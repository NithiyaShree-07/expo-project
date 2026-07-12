import os
import sqlite3
from flask import Flask, request, jsonify, render_template, send_from_directory
from datetime import datetime, timedelta

app = Flask(__name__, template_folder='templates', static_folder='static')
DB_PATH = os.path.join(os.path.dirname(__file__), 'database.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Ensure template and static dirs exist
os.makedirs(os.path.join(os.path.dirname(__file__), 'templates'), exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(__file__), 'static', 'css'), exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(__file__), 'static', 'js'), exist_ok=True)

# Helper function to calculate bin metrics
def update_bin_metrics(cursor, bin_id, fill, battery):
    # AI Fill Prediction: Simple formula for hours left based on current fill %
    # e.g., if fill is 100%, 0 hours. If fill is 0%, 24 hours. If fill is 80%, 2 hours.
    hours_left = max(0, int((100 - fill) * 0.24)) # 0% -> 24 hours, 50% -> 12 hours, 90% -> 2 hours
    if fill >= 90:
        hours_left = 0
    elif fill >= 80:
        hours_left = 2

    # Calculate complaint weight for this location
    cursor.execute("SELECT location FROM smart_bins WHERE id = ?", (bin_id,))
    row = cursor.fetchone()
    loc = row['location'] if row else ""
    
    cursor.execute("SELECT COUNT(*) as count FROM complaints WHERE location = ? AND status = 'Pending'", (loc,))
    complaint_count = cursor.fetchone()['count']

    # AI Collection Priority Score Formula:
    # Priority = (Fill% * 0.5) + ((24 - HoursLeft)/24 * 25) + (ComplaintCount * 15) + (battery_status_factor * 10)
    # Caps at 100
    overflow_factor = ((24 - hours_left) / 24) * 25
    complaint_factor = min(15, complaint_count * 15)
    battery_factor = 10 if battery < 20 else 0
    
    priority_score = int((fill * 0.5) + overflow_factor + complaint_factor + battery_factor)
    priority_score = min(100, max(0, priority_score))

    cursor.execute('''
        UPDATE smart_bins 
        SET fill_percentage = ?, battery_percentage = ?, last_updated = ?, predicted_overflow_hours = ?, priority_score = ?
        WHERE id = ?
    ''', (fill, battery, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), hours_left, priority_score, bin_id))

# Root Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/simulator')
def simulator():
    return render_template('simulator.html')

# Authentication API
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? AND password = ? AND role = ?", (username, password, role))
    user = cursor.fetchone()
    conn.close()

    if user:
        return jsonify({"success": True, "message": "Login successful", "username": username, "role": role})
    else:
        # If user is a citizen, let's create a dynamic record if not exists
        if role == 'citizen':
            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", (username, 'citizen123', 'citizen'))
                conn.commit()
            except sqlite3.IntegrityError:
                pass # Already exists
            conn.close()
            return jsonify({"success": True, "message": "Citizen logged in", "username": username, "role": role})
        return jsonify({"success": False, "message": "Invalid username or password"}), 401

# Smart Bins API
@app.route('/api/bins', methods=['GET'])
def get_bins():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM smart_bins ORDER BY id ASC")
    bins = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(bins)

@app.route('/api/bins/update', methods=['POST'])
def update_bin():
    data = request.get_json()
    bin_id = data.get('id')
    fill = int(data.get('fill_percentage', 0))
    battery = int(data.get('battery_percentage', 100))
    location = data.get('location')
    lat = data.get('latitude')
    lon = data.get('longitude')

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if bin exists, if not, create it
    cursor.execute("SELECT * FROM smart_bins WHERE id = ?", (bin_id,))
    bin_exists = cursor.fetchone()

    if not bin_exists:
        # Generate some default coords if not provided
        lat = lat if lat is not None else 12.97
        lon = lon if lon is not None else 77.59
        loc = location if location else "Unknown Area"
        cursor.execute('''
            INSERT INTO smart_bins (id, location, latitude, longitude, fill_percentage, battery_percentage, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (bin_id, loc, lat, lon, fill, battery, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
    else:
        if location:
            cursor.execute("UPDATE smart_bins SET location = ? WHERE id = ?", (location, bin_id))
        if lat is not None and lon is not None:
            cursor.execute("UPDATE smart_bins SET latitude = ?, longitude = ? WHERE id = ?", (lat, lon, bin_id))

    update_bin_metrics(cursor, bin_id, fill, battery)
    
    # Check if we should log an AI recommendation
    if fill >= 85:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        msg = f"Alert: {bin_id} ({location if location else bin_id}) is at {fill}% capacity. Overflow expected in 1 hour. Route optimization recommended."
        # Check if already logged in last 10 minutes to avoid clutter
        cursor.execute("SELECT COUNT(*) as cnt FROM decision_logs WHERE message LIKE ? AND datetime(created_at) > datetime('now', '-10 minutes')", (f"%{bin_id}%",))
        if cursor.fetchone()['cnt'] == 0:
            cursor.execute("INSERT INTO decision_logs (message, type, created_at) VALUES (?, ?, ?)", (msg, 'warning', now_str))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"Bin {bin_id} telemetry updated successfully"})

# Route Optimization API
@app.route('/api/bins/routes', methods=['GET'])
def get_routes():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Recalculate priorities on query
    cursor.execute("SELECT * FROM smart_bins")
    bins = cursor.fetchall()
    for row in bins:
        update_bin_metrics(cursor, row['id'], row['fill_percentage'], row['battery_percentage'])
    conn.commit()
    
    # Now select bins with priority_score >= 50 or fill_percentage >= 70, sorted by priority score desc
    cursor.execute("SELECT * FROM smart_bins WHERE priority_score >= 50 ORDER BY priority_score DESC")
    high_prio_bins = [dict(row) for row in cursor.fetchall()]
    
    # Generate optimal route sequence: Depot -> Bins in priority order -> Transfer Station
    route_stops = []
    route_stops.append({"id": "DEPOT", "location": "Municipality Garage", "latitude": 12.9600, "longitude": 77.5800, "fill_percentage": 0, "type": "depot"})
    
    for b in high_prio_bins:
        b['type'] = 'bin'
        route_stops.append(b)
        
    route_stops.append({"id": "STATION", "location": "Central Recycling Station", "latitude": 12.9850, "longitude": 77.6200, "fill_percentage": 0, "type": "station"})
    
    # Mock Calculations for Route Metrics
    bins_count = len(high_prio_bins)
    fuel_saved = round(bins_count * 0.45, 1) # e.g. 0.45 L saved per optimized bin collected
    co2_saved = round(fuel_saved * 2.68, 1) # 2.68 kg CO2 per liter of diesel
    
    # If no bins need collection, return empty list of bins but showing depot/station
    if bins_count == 0:
        route_stops = []
        fuel_saved = 0
        co2_saved = 0

    conn.close()
    return jsonify({
        "route": route_stops,
        "bins_collected": bins_count,
        "fuel_saved_liters": fuel_saved,
        "co2_saved_kg": co2_saved,
        "estimated_time_mins": bins_count * 12 + 20
    })

# AI Segregation Simulation API
@app.route('/api/segregation/predict', methods=['GET'])
def get_segregation_prediction():
    weight = float(request.args.get('weight', 100))
    # Standard composition ratios
    ratios = {
        "Organic": 0.45,
        "Plastic": 0.30,
        "Paper": 0.12,
        "Metal": 0.08,
        "Glass": 0.05
    }
    
    prediction = []
    for material, pct in ratios.items():
        prediction.append({
            "material": material,
            "percentage": int(pct * 100),
            "weight": round(weight * pct, 2)
        })
        
    return jsonify(prediction)

# Periodic Waste Audit & Circular Economy Metrics
@app.route('/api/segregation/history', methods=['GET'])
def get_segregation_history():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get total collected waste
    cursor.execute("SELECT SUM(collected_weight) as total FROM waste_collection_history")
    total_waste = cursor.fetchone()['total'] or 0.0
    
    # Aggregated composition
    cursor.execute('''
        SELECT 
            SUM(collected_weight * organic_pct / 100.0) as organic,
            SUM(collected_weight * plastic_pct / 100.0) as plastic,
            SUM(collected_weight * paper_pct / 100.0) as paper,
            SUM(collected_weight * metal_pct / 100.0) as metal,
            SUM(collected_weight * glass_pct / 100.0) as glass
        FROM waste_collection_history
    ''')
    comp_row = cursor.fetchone()
    
    organic = round(comp_row['organic'] or 0.0, 1)
    plastic = round(comp_row['plastic'] or 0.0, 1)
    paper = round(comp_row['paper'] or 0.0, 1)
    metal = round(comp_row['metal'] or 0.0, 1)
    glass = round(comp_row['glass'] or 0.0, 1)
    
    # Circular Economy Score: (Recovered Waste / Total Waste) * 100
    # Let's say recovery efficiency is 86% across all collected waste
    recovered = round(total_waste * 0.86, 1)
    landfill = round(total_waste - recovered, 1)
    circular_score = 86.0 if total_waste > 0 else 0.0
    
    conn.close()
    return jsonify({
        "total_collected_kg": round(total_waste, 1),
        "recovered_kg": recovered,
        "landfill_kg": landfill,
        "circular_score_pct": circular_score,
        "composition": [
            {"material": "Organic", "weight": organic},
            {"material": "Plastic", "weight": plastic},
            {"material": "Paper", "weight": paper},
            {"material": "Metal", "weight": metal},
            {"material": "Glass", "weight": glass}
        ]
    })

# Resource Recovery Advisor API
@app.route('/api/recovery/advisor', methods=['GET'])
def get_recovery_advisor():
    # Returns recovery processing pathways, efficiency, and cost estimation
    advisor_data = [
        {"material": "Organic", "process": "Aerobic Composting", "efficiency": 92, "cost_per_kg": 2.50, "destination": "Agriculture Hubs", "output": "Organic Compost"},
        {"material": "Plastic", "process": "Thermal Extrusion", "efficiency": 88, "cost_per_kg": 8.00, "destination": "Plastic Granulation Mills", "output": "Plastic Granules"},
        {"material": "Paper", "process": "Hydro-Pulping & De-inking", "efficiency": 82, "cost_per_kg": 4.20, "destination": "Paper Recycling Mills", "output": "Recycled Paper Rolls"},
        {"material": "Metal", "process": "Magnetic Separation & Smelting", "efficiency": 95, "cost_per_kg": 15.00, "destination": "Foundry Recoveries", "output": "Steel/Aluminum Ingots"},
        {"material": "Glass", "process": "Crushing & Cullet Remelting", "efficiency": 90, "cost_per_kg": 6.50, "destination": "Glass Bottling Factories", "output": "Cullet Glass"}
    ]
    return jsonify(advisor_data)

# Circular Economy Estimation API
@app.route('/api/circular/estimate', methods=['GET'])
def get_circular_estimate():
    material = request.args.get('material', 'Plastic')
    weight = float(request.args.get('weight', 100))
    
    # Calculate estimations
    if material == 'Plastic':
        granules = round(weight * 0.90, 1) # 90% yield
        chairs = int(granules / 4.5) # 4.5kg per plastic chair
        revenue = chairs * 800
        result = {
            "input_waste": weight,
            "intermediate": f"{granules} kg Granules",
            "product": "Recycled Plastic Chairs",
            "units": chairs,
            "revenue": revenue
        }
    elif material == 'Organic':
        compost = round(weight * 0.60, 1) # 60% yield
        bags = int(compost / 5) # 5kg bag
        revenue = bags * 250
        result = {
            "input_waste": weight,
            "intermediate": f"{compost} kg Finished Compost",
            "product": "Eco Organic Compost Bags (5kg)",
            "units": bags,
            "revenue": revenue
        }
    elif material == 'Paper':
        pulp = round(weight * 0.80, 1)
        notebooks = int(pulp / 0.25) # 250g per notebook
        revenue = notebooks * 80
        result = {
            "input_waste": weight,
            "intermediate": f"{pulp} kg Clean Pulp",
            "product": "Recycled Paper Notebooks",
            "units": notebooks,
            "revenue": revenue
        }
    elif material == 'Metal':
        rods = int(weight * 0.95 / 0.8) # 800g per rod
        revenue = rods * 35
        result = {
            "input_waste": weight,
            "intermediate": f"{round(weight*0.95, 1)} kg Melted Steel",
            "product": "Scrap Steel Rods",
            "units": rods,
            "revenue": revenue
        }
    else: # Glass
        bottles = int(weight * 0.90 / 0.4) # 400g per bottle
        revenue = bottles * 50
        result = {
            "input_waste": weight,
            "intermediate": f"{round(weight*0.90, 1)} kg Glass Cullet",
            "product": "Recycled Glass Bottles",
            "units": bottles,
            "revenue": revenue
        }
        
    return jsonify(result)

# Marketplace Products API
@app.route('/api/marketplace/products', methods=['GET', 'POST'])
def handle_products():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        cursor.execute("SELECT * FROM marketplace_products")
        products = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(products)
        
    elif request.method == 'POST':
        data = request.get_json()
        name = data.get('name')
        category = data.get('category')
        price = float(data.get('price', 0))
        stock = int(data.get('stock', 0))
        img = data.get('image_url', 'default.png')
        desc = data.get('description', '')
        
        cursor.execute('''
            INSERT INTO marketplace_products (name, category, price, stock, image_url, description)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, category, price, stock, img, desc))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Product added successfully"})

@app.route('/api/marketplace/products/<int:prod_id>', methods=['PUT', 'DELETE'])
def edit_product(prod_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        data = request.get_json()
        name = data.get('name')
        price = float(data.get('price'))
        stock = int(data.get('stock'))
        desc = data.get('description')
        
        cursor.execute('''
            UPDATE marketplace_products 
            SET name = ?, price = ?, stock = ?, description = ?
            WHERE id = ?
        ''', (name, price, stock, desc, prod_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Product updated successfully"})
        
    elif request.method == 'DELETE':
        cursor.execute("DELETE FROM marketplace_products WHERE id = ?", (prod_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Product deleted successfully"})

# Orders API
@app.route('/api/marketplace/orders', methods=['GET', 'POST'])
def handle_orders():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        citizen = request.args.get('citizen')
        if citizen:
            cursor.execute('''
                SELECT o.*, p.name as product_name, p.price as unit_price 
                FROM orders o JOIN marketplace_products p ON o.product_id = p.id
                WHERE o.citizen_name = ?
                ORDER BY o.id DESC
            ''', (citizen,))
        else:
            cursor.execute('''
                SELECT o.*, p.name as product_name, p.price as unit_price 
                FROM orders o JOIN marketplace_products p ON o.product_id = p.id
                ORDER BY o.id DESC
            ''')
        orders = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(orders)
        
    elif request.method == 'POST':
        data = request.get_json()
        citizen = data.get('citizen_name')
        product_id = int(data.get('product_id'))
        qty = int(data.get('quantity', 1))
        
        # Check stock
        cursor.execute("SELECT stock, price, name FROM marketplace_products WHERE id = ?", (product_id,))
        prod = cursor.fetchone()
        if not prod:
            conn.close()
            return jsonify({"success": False, "message": "Product not found"}), 404
            
        if prod['stock'] < qty:
            conn.close()
            return jsonify({"success": False, "message": "Insufficient stock"}), 400
            
        total = prod['price'] * qty
        order_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Insert order and update stock
        cursor.execute('''
            INSERT INTO orders (citizen_name, product_id, quantity, total_price, status, order_date)
            VALUES (?, ?, ?, ?, 'Pending', ?)
        ''', (citizen, product_id, qty, total, order_date))
        
        cursor.execute("UPDATE marketplace_products SET stock = stock - ? WHERE id = ?", (qty, product_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Order placed successfully", "total_price": total})

@app.route('/api/marketplace/orders/<int:order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    data = request.get_json()
    status = data.get('status') # 'Approved', 'Shipped'
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Order status updated successfully"})

# Citizen Selling Requests API
@app.route('/api/citizen/selling', methods=['GET', 'POST'])
def handle_selling():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        citizen = request.args.get('citizen')
        if citizen:
            cursor.execute("SELECT * FROM selling_requests WHERE citizen_name = ? ORDER BY id DESC", (citizen,))
        else:
            cursor.execute("SELECT * FROM selling_requests ORDER BY id DESC")
        requests = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(requests)
        
    elif request.method == 'POST':
        data = request.get_json()
        citizen = data.get('citizen_name')
        waste_type = data.get('waste_type')
        weight = float(data.get('weight', 0))
        address = data.get('pickup_address')
        pref_date = data.get('preferred_date')
        
        # Calculate AI estimated price: standard rate * quality factor * demand
        # Standard rates per kg: Plastic 25, Paper 8, Metal 60, Organic 3, Glass 15
        rates = {"Plastic": 25, "Paper": 8, "Metal": 60, "Organic": 3, "Glass": 15}
        rate = rates.get(waste_type, 10)
        est_price = rate * weight
        
        created = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO selling_requests (citizen_name, waste_type, weight, pickup_address, preferred_date, estimated_price, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
        ''', (citizen, waste_type, weight, address, pref_date, est_price, created))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Selling request submitted", "estimated_price": est_price})

@app.route('/api/citizen/selling/<int:req_id>/status', methods=['PUT'])
def update_selling_status(req_id):
    data = request.get_json()
    status = data.get('status') # 'Approved', 'Rejected', 'Pickup Scheduled', 'Vehicle Assigned', 'Completed'
    vehicle = data.get('assigned_vehicle')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if vehicle:
        cursor.execute("UPDATE selling_requests SET status = ?, assigned_vehicle = ? WHERE id = ?", (status, vehicle, req_id))
    else:
        cursor.execute("UPDATE selling_requests SET status = ? WHERE id = ?", (status, req_id))
        
    # If completed, waste enters the Segregation system automatically!
    if status == 'Completed':
        cursor.execute("SELECT * FROM selling_requests WHERE id = ?", (req_id,))
        req = cursor.fetchone()
        if req:
            w_type = req['waste_type']
            weight = req['weight']
            # Map waste type to composition percentage
            # Seed composition logic: if waste_type is Plastic, set organic to 0, plastic to 100, etc.
            comp = {"Organic": 0, "Plastic": 0, "Paper": 0, "Metal": 0, "Glass": 0}
            comp[w_type] = 100
            
            cursor.execute('''
                INSERT INTO waste_collection_history (bin_id, collected_weight, collection_date, organic_pct, plastic_pct, paper_pct, metal_pct, glass_pct)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (f"CITIZEN-{req['citizen_name']}", weight, datetime.now().strftime('%Y-%m-%d'), comp['Organic'], comp['Plastic'], comp['Paper'], comp['Metal'], comp['Glass']))
            
            # Log AI recommendation of successfully recycling citizen waste
            msg = f"Circular Economy: Citizen waste collection from {req['citizen_name']} completed. Recovered {weight} kg of pure {w_type} waste. Contributed ₹{req['estimated_price']} to circular loop."
            cursor.execute("INSERT INTO decision_logs (message, type, created_at) VALUES (?, 'success', ?)", (msg, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"Selling request updated to {status}"})

# Complaints API
@app.route('/api/citizen/complaints', methods=['GET', 'POST'])
def handle_complaints():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        citizen = request.args.get('citizen')
        if citizen:
            cursor.execute("SELECT * FROM complaints WHERE citizen_name = ? ORDER BY id DESC", (citizen,))
        else:
            cursor.execute("SELECT * FROM complaints ORDER BY id DESC")
        complaints = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(complaints)
        
    elif request.method == 'POST':
        data = request.get_json()
        citizen = data.get('citizen_name')
        c_type = data.get('complaint_type')
        loc = data.get('location')
        desc = data.get('description')
        
        created = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO complaints (citizen_name, complaint_type, location, description, status, created_at)
            VALUES (?, ?, ?, ?, 'Pending', ?)
        ''', (citizen, c_type, loc, desc, created))
        
        # If complaint is "Overflow", update priority score of that location's bin
        if c_type == 'Overflow':
            cursor.execute("SELECT id, fill_percentage, battery_percentage FROM smart_bins WHERE location LIKE ?", (f"%{loc}%",))
            bins = cursor.fetchall()
            for b in bins:
                update_bin_metrics(cursor, b['id'], b['fill_percentage'], b['battery_percentage'])
                
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Complaint submitted successfully"})

@app.route('/api/citizen/complaints/<int:c_id>/status', methods=['PUT'])
def update_complaint_status(c_id):
    data = request.get_json()
    status = data.get('status') # 'Assigned', 'Resolved'
    staff = data.get('staff_assigned')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if staff:
        cursor.execute("UPDATE complaints SET status = ?, staff_assigned = ? WHERE id = ?", (status, staff, c_id))
    else:
        cursor.execute("UPDATE complaints SET status = ? WHERE id = ?", (status, c_id))
        
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Complaint status updated successfully"})

# Analytics API
@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 7-day collections trend
    today = datetime.now().date()
    labels = []
    data_weights = []
    
    for i in reversed(range(7)):
        day = today - timedelta(days=i)
        day_str = day.strftime('%Y-%m-%d')
        labels.append(day.strftime('%b %d'))
        cursor.execute("SELECT SUM(collected_weight) as w FROM waste_collection_history WHERE collection_date = ?", (day_str,))
        weight = cursor.fetchone()['w'] or 0.0
        data_weights.append(round(weight, 1))
        
    # Waste Composition totals
    cursor.execute('''
        SELECT 
            SUM(collected_weight * organic_pct / 100.0) as organic,
            SUM(collected_weight * plastic_pct / 100.0) as plastic,
            SUM(collected_weight * paper_pct / 100.0) as paper,
            SUM(collected_weight * metal_pct / 100.0) as metal,
            SUM(collected_weight * glass_pct / 100.0) as glass
        FROM waste_collection_history
    ''')
    comp = cursor.fetchone()
    
    organic = comp['organic'] or 0
    plastic = comp['plastic'] or 0
    paper = comp['paper'] or 0
    metal = comp['metal'] or 0
    glass = comp['glass'] or 0
    
    # Total revenue from orders
    cursor.execute("SELECT SUM(total_price) as rev FROM orders WHERE status != 'Pending'")
    revenue = cursor.fetchone()['rev'] or 0.0
    
    # Total complaints count by status
    cursor.execute("SELECT COUNT(*) as count FROM complaints WHERE status = 'Pending'")
    pending_complaints = cursor.fetchone()['count']
    
    # Total selling requests pending
    cursor.execute("SELECT COUNT(*) as count FROM selling_requests WHERE status = 'Pending'")
    pending_selling = cursor.fetchone()['count']

    conn.close()
    return jsonify({
        "collection_trend": {
            "labels": labels,
            "weights": data_weights
        },
        "composition": {
            "Organic": round(organic, 1),
            "Plastic": round(plastic, 1),
            "Paper": round(paper, 1),
            "Metal": round(metal, 1),
            "Glass": round(glass, 1)
        },
        "revenue": revenue,
        "pending_complaints": pending_complaints,
        "pending_selling": pending_selling
    })

# AI Decision Support API
@app.route('/api/decision_support', methods=['GET'])
def get_decisions():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM decision_logs ORDER BY id DESC LIMIT 10")
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(logs)

# Chatbot API
@app.route('/api/chatbot', methods=['POST'])
def chatbot():
    data = request.get_json()
    query = data.get('query', '').lower()
    citizen = data.get('citizen', 'citizen')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    reply = ""
    
    if "bin" in query or "nearest" in query or "where" in query:
        cursor.execute("SELECT id, location, fill_percentage FROM smart_bins")
        bins = cursor.fetchall()
        bin_list = ", ".join([f"{b['id']} at {b['location']} ({b['fill_percentage']}% Full)" for b in bins])
        reply = f"Here are the active smart bins in your city: {bin_list}. Throw waste in the closest bin to avoid overflow!"
        
    elif "complaint" in query:
        cursor.execute("SELECT complaint_type, location, status FROM complaints WHERE citizen_name = ? ORDER BY id DESC LIMIT 1", (citizen,))
        row = cursor.fetchone()
        if row:
            reply = f"Your latest complaint regarding '{row['complaint_type']}' at '{row['location']}' is currently in '{row['status']}' status."
        else:
            reply = "You haven't submitted any complaints yet. You can report bin overflows or illegal dumping in the Complaint Portal tab!"
            
    elif "selling" in query or "sell" in query or "pickup" in query:
        cursor.execute("SELECT waste_type, weight, status, estimated_price FROM selling_requests WHERE citizen_name = ? ORDER BY id DESC LIMIT 1", (citizen,))
        row = cursor.fetchone()
        if row:
            reply = f"Your selling request for {row['weight']}kg of {row['waste_type']} (Est. value: ₹{row['estimated_price']}) is currently '{row['status']}'."
        else:
            reply = "You can earn money by selling recyclables like plastic, paper, and metal! Just go to the 'Sell Waste' portal to estimate prices and submit requests."
            
    elif "schedule" in query or "time" in query:
        reply = "Normal waste collection trucks drive around every morning at 7:00 AM. Route-optimized smart collection vehicles deploy instantly when any bin reaches 80% capacity!"
        
    elif "recycle" in query or "guide" in query or "plastic" in query or "paper" in query:
        reply = "Recycling Tips:\n1. Separate food waste (organic) from dry waste.\n2. Wash plastic bottles and tins before throwing.\n3. Steel rods and paper notebooks can be sold to us for cashback!\n4. Avoid throwing battery items in standard bins."
        
    else:
        reply = "Hello! I am your AI Eco-Assistant. You can ask me about:\n- 'Nearest bins'\n- 'Complaint status'\n- 'Selling requests'\n- 'Recycling guide'\n- 'Collection schedule'"

    conn.close()
    return jsonify({"reply": reply})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
