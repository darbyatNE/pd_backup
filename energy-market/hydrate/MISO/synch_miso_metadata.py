import os
import requests
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MISO uses the same Azure APIM infrastructure style as PJM
MISO_API_KEY = os.getenv("MISO_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") 

# Enforce the planning schema domain boundary
opts = ClientOptions(schema="planning")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)

def get_miso_uuid():
    """Fetches the UUID for MISO from the iso_registry table."""
    print("🔍 Fetching MISO ISO ID from database...")
    response = supabase.table('iso_registry').select('id').eq('iso_code', 'MISO').execute()
    
    if not response.data:
        raise ValueError("MISO not found in 'iso_registry'. Please add it before running.")
    return response.data[0]['id']

def fetch_miso_nodes():
    """Fetches node metadata from the MISO Load, Generation and Interchange API."""
    headers = {'Ocp-Apim-Subscription-Key': MISO_API_KEY}
    
    # 🚨 UPDATE THIS URL: Check your MISO API portal for the exact LGI endpoint path for nodes
    base_url = "https://api.misoenergy.org/lgi/v1/nodes" 
    
    all_nodes = []
    
    print("📡 Downloading metadata from MISO API...")
    
    # Note: Adjust pagination logic based on MISO's specific LGI Swagger documentation.
    # Some MISO endpoints return all data at once, others use ?offset= & ?limit=
    try:
        response = requests.get(base_url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # 🚨 UPDATE THIS KEY: Adjust 'items' based on the actual JSON response wrapper
        all_nodes = data.get('items', data) 
        print(f"   ...downloaded {len(all_nodes)} MISO nodes.")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to fetch from MISO API: {e}")
        
    return all_nodes

def main():
    miso_uuid = get_miso_uuid()
    miso_data = fetch_miso_nodes()
    
    if not miso_data:
        print("⚠️ No data retrieved. Exiting.")
        return

    print("⚙️ Formatting and deduplicating MISO data for Supabase...")
    unique_nodes = {}
    
    for item in miso_data:
        # 🚨 UPDATE THESE KEYS: Map to the exact JSON keys returned by MISO
        # MISO often uses string IDs (e.g., 'CPNode') rather than integers
        raw_pnode_id = item.get('node_id', item.get('cpnode_name')) 
        
        # Supabase expects an integer for pnode_id based on your PJM script. 
        # If MISO uses string IDs, you may need to hash it or update your DB schema.
        try:
            pnode_id = int(raw_pnode_id)
        except (ValueError, TypeError):
            # Fallback hash if MISO uses purely alphabetical node names as IDs
            pnode_id = abs(hash(raw_pnode_id)) % (10 ** 8) 

        raw_effective_date = item.get('effective_date')
        clean_effective_date = str(raw_effective_date)[:10] if raw_effective_date else "1970-01-01"
        
        composite_key = (pnode_id, clean_effective_date)
        
        unique_nodes[composite_key] = {
            "iso_id": miso_uuid,
            "pnode_id": pnode_id,
            "node_name": item.get('node_name', raw_pnode_id),
            "effective_date": clean_effective_date,
            "termination_date": item.get('termination_date'),
            "node_type": item.get('node_type', 'UNKNOWN')
        }

    nodes_to_upsert = list(unique_nodes.values())
    print(f"   ...reduced to {len(nodes_to_upsert)} unique versions.")

    batch_size = 1000
    total_batches = (len(nodes_to_upsert) // batch_size) + 1
    
    print(f"🚀 Upserting {len(nodes_to_upsert)} MISO nodes into 'iso_lmps'...")
    for i in range(0, len(nodes_to_upsert), batch_size):
        batch = nodes_to_upsert[i:i+batch_size]
        current_batch = (i // batch_size) + 1
        
        try:
            supabase.table('iso_lmps').upsert(
                batch, 
                on_conflict="iso_id,pnode_id,effective_date"
            ).execute()
            print(f"   ✅ Batch {current_batch}/{total_batches} complete.")
        except Exception as e:
            print(f"   ❌ Error in Batch {current_batch}: {e}")

    print("🎉 Success! MISO metadata synchronization complete.")

if __name__ == "__main__":
    main()
