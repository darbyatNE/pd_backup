# src/hydrate/dailysync.py

import os
import sys
import subprocess
import requests
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv
from datetime import date, timedelta, datetime

load_dotenv()

PJM_API_KEY = os.getenv("PJM_API_KEY")

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "cursorclass": DictCursor
}

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

SUBPROCESS_TASKS = [
    {
        "name": "Day-Ahead Hourly LMP",
        "table": "pjm_da_hrl_lmps",
        "date_col": "datetime_beginning_ept",
        "script": "pjm_query_da_lmp.py"
    },
    {
        "name": "Binding Constraints (Backfill)",
        "table": "pjm_binding_constraints",
        "date_col": "datetime_beginning_ept",
        "script": "pjm_query_rt_constraints.py"
    }
]

def get_latest_db_date(table_name, date_col):
    conn = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        with conn.cursor() as cursor:
            sql = f"SELECT MAX(DATE({date_col})) as max_date FROM {table_name}"
            cursor.execute(sql)
            result = cursor.fetchone()
            if result and result['max_date']:
                val = result['max_date']
                if isinstance(val, str): return datetime.strptime(val, "%Y-%m-%d").date()
                if isinstance(val, datetime): return val.date()
                return val
            return None
    except Exception as e:
        print(f"      [!] DB Check Error ({table_name}): {e}")
        return None
    finally:
        if conn: conn.close()

def run_subprocess_task(script_relative_path, start_date, end_date):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(current_dir, script_relative_path)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    print(f"      ▶️ Running {script_relative_path} ({start_str} to {end_str})...")
    try:
        subprocess.run([sys.executable, script_path, start_str, end_str], check=True)
    except Exception as e:
        print(f"      ❌ Failed to run {script_relative_path}: {e}")

def sync_subprocess_tasks():
    target_date = date.today() + timedelta(days=1)
    for task in SUBPROCESS_TASKS:
        last_date = get_latest_db_date(task['table'], task['date_col'])
        
        if last_date is None:
            # First run ever: go back 30 days
            start_date = date.today() - timedelta(days=30)
            run_subprocess_task(task['script'], start_date, target_date)
        elif last_date < target_date:
            # Self Healing Start
            start_date = last_date 
            run_subprocess_task(task['script'], start_date, target_date)
        else:
            print(f"      🔹 {task['name']} is up to date.")

def sync_verified_rt_prices():
    print("      🔍 Checking for Official Verified RT Data (Last 5 Days)...")
    VERIFIED_ENDPOINT = 'https://api.pjm.com/api/v1/rt_hrl_lmps'
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=5)
    
    params = {
        'rowCount': 100000, 'startRow': 1,
        'datetime_beginning_ept': f"{start_dt.strftime('%Y-%m-%d %H:%M:%S')} to {end_dt.strftime('%Y-%m-%d %H:%M:%S')}",
        'fields': 'datetime_beginning_ept,pnode_id,total_lmp_rt,congestion_price_rt,marginal_loss_price_rt'
    }
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}
    
    try:
        response = requests.get(VERIFIED_ENDPOINT, headers=headers, params=params, timeout=60)
        response.raise_for_status()
        items = response.json().get('items', [])
        
        target_ids = set(PNODE_IDS)
        filtered = [i for i in items if i.get('pnode_id') in target_ids]
        
        if not filtered:
            print("      🔹 No new verified data found.")
            return

        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        try:
            sql_price = """
            INSERT INTO pjm_rt_hrl_lmps 
            (datetime_beginning_ept, pnode_id, total_lmp_rt, congestion_price_rt, marginal_loss_price_rt)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                total_lmp_rt = VALUES(total_lmp_rt),
                congestion_price_rt = VALUES(congestion_price_rt),
                marginal_loss_price_rt = VALUES(marginal_loss_price_rt)
            """
            rows = [(i['datetime_beginning_ept'], i['pnode_id'], i['total_lmp_rt'], i['congestion_price_rt'], i['marginal_loss_price_rt']) for i in filtered]
            cursor.executemany(sql_price, rows)
            
            unique_timestamps = set(i['datetime_beginning_ept'] for i in filtered)
            sql_status = "INSERT INTO pjm_hourly_status (datetime_beginning_ept, status) VALUES (%s, 'v') ON DUPLICATE KEY UPDATE status = 'v';"
            cursor.executemany(sql_status, [(t,) for t in unique_timestamps])
            
            conn.commit()
            print(f"      ✨ Synced {len(rows)} Verified rows. Status set to 'v'.")
        finally:
            conn.close()
    except Exception as e:
        print(f"      ⚠️ Verified Sync Failed: {e}")

def run_all_syncs():
    print("\n📦 STARTING BACKGROUND SYNC...")
    sync_subprocess_tasks()
    sync_verified_rt_prices()
    print("📦 BACKGROUND SYNC COMPLETE.\n")

if __name__ == "__main__":
    run_all_syncs()
