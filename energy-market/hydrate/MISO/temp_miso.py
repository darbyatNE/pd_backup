import os
import requests
from datetime import datetime
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
        raise ValueError("MISO not found in 'iso_registry'. Please check your database.")
    return response.data[0]['id']

def fetch_miso_aggregated_nodes():
    """Paginates through the MISO Aggregated Pnode API."""
    headers = {'Ocp-Apim-Subscription-Key': MISO_API_KEY}
    
    all_nodes = []
    page_number = 1
    
    print("📡 Downloading Aggregated Nodes and Types from MISO...")
    
    while True:
        url = f"https://apim.misoenergy.org/pricing/v1/aggregated-pnode?pageNumber={page_number}"
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        payload = response.json()
        
        # Extract the node array from the "data" key
        items = payload.get('data', [])
        all_nodes.extend(items)
        
        # Extract pagination info from the "page" key
        page_info = payload.get('page', {})
        total_pages = page_info.get('totalPages', 1)
        is_last_page = page_info.get('lastPage', True)
        
        print(f"   ...downloaded page {page_number}/{total_pages} ({len(all_nodes)} nodes so far).")
        
        if is_last_page or page_number >= total_pages:
            break
            
        page_number += 1
        
    return all_nodes

def main():
    miso_uuid = get_miso_uuid()
    miso_data = fetch_miso_aggregated_nodes()
    
    if not miso_data:
        print("⚠️ No data retrieved. Exiting.")
        return

    print("⚙️ Formatting and deduplicating MISO data for Supabase...")
    unique_nodes = {}
    
    # Use today's date as the effective date since we are pulling the current model
    current_date = datetime.now().strftime('%Y-%m-%d')
    
    for item in miso_data:
        raw_node_name = item.get('node')
        if not raw_node_name:
            continue
            
        # 🚨 MISO uses strings for IDs (e.g., 'ALTW.WELLS1'). 
        # We hash it into an 8-digit integer to satisfy your 'pnode_id' integer column.
        pnode_id = abs(hash(raw_node_name)) % (10 ** 8) 
        
        composite_key = (pnode_id, current_date)
        
        unique_nodes[composite_key] = {
            "iso_id": miso_uuid,
            "pnode_id": pnode_id,
            "node_name": raw_node_name,
            "effective_date": current_date,
            "termination_date": None,
            "node_type": item.get('nodeType', 'UNKNOWN') # Captures "Hubs", etc.
        }

    nodes_to_upsert = list(unique_nodes.values())
    print(f"   ...reduced to {len(nodes_to_upsert)} unique nodes.")

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

    print("🎉 Success! Your MISO metadata is fully synced.")

if __name__ == "__main__":
    main()
