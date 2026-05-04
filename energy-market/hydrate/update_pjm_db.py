# src/hydrate/update_pjm_db.py

import os
import sys
import subprocess
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv
from datetime import date, timedelta, datetime

load_dotenv()

# --- Configuration ---
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

# --- Task Definitions ---
# Map each table to its corresponding Python script
TASKS = [
    {
        "name": "Real-Time Hourly LMP",
        "table": "pjm_rt_hrl_lmps",
        "date_col": "datetime_beginning_ept",
        "script": "pjm_query_rt_lmp.py"
    },
    {
        "name": "Day-Ahead Hourly LMP",
        "table": "pjm_da_hrl_lmps",
        "date_col": "datetime_beginning_ept",
        "script": "pjm_query_da_lmp.py"
    },
    {
        "name": "Binding Constraints",
        "table": "pjm_binding_constraints",
        "date_col": "datetime_beginning_ept",
        "script": "pjm_query_rt_constraints.py"
    },
    {
        "name": "Real-Time 5min LMP",
        "table": "pjm_rt_unverified_fivemin_lmps",
        "date_col": "datetime_beginning_ept",
        "script": "pjm_query_rt_5min_unver.py"
    }
]

def get_latest_db_date(table_name, date_col):
    """
    Queries the database for the maximum date present in the table.
    Returns a python date object.
    """
    conn = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        with conn.cursor() as cursor:
            sql = f"SELECT MAX(DATE({date_col})) as max_date FROM {table_name}"
            cursor.execute(sql)
            result = cursor.fetchone()
            
            if result and result['max_date']:
                val = result['max_date']
                # Ensure we return a date object
                if isinstance(val, str):
                    return datetime.strptime(val, "%Y-%m-%d").date()
                if isinstance(val, datetime):
                    return val.date()
                return val
            else:
                return None
    except pymysql.Error as e:
        print(f"   [!] Error checking table {table_name}: {e}")
        return None
    finally:
        if conn:
            conn.close()

def run_update_script(script_relative_path, start_date, end_date):
    """
    Runs the specific python script as a subprocess with date arguments.
    """

    current_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(current_dir, script_relative_path)
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    print(f"   >>> Launching {script_relative_path}...")
    print(f"   >>> Range: {start_str} to {end_str}")
    
    try:
        # Calls: python /full/path/to/src/hydrate/script.py YYYY-MM-DD YYYY-MM-DD
        subprocess.run(
            [sys.executable, script_path, start_str, end_str],
            check=True
        )
        print(f"   >>> {script_relative_path} finished successfully.\n")
    except subprocess.CalledProcessError as e:
        print(f"   [!!!] Error running {script_relative_path}. Exit code: {e.returncode}\n")
    except FileNotFoundError:
        print(f"   [!!!] Script file not found: {script_path}\n")

def main():
    print("==========================================")
    print("   PJM DATABASE UPDATE ORCHESTRATOR")
    print("==========================================\n")
    
    # Target Date: We usually want data up to Yesterday to ensure the day is complete.
    # If you want up to Today, use: date.today()
    target_date = date.today() - timedelta(days=1)
    
    print(f"Target Date (Up-To): {target_date}")
    print(f"Checking {len(TASKS)} tables...\n")

    for task in TASKS:
        print(f"--- Checking: {task['name']} ({task['table']}) ---")
        
        last_date = get_latest_db_date(task['table'], task['date_col'])
        
        if last_date is None:
            print(f"   Status: Table appears empty.")
            # Default start date if table is empty
            start_date = date(2016, 1, 1) 
            run_update_script(task['script'], start_date, target_date)
            
        elif last_date < target_date:
            print(f"   Status: OUT OF DATE. Last data: {last_date}")
            
            # Start from the day AFTER the last record
            start_date = last_date + timedelta(days=1)
            
            if start_date <= target_date:
                run_update_script(task['script'], start_date, target_date)
            else:
                print("   Status: Gap is too small (less than 1 day). Skipping.")
                
        else:
            print(f"   Status: UP TO DATE ({last_date}). No action.")
        
        print("") # Empty line for readability

    print("==========================================")
    print("   All checks completed.")
    print("==========================================")

if __name__ == "__main__":
    main()
