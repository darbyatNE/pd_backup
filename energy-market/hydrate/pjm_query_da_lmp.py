import os
import requests
import time
from datetime import date, timedelta
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client, ClientOptions

# ==========================================
# 1. ENVIRONMENT & CLIENT SETUP
# ==========================================
load_dotenv(find_dotenv())

SUPABASE_URL = os.getenv("SUPABASE_URL") 
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") 
PJM_API_KEY = os.getenv("PJM_API_KEY")

PJM_API_ENDPOINT = 'https://api.pjm.com/api/v1/da_hrl_lmps'
DB_TABLE_LMP = 'da_lmp'
DB_TABLE_REGISTRY = 'iso_lmps'

supabase: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY, 
    options=ClientOptions(schema="planning")
)

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================
def chunk_list(data, chunk_size=5000):
    """Yields successive chunks from a list for Supabase batching."""
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]

def daterange(start_date, end_date):
    """Generator for iterating through days."""
    for n in range(int((end_date - start_date).days) + 1):
        yield start_date + timedelta(n)

# ==========================================
# 3. CORE LOGIC
# ==========================================
def fetch_and_hydrate_archive():
    print("🔍 Fetching PJM UUID from iso_registry...")
    registry_response = supabase.table('iso_registry').select('id').eq('iso_code', 'PJM').execute()
    pjm_uuid = registry_response.data[0]['id']
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}

    # --- PRE-LOAD KNOWN NODES INTO MEMORY ---
    print("🧠 Pre-loading known PJM nodes from Supabase into memory cache...")
    known_pnodes = set()
    
    # Pagination to get all existing nodes (Supabase limits to 1000 per request by default)
    start_idx = 0
    while True:
        node_resp = supabase.table(DB_TABLE_REGISTRY).select('pnode_id') \
            .eq('iso_id', pjm_uuid).range(start_idx, start_idx + 999).execute()
        
        if not node_resp.data:
            break
            
        for row in node_resp.data:
            known_pnodes.add(int(row['pnode_id']))
        start_idx += 1000

    print(f"   -> Loaded {len(known_pnodes)} known nodes.")

    # Target Dates
    BACKFILL_START = date(2022, 1, 5)
    BACKFILL_END = date(2024, 4, 28)

    print(f"\n🐌 STARTING ARCHIVE HYDRATION ({BACKFILL_START} to {BACKFILL_END})")

    for single_date in daterange(BACKFILL_START, BACKFILL_END):
        
        date_str = f"{single_date.strftime('%Y-%m-%d')}%2000:00:00%20to%20{single_date.strftime('%Y-%m-%d')}%2023:59:00"
        print(f"\n   📅 {single_date.strftime('%Y-%m-%d')}...", end=" ", flush=True)

        start_row = 1
        daily_saved = 0
        new_nodes_found = 0
        has_more_data = True
        retry_count = 0

        while has_more_data:
            raw_query = f"rowCount=50000&startRow={start_row}&datetime_beginning_ept={date_str}"
            url = f"{PJM_API_ENDPOINT}?{raw_query}"

            try:
                response = requests.get(url, headers=headers, timeout=60)
                
                if response.status_code == 429:
                    retry_count += 1
                    if retry_count > 5:
                        print("❌ Max retries hit. Skipping rest of day.")
                        break
                    print(f" [429 Hit. Pausing 30s...] ", end="", flush=True)
                    time.sleep(30)
                    continue 
                
                response.raise_for_status()
                items = response.json().get('items', [])
                retry_count = 0

            except Exception as e:
                print(f" ❌ Error: {e}")
                break

            if not items:
                break
            
            # --- PROCESS NODES & DATA ---
            nodes_to_insert = []
            lmp_rows_to_insert = []

            for item in items:
                pnode_id = item.get('pnode_id')
                if pnode_id is None:
                    continue
                
                pnode_id = int(pnode_id)

                # 1. Check if we need to register this node
                if pnode_id not in known_pnodes:
                    nodes_to_insert.append({
                        "iso_id": pjm_uuid,
                        "pnode_id": pnode_id,
                        "node_name": item.get('pnode_name', f"Unknown Node {pnode_id}"),
                        "node_type": item.get('type', 'UNKNOWN') # Adjust if PJM payload has a specific type field
                    })
                    known_pnodes.add(pnode_id) # Add to local cache immediately
                    new_nodes_found += 1

                # 2. Prep the LMP data (No longer filtering by PNODE_SET)
                lmp_rows_to_insert.append({
                    "iso_id": pjm_uuid, 
                    "pnode_id": pnode_id,
                    "timestamp_utc": item.get('datetime_beginning_utc'), 
                    "energy_price": item.get('system_energy_price_da'),
                    "total_lmp": item.get('total_lmp_da'),
                    "congestion_price": item.get('congestion_price_da'),
                    "loss_price": item.get('marginal_loss_price_da')
                })

            # --- DATABASE INSERTS ---
            
            # 1. Insert new nodes to registry first (to satisfy foreign key constraints)
            if nodes_to_insert:  # <-- FIXED VARIABLE NAME
                for batch in chunk_list(nodes_to_insert, 1000):  # <-- FIXED VARIABLE NAME
                    supabase.table(DB_TABLE_REGISTRY).upsert(
                        batch, on_conflict="iso_id, pnode_id"
                    ).execute()

            # 2. Insert LMP data (with the lowered batch size to prevent timeouts!)
            if lmp_rows_to_insert:
                for batch in chunk_list(lmp_rows_to_insert, 2500):
                    db_response = supabase.table(DB_TABLE_LMP).upsert(batch).execute()
                    daily_saved += len(db_response.data)
                    time.sleep(0.025)

            # Pagination check
            if len(items) < 50000:
                has_more_data = False
            else:
                start_row += 50000

            # Strict 12-second sleep
            time.sleep(12)

        print(f"Saved {daily_saved} LMP rows. (Registered {new_nodes_found} new historical nodes)")

    print("\n✅ Archive data processing complete.")

if __name__ == '__main__':
    fetch_and_hydrate_archive()
