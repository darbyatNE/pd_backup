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

def chunk_list(data, chunk_size=5000):
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]

def daterange(start_date, end_date):
    for n in range(int((end_date - start_date).days) + 1):
        yield start_date + timedelta(n)

# ==========================================
# 2. CORE LOGIC
# ==========================================
def fetch_and_hydrate_archive():
    print("🔍 Fetching PJM UUID from iso_registry...")
    registry_response = supabase.table('iso_registry').select('id').eq('iso_code', 'PJM').execute()
    pjm_uuid = registry_response.data[0]['id']
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}

    # --- PRE-LOAD REGISTRY INTO DICTIONARY CACHE ---
    print("🧠 Pre-loading known PJM nodes into memory cache...")
    node_cache = {} # Format: {pnode_id: {'name': '...', 'first_seen': '...', 'last_seen': '...', 'needs_update': False}}
    
    start_idx = 0
    while True:
        node_resp = supabase.table(DB_TABLE_REGISTRY).select('pnode_id, node_name, first_seen, last_seen') \
            .eq('iso_id', pjm_uuid).range(start_idx, start_idx + 999).execute()
        
        if not node_resp.data:
            break
            
        for row in node_resp.data:
            node_cache[int(row['pnode_id'])] = {
                'name': row.get('node_name'),
                'first_seen': row.get('first_seen'),
                'last_seen': row.get('last_seen'),
                'needs_update': False # Flag to track if we need to push changes to Supabase
            }
        start_idx += 1000

    print(f"   -> Loaded {len(node_cache)} known nodes.")

    # Target Dates
    BACKFILL_START = date(2022, 1, 5)
    BACKFILL_END = date(2024, 4, 28)

    print(f"\n🐌 STARTING ARCHIVE HYDRATION ({BACKFILL_START} to {BACKFILL_END})")

    for single_date in daterange(BACKFILL_START, BACKFILL_END):
        
        date_str = f"{single_date.strftime('%Y-%m-%d')}%2000:00:00%20to%20{single_date.strftime('%Y-%m-%d')}%2023:59:00"
        print(f"\n   📅 {single_date.strftime('%Y-%m-%d')}...", end=" ", flush=True)

        start_row = 1
        daily_saved = 0
        has_more_data = True
        retry_count = 0

        while has_more_data:
            raw_query = f"rowCount=50000&startRow={start_row}&datetime_beginning_ept={date_str}"
            url = f"{PJM_API_ENDPOINT}?{raw_query}"

            try:
                response = requests.get(url, headers=headers, timeout=60)
                if response.status_code == 429:
                    retry_count += 1
                    if retry_count > 5: break
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
            nodes_to_upsert = []
            lmp_rows_to_insert = []

            for item in items:
                pnode_id = item.get('pnode_id')
                if pnode_id is None: continue
                
                pnode_id = int(pnode_id)
                current_timestamp = item.get('datetime_beginning_utc')
                current_name = item.get('pnode_name', f"Unknown Node {pnode_id}")

                # 1. LIFECYCLE TRACKING
                if pnode_id not in node_cache:
                    # Brand new node discovered!
                    node_cache[pnode_id] = {
                        'name': current_name,
                        'first_seen': current_timestamp,
                        'last_seen': current_timestamp,
                        'needs_update': False 
                    }
                    # We must insert new nodes immediately to satisfy Database Foreign Keys
                    nodes_to_upsert.append({
                        "iso_id": pjm_uuid,
                        "pnode_id": pnode_id,
                        "node_name": current_name,
                        "first_seen": current_timestamp,
                        "last_seen": current_timestamp
                    })
                else:
                    # Existing node: Update last_seen and check for name changes
                    cached_node = node_cache[pnode_id]
                    
                    # If this is the first time we've seen it (because the DB column was previously null)
                    if not cached_node['first_seen']:
                        cached_node['first_seen'] = current_timestamp
                        cached_node['needs_update'] = True
                        
                    # Always push the last_seen forward
                    cached_node['last_seen'] = current_timestamp
                    cached_node['needs_update'] = True

                    # Check if PJM renamed the node
                    if current_name and cached_node['name'] != current_name:
                        cached_node['name'] = current_name
                        cached_node['needs_update'] = True

                # 2. Prep the LMP data
                lmp_rows_to_insert.append({
                    "iso_id": pjm_uuid, 
                    "pnode_id": pnode_id,
                    "timestamp_utc": current_timestamp, 
                    "energy_price": item.get('system_energy_price_da'),
                    "total_lmp": item.get('total_lmp_da'),
                    "congestion_price": item.get('congestion_price_da'),
                    "loss_price": item.get('marginal_loss_price_da')
                })

            # --- DATABASE INSERTS ---
            
            # Insert brand new nodes immediately
            if nodes_to_upsert:
                # The on_conflict parameter ensures we use our new UNIQUE constraint
                supabase.table(DB_TABLE_REGISTRY).upsert(
                    nodes_to_upsert, on_conflict="iso_id, pnode_id"
                ).execute()

            # Insert LMP data
            if lmp_rows_to_insert:
                for batch in chunk_list(lmp_rows_to_insert, 5000):
                    db_response = supabase.table(DB_TABLE_LMP).upsert(batch).execute()
                    daily_saved += len(db_response.data)

            if len(items) < 50000:
                has_more_data = False
            else:
                start_row += 50000

            time.sleep(12) # Strict rate limit

        print(f"Saved {daily_saved} LMP rows.")

    # ==========================================
    # 3. FINAL REGISTRY SYNC
    # ==========================================
    print("\n🔄 Syncing final lifecycle dates to Supabase registry...")
    final_registry_updates = []
    
    for pnode_id, data in node_cache.items():
        if data['needs_update']:
            final_registry_updates.append({
                "iso_id": pjm_uuid,
                "pnode_id": pnode_id,
                "node_name": data['name'],
                "first_seen": data['first_seen'],
                "last_seen": data['last_seen']
            })

    if final_registry_updates:
        for batch in chunk_list(final_registry_updates, 1000):
            supabase.table(DB_TABLE_REGISTRY).upsert(
                batch, on_conflict="iso_id, pnode_id"
            ).execute()
        print(f"✅ Updated lifecycle data for {len(final_registry_updates)} nodes.")

    print("\n🎉 Archive data processing complete.")

if __name__ == '__main__':
    fetch_and_hydrate_archive()
