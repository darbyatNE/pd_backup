import os
import requests
import pandas as pd
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
# 1. Endpoint for Day-Ahead Settlement Point Prices
BASE_URL = "https://api.ercot.com/api/public-reports/np4-190-cd/dam_spp"

# 2. Define the specific Settlement Points we care about (Hubs & Zones)
# This list covers the major trading points.
TARGET_POINTS = [
    "HB_BUSAVG", "HB_HOUSTON", "HB_HUBAVG", "HB_NORTH", "HB_PAN", "HB_SOUTH", "HB_WEST",
    "LZ_AEN", "LZ_CPS", "LZ_HOUSTON", "LZ_LCRA", "LZ_NORTH", "LZ_RAYBN", "LZ_SOUTH", "LZ_WEST"
]

def get_token():
    """(Reusing your working auth logic)"""
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

def fetch_da_prices(token, date_str):
    """
    Fetches DA prices for a specific date (YYYY-MM-DD).
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Ocp-Apim-Subscription-Key": os.getenv("ERCOT_API_KEY")
    }
    
    # Query Parameters
    # deliveryDate: The operating day we want prices for
    # settlementPoint: We can filter server-side to save bandwidth!
    # Note: We repeat the 'settlementPoint' key for multiple values
    params = [
        ("deliveryDate", date_str),
        ("sort", "hourEnding:asc,settlementPoint:asc")
    ]
    
    # Add multiple settlementPoint filters
    for point in TARGET_POINTS:
        params.append(("settlementPoint", point))

    print(f"📡 Fetching DA Prices for {date_str}...")
    
    try:
        r = requests.get(BASE_URL, headers=headers, params=params)
        r.raise_for_status()
        data = r.json()
        
        # Convert to DataFrame
        cols = [f['name'] for f in data['fields']]
        df = pd.DataFrame(data['data'], columns=cols)
        
        return df
        
    except Exception as e:
        print(f"❌ Fetch Failed: {e}")
        if 'r' in locals():
            print(r.text)
        return None

if __name__ == "__main__":
    token = get_token()
    if token:
        # Example: Get prices for Tomorrow (or Today)
        # ERCOT DA Market runs 1 day ahead, so let's try to get "Tomorrow's" prices
        # If they aren't out yet (before 10am), this might return empty, so we fallback to Today.
        target_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        print
        df = fetch_da_prices(token, target_date)
        
        if df is not None and not df.empty:
            print(f"\n✅ Acquired {len(df)} rows for {target_date}")
            print(df.head(10))
            
            # Optional: Save to CSV
            # df.to_csv(f"ercot_da_prices_{target_date}.csv", index=False)
        else:
            print("⚠️ No data found (Market might not have cleared yet). Trying Today...")
            target_date = datetime.now().strftime('%Y-%m-%d')
            df = fetch_da_prices(token, target_date)
            if df is not None:
                print(f"\n✅ Acquired {len(df)} rows for {target_date}")
                print(df.head(10))