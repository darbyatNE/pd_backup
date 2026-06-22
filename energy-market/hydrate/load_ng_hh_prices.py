#!/usr/bin/env python3
"""
Keep planning.ng_hh_price_history_daily current with EIA's daily Henry Hub spot price.

Source:
    https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls   (stable URL, updated weekly)

Flow:
    1. Download the latest .xls from EIA (with retries; falls back to local cache).
    2. Parse 'Data 1' sheet → (trade_date, price_usd_per_mmbtu).
    3. Bulk upsert into planning.ng_hh_price_history_daily.
    4. Report what changed.

Idempotent. Safe to run on any cadence — EIA refreshes ~weekly (Thursdays).

Usage:
    python load_ng_hh_prices.py [--no-download] [--cache /path/to/local.xls]
"""
from __future__ import annotations
import argparse
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

EIA_URL    = "https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls"
SHEET_NAME = "Data 1"
SCHEMA     = "planning"
TABLE      = "ng_hh_price_history_daily"

DEFAULT_CACHE = Path(__file__).resolve().parent / "ng_hh_price_history_daily.xls"

DOWNLOAD_TIMEOUT_S   = 30
DOWNLOAD_RETRIES     = 3
STALE_WARN_DAYS      = 14    # warn if MAX(trade_date) older than this after run

DDL = f"""
CREATE SCHEMA IF NOT EXISTS {SCHEMA};
CREATE TABLE IF NOT EXISTS {SCHEMA}.{TABLE} (
    trade_date           DATE          PRIMARY KEY,
    price_usd_per_mmbtu  NUMERIC(8,4)  NOT NULL,
    source               TEXT          NOT NULL DEFAULT 'EIA',
    loaded_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_{TABLE}_trade_date
    ON {SCHEMA}.{TABLE} (trade_date DESC);
"""

# Use a CTE so we can count true inserts vs. updated rows in one round-trip.
UPSERT = f"""
WITH input(trade_date, price) AS (VALUES %s),
existing AS (
    SELECT trade_date, price_usd_per_mmbtu FROM {SCHEMA}.{TABLE}
    WHERE trade_date IN (SELECT trade_date FROM input)
),
upsert AS (
    INSERT INTO {SCHEMA}.{TABLE} (trade_date, price_usd_per_mmbtu)
    SELECT trade_date, price FROM input
    ON CONFLICT (trade_date) DO UPDATE SET
        price_usd_per_mmbtu = EXCLUDED.price_usd_per_mmbtu,
        loaded_at            = NOW()
    RETURNING trade_date, price_usd_per_mmbtu
)
SELECT
    (SELECT COUNT(*) FROM upsert) AS total_rows,
    (SELECT COUNT(*) FROM upsert u
        WHERE NOT EXISTS (SELECT 1 FROM existing e WHERE e.trade_date = u.trade_date)
    ) AS inserted,
    (SELECT COUNT(*) FROM upsert u
        JOIN existing e ON e.trade_date = u.trade_date
        WHERE e.price_usd_per_mmbtu IS DISTINCT FROM u.price_usd_per_mmbtu
    ) AS revised;
"""


def load_env() -> None:
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parents[2] / ".env",
        Path("/home/ubuntu/hydrate/.env"),
        Path("/home/ubuntu/powerdime-repo/.env"),
    ]
    for env_path in candidates:
        if env_path.exists():
            load_dotenv(dotenv_path=env_path)
            print(f"📄 Loaded env from {env_path}")
            break
    else:
        print("⚠️  No .env found; relying on shell environment")

    missing = [k for k in ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME") if not os.getenv(k)]
    if missing:
        print(f"❌ Missing env vars: {missing}")
        sys.exit(1)


def connect():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 5432)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        dbname=os.getenv("DB_NAME"),
        sslmode="require",
    )


def download_eia(cache_path: Path) -> Path:
    """Download the EIA .xls to cache_path. Returns the path used (cache may be reused on failure)."""
    print(f"⬇️  Downloading latest EIA file from {EIA_URL}")
    last_err: Exception | None = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        try:
            r = requests.get(EIA_URL, timeout=DOWNLOAD_TIMEOUT_S,
                             headers={"User-Agent": "powerdime-hydrate/1.0"})
            r.raise_for_status()
            tmp = cache_path.with_suffix(".xls.tmp")
            tmp.write_bytes(r.content)
            tmp.replace(cache_path)
            print(f"   ✅ Saved {len(r.content):,} bytes → {cache_path}")
            return cache_path
        except Exception as e:
            last_err = e
            print(f"   ⚠️  attempt {attempt}/{DOWNLOAD_RETRIES} failed: {e.__class__.__name__}: {e}")
            if attempt < DOWNLOAD_RETRIES:
                time.sleep(2 ** attempt)

    # All retries exhausted — fall back to existing cache if any
    if cache_path.exists():
        age_h = (time.time() - cache_path.stat().st_mtime) / 3600
        print(f"   ⚠️  Falling back to existing cache ({age_h:.1f}h old): {cache_path}")
        return cache_path
    print(f"❌ Download failed and no local cache available: {last_err}")
    sys.exit(1)


def parse_xls(path: Path) -> list[tuple]:
    df = pd.read_excel(path, sheet_name=SHEET_NAME, header=0)
    df.columns = ["trade_date", "price"]
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date

    null_rows = df["price"].isna().sum()
    if null_rows:
        df = df.dropna(subset=["price"])
        print(f"   ⚠️  Skipped {null_rows} row(s) with null prices (EIA non-trading days)")

    rows = list(df.itertuples(index=False, name=None))
    print(f"   📊 Parsed {len(rows):,} rows ({df['trade_date'].min()} → {df['trade_date'].max()})")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-download", action="store_true",
                        help="skip the EIA download and use the local cache as-is")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE,
                        help=f"path to the .xls cache (default {DEFAULT_CACHE})")
    args = parser.parse_args()

    print("=" * 64)
    print(f"   EIA Henry Hub spot prices → {SCHEMA}.{TABLE}")
    print("=" * 64)
    load_env()

    if args.no_download:
        if not args.cache.exists():
            print(f"❌ --no-download given but cache file missing: {args.cache}")
            sys.exit(1)
        print(f"📄 Using local cache: {args.cache}")
        xls_path = args.cache
    else:
        xls_path = download_eia(args.cache)

    rows = parse_xls(xls_path)
    if not rows:
        print("❌ No rows parsed — file format may have changed.")
        sys.exit(1)

    with connect() as conn, conn.cursor() as cur:
        print("🔧 Ensuring schema/table/index exist...")
        cur.execute(DDL)

        print(f"📥 Upserting {len(rows):,} rows...")
        execute_values(cur, UPSERT, rows, page_size=1000, fetch=True)
        # execute_values with fetch=True returns rows from the RETURNING; we have a single summary row
        result = cur.fetchone()
        total, inserted, revised = result if result else (0, 0, 0)
        unchanged = total - inserted - revised

        cur.execute(
            f"SELECT COUNT(*), MIN(trade_date), MAX(trade_date) FROM {SCHEMA}.{TABLE}"
        )
        full_count, full_min, full_max = cur.fetchone()
        conn.commit()

    print(f"\n📊 Run summary:")
    print(f"   inserted: {inserted}")
    print(f"   revised:  {revised}")
    print(f"   unchanged: {unchanged}")

    days_stale = (date.today() - full_max).days if full_max else None
    stale_marker = "🔴" if days_stale and days_stale > STALE_WARN_DAYS else "🟢"
    print(f"\n🗃️  Table now: {full_count:,} rows, {full_min} → {full_max} "
          f"{stale_marker} ({days_stale}d stale)")
    print("=" * 64)


if __name__ == "__main__":
    main()
