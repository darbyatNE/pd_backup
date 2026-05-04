import os
import requests
import time
import urllib.parse
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

# PJM Endpoint for Historical Load Forecasts
PJM_API_ENDPOINT = 'https://api.pjm.com/api/v1/load_frcstd_hist'
DB_TABLE_NAME = 'historical_load_forecasts'

supabase: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY, 
    options=ClientOptions(schema="planning")
)

# ==========================================
# 2. HELPER: 15-DAY CHUNKS
# ==========================================
def generate_safe_chunks(start_date, end_date):
    """Splits dates into 15-day chunks to safely stay under 50,000 rows."""
    chunks = []
    current_start = start_date
    while current_start <= end_date:
        current_end = current_start + timedelta(days=15)
        if current_end > end_date:
            current_end = end_date
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks

def chunk_list(data, chunk_size=5000):
    """Yields successive chunks from a list for Supabase batching."""
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]

# ==========================================
# 3. CORE LOGIC
# ==========================================
def fetch_load_forecasts():
    print("🔍 Fetching PJM UUID from registry...")
    registry_response = supabase.table('iso_registry').select('id').eq('iso_code', 'PJM').execute()
    pjm_uuid = registry_response.data[0]['id']
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}

    # Set your target historical dates here
    START_DATE = date(2024, 4, 29)
    END_DATE = date(2025, 12, 31) 
    
    date_chunks = generate_safe_chunks(START_DATE, END_DATE)

    print(f"\n🚀 STARTING FORECAST BACKFILL ({START_DATE} to {END_DATE})")

    for chunk_idx, (start_d, end_d) in enumerate(date_chunks):
        
        date_range_str = f"{start_d.strftime('%Y-%m-%d')} to {end_d.strftime('%Y-%m-%d')}"
        print(f"=== [{chunk_idx+1}/{len(date_chunks)}] {date_range_str} ===", end=" ", flush=True)

        # 🚨 UPDATED: Using forecast_hour_beginning_ept instead of datetime_beginning_ept
        params_dict = {
            'rowCount': 50000,
            'order': 'Asc',
            'startRow': 1, 
            'forecast_hour_beginning_ept': date_range_str
        }

        # Force standard URL encoding (%20 instead of +)
        query_string = urllib.parse.urlencode(
            params_dict, 
            quote_via=urllib.parse.quote
        )

        try:
            response = requests.get(PJM_API_ENDPOINT, headers=headers, params=query_string, timeout=60)
            response.raise_for_status()
            items = response.json().get('items', [])

            if not items:
                print("-> No data.")
            else:
                # 🚨 UPDATED: Mapping the correct JSON keys from the PJM Docs
                rows_to_insert = [
                    {
                        "iso_id": pjm_uuid, 
                        "evaluated_at_utc": item.get('evaluated_at_utc'),
                        "evaluated_at_ept": item.get('evaluated_at_ept'),
                        "timestamp_utc": item.get('forecast_hour_beginning_utc'),
                        "timestamp_ept": item.get('forecast_hour_beginning_ept'),
                        "forecast_area": item.get('forecast_area'),
                        "forecast_load_mw": item.get('forecast_load_mw'),
                        "data_source": "PJM API"
                    }
                    for item in items
                ]

                # Batch insert to Supabase
                total_saved = 0
                for batch in chunk_list(rows_to_insert, 5000):
                    db_response = supabase.table(DB_TABLE_NAME).insert(batch).execute()
                    total_saved += len(db_response.data)
                
                print(f"-> ✅ Saved {total_saved} rows.")

        except Exception as e:
            print(f"-> ❌ Error: {e}")

        # Strict 10-second sleep to respect PJM's 6 requests/minute limit
        time.sleep(10)

    print("\n🎉 Load forecast backfill complete.")

if __name__ == '__main__':
    fetch_load_forecasts()
