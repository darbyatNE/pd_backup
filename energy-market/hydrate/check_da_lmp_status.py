#!/usr/bin/env python3
"""
Check AWS RDS connection and last LMP date in planning.da_lmp table.

FOR USE ON EC2 INSTANCE (direct connection to RDS)
Copy this script to your EC2 and run it there - no SSH tunnel needed.

Usage:
    python check_da_lmp_status.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Use psycopg2 for PostgreSQL/RDS
try:
    import psycopg2
    DB_DRIVER = "psycopg2"
except ImportError:
    print("❌ psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# Load environment variables (from .env in repo root)
env_path = Path(__file__).resolve().parents[2] / '.env'
if not env_path.exists():
    env_path = Path('/home/ubuntu/powerdime-repo/.env')  # Common EC2 path
load_dotenv(dotenv_path=env_path)

# --- Configuration ---
DB_HOST = os.getenv("DB_HOST")
if not DB_HOST:
    print("❌ DB_HOST not set in .env")
    print("   Set DB_HOST to your RDS endpoint (e.g., pd-market.xxx.us-east-2.rds.amazonaws.com)")
    sys.exit(1)

DB_CONFIG = {
    "host": DB_HOST,
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME", "pjm_data"),
    "port": int(os.getenv("DB_PORT", 5432))
}

TABLE_NAME = "da_lmp"
SCHEMA_NAME = "planning"
DATE_COLUMN = "timestamp_utc"  # Adjust if your column name differs


def check_connection():
    """Test database connection and return connection object."""
    print(f"🔌 Attempting connection to {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
    print(f"   Database: {DB_CONFIG['database']}")
    print(f"   User: {DB_CONFIG['user']}")
    
    try:
        conn = psycopg2.connect(
            host=DB_CONFIG['host'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            dbname=DB_CONFIG['database'],
            port=DB_CONFIG['port']
        )
        print("   ✅ Connection successful!")
        return conn
    except Exception as e:
        print(f"   ❌ Connection failed: {e}")
        sys.exit(1)


def get_last_lmp_date(conn):
    """Query the most recent timestamp from da_lmp table."""
    print(f"\n📊 Querying last LMP date from {SCHEMA_NAME}.{TABLE_NAME}...")
    
    cursor = conn.cursor()
    
    try:
        query = f"""
            SELECT MAX({DATE_COLUMN}) as last_date, COUNT(*) as total_rows
            FROM {SCHEMA_NAME}.{TABLE_NAME}
        """
        
        cursor.execute(query)
        result = cursor.fetchone()
        
        last_date, total_rows = result
        
        if last_date:
            # Handle different datetime formats
            if isinstance(last_date, str):
                last_date = datetime.fromisoformat(last_date.replace('Z', '+00:00'))
            
            days_ago = (datetime.now(last_date.tzinfo) - last_date).days if last_date.tzinfo else (datetime.now() - last_date).days
            
            print(f"   ✅ Last LMP date: {last_date}")
            print(f"   📈 Total rows in table: {total_rows:,}")
            
            if days_ago == 0:
                print(f"   🟢 Data is current (today)")
            elif days_ago == 1:
                print(f"   🟡 Data is 1 day old")
            elif days_ago <= 7:
                print(f"   🟠 Data is {days_ago} days old")
            else:
                print(f"   🔴 Data is {days_ago} days old - may need backfill")
        else:
            print(f"   ⚠️  No data found in table (0 rows)")
            
    except Exception as e:
        print(f"   ❌ Query failed: {e}")
        print(f"   Hint: Verify table '{SCHEMA_NAME}.{TABLE_NAME}' exists and column '{DATE_COLUMN}' is correct")
    finally:
        cursor.close()


def get_sample_data(conn):
    """Display a few sample rows for verification."""
    print(f"\n📋 Sample data (last 3 rows):")
    
    cursor = conn.cursor()
    
    try:
        query = f"""
            SELECT * FROM {SCHEMA_NAME}.{TABLE_NAME}
            ORDER BY {DATE_COLUMN} DESC
            LIMIT 3
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        if not rows:
            print("   No rows to display")
            return
            
        colnames = [desc[0] for desc in cursor.description]
        for i, row in enumerate(rows, 1):
            print(f"\n   Row {i}:")
            for col, val in zip(colnames, row):
                print(f"      {col}: {val}")
                    
    except Exception as e:
        print(f"   Could not fetch samples: {e}")
    finally:
        cursor.close()


def main():
    print("=" * 50)
    print("   DA_LMP Connection & Status Check")
    print("=" * 50)
    
    # Test connection
    conn = check_connection()
    
    # Check last date
    get_last_lmp_date(conn)
    
    # Show samples
    get_sample_data(conn)
    
    # Cleanup
    conn.close()
    print("\n🔌 Connection closed.")
    print("=" * 50)


if __name__ == "__main__":
    main()
