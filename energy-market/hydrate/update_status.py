# src/hydrate/update_status.py

import os
from pathlib import Path
from dotenv import load_dotenv
import pymysql

env_path = Path(__file__).resolve().parents[2] / '.env'
load_dotenv(dotenv_path=env_path)

load_dotenv()

# --- Configuration ---
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "port": int(os.getenv("DB_PORT", 3306))
}

def backfill_status_table():
    print("--- Starting Status Table Backfill ---")
    
    conn = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 1. Ensure the table exists (just in case)
        print("Verifying table structure...")
        create_sql = """
        CREATE TABLE IF NOT EXISTS pjm_hourly_status (
            datetime_beginning_ept DATETIME NOT NULL,
            status CHAR(1) NOT NULL DEFAULT 'm' COMMENT 'm=missing, u=unverified (calculated), v=verified (official)',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (datetime_beginning_ept)
        );
        """
        cursor.execute(create_sql)
        
        # 2. Perform the Backfill
        # This query finds every unique hour in the data table
        # and inserts it into the status table marked as 'v'.
        print("Migrating existing hours to status table...")
        
        backfill_sql = """
            INSERT IGNORE INTO pjm_hourly_status (datetime_beginning_ept, status)
            SELECT DISTINCT datetime_beginning_ept, 'v'
            FROM pjm_rt_hrl_lmps;
        """
        
        cursor.execute(backfill_sql)
        rows_affected = cursor.rowcount
        
        conn.commit()
        
        print(f"SUCCESS: Identified and backfilled {rows_affected} unique hours as 'v' (Verified).")
        
    except pymysql.Error as e:
        print(f"ERROR: Database operation failed: {e}")
    finally:
        if conn:
            conn.close()
            print("Connection closed.")

if __name__ == "__main__":
    backfill_status_table()
