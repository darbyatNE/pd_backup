import os
import sys
import pymysql
from pathlib import Path
from dotenv import load_dotenv

# --- Setup Paths & Env ---
current_dir = Path(__file__).resolve().parent
env_path = current_dir.parents[1] / '.env'
load_dotenv(dotenv_path=env_path)

# --- Configuration ---
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "port": int(os.getenv("DB_PORT", 3306))
}

TABLES_TO_CLEAR = [
    "pjm_da_hrl_lmps",
    "pjm_rt_hrl_lmps",
    "pjm_binding_constraints"
]

def clear_tables():
    print("!!! WARNING: DESTRUCTIVE ACTION !!!")
    print(f"You are about to DELETE ALL DATA from: {', '.join(TABLES_TO_CLEAR)}")
    print(f"Database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}")
    
    confirm = input("\nType 'DELETE' to confirm: ")
    
    if confirm != "DELETE":
        print("Operation cancelled.")
        return

    conn = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Disable FK checks to allow truncation
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        
        for table in TABLES_TO_CLEAR:
            print(f"Truncating {table}...", end=" ")
            cursor.execute(f"TRUNCATE TABLE {table}")
            print("Done.")
            
        # Re-enable FK checks
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        
        print("\nAll specified tables have been cleared.")
        
    except pymysql.Error as e:
        print(f"\nDatabase Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    clear_tables()
