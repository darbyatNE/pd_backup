import os
import sys
import requests
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv
import time
from datetime import datetime, timedelta

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

from update_pjm_db import PNODE_IDS 

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "cursorclass": DictCursor
}

PJM_API_KEY = os.getenv("PJM_API_KEY")
PJM_API_ENDPOINT = 'https://api.pjm.com/api/v1/rt_unverified_fivemin_lmps'
DB_TABLE_NAME = 'pjm_rt_unverified_fivemin_lmps'
TARGET_PNODES = set(PNODE_IDS)

def fetch_and_upsert_batch(start_dt, end_dt):
    """
    Accepts datetime objects (e.g., 2023-10-27 08:00:00)
    """
    if not all([PJM_API_KEY, DB_CONFIG["host"]]):
        print("Error: Missing environment variables.")
        return

    time_range_string = f"{start_dt.strftime('%Y-%m-%d %H:%M:%S')} to {end_dt.strftime('%Y-%m-%d %H:%M:%S')}"
    
    print(f"   ⬇️ Fetching Raw: {time_range_string}")

    params = {
        'rowCount': 50000, 
        'order': 'Asc',
        'startRow': 1,
        'datetime_beginning_ept': time_range_string,
        'fields': 'datetime_beginning_ept,pnode_id,pnode_name,total_lmp_rt,congestion_price_rt,marginal_loss_price_rt'
    }
    
    headers = {'Ocp-Apim-Subscription-Key': PJM_API_KEY}

    try:
        response = requests.get(PJM_API_ENDPOINT, headers=headers, params=params, timeout=60)
        response.raise_for_status()
        
        all_items = response.json().get('items', [])
        filtered_items = [item for item in all_items if item.get('pnode_id') in TARGET_PNODES]
        
        if filtered_items:
            save_to_db(filtered_items)
            return len(filtered_items)
        else:
            print("      ⚠️ No data found for this window.")
            return 0

    except Exception as e:
        print(f"      ❌ Error: {e}")
        return 0

def save_to_db(items):
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    try:
        rows_to_upsert = [
            (
                item.get('datetime_beginning_ept'), item.get('pnode_id'),
                item.get('pnode_name'), item.get('total_lmp_rt'),
                item.get('congestion_price_rt'), item.get('marginal_loss_price_rt')
            ) for item in items
        ]
        
        sql_upsert = f"""
            INSERT INTO {DB_TABLE_NAME} (
                datetime_beginning_ept, pnode_id, pnode_name, total_lmp_rt, congestion_price_rt, marginal_loss_price_rt
            ) VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                total_lmp_rt = VALUES(total_lmp_rt),
                congestion_price_rt = VALUES(congestion_price_rt),
                marginal_loss_price_rt = VALUES(marginal_loss_price_rt)
        """
        cursor.executemany(sql_upsert, rows_to_upsert)
        conn.commit()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    end_d = datetime.now()
    start_d = datetime(end_d.year, end_d.month, end_d.day) 
    
    if len(sys.argv) > 2:
        start_d = datetime.fromisoformat(sys.argv[1])
        end_d = datetime.fromisoformat(sys.argv[2])

    fetch_and_upsert_batch(start_d, end_d)
