import os
import requests
import pandas as pd
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
# Endpoint: NP6-905-CD (Settlement Point Prices)
BASE_URL = "https://api.ercot.com/api/public-reports/np6-905-cd/spp_node_zone_hub"

# We filter for these AFTER fetching to avoid API parameter errors
TARGET_POINTS = [
    "HB_BUSAVG", "HB_HOUSTON", "HB_HUBAVG", "HB_NORTH", "HB_PAN", "HB_SOUTH", "HB_WEST",
    "LZ_AEN", "LZ_CPS", "LZ_HOUSTON", "LZ_LCRA", "LZ_NORTH", "LZ_RAYBN", "LZ_SOUTH", "LZ_WEST"
]

def get_token():
    token_url = "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token"
    payload = {
        "username": os.getenv("ERCOT_USERNAME"),
        "password": os.getenv("ERCOT_PASSWORD"),
        "grant_type": "password",
        "scope": "openid fec253ea-0d06-4272-a5e6-b478baeecd70 offline_access",
        "client_id": "fec253ea-0d06-4272-a5e6-b478baeecd70",
        "response_type": "id_token"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    try:
        r = requests.post(token_url, data=payload, headers=headers)
        r.raise_for_status()
        return r.json().get("access_token") or r.json().get("id_token")
    except Exception as e:
        print(f"❌ Auth Failed: {e}")
        return None

def fetch_rt_settled(token, date_str):
    headers = {
        "Authorization": f"Bearer {token}",
        "Ocp-Apim-Subscription-Key": os.getenv("ERCOT_API_KEY")
    }
    
    # 1. Use EXACT parameters from Documentation
    # We request the full day. We do NOT pass settlementPoint to avoid list formatting issues.
    params = {
        "deliveryDateFrom": date_str,
        "deliveryDateTo": date_str,
        "size": 100000  # Large size to ensure we get all nodes for the day
    }

    print(f"📡 Fetching RT Settled Prices (15-min) for {date_str}...")
    
    try:
        r = requests.get(BASE_URL, headers=headers, params=params)
        r.raise_for_status()
        data = r.json()
        
        if not data.get('data'):
            print("⚠️ No data found.")
            return None

        # 2. Convert to DataFrame
        cols = [f['name'] for f in data['fields']]
        df = pd.DataFrame(data['data'], columns=cols)
        
        # 3. Filter for Target Points (Hubs & Zones)
        # This is safer than passing them in the URL
        print(f"   Raw data: {len(df)} rows. Filtering for Hubs/Zones...")
        df_filtered = df[df['settlementPoint'].isin(TARGET_POINTS)].copy()
        
        # 4. Cleanup Data Types
        df_filtered['settlementPointPrice'] = pd.to_numeric(df_filtered['settlementPointPrice'])
        
        return df_filtered
        
    except Exception as e:
        print(f"❌ Fetch Failed: {e}")
        if 'r' in locals():
           print(f"   Response: {r.text}")
        return None

if __name__ == "__main__":
    token = get_token()
    if token:
        # Get Yesterday's Data (Today's might be incomplete)
        target_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        df = fetch_rt_settled(token, target_date)
        
        if df is not None:
            print(f"\n✅ Acquired {len(df)} rows (15-min intervals)")
            print(df[['settlementPoint', 'deliveryDate', 'deliveryHour', 'deliveryInterval', 'settlementPointPrice']].head())

            # Optional: Calculate Hourly Average from 15-min data
            print("\n--- Calculated Hourly Averages ---")
            hourly = df.groupby(['settlementPoint', 'deliveryDate', 'deliveryHour'])['settlementPointPrice'].mean().reset_index()
            print(hourly.head())