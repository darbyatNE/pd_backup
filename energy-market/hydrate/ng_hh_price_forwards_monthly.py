#!/usr/bin/env python3
"""
Daily snapshot of the NG Henry Hub monthly forwards curve from Yahoo Finance.

Maintains a rolling horizon (default 120 months / 10 years from current month):
  - New contracts at the far end of the horizon get auto-added to the catalog.
  - Expired contracts (delivery in the past, or 3+ consecutive misses on near-dated
    contracts) are skipped permanently.
  - "Unlisted" contracts (in horizon but no Yahoo data yet) are re-tested monthly,
    so newly listed far-dated contracts get picked up automatically.

Two tables:
  - planning.ng_hh_futures_curve      (OHLCV history per asof_date × contract)
  - planning.ng_hh_contracts_catalog  (per-contract status & miss-tracking)

Designed to run Mon-Fri at ~17:00 ET (22:00 UTC) via systemd timer.

Usage:
    python ng_hh_price_forwards_monthly.py [--horizon 120] [--asof YYYY-MM-DD]
"""
from __future__ import annotations
import argparse
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values
import yfinance as yf

SCHEMA = "planning"
CURVE_TABLE = "ng_hh_futures_curve"
CATALOG_TABLE = "ng_hh_contracts_catalog"

# NYMEX futures month codes
MONTH_CODES = {1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
               7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z"}

# Behavior knobs
DEFAULT_HORIZON_MONTHS = 120
MISS_THRESHOLD         = 3
UNLISTED_RECHECK_DAYS  = 30
INTER_REQUEST_SLEEP    = 0.25

DDL = f"""
CREATE SCHEMA IF NOT EXISTS {SCHEMA};

CREATE TABLE IF NOT EXISTS {SCHEMA}.{CURVE_TABLE} (
    asof_date       DATE          NOT NULL,
    contract_code   TEXT          NOT NULL,
    delivery_year   INT           NOT NULL,
    delivery_month  INT           NOT NULL,
    delivery_date   DATE          NOT NULL,
    open_price      NUMERIC(10,4),
    high_price      NUMERIC(10,4),
    low_price       NUMERIC(10,4),
    close_price     NUMERIC(10,4) NOT NULL,
    volume          BIGINT,
    source          TEXT          NOT NULL DEFAULT 'yfinance',
    loaded_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (asof_date, contract_code)
);
CREATE INDEX IF NOT EXISTS idx_{CURVE_TABLE}_asof
    ON {SCHEMA}.{CURVE_TABLE} (asof_date DESC);
CREATE INDEX IF NOT EXISTS idx_{CURVE_TABLE}_delivery
    ON {SCHEMA}.{CURVE_TABLE} (delivery_year, delivery_month);

CREATE TABLE IF NOT EXISTS {SCHEMA}.{CATALOG_TABLE} (
    contract_code       TEXT         PRIMARY KEY,
    delivery_year       INT          NOT NULL,
    delivery_month      INT          NOT NULL,
    delivery_date       DATE         NOT NULL,
    status              TEXT         NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','unlisted','expired')),
    last_close_price    NUMERIC(10,4),
    consecutive_misses  INT          NOT NULL DEFAULT 0,
    total_observations  INT          NOT NULL DEFAULT 0,
    first_seen_at       TIMESTAMPTZ,
    last_seen_at        TIMESTAMPTZ,
    last_checked_at     TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_{CATALOG_TABLE}_status
    ON {SCHEMA}.{CATALOG_TABLE} (status);
CREATE INDEX IF NOT EXISTS idx_{CATALOG_TABLE}_delivery
    ON {SCHEMA}.{CATALOG_TABLE} (delivery_date);
"""

SEED_CATALOG = f"""
INSERT INTO {SCHEMA}.{CATALOG_TABLE}
    (contract_code, delivery_year, delivery_month, delivery_date)
VALUES %s
ON CONFLICT (contract_code) DO NOTHING;
"""

AUTOEXPIRE_PAST = f"""
UPDATE {SCHEMA}.{CATALOG_TABLE}
   SET status = 'expired',
       updated_at = NOW()
 WHERE delivery_date < date_trunc('month', CURRENT_DATE)
   AND status != 'expired';
"""

SELECT_CANDIDATES = f"""
SELECT contract_code, delivery_year, delivery_month, delivery_date, status
  FROM {SCHEMA}.{CATALOG_TABLE}
 WHERE delivery_date >= date_trunc('month', CURRENT_DATE)
   AND status != 'expired'
   AND (
        status IN ('pending','active')
        OR (status = 'unlisted'
            AND (last_checked_at IS NULL
                 OR last_checked_at < NOW() - (%s || ' days')::interval))
       )
 ORDER BY delivery_date;
"""

UPSERT_CURVE = f"""
INSERT INTO {SCHEMA}.{CURVE_TABLE}
    (asof_date, contract_code, delivery_year, delivery_month, delivery_date,
     open_price, high_price, low_price, close_price, volume)
VALUES %s
ON CONFLICT (asof_date, contract_code) DO UPDATE SET
    open_price  = EXCLUDED.open_price,
    high_price  = EXCLUDED.high_price,
    low_price   = EXCLUDED.low_price,
    close_price = EXCLUDED.close_price,
    volume      = EXCLUDED.volume,
    loaded_at   = NOW();
"""

MARK_HIT = f"""
UPDATE {SCHEMA}.{CATALOG_TABLE}
   SET status              = 'active',
       last_close_price    = %s,
       last_seen_at        = NOW(),
       last_checked_at     = NOW(),
       first_seen_at       = COALESCE(first_seen_at, NOW()),
       consecutive_misses  = 0,
       total_observations  = total_observations + 1,
       updated_at          = NOW()
 WHERE contract_code = %s;
"""

MARK_MISS = f"""
UPDATE {SCHEMA}.{CATALOG_TABLE}
   SET consecutive_misses  = consecutive_misses + 1,
       last_checked_at     = NOW(),
       status = CASE
           WHEN consecutive_misses + 1 >= {MISS_THRESHOLD} AND delivery_date < CURRENT_DATE + INTERVAL '90 days'
               THEN 'expired'
           WHEN consecutive_misses + 1 >= {MISS_THRESHOLD}
               THEN 'unlisted'
           ELSE status
       END,
       updated_at = NOW()
 WHERE contract_code = %s;
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


def build_horizon(horizon_months: int) -> list[tuple]:
    today = date.today()
    out = []
    y, m = today.year, today.month
    for _ in range(horizon_months):
        code = f"NG{MONTH_CODES[m]}{y % 100:02d}.NYM"
        out.append((code, y, m, date(y, m, 1)))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def fetch_contract(code: str, retries: int = 2) -> tuple | None:
    for attempt in range(retries + 1):
        try:
            ticker = yf.Ticker(code)
            hist = ticker.history(period="5d", auto_adjust=False)
            if hist.empty:
                return None
            last = hist.iloc[-1]
            close = float(last["Close"])
            if close != close:
                return None
            asof = hist.index[-1].date()
            return (
                asof,
                float(last["Open"])  if last["Open"]  == last["Open"]  else None,
                float(last["High"])  if last["High"]  == last["High"]  else None,
                float(last["Low"])   if last["Low"]   == last["Low"]   else None,
                close,
                int(last["Volume"]) if last["Volume"] == last["Volume"] else None,
            )
        except Exception as e:
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            print(f"   ⚠️  {code}: {e.__class__.__name__}: {e}")
            return None
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--horizon", type=int, default=DEFAULT_HORIZON_MONTHS,
                        help=f"months ahead to consider (default {DEFAULT_HORIZON_MONTHS})")
    parser.add_argument("--asof", type=str, default=None,
                        help="override asof_date YYYY-MM-DD (default = whatever yfinance returns)")
    args = parser.parse_args()

    print("=" * 68)
    print(f"   NG HH monthly forwards → {SCHEMA}.{CURVE_TABLE}  (horizon {args.horizon}m)")
    print("=" * 68)
    load_env()

    with connect() as conn, conn.cursor() as cur:
        cur.execute(DDL)

        cur.execute(AUTOEXPIRE_PAST)
        autoexpired = cur.rowcount
        if autoexpired:
            print(f"⏳ Auto-expired {autoexpired} contract(s) whose delivery passed")

        horizon = build_horizon(args.horizon)
        execute_values(cur, SEED_CATALOG, horizon, page_size=500)
        print(f"📚 Catalog covers {len(horizon)} contracts in horizon "
              f"({horizon[0][0]} → {horizon[-1][0]})")

        cur.execute(SELECT_CANDIDATES, (UNLISTED_RECHECK_DAYS,))
        candidates = cur.fetchall()
        conn.commit()

    if not candidates:
        print("✅ Nothing to fetch — catalog is fully resolved for this run.")
        return

    print(f"🎯 Fetching {len(candidates)} contract(s) this run "
          f"({sum(1 for c in candidates if c[4] == 'active')} active, "
          f"{sum(1 for c in candidates if c[4] == 'pending')} pending, "
          f"{sum(1 for c in candidates if c[4] == 'unlisted')} unlisted recheck)\n")

    hits: list[tuple] = []
    miss_codes: list[str] = []
    for i, (code, dy, dm, dd, status) in enumerate(candidates, 1):
        result = fetch_contract(code)
        if result is None:
            miss_codes.append(code)
            print(f"   ✗ [{i:3d}/{len(candidates)}] {code:14s} ({status:8s}) no data")
        else:
            asof, o, h, low, close, vol = result
            if args.asof:
                asof = datetime.strptime(args.asof, "%Y-%m-%d").date()
            hits.append((asof, code, dy, dm, dd, o, h, low, close, vol))
            print(f"   ✓ [{i:3d}/{len(candidates)}] {code:14s} ({status:8s}) "
                  f"asof={asof} close={close:.4f}")
        time.sleep(INTER_REQUEST_SLEEP)

    with connect() as conn, conn.cursor() as cur:
        if hits:
            execute_values(cur, UPSERT_CURVE, hits, page_size=500)
            for h in hits:
                cur.execute(MARK_HIT, (h[8], h[1]))
        for code in miss_codes:
            cur.execute(MARK_MISS, (code,))
        conn.commit()

        cur.execute(f"""
            SELECT status, COUNT(*)
              FROM {SCHEMA}.{CATALOG_TABLE}
             GROUP BY status
             ORDER BY status
        """)
        status_counts = dict(cur.fetchall())

        cur.execute(f"""
            SELECT COUNT(*), MIN(asof_date), MAX(asof_date),
                   COUNT(DISTINCT asof_date),
                   MIN(delivery_date), MAX(delivery_date)
              FROM {SCHEMA}.{CURVE_TABLE}
        """)
        total_rows, min_asof, max_asof, distinct_asof, min_delv, max_delv = cur.fetchone()

    print(f"\n📊 This run: {len(hits)} hits, {len(miss_codes)} miss(es)")
    print(f"📚 Catalog: {status_counts}")
    print(f"🗃️  Curve table: {total_rows:,} rows across {distinct_asof} as-of date(s)")
    print(f"   asof range:    {min_asof} → {max_asof}")
    print(f"   delivery range: {min_delv} → {max_delv}")
    print("=" * 68)


if __name__ == "__main__":
    main()
