import os
import sys
import time
import requests
import psycopg2
from psycopg2 import extras, sql
from dotenv import load_dotenv
from datetime import date, datetime, timedelta
import argparse
from pathlib import Path

current_dir = Path(__file__).resolve().parent
env_path = current_dir.parents[1] / '.env'
load_dotenv(dotenv_path=env_path)

PNODE_IDS = [
    51217, 51288, 4669664, 5413134, 31252687, 33092311, 33092313,
    33092315, 34497125, 34497127, 34497151, 35010337, 40523629,
    56958967, 81436855, 116013751, 116472927, 116472931, 116472933,
    116472935, 116472937, 116472939, 116472941, 116472943,
    116472945, 116472947, 116472949, 116472951, 116472953,
    116472955, 116472957, 116472959, 126769999, 1069452904,
    1124361945, 1127872598, 1258625176, 1269364670, 1269364671,
    1269364672, 1269364674, 1288248099, 1304468347, 1441662202,
    1709726615, 2156111904
]

class Database:
    def __init__(self, config):
        try:
            print(f"🔌 Connecting to DB at {config['host']}:{config['port']}...")
            self.conn = psycopg2.connect(
                host=config['host'], 
                user=config['user'], 
                password=config['password'], 
                dbname=config['database'], 
                port=config['port'],
                options="-c statement_timeout=30000" 
            )
            self.conn.autocommit = True
            print("   ✅ Connected.")
        except Exception as e:
            print(f"   ❌ Connection Failed: {e}")
            sys.exit(1)


    def close(self):
        if self.conn:
            self.conn.close()
            print("🔌 Connection closed.")

    def check_data_exists(self, table_name, start_date, end_date):
        """
        Checks if ANY data exists in the table for the given range.
        Returns True if data exists, False if empty.
        """
        cursor = self.conn.cursor()
        query = sql.SQL("SELECT 1 FROM {} WHERE datetime_beginning_ept >= %s AND datetime_beginning_ept <= %s LIMIT 1").format(
            sql.Identifier(table_name)
        )
        try:
            # We add 23:59:59 to end_date to ensure we cover the whole day
            s_ts = f"{start_date} 00:00:00"
            e_ts = f"{end_date} 23:59:59"
            
            cursor.execute(query, (s_ts, e_ts))
            return cursor.fetchone() is not None
        except Exception as e:
            print(f"      ⚠️ Check Error: {e}")
            return False
        finally:
            cursor.close()

    def upsert_data(self, table_name, data, conflict_keys, update_cols):
        if not data:
            return

        # Deduplicate in Python first
        if conflict_keys:
            initial_count = len(data)
            unique_rows = {}
            for row in data:
                key_tuple = tuple(row.get(k) for k in conflict_keys)
                unique_rows[key_tuple] = row
            data = list(unique_rows.values())
            if len(data) < initial_count:
                print(f"      🧹 Cleaned batch: Removed {initial_count - len(data)} duplicates.")

        columns = list(data[0].keys())
        query = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(
            sql.Identifier(table_name),
            sql.SQL(', ').join(map(sql.Identifier, columns))
        )

        if conflict_keys and update_cols:
            conflict_part = sql.SQL("ON CONFLICT ({}) DO UPDATE SET {}").format(
                sql.SQL(', ').join(map(sql.Identifier, conflict_keys)),
                sql.SQL(', ').join([
                    sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(col), sql.Identifier(col))
                    for col in update_cols
                ])
            )
            query = query + sql.SQL(" ") + conflict_part

        cursor = self.conn.cursor()
        try:
            values = [[row.get(col) for col in columns] for row in data]
            extras.execute_values(cursor, query, values, page_size=1000)
            print(f"      💾 Saved {len(data)} rows to {table_name}.")
        except Exception as e:
            print(f"      ❌ DB Error in {table_name}: {e}")
        finally:
            cursor.close()

class PJMApi:
    def __init__(self, api_key):
        if not api_key:
            raise ValueError("Missing PJM_API_KEY")
        self.headers = {'Ocp-Apim-Subscription-Key': api_key}
        self.base_url = 'https://api.pjm.com/api/v1/'
        self.last_request_time = 0

    def _smart_sleep(self):
        elapsed = time.time() - self.last_request_time
        wait_time = 2.0 - elapsed 
        if wait_time > 0:
            time.sleep(wait_time)
        self.last_request_time = time.time()

    def _fetch_all_pages(self, endpoint, params, description):
        all_items = []
        start_row = 1
        BATCH_SIZE = 50000
        
        while True:
            self._smart_sleep()
            params['startRow'] = start_row
            params['rowCount'] = BATCH_SIZE
            
            try:
                url = self.base_url + endpoint
                response = requests.get(url, headers=self.headers, params=params, timeout=45)
                
                if response.status_code == 429:
                    print(f"\n      Pausing 60s...")
                    time.sleep(60)
                    continue
                    
                response.raise_for_status()
                items = response.json().get('items', [])
                
                if not items:
                    break
                    
                all_items.extend(items)
                if len(items) < BATCH_SIZE:
                    break
                start_row += BATCH_SIZE
                print(f"         ...paging {description} (row {start_row})...", end="\r")
                
            except Exception as e:
                print(f"\n      ❌ API Error ({description}): {e}")
                break
                
        return all_items

    def fetch_da_lmps(self, start_date, end_date):
        all_data = []
        endpoint = 'da_hrl_lmps'
        date_range_str = f"{start_date} to {end_date}"
        print(f"   Fetching DA LMPs ({start_date} -> {end_date})...")
        
        for i, pnode_id in enumerate(PNODE_IDS):
            print(f"      [{i+1}/{len(PNODE_IDS)}] PNode {pnode_id}...", end="\r")
            params = {
                'datetime_beginning_ept': date_range_str, 
                'pnode_id': pnode_id
            }
            items = self._fetch_all_pages(endpoint, params, f"DA {pnode_id}")
            
            for x in items:
                all_data.append({
                    'datetime_beginning_ept': x.get('datetime_beginning_ept'),
                    'pnode_id': x.get('pnode_id'),
                    'pnode_name': x.get('pnode_name'),
                    'type': x.get('type'),
                    'system_energy_price_da': x.get('system_energy_price_da'),
                    'total_lmp_da': x.get('total_lmp_da'),
                    'congestion_price_da': x.get('congestion_price_da'),
                    'marginal_loss_price_da': x.get('marginal_loss_price_da')
                })
        print(f"\n      ✅ Fetched {len(all_data)} DA records.")
        return all_data

    def fetch_rt_lmps(self, start_date, end_date):
        all_data = []
        endpoint = 'rt_hrl_lmps'
        date_range_str = f"{start_date} to {end_date}"
        print(f"   Fetching RT LMPs ({start_date} -> {end_date})...")

        for i, pnode_id in enumerate(PNODE_IDS):
            print(f"      [{i+1}/{len(PNODE_IDS)}] PNode {pnode_id}...", end="\r")
            params = {
                'datetime_beginning_ept': date_range_str, 
                'pnode_id': pnode_id
            }
            items = self._fetch_all_pages(endpoint, params, f"RT {pnode_id}")
            
            for x in items:
                all_data.append({
                    'datetime_beginning_ept': x.get('datetime_beginning_ept'),
                    'pnode_id': x.get('pnode_id'),
                    'pnode_name': x.get('pnode_name'),
                    'type': x.get('type'),
                    'system_energy_price_rt': x.get('system_energy_price_rt'),
                    'total_lmp_rt': x.get('total_lmp_rt'),
                    'congestion_price_rt': x.get('congestion_price_rt'),
                    'marginal_loss_price_rt': x.get('marginal_loss_price_rt')
                })
        print(f"\n      ✅ Fetched {len(all_data)} RT records.")
        return all_data

    def fetch_binding_constraints(self, start_date_str, end_date_str):
        endpoint = "rt_marginal_value"
        s_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
        e_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
        
        start_fmt = s_dt.strftime("%Y-%m-%dT00:00:00")
        end_fmt = e_dt.strftime("%Y-%m-%dT23:59:59")
        
        print(f"   Fetching Constraints ({start_fmt} -> {end_fmt})...")
        
        params = {
            'datetime_beginning_ept': start_fmt,
            'datetime_ending_ept': end_fmt
        }
        
        items = self._fetch_all_pages(endpoint, params, "Constraints")
        
        data = []
        for x in items:
            data.append({
                'datetime_beginning_ept': x.get('datetime_beginning_ept'),
                'monitored_facility': x.get('monitored_facility'),
                'contingency_facility': x.get('contingency_facility'),
                'transmission_constraint_penalty_factor': x.get('transmission_constraint_penalty_factor'),
                'limit_control_percentage': x.get('limit_control_percentage'),
                'shadow_price': x.get('shadow_price')
            })
        return data

def chunk_date_range(start_date, end_date, days_per_chunk):
    """Yields (chunk_start_str, chunk_end_str)"""
    current = start_date
    while current <= end_date:
        chunk_end = min(current + timedelta(days=days_per_chunk - 1), end_date)
        yield current.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")
        current = chunk_end + timedelta(days=1)

def main():
    parser = argparse.ArgumentParser(description="Hydrate PJM Database")
    parser.add_argument("--start", required=True, help="Start Date (YYYY-MM-DD)")
    parser.add_argument("--end", required=True, help="End Date (YYYY-MM-DD)")
    parser.add_argument("--force", action="store_true", help="Force overwrite even if data exists")
    args = parser.parse_args()

    db_config = {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME", "pjm_data"),
        "port": os.getenv("DB_PORT", "5433") 
    }
    
    api_key = os.getenv("PJM_API_KEY")

    try:
        db = Database(db_config) 
        api = PJMApi(api_key) 
    except Exception as e:
        print(f"❌ Initialization Error: {e}")
        sys.exit(1)

    try:
        start_date = datetime.strptime(args.start, "%Y-%m-%d")
        end_date = datetime.strptime(args.end, "%Y-%m-%d")
        
        # --- PHASE 1: LMPs (45 Day Chunks) ---
        print(f"\n=== ⚡ PHASE 1: Processing LMPs (45-Day Batches) ===")
        for s_str, e_str in chunk_date_range(start_date, end_date, 45):
            print(f"\n📅 Batch: {s_str} to {e_str}")
            
            # --- DA CHECK ---
            if not args.force and db.check_data_exists("pjm_da_hrl_lmps", s_str, e_str):
                print(f"   ⏭️  DA Data exists for {s_str}... Skipping.")
            else:
                da_data = api.fetch_da_lmps(s_str, e_str)
                db.upsert_data("pjm_da_hrl_lmps", da_data, 
                               ["datetime_beginning_ept", "pnode_id"], 
                               ["total_lmp_da", "congestion_price_da", "marginal_loss_price_da", "system_energy_price_da"])
            
            # --- RT CHECK ---
            if not args.force and db.check_data_exists("pjm_rt_hrl_lmps", s_str, e_str):
                print(f"   ⏭️  RT Data exists for {s_str}... Skipping.")
            else:
                rt_data = api.fetch_rt_lmps(s_str, e_str)
                db.upsert_data("pjm_rt_hrl_lmps", rt_data, 
                               ["datetime_beginning_ept", "pnode_id"], 
                               ["total_lmp_rt", "congestion_price_rt", "marginal_loss_price_rt", "system_energy_price_rt"])

        # --- PHASE 2: Constraints (1 Day Chunks) ---
        print(f"\n=== ⛓️ PHASE 2: Processing Constraints (1 Day Chunks) ===")
        for s_str, e_str in chunk_date_range(start_date, end_date, 1):
            const_data = api.fetch_binding_constraints(s_str, e_str)
            if const_data:
                db.upsert_data("pjm_binding_constraints", const_data, 
                               ["datetime_beginning_ept", "monitored_facility", "contingency_facility"], 
                               ["shadow_price", "transmission_constraint_penalty_factor", "limit_control_percentage"])
            else:
                print(f"      ⚠️ No constraints found for {s_str}")

    except KeyboardInterrupt:
        print("\n🛑 Stopped by user.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
