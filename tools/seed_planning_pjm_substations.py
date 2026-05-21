import json
import os
import urllib.request
import urllib.error

REPO_ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_PATH = os.path.join(REPO_ROOT, 'frontend', 'public', 'PJM_subs_priced.geojson')

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

def load_geojson():
    with open(GEOJSON_PATH) as f:
        data = json.load(f)
    rows = []
    for feature in data['features']:
        p = feature['properties']
        rows.append({
            'objectid':      p.get('OBJECTID'),
            'sub_id':        p.get('ID'),
            'name':          p.get('NAME'),
            'city':          p.get('CITY'),
            'state':         p.get('STATE'),
            'zip':           p.get('ZIP'),
            'type':          p.get('TYPE'),
            'status':        p.get('STATUS'),
            'county':        p.get('COUNTY'),
            'countyfips':    p.get('COUNTYFIPS'),
            'country':       p.get('COUNTRY'),
            'latitude':      p.get('LATITUDE'),
            'longitude':     p.get('LONGITUDE'),
            'naics_code':    p.get('NAICS_CODE'),
            'naics_desc':    p.get('NAICS_DESC'),
            'source':        p.get('SOURCE'),
            'sourcedate':    p.get('SOURCEDATE'),
            'val_method':    p.get('VAL_METHOD'),
            'val_date':      p.get('VAL_DATE'),
            'lines':         p.get('LINES'),
            'max_volt':      p.get('MAX_VOLT'),
            'min_volt':      p.get('MIN_VOLT'),
            'max_infer':     p.get('MAX_INFER'),
            'min_infer':     p.get('MIN_INFER'),
            'pnode_id':      p.get('pnode_id'),
            'pnode_name':    p.get('pnode_name'),
            'pnode_subtype': p.get('pnode_subtype'),
            'match_score':   p.get('match_score'),
        })
    return rows

def upsert_batch(rows):
    payload = json.dumps(rows).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/pjm_substations',
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

    rows = load_geojson()
    print(f"Loaded {len(rows)} substations from GeoJSON")

    BATCH_SIZE = 200
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        status, err = upsert_batch(batch)
        if err:
            print(f"  Batch {i//BATCH_SIZE + 1} FAILED ({status}): {err}")
            break
        total += len(batch)
        print(f"  Inserted batch {i//BATCH_SIZE + 1} — {total}/{len(rows)} rows")

    print(f"Done! {total} rows seeded into planning.pjm_substations")

if __name__ == '__main__':
    main()
