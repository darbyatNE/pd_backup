import csv
import os
import json
import urllib.request
import urllib.error

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH  = os.path.join(REPO_ROOT, 'tools', 'pjm_simulated_lmps.csv')

SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co'

def load_env():
    env_path = os.path.join(REPO_ROOT, '.env')
    vals = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                vals[k.strip()] = v.strip()
    return vals

_env = load_env()
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or _env.get('SUPABASE_SERVICE_ROLE_KEY', '')

HEADERS = {
    'apikey':          SERVICE_KEY,
    'Authorization':   f'Bearer {SERVICE_KEY}',
    'Content-Type':    'application/json',
    'Content-Profile': 'planning',
    'Accept-Profile':  'planning',
    'Prefer':          'resolution=merge-duplicates',
}

def load_csv():
    rows = []
    with open(CSV_PATH, newline='') as f:
        for row in csv.DictReader(f):
            rows.append({
                'iso_id':    row['iso_id'],
                'name':      row['name'],
                'pnode_id':  int(row['pnode_id']) if row['pnode_id'].isdigit() else None,
                'month':     int(row['month']),
                'year':      int(row['year']),
                'total_lmp': float(row['total_lmp']),
            })
    return rows

def upsert_batch(rows):
    payload = json.dumps(rows).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/lmp_forecast',
        data=payload,
        headers=HEADERS,
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def main():
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set in environment.")
        return

    rows = load_csv()
    print(f"Loaded {len(rows):,} rows from {CSV_PATH}")

    BATCH_SIZE = 500
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        status, err = upsert_batch(batch)
        if err:
            print(f"  Batch {i//BATCH_SIZE + 1} FAILED ({status}): {err}")
            break
        total += len(batch)
        print(f"  Inserted batch {i//BATCH_SIZE + 1} — {total:,}/{len(rows):,} rows")

    print(f"Done! {total:,} rows seeded into planning.lmp_forecast")

if __name__ == '__main__':
    main()
