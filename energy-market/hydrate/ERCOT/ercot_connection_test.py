import os
import requests
import json
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Supabase Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") # service_role for RLS bypass
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_ercot_iso_id():
    """Fetch the ERCOT UUID from the database."""
    response = supabase.table('isos').select('id').eq('name', 'ERCOT').execute()
    if not response.data:
        raise ValueError("ERCOT not found in the 'isos' table.")
    return response.data[0]['id']

def get_ercot_token():
    """Authenticates with ERCOT's Azure B2C and returns a token."""
    username = os.getenv("ERCOT_USERNAME")
    password = os.getenv("ERCOT_PASSWORD")
    api_key = os.getenv("ERCOT_API_KEY")

    base_auth_url = "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token"
    
    payload = {
        "username": username,
        "password": password,
        "grant_type": "password",
        "scope": "openid fec253ea-0d06-4272-a5e6-b478baeecd70 offline_access",
        "client_id": "fec253ea-0d06-4272-a5e6-b478baeecd70",
        "response_type": "id_token"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    print("🔐 Requesting ERCOT Token...")
    response = requests.post(base_auth_url, data=payload, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    token = data.get("access_token") or data.get("id_token")
    
    if not token:
        raise ValueError("Token not found in response.")
    
    print("✅ Token Acquired")
    return token

def fetch_ercot_data(token):
    """Fetches the actual metadata using the Bearer token."""
    # Using your working endpoint. 
    # Note: If you need a different report for Settlement Points later, just swap this URL.
    url = "https://api.ercot.com/api/public-reports/np3-907-ex/2d_agg_edc"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Ocp-Apim-Subscription-Key": os.getenv("ERCOT_API_KEY")
    }
    
    # Grab a larger batch of records (adjust 'size' as needed based on ERCOT limits)
    params = {"size": 5000} 
    
    print("📡 Downloading ERCOT Data...")
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    
    # ERCOT usually wraps the array in a 'data' key
    return response.json().get('data', [])

def main():
    try:
        iso_id = get_ercot_iso_id()
        token = get_ercot_token()
        raw_data = fetch_ercot_data(token)
        
        if not raw_data:
            print("⚠️ No data returned from ERCOT.")
            return

        print(f"⚙️ Formatting {len(raw_data)} ERCOT records...")
        formatted_nodes = []
        
        for item in raw_data:
            # ⚠️ IMPORTANT: Update these item.get() keys based on the exact JSON 
            # your test script printed out!
            node = {
                "iso_id": iso_id,
                "pnode_id": str(item.get("SettlementPoint", item.get("id", "UNKNOWN"))), 
                "pnode_name": item.get("SettlementPointName", "Unknown Node"),
                "effective_date": item.get("OperDay", item.get("DeliveryDate", "2024-01-01")),
                "type": "ERCOT_NODE" # Update if the JSON provides a type (e.g., HUB, LZN)
            }
            formatted_nodes.append(node)
            
        print("🛡️ Deduplicating records based on Primary Key...")
        seen_pks = set()
        unique_nodes = []
        
        for node in formatted_nodes:
            pk = (node["iso_id"], node["pnode_id"], node["effective_date"])
            if pk not in seen_pks:
                seen_pks.add(pk)
                unique_nodes.append(node)

        print(f"🚀 Upserting {len(unique_nodes)} unique ERCOT nodes into Supabase...")
        
        # Upsert using the exact same composite key constraint as PJM
        response = supabase.table('iso_lmps').upsert(
            unique_nodes, 
            on_conflict="iso_id,pnode_id,effective_date"
        ).execute()
        
        print("✅ ERCOT metadata successfully synchronized!")

    except Exception as e:
        print(f"❌ Script Failed: {e}")

if __name__ == "__main__":
    main()
