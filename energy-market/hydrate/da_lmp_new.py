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
DB_TABLE_NAME = 'da_lmp'

supabase: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY, 
    options=ClientOptions(schema="planning")
)

# ==========================================
# 2. MASTER PNODE LIST (40 Nodes)
# ==========================================
PNODE_IDS = [
  5413134, 31252687, 40523629, 56958967, 81436855, 1124361945, 2156111904,
  51217, 51287, 51288, 4669664, 33092311, 33092313, 33092315,
  34497125, 34497127, 34497151, 35010337, 116013751, 51291, 8445784,
  8394954, 116013753, 51292, 33092371, 34508503, 124076095, 34964545,
  51293, 37737283, 970242670, 51295, 51296, 1709725933, 51297,
  51300, 51298, 51299, 51301, 7633629
]

# ==========================================
# 3. HELPER: 170-DAY CHUNKS
# ==========================================
def generate_safe_chunks(start_date, end_date):
    """Splits dates into safe 170-day chunks to avoid PJM's 180-day limit."""
    chunks = []
    current_start = start_date
    while current_start <= end_date:
        current_end = current_start + timedelta(days=170)
        if current_end > end_date:
            current_end = end_date
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks

def chunk_list(data, chunk_size=10000):
    """Yields successive chunks from a list for Supabase batching."""
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]

# ==========================================
# 4. CORE LOGIC (Node-by-Node Iteration)
# ==========================================
def fetch_recent_pjm_data():
    print("🔍 Fetching PJM UUID from registry...")
    registry_response = supabase.table('iso_registry').select('id').eq('iso_code', 'PJM').execute()
    pjm_uuid = registry_response.data[0]['id']
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}

    # Set your target dates here
    START_DATE = date(2024, 4, 29)
    END_DATE = date(2025, 12, 1) 
    
    date_chunks = generate_safe_chunks(START_DATE, END_DATE)

    print(f"\n🚀 STARTING BACKFILL ({START_DATE} to {END_DATE})")

    # 1. Loop through each Node individually
    for i, pnode_id in enumerate(PNODE_IDS):
        print(f"\n=== [{i+1}/{len(PNODE_IDS)}] Processing PNode {pnode_id} ===")

        # 2. Loop through the safe 170-day date chunks for this specific node
        for chunk_idx, (start_d, end_d) in enumerate(date_chunks):
            
            date_range_str = f"{start_d.strftime('%Y-%m-%d')} to {end_d.strftime('%Y-%m-%d')}"
            print(f"   -> Chunk {chunk_idx+1}: {date_range_str}...", end=" ", flush=True)

            # Standard dictionary params - no custom URL encoding needed
            params = {
                'rowCount': 50000,
                'order': 'Asc',
                'startRow': 1, 
                'datetime_beginning_ept': date_range_str,
                'pnode_id': pnode_id
            }

            try:
                response = requests.get(PJM_API_ENDPOINT, headers=headers, params=params, timeout=60)
                response.raise_for_status()
                items = response.json().get('items', [])

                if not items:
                    print("No data.")
                else:
                    rows_to_upsert = [
                        {
                            "iso_id": pjm_uuid, 
                            "pnode_id": item.get('pnode_id'),
                            "timestamp_utc": item.get('datetime_beginning_utc'), 
                            "energy_price": item.get('system_energy_price_da'),
                            "total_lmp": item.get('total_lmp_da'),
                            "congestion_price": item.get('congestion_price_da'),
                            "loss_price": item.get('marginal_loss_price_da')
                        }
                        for item in items
                    ]

                    # Batch upsert to Supabase
                    total_saved = 0
                    for batch in chunk_list(rows_to_upsert, 10000):
                        db_response = supabase.table(DB_TABLE_NAME).upsert(batch).execute()
                        total_saved += len(db_response.data)
                    
                    print(f"Saved {total_saved} rows.")

            except Exception as e:
                print(f"❌ Error: {e}")

            # Strict 10-second sleep to respect PJM rate limits
            time.sleep(10)

    print("\n✅ Data processing complete.")

if __name__ == '__main__':
    fetch_recent_pjm_data()
