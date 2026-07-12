import sqlite3
import os
from datetime import datetime, timedelta

def init_db():
    db_path = os.path.join(os.path.dirname(__file__), 'database.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL
    )
    ''')

    # Create smart_bins table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS smart_bins (
        id TEXT PRIMARY KEY,
        location TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        fill_percentage INTEGER DEFAULT 0,
        battery_percentage INTEGER DEFAULT 100,
        last_updated TEXT,
        predicted_overflow_hours INTEGER DEFAULT 24,
        priority_score INTEGER DEFAULT 0
    )
    ''')

    # Create waste_collection_history table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS waste_collection_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_id TEXT,
        collected_weight REAL NOT NULL,
        collection_date TEXT NOT NULL,
        organic_pct INTEGER NOT NULL,
        plastic_pct INTEGER NOT NULL,
        paper_pct INTEGER NOT NULL,
        metal_pct INTEGER NOT NULL,
        glass_pct INTEGER NOT NULL,
        FOREIGN KEY(bin_id) REFERENCES smart_bins(id)
    )
    ''')

    # Create complaints table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        citizen_name TEXT NOT NULL,
        complaint_type TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'Pending',
        staff_assigned TEXT,
        created_at TEXT NOT NULL
    )
    ''')

    # Create selling_requests table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS selling_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        citizen_name TEXT NOT NULL,
        waste_type TEXT NOT NULL,
        weight REAL NOT NULL,
        pickup_address TEXT NOT NULL,
        preferred_date TEXT NOT NULL,
        estimated_price REAL NOT NULL,
        status TEXT DEFAULT 'Pending',
        assigned_vehicle TEXT,
        created_at TEXT NOT NULL
    )
    ''')

    # Create marketplace_products table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS marketplace_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        image_url TEXT,
        description TEXT
    )
    ''')

    # Create orders table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        citizen_name TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        total_price REAL NOT NULL,
        status TEXT DEFAULT 'Pending',
        order_date TEXT NOT NULL,
        FOREIGN KEY(product_id) REFERENCES marketplace_products(id)
    )
    ''')

    # Create decision_logs table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS decision_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    ''')

    # SEED DATA
    # Users
    cursor.execute("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)", 
                   ('admin', 'admin123', 'admin'))
    cursor.execute("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)", 
                   ('citizen', 'citizen123', 'citizen'))

    # Bins
    bins_data = [
        ('BIN-001', 'MG Road', 12.9716, 77.5946, 82, 94, 2, 96),
        ('BIN-002', 'Market Road', 12.9800, 77.6000, 88, 89, 1, 98),
        ('BIN-003', 'College Road', 12.9650, 77.5850, 45, 90, 8, 52),
        ('BIN-004', 'Residency Road', 12.9730, 77.6080, 15, 92, 24, 20),
        ('BIN-005', 'Indiranagar', 12.9780, 77.6400, 92, 85, 0, 99)
    ]
    
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    for b_id, loc, lat, lon, fill, bat, pred, prio in bins_data:
        cursor.execute('''
        INSERT OR IGNORE INTO smart_bins (id, location, latitude, longitude, fill_percentage, battery_percentage, last_updated, predicted_overflow_hours, priority_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (b_id, loc, lat, lon, fill, bat, now_str, pred, prio))

    # Waste Collection History (past 7 days + today)
    today = datetime.now().date()
    history_data = []
    
    # We will generate daily collections for some bins
    for i in range(14):
        day = today - timedelta(days=(i % 7))
        bin_id = f"BIN-00{(i % 5) + 1}"
        weight = round(40.0 + (i * 2.5) % 35, 1)
        # Random but consistent compositions
        organic = 40 + (i % 3) * 5
        plastic = 25 + (i % 2) * 5
        paper = 15 - (i % 3) * 2
        metal = 8 + (i % 4)
        glass = int(100 - (organic + plastic + paper + metal))
        history_data.append((bin_id, weight, day.strftime('%Y-%m-%d'), organic, plastic, paper, metal, glass))

    cursor.executemany('''
    INSERT INTO waste_collection_history (bin_id, collected_weight, collection_date, organic_pct, plastic_pct, paper_pct, metal_pct, glass_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', history_data)

    # Complaints
    complaints_data = [
        ('Rahul Kumar', 'Overflow', 'MG Road', 'Bin BIN-001 is completely full and trash is spilling out.', 'Pending', None, (datetime.now() - timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')),
        ('Sneha Reddy', 'Illegal Dumping', 'Indiranagar', 'Someone dumped construction waste next to the green bin.', 'Assigned', 'Ramesh Kumar', (datetime.now() - timedelta(hours=5)).strftime('%Y-%m-%d %H:%M:%S')),
        ('John Doe', 'Damaged Bin', 'Residency Road', 'The lid of the bin BIN-004 is broken.', 'Resolved', 'Amit Singh', (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'))
    ]
    for c_name, c_type, loc, desc, status, staff, dt in complaints_data:
        cursor.execute('''
        INSERT INTO complaints (citizen_name, complaint_type, location, description, status, staff_assigned, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (c_name, c_type, loc, desc, status, staff, dt))

    # Citizen Selling Requests
    selling_data = [
        ('citizen', 'Plastic', 20.0, 'Flat 402, Green Meadows, Indiranagar', (today + timedelta(days=1)).strftime('%Y-%m-%d'), 500.0, 'Pending', None, (datetime.now() - timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')),
        ('citizen', 'Paper', 45.0, 'Sector 3, HSR Layout', (today + timedelta(days=2)).strftime('%Y-%m-%d'), 360.0, 'Approved', None, (datetime.now() - timedelta(hours=6)).strftime('%Y-%m-%d %H:%M:%S')),
        ('citizen', 'Metal', 15.0, '12th Cross, Malleshwaram', today.strftime('%Y-%m-%d'), 900.0, 'Completed', 'Eco Truck-3', (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S'))
    ]
    for name, w_type, weight, addr, pref_date, price, status, vehicle, dt in selling_data:
        cursor.execute('''
        INSERT INTO selling_requests (citizen_name, waste_type, weight, pickup_address, preferred_date, estimated_price, status, assigned_vehicle, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (name, w_type, weight, addr, pref_date, price, status, vehicle, dt))

    # Marketplace Products
    products = [
        ('Recycled Plastic Chair', 'Chair', 800.0, 45, 'plastic_chair.png', 'Durable, stylish outdoor chair made from 100% post-consumer recycled plastic granules.'),
        ('Eco Organic Compost (5kg)', 'Compost', 250.0, 120, 'compost.png', 'Rich nutrient-dense organic fertilizer produced from collected organic food waste.'),
        ('Recycled Paper Notebook', 'Notebook', 80.0, 200, 'notebook.png', 'Unruled 160-page notebook made from recycled paper fibers. Eco-friendly stationery.'),
        ('Recycled Plastic Bucket', 'Bucket', 150.0, 80, 'plastic_bucket.png', 'Heavy-duty 15-liter household bucket molded from high-density recycled polyethylene.'),
        ('Processed Scrap Steel Rods (10pc)', 'Scrap Metal', 350.0, 35, 'steel_rods.png', 'Reinforcement steel bars recovered from scrap metal processing centers.')
    ]
    for name, cat, price, stock, img, desc in products:
        cursor.execute('''
        INSERT INTO marketplace_products (name, category, price, stock, image_url, description)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, cat, price, stock, img, desc))

    # Seed some Orders
    orders_data = [
        ('citizen', 1, 2, 1600.0, 'Shipped', (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S')),
        ('citizen', 2, 3, 750.0, 'Pending', (datetime.now() - timedelta(hours=4)).strftime('%Y-%m-%d %H:%M:%S'))
    ]
    for name, prod_id, qty, tot, status, dt in orders_data:
        cursor.execute('''
        INSERT INTO orders (citizen_name, product_id, quantity, total_price, status, order_date)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, prod_id, qty, tot, status, dt))

    # Seed AI Decision Support logs
    decisions = [
        ('Increase collection frequency near College Road: Plastic waste has increased by 25%. Expected monthly revenue: ₹52,000.', 'info'),
        ('Bin BIN-002 (Market Road) is filling up rapidly. Install one additional smart bin nearby to prevent chronic overflow.', 'warning'),
        ('Route Optimization: Today\'s collection route optimized successfully! Saved 12.6L of fuel and reduced CO₂ emissions by 32.4 kg.', 'success')
    ]
    for msg, d_type in decisions:
        cursor.execute('''
        INSERT INTO decision_logs (message, type, created_at)
        VALUES (?, ?, ?)
        ''', (msg, d_type, now_str))

    conn.commit()
    conn.close()
    print("Database initialized and seeded successfully!")

if __name__ == '__main__':
    init_db()
