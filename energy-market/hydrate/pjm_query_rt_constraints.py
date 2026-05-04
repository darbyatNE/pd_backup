import os
import sys
import time
import requests
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv
from datetime import date, datetime, timedelta

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
API_URL = "https://api.pjm.com/api/v1/rt_marginal_value" 
TABLE_NAME = "pjm_binding_constraints"

def fetch_pjm_data(start_dt: datetime, end_dt: datetime, api_key: str) -> list:
    """
    Fetches records for a specific DATETIME range.
    """
    headers = {'Ocp-Apim-Subscription-Key': api_key}
    start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
    end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
    
    params = {
        'startRow': 1,
        'rowCount': 50000, 
        'datetime_beginning_ept': start_str,
        'datetime_ending_ept': end_str,
        'format': 'json'
    }

    if (end_dt - start_dt) > timedelta(hours=1):
        print(f"      ⛓️  Fetching PJM Constraints: {start_str} to {end_str}...")

    try:
        response = requests.get(API_URL, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        items = response.json().get('items', [])
        return items
    except requests.exceptions.RequestException as e:
        print(f"      ⚠️ API Error ({start_str}): {e}")
        return []

def save_data_to_mysql(conn, items: list) -> int:
    """Saves a list of PJM constraint items to the MySQL database."""
    if not items:
        return 0
        
    cursor = conn.cursor()
    
    sql = f'''
        INSERT IGNORE INTO {TABLE_NAME} (
            datetime_beginning_ept, monitored_facility, contingency_facility,
            transmission_constraint_penalty_factor, limit_control_percentage, shadow_price
        ) VALUES (%s, %s, %s, %s, %s, %s)
    '''
    
    rows_to_insert = [
        (
            item.get('datetime_beginning_ept'), item.get('monitored_facility'),
            item.get('contingency_facility'), item.get('transmission_constraint_penalty_factor'),
            item.get('limit_control_percentage'), item.get('shadow_price')
        ) for item in items
    ]
        
    try:
        cursor.executemany(sql, rows_to_insert)
        conn.commit()
        return cursor.rowcount
    except pymysql.Error as e:
        print(f"      ❌ DB Insert Error: {e}")
        conn.rollback()
        return 0

# --- Watchdog Entry---

def fetch_constraints_batch(start_dt: datetime, end_dt: datetime):
    """
    Called by db_watchdog.py to sync a specific window (e.g., 1 hour).
    """
    conn = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        items = fetch_pjm_data(start_dt, end_dt, PJM_API_KEY)
        if items:
            count = save_data_to_mysql(conn, items)
            print(f"      ⛓️  Constraints: {len(items)} fetched, {count} inserted.")
        else:
            pass
    except Exception as e:
        print(f"      ⚠️ Constraint Batch Failed: {e}")
        raise e
    finally:
        if conn: conn.close()

# --- Backfill Entry ---

if __name__ == "__main__":
    
    if not all([PJM_API_KEY, DB_CONFIG["host"]]):
        print("--- CONFIGURATION ERROR: Check .env file ---")
        sys.exit(1)

    if len(sys.argv) > 2:
        START_DATE_STR = sys.argv[1]
        END_DATE_STR = sys.argv[2]
        print(f"--- Dynamic Mode: Processing {START_DATE_STR} to {END_DATE_STR} ---")
    else:
        START_DATE_STR = "2025-11-21"
        END_DATE_STR = "2025-11-21"
        print(f"--- Manual Mode: Processing {START_DATE_STR} to {END_DATE_STR} ---")

    # Convert strings
    start_date = date.fromisoformat(START_DATE_STR)
    end_date = date.fromisoformat(END_DATE_STR)
    
    conn = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        
        # Loop by Day
        current_date = start_date
        while current_date <= end_date:
            dt_start = datetime.combine(current_date, datetime.min.time())
            dt_end = datetime.combine(current_date, datetime.max.time())
            
            items = fetch_pjm_data(dt_start, dt_end, PJM_API_KEY)
            
            if items:
                rows = save_data_to_mysql(conn, items)
                print(f"   -> {current_date}: {len(items)} items, {rows} new.")
            else:
                print(f"   -> {current_date}: No constraints found.")
            
            current_date += timedelta(days=1)
            time.sleep(2) # Rate limit safety
            
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
    finally:
        if conn: conn.close()
