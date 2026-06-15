"""Example usage of connectors for PJM data hydration.

This demonstrates the new modular connector pattern.
"""

from datetime import date, timedelta
from connectors import Config, PJMClient, DatabaseConnection


def test_pjm_api():
    """Test PJM API connectivity."""
    print("\n" + "="*50)
    print("TESTING PJM API CONNECTION")
    print("="*50)
    
    config = Config()
    client = PJMClient(config)
    
    # Fetch single day of day-ahead LMP
    test_date = date(2024, 1, 1)
    print(f"\n🔍 Querying DA LMP for {test_date}...")
    
    response = client.query_lmp_day_ahead(test_date)
    items = response.get('items', [])
    
    print(f"   ✅ Retrieved {len(items)} records")
    if items:
        print(f"   Sample: {items[0]}")
    
    return len(items)


def test_database_direct():
    """Test direct database connection (for local/VPN)."""
    print("\n" + "="*50)
    print("TESTING DIRECT DATABASE CONNECTION")
    print("="*50)
    
    config = Config()
    
    # Check if SSH tunnel is required
    if config.use_ssh_tunnel:
        print("⚠️  SSH tunnel configured but not using it. Set EC2_* vars to use tunnel.")
        return None
    
    db = DatabaseConnection(config)
    
    try:
        conn = db.connect()
        print("   ✅ Connected to database")
        
        # Test query
        results = db.execute(
            "SELECT COUNT(*) FROM pjm_da_hrl_lmps",
            fetch=True
        )
        count = results[0][0] if results else 0
        print(f"   📊 Total LMP records: {count:,}")
        
        conn.close()
        return count
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None


def test_database_with_tunnel():
    """Test database connection via SSH tunnel."""
    print("\n" + "="*50)
    print("TESTING DATABASE VIA SSH TUNNEL")
    print("="*50)
    
    config = Config()
    
    if not config.use_ssh_tunnel:
        print("⚠️  SSH tunnel not configured. Add EC2_HOST, EC2_USER, EC2_SSH_KEY_PATH to .env")
        return None
    
    db = DatabaseConnection(config)
    
    try:
        with db.tunnel():
            conn = db.connect()
            print("   ✅ Connected to database via tunnel")
            
            # Test query
            results = db.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' LIMIT 5",
                fetch=True
            )
            print(f"   📋 Sample tables: {[r[0] for r in results]}")
            
            conn.close()
        
        return True
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None


def hydrate_pjm_da_lmps(start_date: date, end_date: date):
    """Full hydration example: Fetch from PJM API and insert to database.
    
    This demonstrates the complete data flow:
    1. Connect to PJM API
    2. Fetch DA LMP data for date range
    3. Connect to database via SSH tunnel
    4. Insert data with upsert logic
    """
    print("\n" + "="*50)
    print(f"HYDRATING PJM DA LMP: {start_date} to {end_date}")
    print("="*50)
    
    config = Config()
    
    # Initialize clients
    pjm = PJMClient(config)
    db = DatabaseConnection(config)
    
    total_fetched = 0
    total_inserted = 0
    
    # Use tunnel context for DB operations
    with db.tunnel():
        conn = db.connect()
        
        # Process each day
        current = start_date
        while current <= end_date:
            print(f"\n📅 Processing {current}...")
            
            # Fetch from PJM
            items = list(pjm.fetch_date_range(current, current, 'da_hrl_lmps'))
            total_fetched += len(items)
            
            if not items:
                print("   ⚠️  No data returned")
                current += timedelta(days=1)
                continue
            
            # Transform to database rows
            rows = []
            for item in items:
                rows.append({
                    'datetime_beginning_ept': item.get('datetime_beginning_ept'),
                    'pnode_id': item.get('pnode_id'),
                    'pnode_name': item.get('pnode_name'),
                    'system_energy_price_da': item.get('system_energy_price_da'),
                    'total_lmp_da': item.get('total_lmp_da'),
                    'congestion_price_da': item.get('congestion_price_da'),
                    'marginal_loss_price_da': item.get('marginal_loss_price_da')
                })
            
            # Insert to database
            inserted = db.upsert_batch(
                table='pjm_da_hrl_lmps',
                data=rows,
                conflict_keys=['datetime_beginning_ept', 'pnode_id'],
                update_cols=['system_energy_price_da', 'total_lmp_da', 
                           'congestion_price_da', 'marginal_loss_price_da'],
                batch_size=1000
            )
            total_inserted += inserted
            
            print(f"   ✅ Fetched: {len(items)}, Inserted: {inserted}")
            
            current += timedelta(days=1)
        
        conn.close()
    
    print(f"\n🏁 COMPLETE: Fetched {total_fetched:,}, Inserted {total_inserted:,}")
    return total_inserted


if __name__ == '__main__':
    # Run tests
    test_pjm_api()
    test_database_direct()
    test_database_with_tunnel()
    
    # Uncomment to run full hydration:
    # hydrate_pjm_da_lmps(date(2024, 1, 1), date(2024, 1, 3))
