import os
import sys
import subprocess
import psycopg2
import argparse
import csv  # <--- Added
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load .env
current_dir = Path(__file__).resolve().parent
env_path = current_dir.parents[1] / '.env'
load_dotenv(dotenv_path=env_path)

# --- Configuration ---
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
    "dbname": os.getenv("DB_NAME", "pjm_data"),
    "port": int(os.getenv("DB_PORT", 5433)) 
}

CONSTRAINT_TABLE = "pjm_binding_constraints" 
LMP_EXPECTED_ROWS = 46 
CONSTRAINT_MIN_ROWS = 1

def get_hourly_range(start_date, end_date):
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    current = start
    while current < end:
        yield current
        current += timedelta(hours=1)

def check_table_gaps(cursor, table_name, start_date, end_date, expected_rows, exact_match=True):
    print(f"   Checking {table_name} (Target: {'==' if exact_match else '>='} {expected_rows})...")
    
    sql = f"""
        SELECT datetime_beginning_ept, COUNT(*) as cnt
        FROM {table_name}
        WHERE datetime_beginning_ept >= %s 
          AND datetime_beginning_ept < %s::timestamp + INTERVAL '1 DAY'
        GROUP BY datetime_beginning_ept
    """
    
    try:
        cursor.execute(sql, (start_date, end_date))
        results = cursor.fetchall()
    except psycopg2.Error as e:
        print(f"   [!] Error querying {table_name}: {e}")
        return set(), {}

    # Store raw counts for CSV export
    db_data = {row[0]: row[1] for row in results}
    missing_or_incomplete = set()
    
    for expected_hour in get_hourly_range(start_date, end_date):
        actual_count = db_data.get(expected_hour, 0)
        is_issue = False
        
        if actual_count == 0:
            is_issue = True
        elif exact_match and actual_count != expected_rows:
            is_issue = True
        elif not exact_match and actual_count < expected_rows:
            is_issue = True
            
        if is_issue:
            missing_or_incomplete.add(expected_hour)
            
    # RETURN BOTH: The Set of bad hours (for logic) AND the Raw Data (for CSV)
    return missing_or_incomplete, db_data

def get_optimized_ranges(unique_days):
    """
    Groups consecutive days into ranges.
    """
    if not unique_days:
        return []

    dates = sorted([datetime.strptime(d, "%Y-%m-%d") for d in unique_days])
    ranges = []
    
    range_start = dates[0]
    prev_date = dates[0]

    for i in range(1, len(dates)):
        curr_date = dates[i]
        
        is_consecutive = (curr_date - prev_date).days == 1
        within_limit = (curr_date - range_start).days < 365 

        if is_consecutive and within_limit:
            prev_date = curr_date
        else:
            ranges.append((range_start.strftime("%Y-%m-%d"), prev_date.strftime("%Y-%m-%d")))
            range_start = curr_date
            prev_date = curr_date
    ranges.append((range_start.strftime("%Y-%m-%d"), prev_date.strftime("%Y-%m-%d")))    
    return ranges

def export_audit_csv(start_date, end_date, rt_data, da_data, const_data):
    """
    Generates a CSV file with row counts for every hour in the range.
    """
    filename = f"pjm_audit_{start_date}_to_{end_date}.csv"
    print(f"\n📝 Generating Audit CSV: {filename} ...")
    
    try:
        with open(filename, mode='w', newline='') as f:
            writer = csv.writer(f)
            # Header
            writer.writerow(["Date", "Hour_EPT", "RT_LMP_Count", "DA_LMP_Count", "Constraints_Count"])
            
            # Rows
            for dt in get_hourly_range(start_date, end_date):
                date_str = dt.strftime("%Y-%m-%d")
                hour_str = dt.strftime("%H:00")
                
                # Get counts (default to 0 if missing)
                rt_c = rt_data.get(dt, 0)
                da_c = da_data.get(dt, 0)
                const_c = const_data.get(dt, 0)
                
                writer.writerow([date_str, hour_str, rt_c, da_c, const_c])
        
        print(f"   ✅ Saved successfully.")
    except Exception as e:
        print(f"   ❌ Failed to save CSV: {e}")

def run_hydrator(dates_to_fix):
    """Groups missing hours by optimized ranges and calls hydrate_db.py."""
    unique_days = sorted(list(set(dt.strftime("%Y-%m-%d") for dt in dates_to_fix)))
    
    script_path = current_dir / "hydrate_db.py"
    if not script_path.exists():
        print(f"CRITICAL ERROR: Could not find {script_path}")
        return

    ranges = get_optimized_ranges(unique_days)

    print(f"\n🚀 Starting Hydration for {len(ranges)} macro-batches...")

    for i, (start_str, end_str) in enumerate(ranges):
        print(f"\n[{i+1}/{len(ranges)}] Macro-Batch: {start_str} to {end_str}")
        try:
            cmd = [
                sys.executable, str(script_path),
                "--start", start_str,
                "--end", end_str
            ]
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            print(f"❌ Error in batch {start_str}: {e}")
        except KeyboardInterrupt:
            print("\n🛑 Process interrupted by user.")
            sys.exit(1)
        except Exception as e:
            print(f"❌ Unexpected error: {e}")

def main(start_date, end_date):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print(f"--- 🔍 Analyzing Data Status: {start_date} to {end_date} ---\n")

        # 1. Run Checks (Now capturing raw counts too)
        rt_issues, rt_counts = check_table_gaps(cursor, "pjm_rt_hrl_lmps", start_date, end_date, 
                                     expected_rows=LMP_EXPECTED_ROWS, exact_match=True)
        
        da_issues, da_counts = check_table_gaps(cursor, "pjm_da_hrl_lmps", start_date, end_date, 
                                     expected_rows=LMP_EXPECTED_ROWS, exact_match=True)
        
        const_issues = set(get_hourly_range(start_date, end_date))
        const_counts = {} 

        # 2. Combine unique timestamps
        all_issues = rt_issues.union(da_issues)
        unique_days = sorted(list(set(dt.strftime("%Y-%m-%d") for dt in all_issues)))

        # 3. Print Detailed Summary
        print("\n" + "="*40)
        print("       MISSING DATA SUMMARY")
        print("="*40)
        print(f"{'Table':<25} | {'Bad Hours':<5}")
        print("-" * 40)
        print(f"{'pjm_rt_hrl_lmps':<25} | {len(rt_issues)}")
        print(f"{'pjm_da_hrl_lmps':<25} | {len(da_issues)}")
        print(f"{CONSTRAINT_TABLE:<25} | {len(const_issues)}")
        print("-" * 40)
        print(f"{'TOTAL UNIQUE HOURS':<25} | {len(all_issues)}")
        print(f"{'DAYS TO RE-RUN':<25} | {len(unique_days)}")
        
        # 4. Generate CSV Report
        export_audit_csv(start_date, end_date, rt_counts, da_counts, const_counts)

        # 5. Execute Hydration
        if unique_days:
            print("\nMissing Ranges (Macro-Batches):")
            ranges = get_optimized_ranges(unique_days)
            for s, e in ranges:
                print(f"  • {s} -> {e}")

            print(f"\nReady to hydrate {len(unique_days)} days.")
            try:
                input("Press Enter to start hydration (or Ctrl+C to cancel)...")
            except KeyboardInterrupt:
                sys.exit(0)
                
            run_hydrator(all_issues)
        else:
            print("\n✅ No issues found. Database is complete!")

    except psycopg2.Error as e:
        print(f"Database Connection Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check DB for missing PJM data and trigger hydration.")
    parser.add_argument("--start", required=True, help="Start date in YYYY-MM-DD format")
    parser.add_argument("--end", required=True, help="End date in YYYY-MM-DD format")

    args = parser.parse_args()

    try:
        datetime.strptime(args.start, "%Y-%m-%d")
        datetime.strptime(args.end, "%Y-%m-%d")
    except ValueError:
        print("Error: Dates must be in YYYY-MM-DD format.")
        sys.exit(1)

    main(args.start, args.end)