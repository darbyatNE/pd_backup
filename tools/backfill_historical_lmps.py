"""
Backfill historical LMP prices (Jan 2020 – May 2026) into planning.lmp_forecast.

Strategy:
  - Uses PJM_subs_priced.geojson for the 1,024 pnodes with pjm_zone assignments.
  - System avg for each month comes from the same formula as lmpData.ts buildPeriod():
      sysAvg = (onPeak.whAvg + offPeak.whAvg) / 2
  - Zone basis offsets ($/MWh vs system) match PJM_ZONE_BASIS in lmpData.ts.
  - Per-pnode noise: deterministic based on pnode_id + index so it's reproducible.
  - Upserts in batches of 500 to planning.lmp_forecast via Supabase REST API.
"""

import json
import math
import os
import urllib.request
import urllib.error
import uuid

_UUID_NS = uuid.UUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')

def pnode_uuid(pnode_id: int) -> str:
    return str(uuid.uuid5(_UUID_NS, str(pnode_id)))

REPO_ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_PATH = os.path.join(REPO_ROOT, 'frontend', 'public', 'PJM_subs_priced.geojson')
SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co'

# ── Env ─────────────────────────────────────────────────────────────────────
def load_env():
    env_path = os.path.join(REPO_ROOT, '.env')
    vals = {}
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    vals[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
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

# ── Price model (mirrors lmpData.ts buildPeriod) ─────────────────────────────
BASE_WH_ON  = [38.2, 39.1, 42.5, 44.8, 52.3, 58.7, 62.1, 60.4, 54.2, 46.3, 43.1, 39.8]
BASE_WH_OFF = [32.1, 33.4, 36.2, 38.5, 44.1, 50.2, 53.8, 52.1, 46.3, 39.8, 37.2, 33.9]

HISTORICAL_ACTUALS = {
    '2026-1': (44.2, 38.1), '2026-2': (46.8, 40.2),
    '2026-3': (41.3, 35.8), '2026-4': (39.7, 34.1),
}

PJM_ZONE_BASIS = {
    'AECO':    +2.8, 'AEP':     -1.2, 'APS':     -0.8, 'BGE':     +1.5,
    'COMED':   -2.1, 'DAY':     -1.8, 'DEOK':    -1.5, 'DOM':     +0.6,
    'DPL':     +2.1, 'DUQ':     -0.5, 'EKPC':    -2.4, 'FE-ATSI': -1.0,
    'JCPL':    +3.2, 'LGE':     -2.2, 'METED':   +1.8, 'PECO':    +2.5,
    'PENELEC': +0.9, 'PEPCO':   +1.2, 'PPL':     +1.4, 'PSEG':    +3.8,
    'RECO':    +4.1, 'UGI':     +1.0,
}

PJM_ZONE_SPREAD = {
    'AECO':    4.5, 'AEP':     3.0, 'APS':     3.5, 'BGE':     4.0,
    'COMED':   3.2, 'DAY':     2.8, 'DEOK':    2.5, 'DOM':     4.2,
    'DPL':     4.8, 'DUQ':     3.1, 'EKPC':    2.2, 'FE-ATSI': 3.8,
    'JCPL':    6.5, 'LGE':     2.4, 'METED':   4.0, 'PECO':    5.5,
    'PENELEC': 3.6, 'PEPCO':   4.2, 'PPL':     4.4, 'PSEG':    7.2,
    'RECO':    5.8, 'UGI':     3.0,
}

# Seasonal spread multiplier — peak months have wider congestion variance
SEASONAL_MULT = [0.9, 0.85, 0.8, 0.85, 1.0, 1.2, 1.4, 1.35, 1.1, 0.85, 0.9, 1.0]

def sys_avg(year: int, month: int) -> float:
    key = f'{year}-{month}'
    if key in HISTORICAL_ACTUALS:
        on, off = HISTORICAL_ACTUALS[key]
        return (on + off) / 2
    m = month - 1
    esc = math.pow(1.025, year - 2026)   # de-escalates for years < 2026
    wh_on  = round(BASE_WH_ON[m]  * esc, 2)
    wh_off = round(BASE_WH_OFF[m] * esc, 2)
    return (wh_on + wh_off) / 2

def pnode_price(zone: str, pnode_id: int, idx: int, year: int, month: int) -> float:
    base     = sys_avg(year, month)
    basis    = PJM_ZONE_BASIS.get(zone, 0.0)
    spread   = PJM_ZONE_SPREAD.get(zone, 3.0) * SEASONAL_MULT[month - 1]
    # Deterministic hash matching lmpData.ts formula
    t        = ((pnode_id * 2654435761 + idx * 40503) & 0xFFFFFFFF) / 0xFFFFFFFF
    noise    = (t * 2 - 1) * spread
    return round(base + basis + noise, 2)

# ── Date range: Jan 2020 – May 2026 ─────────────────────────────────────────
def month_range(from_y, from_m, to_y, to_m):
    y, m = from_y, from_m
    while (y, m) <= (to_y, to_m):
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1

# ── Load pnodes ──────────────────────────────────────────────────────────────
def load_pnodes():
    with open(GEOJSON_PATH) as f:
        gj = json.load(f)
    seen: set[int] = set()
    by_zone: dict[str, list[dict]] = {}
    for feat in gj['features']:
        p = feat['properties']
        zone  = p.get('pjm_zone')
        pid   = p.get('pnode_id')
        name  = p.get('pnode_name', '')
        if zone and pid is not None and pid not in seen:
            seen.add(pid)
            by_zone.setdefault(zone, []).append({'pid': pid, 'name': name})
    return by_zone

# ── Upsert ───────────────────────────────────────────────────────────────────
def upsert_batch(rows):
    import json as _json
    payload = _json.dumps(rows).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/lmp_forecast?on_conflict=iso_id,pnode_id,month,year',
        data=payload,
        headers=HEADERS,
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    if not SERVICE_KEY:
        print('ERROR: SUPABASE_SERVICE_ROLE_KEY not set.')
        return

    by_zone = load_pnodes()
    total_pnodes = sum(len(v) for v in by_zone.values())
    print(f'Loaded {total_pnodes} pnodes across {len(by_zone)} zones')

    months = list(month_range(2020, 1, 2026, 5))
    print(f'Generating {len(months)} months × {total_pnodes} pnodes = {len(months) * total_pnodes:,} rows')

    # Process one month at a time — each pnode_id appears only once per month
    # so there are no intra-batch duplicate constraint conflicts.
    BATCH_SIZE = 500
    total_inserted = 0
    batch_num = 0

    for year, month in months:
        month_rows = []
        for zone, pnodes in by_zone.items():
            for idx, pnode in enumerate(pnodes):
                price = pnode_price(zone, pnode['pid'], idx, year, month)
                month_rows.append({
                    'iso_id':    pnode_uuid(pnode['pid']),
                    'name':      pnode['name'],
                    'pnode_id':  pnode['pid'],
                    'month':     month,
                    'year':      year,
                    'total_lmp': price,
                })

        # Split this month's rows into batches of BATCH_SIZE
        for i in range(0, len(month_rows), BATCH_SIZE):
            batch = month_rows[i:i + BATCH_SIZE]
            batch_num += 1
            status, err = upsert_batch(batch)
            if err:
                print(f'  Batch {batch_num} ({year}-{month:02d}) FAILED ({status}): {err[:200]}')
                return
            total_inserted += len(batch)

        print(f'  {year}-{month:02d}: {len(month_rows)} rows  (total {total_inserted:,})')

    print(f'\nDone. {total_inserted:,} rows backfilled into planning.lmp_forecast')

if __name__ == '__main__':
    main()
