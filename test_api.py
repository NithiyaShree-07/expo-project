import urllib.request
import urllib.parse
import json
import sys
import time

BASE_URL = "http://127.0.0.1:5000"

def make_request(path, method='GET', data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    
    req_data = None
    if data:
        req_data = json.dumps(data).encode('utf-8')
        
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code} for {method} {path}: {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def test_workflow():
    print("Starting API Test Suite...")
    
    # 1. Test Bins List retrieval
    print("\n[TEST 1] Fetching initial bins...")
    bins = make_request("/api/bins")
    if not bins:
        print("FAIL: Could not fetch bins.")
        sys.exit(1)
    print(f"PASS: Fetched {len(bins)} bins. First bin is: {bins[0]['id']}")
    
    # 2. Test Telemetry Updates
    print("\n[TEST 2] Uploading mock telemetry (BIN-001 fill percentage to 85%)...")
    telemetry = {
        "id": "BIN-001",
        "fill_percentage": 85,
        "battery_percentage": 94,
        "location": "MG Road"
    }
    update_res = make_request("/api/bins/update", method="POST", data=telemetry)
    if not update_res or not update_res.get('success'):
        print(f"FAIL: Telemetry upload failed. Result: {update_res}")
        sys.exit(1)
    print("PASS: Telemetry uploaded successfully.")
    
    # Check if metrics updated
    bins = make_request("/api/bins")
    bin_001 = next((b for b in bins if b['id'] == 'BIN-001'), None)
    if not bin_001 or bin_001['fill_percentage'] != 85:
        print("FAIL: BIN-001 metrics did not update in DB.")
        sys.exit(1)
    print(f"PASS: Checked database. BIN-001 fill is {bin_001['fill_percentage']}%, Priority Score calculated as {bin_001['priority_score']}, Overflow Hours predicted as {bin_001['predicted_overflow_hours']}.")

    # 3. Route Optimization
    print("\n[TEST 3] Fetching optimized route...")
    routes = make_request("/api/bins/routes")
    if not routes or 'route' not in routes:
        print("FAIL: Could not fetch routes.")
        sys.exit(1)
    route_stops = routes['route']
    print(f"PASS: Route calculated. Number of collection stops: {routes['bins_collected']}. Fuel Saved estimate: {routes['fuel_saved_liters']}L.")
    print(f"Route Path: " + " -> ".join([stop['id'] for stop in route_stops]))

    # 4. Circular Economy Estimates
    print("\n[TEST 4] Calculating Circular Economy product yields for 200kg Plastic...")
    est = make_request("/api/circular/estimate?material=Plastic&weight=200")
    if not est or est['units'] != 40: # 200kg plastic * 0.90 yield = 180kg granules. 180kg / 4.5kg per chair = 40 chairs.
        print(f"FAIL: Product calculation mismatch. Result: {est}")
        sys.exit(1)
    print(f"PASS: Correct product estimation: {est['units']} Chairs, revenue generated is Rs. {est['revenue']}.")

    # 5. Citizen Waste Selling loop
    print("\n[TEST 5] Submitting a dry waste selling request from a citizen...")
    sell_req = {
        "citizen_name": "citizen",
        "waste_type": "Metal",
        "weight": 25.0,
        "pickup_address": "Indiranagar",
        "preferred_date": "2026-07-15"
    }
    sell_res = make_request("/api/citizen/selling", method="POST", data=sell_req)
    if not sell_res or not sell_res.get('success'):
        print("FAIL: Could not submit selling request.")
        sys.exit(1)
    print(f"PASS: Selling request submitted. AI Estimated Cashback payout: Rs. {sell_res['estimated_price']} (Rate: Rs. 60/kg for Metal).")
    
    # Get requests list to find the ID
    requests_list = make_request("/api/citizen/selling")
    latest_req = requests_list[0]
    req_id = latest_req['id']
    print(f"Latest Selling Request ID: REQ-{req_id}, Status: {latest_req['status']}.")
    
    # Complete collection loop
    print(f"\n[TEST 6] Simulating admin completing selling request REQ-{req_id}...")
    complete_res = make_request(f"/api/citizen/selling/{req_id}/status", method="PUT", data={"status": "Completed"})
    if not complete_res or not complete_res.get('success'):
        print("FAIL: Could not complete selling request.")
        sys.exit(1)
    print("PASS: Selling request completed successfully. Waste is routed into segregation.")
    
    # Verify segregation audit
    audit = make_request("/api/segregation/history")
    print(f"PASS: Checked Waste Segregation center. Updated Audit weight: {audit['total_collected_kg']} kg, Circular Score: {audit['circular_score_pct']}%.")

    print("\nALL API WORKFLOW TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_workflow()
