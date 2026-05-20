import csv
import json
import os
import random

# PJM ISO ID
ISO_ID = "dc6a8309-d023-4fc0-87bb-396091d6b178"

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON     = os.path.join(REPO_ROOT, 'frontend', 'public', 'PJM_subs_priced.geojson')
OUTPUT_CSV  = os.path.join(REPO_ROOT, 'tools', 'pjm_simulated_lmps.csv')

# Base price and regional multipliers (West to East heat map)
BASE_PRICE = 35.0
REGION_MULTIPLIERS = {
    "IL": 1.00,  # COMED — West (Lowest)
    "IN": 1.02,  # ATSI/AEP fringe
    "OH": 1.05,  # AEP / ATSI / DEOK
    "KY": 1.05,  # EKPC / LGE
    "MI": 1.08,  # ATSI fringe
    "WV": 1.20,  # APS / transition zone
    "PA": 1.25,  # PENELEC / PPL / DUQ
    "NJ": 1.35,  # PSEG / JCPL / AECO
    "MD": 1.38,  # BGE / PEPCO
    "DE": 1.38,  # DPL
    "VA": 1.40,  # DOM / PEPCO
    "TN": 1.10,  # EKPC south
}

# Pnode subtype multiplier — aggregates/zones price differently from individual nodes
SUBTYPE_MULTIPLIERS = {
    'ZONE':      1.10,
    'AGGREGATE': 1.05,
    'GEN':       0.95,
    'LOAD':      1.02,
}

# High-price node name fragments (DOM/PEPCO congested nodes)
HIGH_PRICE_FRAGMENTS = ["LOUDON", "POSSUM POINT", "HARRISON", "OYSTER CREEK",
                        "BEDINGTON", "DOUBS", "AQUILA", "KANAWHA"]

def is_high_price(pnode_name):
    name_up = (pnode_name or '').upper()
    return any(frag in name_up for frag in HIGH_PRICE_FRAGMENTS)

def get_multiplier(state, pnode_name, pnode_subtype, month):
    # 1. Geographic base
    mult = REGION_MULTIPLIERS.get(state, 1.10)

    # 2. High-price congestion override
    if is_high_price(pnode_name):
        mult = max(mult, 1.85)

    # 3. Subtype adjustment
    mult *= SUBTYPE_MULTIPLIERS.get((pnode_subtype or '').upper(), 1.0)

    # 4. Seasonal multiplier
    if month in [7, 8]:    # Summer peak
        mult *= 1.6
    elif month in [1, 2]:  # Winter peak
        mult *= 1.5

    # 5. Natural volatility ±5%
    mult *= random.uniform(0.95, 1.05)

    return mult

# Load all unique pnodes from GeoJSON (first match wins per pnode_id)
nodes = {}  # pnode_id -> (state, pnode_name, pnode_subtype)
with open(GEOJSON) as f:
    data = json.load(f)

for feature in data['features']:
    p = feature['properties']
    pid = str(p['pnode_id'])
    if pid not in nodes:
        nodes[pid] = (
            p.get('STATE', ''),
            p.get('pnode_name', ''),
            p.get('pnode_subtype', ''),
        )

print(f"Loaded {len(nodes)} unique pnodes from {GEOJSON}")

# Generate data
row_count = 0
with open(OUTPUT_CSV, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['iso_id', 'name', 'pnode_id', 'month', 'year', 'total_lmp'])

    for year in range(2026, 2031):
        start_month = 6 if year == 2026 else 1
        for month in range(start_month, 13):
            for pnode_id, (state, pnode_name, pnode_subtype) in nodes.items():
                mult = get_multiplier(state, pnode_name, pnode_subtype, month)
                lmp  = round(BASE_PRICE * mult, 2)
                writer.writerow([ISO_ID, pnode_name, pnode_id, month, year, lmp])
                row_count += 1

print(f"CSV generation complete! {row_count:,} rows → {OUTPUT_CSV}")
