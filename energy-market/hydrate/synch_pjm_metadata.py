import os
import requests
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv

# Load environment variables from a .env file
load_dotenv()

PJM_API_KEY = os.getenv("PJM_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") 

# 🚨 THE FIX: Explicitly set the schema in the ClientOptions
opts = ClientOptions(schema="planning")

# Initialize Supabase client with the options
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)

def get_pjm_uuid():
    """Fetches the UUID for PJM from the iso_registry table."""
    print("🔍 Fetching PJM ISO ID from database...")
    response = supabase.table('iso_registry').select('id').eq('iso_code', 'PJM').execute()
    
    if not response.data:
        raise ValueError("PJM not found in the 'iso_registry' table. Please check your database.")
    return response.data[0]['id']

def fetch_all_pnodes():
    """Paginates through the PJM API to get every historical and active node."""
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}
    start_row = 1
    row_count = 10000 # Fetch in chunks of 10k
    all_nodes = []

    print("📡 Downloading metadata from PJM API...")
    while True:
        url = f"https://api.pjm.com/api/v1/pnode?rowCount={row_count}&startRow={start_row}"
        response = requests.get(url, headers=headers)
        response.raise_for_status() # Catch any HTTP errors
        
        data = response.json()
        items = data.get('items', [])
        
        if not items:
            break # Exit loop when no more items are returned
            
        all_nodes.extend(items)
        print(f"   ...downloaded {len(all_nodes)} nodes so far.")
        start_row += row_count
        
    return all_nodes

def main():
    # 1. Get the correct ISO ID
    pjm_uuid = get_pjm_uuid()
    
    # 2. Fetch all nodes from PJM
    pjm_data = fetch_all_pnodes()
    
    # 3. Transform and DEDUPLICATE the data for Supabase
    print("⚙️ Formatting and deduplicating data for Supabase...")
    unique_nodes = {}
    
    for item in pjm_data:
        pnode_id = int(item['pnode_id'])
        raw_effective_date = item.get('effective_date')
        
        # Normalize the date to YYYY-MM-DD to catch hidden duplicates
        clean_effective_date = raw_effective_date[:10] if raw_effective_date else "1970-01-01"
        
        # Create a composite key using the normalized date
        composite_key = (pnode_id, clean_effective_date)
        
        unique_nodes[composite_key] = {
            "iso_id": pjm_uuid,
            "pnode_id": pnode_id,
            "node_name": item.get('pnode_name'),
            "effective_date": clean_effective_date, 
            "termination_date": item.get('termination_date'),
            "node_type": item.get('pnode_type'), # 🚨 UPDATED: Maps to Supabase 'node_type' column
            "pnode_subtype": item.get('pnode_subtype')
        }

    # Convert the dictionary values back into a list for batching
    nodes_to_upsert = list(unique_nodes.values())
    print(f"   ...reduced from {len(pjm_data)} raw rows to {len(nodes_to_upsert)} unique versions.")

    # 4. Upsert into Supabase in batches to avoid payload limits
    batch_size = 1000
    total_batches = (len(nodes_to_upsert) // batch_size) + 1
    
    print(f"🚀 Upserting {len(nodes_to_upsert)} nodes into the 'iso_lmps' table across {total_batches} batches...")
    for i in range(0, len(nodes_to_upsert), batch_size):
        batch = nodes_to_upsert[i:i+batch_size]
        
        # The on_conflict parameter ensures we update existing rows based on the composite Primary Key
        supabase.table('iso_lmps').upsert(
            batch, 
            on_conflict="iso_id,pnode_id,effective_date"
        ).execute()

        current_batch = (i // batch_size) + 1
        print(f"   ✅ Batch {current_batch}/{total_batches} complete.")

    print("🎉 Success! Your registry is now fully hydrated with official PJM metadata.")

if __name__ == "__main__":
    main()
