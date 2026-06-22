# Hydrate Directory Script Summary

This document provides a brief summary of each Python script in the `hydrate/` directory and its subdirectories.

## Core Hydration & Data Management

### hydrate_db.py
**Main hydration orchestrator.** Fetches LMP data (day-ahead and real-time) from PJM API and inserts into PostgreSQL database. Processes data in 45-day chunks, checks for existing data (with `--force` to overwrite), and handles upserts with conflict resolution. Also fetches binding constraints in 1-day chunks.

**Key Functions:**
- `Database` class: Manages PostgreSQL connections and batch upserts
- `PJMApi` class: Handles PJM API requests with rate limiting and pagination
- `main()`: CLI entry with date range arguments

### hydrate_status.py
**Data completeness checker and repair tool.** Analyzes database for missing or incomplete LMP data, exports audit CSV with row counts per hour, and triggers hydration for gaps. Groups missing days into optimized ranges and calls `hydrate_db.py` for backfill.

**Key Functions:**
- `check_table_gaps()`: Identifies hours with missing/insufficient data
- `export_audit_csv()`: Generates audit report
- `run_hydrator()`: Executes backfill via subprocess

### db_dailysync.py
**Daily synchronization orchestrator.** Runs subprocess tasks (day-ahead LMP, binding constraints) and syncs verified real-time prices. Checks latest DB dates and runs backfills from last known date to target date (usually yesterday).

**Key Functions:**
- `sync_subprocess_tasks()`: Runs hydration scripts for missing date ranges
- `sync_verified_rt_prices()`: Fetches official verified RT data and marks status as 'v'

### db_watchdog.py
**Continuous monitoring daemon.** Runs in a loop every 5 minutes, fetching real-time 5-minute unverified data, aggregating to hourly, and updating hourly status. Runs full sync every 6 hours via `run_all_syncs()`.

**Key Functions:**
- `run_smart_cycle()`: Fetches and aggregates 5-min RT data
- `calculate_and_save_hourly()`: Averages 5-min data to hourly
- `fetch_constraints_batch()`: Fetches transmission constraints

### update_pjm_db.py
**Database update orchestrator (legacy).** Checks multiple tables for staleness and launches appropriate query scripts to backfill missing data. Maintains PNODE_IDs list and task definitions for different data types.

**Key Functions:**
- `get_latest_db_date()`: Queries max date from tables
- `run_update_script()`: Launches hydration subprocesses
- `main()`: Checks all tables and updates as needed

### update_status.py
**Status table backfill utility.** Creates `pjm_hourly_status` table if not exists and backfills existing hours from `pjm_rt_hrl_lmps` with status 'v' (verified).

---

## PJM Data Query Scripts

### pjm_query_da_lmp.py
**Day-ahead LMP historical backfill.** Queries PJM API for day-ahead hourly LMPs for date range, pre-loads known nodes from Supabase registry, discovers and registers new nodes, upserts LMP data in batches.

### pjm_query_rt_lmp.py
**Real-time LMP historical backfill.** Similar to DA script but for verified real-time hourly LMPs. Updates both main data table and status table with 'v' status. Accepts date range via CLI args.

### pjm_query_rt_5min_unver.py
**5-minute unverified RT data fetcher.** Fetches real-time 5-minute unverified LMPs for specific time windows. Filters for target PNODEs and upserts to `pjm_rt_unverified_fivemin_lmps`. Called by `db_watchdog.py`.

### pjm_query_rt_constraints.py
**Transmission constraints fetcher.** Queries PJM API for real-time binding constraints (marginal value endpoint). Can be called as module by watchdog (`fetch_constraints_batch`) or run standalone for backfills.

---

## Node & Metadata Management

### synch_pjm_metadata.py
**PJM node registry synchronization.** Downloads complete pnode metadata from PJM API (all historical and active nodes), deduplicates by pnode_id + effective_date, upserts to `iso_lmps` table in Supabase.

### pnode_lifecycle.py
**Node lifecycle tracking.** Extended version of metadata sync that tracks first_seen and last_seen timestamps for each node. Maintains in-memory cache of known nodes, updates lifecycle dates during historical backfill.

### find_pjm_duplicate_pnodes.py
**Duplicate detection utility.** Downloads all pnode records from PJM API, analyzes for duplicate pnode_ids with different versions, prints first 5 examples for inspection. Useful for understanding data quality issues.

---

## ERCOT Scripts (ERCOT/)

### ercot_connection_test.py
**ERCOT API connection and metadata sync.** Authenticates with ERCOT's Azure B2C, fetches metadata from settlement points endpoint, deduplicates records, upserts to Supabase `iso_lmps` table.

### synch_ercot_metadata.py
**ERCOT node registry full sync.** Fetches archive ZIP from ERCOT API, extracts CSV, generates deterministic pnode_ids from node names using MD5 hash, batch upserts to `iso_lmps`.

### ercot_da.py
**ERCOT day-ahead price fetcher.** Authenticates, fetches DAM settlement point prices for target hubs/zones, returns as pandas DataFrame. Can save to CSV.

### ercot_rt_15.py
**ERCOT real-time settled price fetcher.** Fetches 15-minute settlement point prices, filters for hubs/zones after download, calculates hourly averages from 15-minute data.

### ercot_temp.py
**Simple ERCOT API connectivity test.** Pings ERCOT public reports endpoint to verify API key and basic connectivity. Prints first record shape on success.

---

## MISO Scripts (MISO/)

### synch_miso_metadata.py
**MISO node registry synchronization (legacy).** Fetches node metadata from MISO Load, Generation and Interchange API, handles string-to-integer ID conversion (or hashing), upserts to `iso_lmps`.

### temp_miso.py
**MISO aggregated pnode sync.** Paginates through MISO Aggregated Pnode API, hashes string node names to integers, captures node types (Hubs, etc.), upserts current node list to `iso_lmps`.

---

## Additional Data Fetchers

### da_lmp_new.py
**Day-ahead LMP backfill (node-by-node).** Fetches DA LMPs for 40 specific PNODEs across date range, processes in 170-day chunks to avoid API limits, upserts to Supabase `da_lmp` table.

### hist_forecast_load.py
**Historical load forecast hydration.** Fetches PJM historical load forecasts in 15-day chunks, maps evaluated_at and forecast timestamps, inserts to `historical_load_forecasts` table.

---

## Connector Module (connectors/)

### __init__.py
**Package initialization.** Exports main classes: `Config`, `PJMClient`, `ISOClient`, `DatabaseConnection`. Module docstring describes purpose: modular connectors for ISO APIs and DB with AWS RDS support.

### config.py
**Configuration management.** `Config` class loads from `.env` file, validates required env vars (PJM_API_KEY, DB_HOST, DB_NAME), provides properties for all ISO API keys, database credentials, and SSH tunnel settings. Legacy Supabase support included.

### database.py
**Database connector with SSH tunnel support.** `DatabaseConnection` class manages PostgreSQL connections via psycopg2 and SQLAlchemy. Supports SSH tunnel to EC2 jump host for AWS RDS access. Includes methods for:
- Tunnel lifecycle management (start/stop/context)
- Connection string generation
- Query execution
- Batch upserts with conflict resolution (`upsert_batch`)
- Results as dictionaries (`query_to_dict`)

### iso_api.py
**ISO API client classes.** 
- `ISOClient`: Abstract base class with rate limiting, retry logic, pagination support
- `PJMClient`: Full implementation for PJM API (DA/RT LMPs, 5-min data, constraints)
- `ERCOTClient`: Placeholder for ERCOT API
- `MISOClient`: Placeholder for MISO API

Includes `_rate_limit()`, `_request()` with 429 handling, and `fetch_date_range()` generator.

### example_usage.py
**Connector usage examples.** Demonstrates:
- Testing PJM API connection
- Direct database connection
- Database connection via SSH tunnel
- Full hydration workflow (fetch from PJM, insert to DB via tunnel)

---

## Utilities & Testing

### conn_test.py
**SSH tunnel + database connection tester.** Sets up SSH tunnel to EC2, connects to PostgreSQL via SQLAlchemy, lists columns for key tables (pjm_da_hrl_lmps, pjm_rt_hrl_lmps, pjm_lat_long). Useful for verifying connectivity.

### test_connection.py
**Simple MySQL connection test.** Basic mysql.connector connection test using environment variables. Minimal smoke test for DB connectivity.

### test_pjm_data_retrieval.py
**End-to-end PJM data fetch and insert test.** Fetches instantaneous load data for yesterday, inserts into MySQL `inst_load` table using batch upsert. Validates API and DB pipeline.

### reset_tables.py
**Database reset utility (DESTRUCTIVE).** Truncates `pjm_da_hrl_lmps`, `pjm_rt_hrl_lmps`, and `pjm_binding_constraints` tables. Requires typing 'DELETE' to confirm. Disables FK checks during truncation.

---

## Summary by Category

| Category | Scripts |
|----------|---------|
| **Core Hydration** | hydrate_db.py, db_dailysync.py, db_watchdog.py, update_pjm_db.py, hydrate_status.py |
| **PJM Queries** | pjm_query_da_lmp.py, pjm_query_rt_lmp.py, pjm_query_rt_5min_unver.py, pjm_query_rt_constraints.py, da_lmp_new.py, hist_forecast_load.py |
| **Node Metadata** | synch_pjm_metadata.py, pnode_lifecycle.py, find_pjm_duplicate_pnodes.py |
| **ERCOT** | ercot_connection_test.py, synch_ercot_metadata.py, ercot_da.py, ercot_rt_15.py, ercot_temp.py |
| **MISO** | synch_miso_metadata.py, temp_miso.py |
| **Connectors** | config.py, database.py, iso_api.py, example_usage.py |
| **Testing/Utils** | conn_test.py, test_connection.py, test_pjm_data_retrieval.py, reset_tables.py, update_status.py |
