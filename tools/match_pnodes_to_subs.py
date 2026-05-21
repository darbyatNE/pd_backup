"""
Match PJM PNode IDs to substations in PJM_subs.geojson using fuzzy name matching.

Strategy:
  1. Fetch ALL nodes from Data Miner API (paginated, respecting 6 req/min limit)
     and save raw response to tools/pnodes_raw.json  (only fetched once)
  2. Load PJM_subs.geojson substation names
  3. Fuzzy-match each pnode_name against substation NAME using rapidfuzz
  4. Output tools/pnode_substation_matches.csv with confidence scores

Usage:
  pip install rapidfuzz requests
  python tools/match_pnodes_to_subs.py

  Set PJM_API_KEY env var or edit API_KEY below.
"""

import os
import json
import time
import csv
import requests
from rapidfuzz import process, fuzz

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY       = os.environ.get("PJM_API_KEY", "")
BASE_URL      = "https://api.pjm.com/api/v1/pnode"
PAGE_SIZE     = 500          # rows per request
RATE_LIMIT    = 6            # requests per minute
SLEEP_SEC     = 60 / RATE_LIMIT + 0.5  # ~10.5s between requests to stay safe
MATCH_THRESH  = 70           # minimum fuzzy score (0-100) to record a match

RAW_NODES_FILE   = os.path.join(os.path.dirname(__file__), "pnodes_raw.json")
SUBS_FILE        = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "PJM_subs.geojson")
OUTPUT_CSV       = os.path.join(os.path.dirname(__file__), "pnode_substation_matches.csv")

# ── Step 1: Fetch PNodes (paginated, cached) ──────────────────────────────────
def fetch_all_pnodes():
    if os.path.exists(RAW_NODES_FILE):
        print(f"Loading cached pnodes from {RAW_NODES_FILE}")
        with open(RAW_NODES_FILE) as f:
            return json.load(f)

    if not API_KEY:
        raise ValueError("PJM_API_KEY not set")

    all_rows = []
    page = 1
    while True:
        params = {
            "rowCount": PAGE_SIZE,
            "startRow": (page - 1) * PAGE_SIZE + 1,
            "fields":   "pnode_id,pnode_name,pnode_subtype,voltage_level,zone",
        }
        headers = {"Ocp-Apim-Subscription-Key": API_KEY}
        print(f"  Fetching page {page} (rows {params['startRow']}–{params['startRow']+PAGE_SIZE-1})...")
        r = requests.get(BASE_URL, params=params, headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()

        items = data if isinstance(data, list) else data.get("items", data.get("data", []))
        if not items:
            break

        all_rows.extend(items)
        print(f"    got {len(items)} rows, total so far: {len(all_rows)}")

        if len(items) < PAGE_SIZE:
            break  # last page

        page += 1
        print(f"  Sleeping {SLEEP_SEC:.1f}s (rate limit)...")
        time.sleep(SLEEP_SEC)

    with open(RAW_NODES_FILE, "w") as f:
        json.dump(all_rows, f)
    print(f"Saved {len(all_rows)} pnodes to {RAW_NODES_FILE}")
    return all_rows


# ── Step 2: Load substations ──────────────────────────────────────────────────
def load_substations():
    with open(SUBS_FILE) as f:
        gj = json.load(f)
    subs = []
    for feat in gj["features"]:
        p = feat["properties"]
        subs.append({
            "sub_id":   p.get("ID"),
            "name":     p.get("NAME", ""),
            "city":     p.get("CITY", ""),
            "state":    p.get("STATE", ""),
            "max_volt": p.get("MAX_VOLT"),
            "lat":      p.get("LATITUDE"),
            "lng":      p.get("LONGITUDE"),
        })
    print(f"Loaded {len(subs)} substations")
    return subs


# ── Step 3: Fuzzy match ───────────────────────────────────────────────────────
def match(pnodes, subs):
    sub_names = [s["name"] for s in subs]
    results = []

    for node in pnodes:
        pnode_name = node.get("pnode_name", "") or ""
        pnode_id   = node.get("pnode_id", "")
        subtype    = node.get("pnode_subtype", "")
        voltage    = node.get("voltage_level", "")

        matches = process.extract(
            pnode_name, sub_names,
            scorer=fuzz.token_sort_ratio,
            limit=3
        )

        for match_name, score, idx in matches:
            if score < MATCH_THRESH:
                continue
            sub = subs[idx]
            results.append({
                "pnode_id":        pnode_id,
                "pnode_name":      pnode_name,
                "pnode_subtype":   subtype,
                "pnode_voltage":   voltage,
                "sub_id":          sub["sub_id"],
                "sub_name":        sub["name"],
                "sub_city":        sub["city"],
                "sub_state":       sub["state"],
                "sub_max_volt":    sub["max_volt"],
                "sub_lat":         sub["lat"],
                "sub_lng":         sub["lng"],
                "match_score":     score,
            })

    # Sort by pnode_id, then best match first
    results.sort(key=lambda r: (r["pnode_id"], -r["match_score"]))
    return results


# ── Step 4: Write CSV ─────────────────────────────────────────────────────────
def write_csv(results):
    if not results:
        print("No matches found above threshold.")
        return
    fields = list(results[0].keys())
    with open(OUTPUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(results)
    print(f"Wrote {len(results)} matches to {OUTPUT_CSV}")


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=== Step 1: Fetch PNodes ===")
    pnodes = fetch_all_pnodes()
    print(f"Total pnodes: {len(pnodes)}")

    print("\n=== Step 2: Load Substations ===")
    subs = load_substations()

    print("\n=== Step 3: Fuzzy Match ===")
    results = match(pnodes, subs)
    print(f"Total matches above threshold ({MATCH_THRESH}): {len(results)}")

    print("\n=== Step 4: Write Output ===")
    write_csv(results)
    print("Done.")
