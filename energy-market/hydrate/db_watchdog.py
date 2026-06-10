# src/hydrate/watchdog.py

import os
import sys
import time
import pymysql
from dotenv import load_dotenv
from datetime import datetime, timedelta

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(current_dir)
sys.path.append(parent_dir)

from pjm_query_rt_5min_unver import fetch_and_upsert_batch
from pjm_query_rt_constraints import fetch_constraints_batch 
from db_dailysync import run_all_syncs, DB_CONFIG

load_dotenv()

def get_last_processed_hour():
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT MAX(datetime_beginning_ept) FROM pjm_rt_hrl_lmps")
        result = cursor.fetchone()
        last_time = result[0] if result else None
        if not last_time:
            return datetime.now() - timedelta(days=2)
        return last_time
    finally:
        conn.close()

def calculate_and_save_hourly(target_hour_start):
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    target_hour_end = target_hour_start + timedelta(minutes=59, seconds=59)
    print(f"   🧮 Aggregating Hour: {target_hour_start}")

    try:
        sql_price = """
        INSERT INTO pjm_rt_hrl_lmps (datetime_beginning_ept, pnode_id, total_lmp_rt, congestion_price_rt, marginal_loss_price_rt)
        SELECT 
            DATE_FORMAT(datetime_beginning_ept, '%%Y-%%m-%%d %%H:00:00') as hr_start,
            pnode_id,
            AVG(total_lmp_rt), AVG(congestion_price_rt), AVG(marginal_loss_price_rt)
        FROM pjm_rt_unverified_fivemin_lmps
        WHERE datetime_beginning_ept BETWEEN %s AND %s
        GROUP BY pnode_id, hr_start
        ON DUPLICATE KEY UPDATE
            total_lmp_rt = VALUES(total_lmp_rt),
            congestion_price_rt = VALUES(congestion_price_rt),
            marginal_loss_price_rt = VALUES(marginal_loss_price_rt);
        """
        cursor.execute(sql_price, (target_hour_start, target_hour_end))
        
        sql_status = """
        INSERT INTO pjm_hourly_status (datetime_beginning_ept, status)
        VALUES (%s, 'u') ON DUPLICATE KEY UPDATE status = 'u';
        """
        cursor.execute(sql_status, (target_hour_start,))
        conn.commit()
    except Exception as e:
        print(f"      ❌ Aggregation Error: {e}")
    finally:
        conn.close()

def run_smart_cycle():
    print("\n🔎 Checking Database Status...")
    last_processed = get_last_processed_hour()
    next_target = last_processed
    
    now = datetime.now()
    current_hour_floor = datetime(now.year, now.month, now.day, now.hour)

    print(f"📉 Processing from {next_target} up to Current Hour ({current_hour_floor})...")

    while next_target <= current_hour_floor:
        loop_start_time = time.time()
        window_end = next_target + timedelta(minutes=59, seconds=59)
        
        fetch_and_upsert_batch(next_target, window_end)
        try:
            fetch_constraints_batch(next_target, window_end)
        except Exception as e:
            print(f"      ⚠️ Constraint Fetch Failed (Skipping): {e}")

        # 3. Update Average & Set Status 'u' Unverified
        calculate_and_save_hourly(next_target)
        
        if next_target == current_hour_floor:
            print(f"      ⚡ Updated LIVE Partial Average for {next_target}")
            return False
        
        next_target += timedelta(hours=1)
        
        elapsed = time.time() - loop_start_time
        if (12 - elapsed) > 0:
            time.sleep(12 - elapsed)
            
    return True

if __name__ == "__main__":
    print("🚀 Starting Integrated Watchdog...")
    last_sweep = datetime.min 
    
    while True:
        try:
            # Runs Every 6 Hours
            if datetime.now() - last_sweep > timedelta(hours=6):
                run_all_syncs()
                last_sweep = datetime.now()
                print("      ⏳ Pausing 10s after Sync...")
                time.sleep(10)

            # Runs Every 5 Min
            did_work = run_smart_cycle()
            
            if not did_work:
                print("💤 Up to date. Waiting 5 minutes...")
                time.sleep(300)

        except KeyboardInterrupt:
            print("\n🛑 Stopping...")
            break
        except Exception as e:
            print(f"CRITICAL ERROR: {e}")
            time.sleep(60)
