import os
import time  # 👈 Added time module
import requests
from dotenv import load_dotenv

load_dotenv()
PJM_API_KEY = os.getenv("PJM_API_KEY")

def check_duplicates():
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}
    start_row = 1
    row_count = 10000
    all_nodes = []

    print("📡 Downloading metadata from PJM API (with 12-second rate limit pauses)...")
    while True:
        url = f"https://api.pjm.com/api/v1/pnode?rowCount={row_count}&startRow={start_row}"
        response = requests.get(url, headers=headers)
        
        # Catch errors
        response.raise_for_status()
        
        items = response.json().get('items', [])
        if not items:
            break
            
        all_nodes.extend(items)
        print(f"   ...downloaded {len(all_nodes)} nodes. Pausing for 12 seconds...")
        
        start_row += row_count
        
        # 🚨 THE FIX: Sleep for 12 seconds to stay under 6 requests/minute
        time.sleep(10.1)

    # Group records by pnode_id
    print("\n⚙️ Analyzing data for duplicates...")
    node_groups = {}
    for item in all_nodes:
        pid = item['pnode_id']
        if pid not in node_groups:
            node_groups[pid] = []
        node_groups[pid].append(item)

    # Filter down to ONLY the ones with multiple records
    duplicates = {pid: records for pid, records in node_groups.items() if len(records) > 1}

    print(f"\n🚨 Found {len(duplicates)} pnode_ids with multiple records.")

    # Print the first 5 examples to visually inspect the differences
    count = 0
    for pid, records in duplicates.items():
        print(f"\n--- PNODE ID: {pid} ---")
        for r in records:
            print(f"Name: {r.get('pnode_name')} | Type: {r.get('pnode_type')} | Subtype: {r.get('pnode_subtype')} | Effective: {r.get('effective_date')} | Terminated: {r.get('termination_date')}")
        
        count += 1
        if count >= 5:
            break

if __name__ == "__main__":
    check_duplicates()
