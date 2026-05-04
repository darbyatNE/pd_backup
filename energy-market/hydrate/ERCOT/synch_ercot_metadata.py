import os
import requests
import zipfile
import io
import csv
import hashlib
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# --- SUPABASE SETUP ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") 
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_ercot_token():
    base_auth_url = "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token"
    payload = {
        "username": os.getenv("ERCOT_USERNAME"),
        "password": os.getenv("ERCOT_PASSWORD"),
        "grant_type": "password",
        "scope": "openid fec253ea-0d06-4272-a5e6-b478baeecd70 offline_access",
        "client_id": "fec253ea-0d06-4272-a5e6-b478baeecd70",
        "response_type": "id_token"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    
    print("🔐 Requesting ERCOT Token...")
    response = requests.post(base_auth_url, data=payload, headers=headers)
    response.raise_for_status()
    return response.json().get("access_token")

def generate_pnode_id(node_name: str) -> int:
    """Creates a deterministic 64-bit integer (int8) from a string node name."""
    # Hash the string and convert to an integer that fits in Postgres int8 (max 2^63 - 1)
    return int(hashlib.md5(node_name.encode('utf-8')).hexdigest(), 16) % (2**63 - 1)

def extract_and_upsert_nodes(token):
    # 1. Get ERCOT UUID from iso_registry
    print("🔍 Fetching ERCOT UUID from iso_registry...")
    iso_res = supabase.schema("planning").table("iso_registry").select("id").eq("iso_code", "ERCOT").execute()
    
    if not iso_res.data:
        print("❌ ERCOT not found in iso_registry! Please add an ERCOT row to iso_registry first.")
        return
        
    ercot_uuid = iso_res.data[0]['id']
    print(f"✅ Found ERCOT UUID: {ercot_uuid}")

    # 2. Fetch the file metadata
    headers = {
        "Authorization": f"Bearer {token}",
        "Ocp-Apim-Subscription-Key": os.getenv("ERCOT_API_KEY")
    }
    archive_url = "https://api.ercot.com/api/public-reports/archive/np4-190-cd"
    res = requests.get(archive_url, headers=headers, params={"size": 1})
    res.raise_for_status()
    
    download_url = res.json().get("archives", [])[0]["_links"]["endpoint"]["href"]
    print(f"📥 Downloading from: {download_url}")
    
    # 3. Download and extract
    file_res = requests.get(download_url, headers=headers)
    file_res.raise_for_status()
    
    unique_nodes = set()
    with zipfile.ZipFile(io.BytesIO(file_res.content)) as z:
        csv_filename = [name for name in z.namelist() if name.endswith('.csv')][0]
        with z.open(csv_filename) as f:
            content = f.read().decode('utf-8').splitlines()
            reader = csv.DictReader(content)
            for row in reader:
                if 'SettlementPoint' in row:
                    unique_nodes.add(row['SettlementPoint'])

    print(f"✅ Extracted {len(unique_nodes)} unique nodes. Preparing database payload...")

    # 4. Format for iso_lmps Schema
    current_time = datetime.now(timezone.utc).isoformat()
    
    records = [
        {
            "iso_id": ercot_uuid,
            "pnode_id": generate_pnode_id(node),
            "node_name": node,
            "effective_date": current_time,
            "first_seen": current_time,
            "last_seen": current_time
        }
        for node in unique_nodes
    ]

    # 5. Batch Upsert to iso_lmps
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        
        response = supabase.schema("planning") \
            .table("iso_lmps") \
            .upsert(batch, on_conflict="iso_id,pnode_id,effective_date") \
            .execute()
            
        print(f"💾 Upserted batch {i // batch_size + 1} ({len(batch)} records)")

    print("🚀 ERCOT Node Registry Synchronization Complete!")

def main():
    try:
        token = get_ercot_token()
        extract_and_upsert_nodes(token)
    except Exception as e:
        print(f"❌ Script Failed: {e}")

if __name__ == "__main__":
    main()
