# Multi-ISO Scalable Data Architecture
## Design Documentation for Energy Market & Natural Gas Data

**Status**: Deployed — PJM, MISO, and ERCOT Active  
**Database**: PostgreSQL 18+  
**Last Updated**: May 2026

---

## Executive Summary

This architecture provides a **multi-ISO database** for storing operational and market data from PJM, MISO, and ERCOT — with all pricing nodes (pnodes) loaded for each. The design enables:

- **Clean ISO separation** via UUID-keyed `iso_registry` while maintaining unified querying across markets
- **Full pnode coverage**: All nodes for PJM, MISO, and ERCOT are tracked in the `iso_lmps` registry with temporal validity (`effective_date`, `termination_date`)
- **DST-safe time-series data** using UTC-based absolute timestamps (handles daylight saving time edge cases)
- **Referential integrity** across 12+ tables with cascading deletes where appropriate
- **ML-friendly dimensions** (buses, hubs, pnode registry) separated from facts (LMPs, load, outages)
- **Two-tier modeling strategy**: Market-level models (zone/hub/interface) feed into customer-specific models (individual bus locations with pricing risk)
- **Extensibility** to add new ISOs in North America and abroad without schema rewrites — add a row to `iso_registry` and populate `iso_lmps`
- **Auditability** through ingestion logs and created/updated timestamps
- **API-mapped fields**: Schema fields directly correspond to ISO data APIs (PJM Data Miner 2, MISO API, ERCOT API) and ICE data outputs

---

## Design Philosophy

### 1. **Absolute UTC Timestamps (DST-Safe)**

All timestamps are stored as UTC (TIMESTAMP WITH TIME ZONE in PostgreSQL), normalized to Coordinated Universal Time. This eliminates daylight saving time ambiguities:

- **Spring Forward (2 AM → 3 AM)**: One hour skipped — only 23 hours exist on that day
- **Fall Back (2 AM → 1 AM)**: One hour repeated — two different moments map to "1:30 AM"
- **Solution**: Use absolute UTC moments as unique identifiers, never local day/hour combos

**Why it matters**: PJM API returns both EPT (Eastern time) and UTC. We store UTC for uniqueness; convert to EPT in application layer for display.

**Example**:
```sql
-- Both are "1:30 AM EPT" on Nov 3, but they're different UTC moments!
INSERT INTO zonal_load (iso_id, zone_id, datetime_beginning_utc, forecast_load_mw) 
  VALUES (1, 1, '2024-11-03 05:30:00+00', 15000);  -- 1:30 AM EDT (05:30 UTC)
INSERT INTO zonal_load (iso_id, zone_id, datetime_beginning_utc, forecast_load_mw) 
  VALUES (1, 1, '2024-11-03 06:30:00+00', 14500);  -- 1:30 AM EST (06:30 UTC) → Different hour, correct!
```

### 2. **Multi-ISO Registry Pattern**

Rather than separate databases/schemas per ISO, this design uses:

- **Shared reference tables**: `iso_registry`, `iso_lmps`, `iso_buses`, `gas_hubs` (small, infrequently updated)
- **ISO-aware data tables**: UUID foreign key `iso_id` on all market/outage tables — links back to `iso_registry`
- **Benefits**: Single query across ISOs; adding a new market (e.g., NYISO, CAISO) requires only a new `iso_registry` row and pnode population; data stays warm

### 3. **Dimension + Fact Separation with Two-Tier Modeling**

Following data warehouse principles:

- **Dimensions**: `iso_registry`, `iso_lmps`, `iso_buses`, `gas_hubs` (lookup tables, slow-changing)
- **Facts**: `da_lmp`, `historical_load_forecasts`, `transmission_outage`, `ng_futures`, `ng_basis` (high-volume, timestamped)
- **Impact**: Efficient joins, predictable growth patterns, ML-friendly structure

**Two-Tier Modeling Strategy**:

1. **Market-Level Models** (Tier 1): Build forecasting models on aggregated data
   - Zone-level expected values (mapped to transmission companies: DOM, BGE, PEPCO, etc.)
   - Hub-level expected values (Henry Hub, basis markets)
   - Interface-level expected values (transmission corridor flows/prices)
   - These models use standardized PJM market data pulled from Data Miner 2 API

2. **Customer-Specific Models** (Tier 2): Extend market models to individual customer sites
   - Specific PJM buses where customers have pricing risk or generation
   - Model logic extrapolates zone/hub signals to individual bus locations
   - Enables custom PPA valuations at precise customer coordinates
   - Minimal additional computational overhead—reuses market model outputs

**This two-tier approach means**: Train once on market aggregates (DOM, BGE zones), then apply the same model logic to hundreds of customer-specific buses. Easy scaling without rebuilding models from scratch.

---

## Architecture Overview

### ISOs Covered

Three ISOs are active, with all pnodes loaded for each:

| ISO | Region | Notes |
|-----|--------|-------|
| **PJM** | Mid-Atlantic / Midwest | Pennsylvania, New Jersey, Maryland, Virginia, Ohio, and more |
| **MISO** | Midwest / Mid-South | Illinois, Indiana, Michigan, Minnesota, Mississippi, and more |
| **ERCOT** | Texas | Covers approximately 90% of Texas electric load |

### Understanding Pnodes (Pricing Nodes)

Each ISO defines **pnodes** — the precise locations where Locational Marginal Prices (LMPs) are calculated. These range from individual substations and generation facilities to aggregated hub nodes. All pnodes for PJM, MISO, and ERCOT are loaded into `iso_lmps`, which tracks:
- `pnode_id` and `node_name` — the ISO's own identifiers
- `node_type`, `pnode_type`, `pnode_subtype` — classification for grouping and model selection
- `effective_date` / `termination_date` — temporal validity (nodes are added/retired over time)

### Buses (Physical Network Points)

**Buses** in `iso_buses` are specific physical substations or interconnection points. They carry geographic coordinates (`lat`, `lon`) and optionally link to a zone for zone-level aggregation.

### System Diagram

```
REFERENCE TABLES (Master Lookup Data)
======================================
iso_registry ──── iso_lmps      iso_buses      gas_hubs
(PJM, MISO,       (All pnodes   (Physical      (NG Hubs:
 ERCOT, ...)       per ISO,      substations,   Henry Hub,
                   with type     lat/lon)       PG, TC, NX...)
                   & validity)
        ^               ^             ^              ^
        |               |  Foreign    |              |
        +───────────────+──  Keys  ───+──────────────+


TIME-SERIES MARKET DATA
========================
da_lmp                          historical_load_forecasts
- iso_id, pnode_id (FK)         - iso_id (FK)
- timestamp_utc                 - evaluated_at_utc
- energy_price                  - timestamp_utc
- congestion_price              - forecast_area
- loss_price                    - forecast_load_mw
- total_lmp

transmission_outage             ng_futures / ng_basis
- iso_id (FK)                   - hub_id (FK to gas_hubs)
- facility_name / type          - settlement_date
- start/end_time_utc            - contract_month
- impact_mw                     - settle_price / settle_basis

pjm_rec_futures                 ercot_rec_futures
- iso_id (FK)                   - iso_id (FK)
- contract_month                - contract_month
- settle_price                  - settle_price


AUDIT & OPERATIONS (Metadata)
==============================
data_ingestion_log
- iso_id (FK), table_name, endpoint
- records_inserted / updated / failed
- ingestion_start / end, status, error_message
```

---

## Field Mapping: ISO APIs → Database Schema

### Day-Ahead LMP (da_lmp)

**Source**: ISO day-ahead market clearing results (PJM Data Miner 2, MISO API, ERCOT API)

| API Concept | Database Column | Type | Notes |
|-------------|-----------------|------|-------|
| ISO identifier | iso_id | UUID (FK to iso_registry) | Links to iso_registry |
| Pricing node ID | pnode_id | int8 (FK to iso_lmps) | ISO's own pnode identifier |
| Interval start (UTC) | timestamp_utc | TIMESTAMP WITH TIME ZONE | **Primary key** — UTC for uniqueness across DST |
| Energy component | energy_price | NUMERIC | $/MWh energy clearing price |
| Congestion component | congestion_price | NUMERIC | $/MWh congestion adder |
| Loss component | loss_price | NUMERIC | $/MWh transmission loss adder |
| Total LMP | total_lmp | NUMERIC | energy + congestion + loss |

**Primary Key**: `(iso_id, pnode_id, timestamp_utc)`

**Example Row**:
```
iso_id='<pjm-uuid>', pnode_id=33092371, timestamp_utc='2026-04-22 16:00:00+00',
energy_price=42.15, congestion_price=1.80, loss_price=0.55, total_lmp=44.50
```

---

### Pnode Registry (iso_lmps)

**Source**: ISO node lists — loaded once per ISO and updated as nodes are added/retired

| Concept | Database Column | Type | Notes |
|---------|-----------------|------|-------|
| ISO | iso_id | UUID (FK to iso_registry) | Which ISO owns this node |
| Pnode identifier | pnode_id | int8 | ISO-assigned numeric ID |
| Node label | node_name | varchar | Human-readable name |
| Node classification | node_type, pnode_type, pnode_subtype | varchar | Used for model grouping |
| Validity window | effective_date, termination_date | TIMESTAMP WITH TIME ZONE | Node lifecycle |
| First/last observed | first_seen, last_seen | TIMESTAMP WITH TIME ZONE | Ingestion audit |

**Primary Key**: `(iso_id, pnode_id, effective_date)` — supports node version history

---

### Historical Load Forecasts (historical_load_forecasts)

**Source**: ISO load forecast APIs (PJM Data Miner 2, MISO, ERCOT)

| API Field | Database Column | Type | Notes |
|-----------|-----------------|------|-------|
| ISO | iso_id | UUID (FK to iso_registry) | |
| Forecast creation time (UTC) | evaluated_at_utc | TIMESTAMP WITH TIME ZONE | When forecast was generated |
| Forecast creation time (local) | evaluated_at_ept | TIMESTAMP | Local-time reference |
| Forecast interval (UTC) | timestamp_utc | TIMESTAMP WITH TIME ZONE | **Forecast target period (UTC)** |
| Forecast interval (local) | timestamp_ept | TIMESTAMP | Local-time reference |
| Area name | forecast_area | varchar | Zone or region name |
| Load forecast | forecast_load_mw | NUMERIC | Forecasted MW |

**Primary Key**: `forecast_id` (identity) — deduplicate via `(iso_id, evaluated_at_utc, timestamp_utc, forecast_area)`

---

### Natural Gas Futures (ICE - Henry Hub)

**Source**: ICE Futures API or data feed (minimal fields for MVP)

| ICE Field | Database Column | Type | Notes |
|-----------|-----------------|------|-------|
| Settlement Date | settlement_date | DATE | Date contract settled |
| Contract Month | contract_month | VARCHAR(10) | e.g., 'May', 'F26' |
| Settle Price | settle_price | NUMERIC(10, 4) | $/MMBtu |
| Volume | volume_mmbtu | NUMERIC(15, 2) | Trading volume (optional) |

**Unique Constraint**: `UNIQUE(hub_id, contract_month, settlement_date)` — one entry per contract/date

**Example Row**:
```
hub_id=1 (Henry Hub), contract_month='May26', settlement_date='2026-04-22',
settle_price=2.845, volume_mmbtu=500000
```

---

### Natural Gas Basis (ICE - Regional Hubs)

**Source**: ICE Basis Contracts API (Henry Hub basis for PG, TC, NX, NZ, NB)

| ICE Field | Database Column | Type | Notes |
|-----------|-----------------|------|-------|
| Settlement Date | settlement_date | DATE | Date contract settled |
| Contract Month | contract_month | VARCHAR(10) | e.g., 'May', 'F26' |
| Settle Basis | settle_basis | NUMERIC(10, 4) | $/MMBtu spread vs. HH |
| Volume | volume_mmbtu | NUMERIC(15, 2) | Trading volume (optional) |

**Unique Constraint**: `UNIQUE(hub_id, contract_month, settlement_date)` — one entry per hub/contract/date

**Example Rows**:
```
hub_id=2 (PG - Columbia Gas), contract_month='May26', settlement_date='2026-04-22',
settle_basis=0.450

hub_id=4 (NX - Tetco M-3), contract_month='May26', settlement_date='2026-04-22',
settle_basis=0.825
```

---

## ISO Registry

ISOs are identified by UUID in `iso_registry`. The three active ISOs are:

| iso_code | iso_name | Region | Country |
|----------|----------|--------|---------|
| `PJM` | PJM Interconnection | Mid-Atlantic / Midwest | US |
| `MISO` | Midcontinent ISO | Midwest / Mid-South | US / Canada |
| `ERCOT` | Electric Reliability Council of Texas | Texas | US |

Adding a new ISO (e.g., NYISO, CAISO, IESO) requires only inserting a row into `iso_registry` and running the pnode population ingestion for that ISO.

---

## Natural Gas Hub Reference Data

When populating `gas_hubs`:

```sql
INSERT INTO gas_hubs (hub_code, hub_name, cme_ticker, market_role, primary_pjm_zones) VALUES
  ('HH', 'Henry Hub', 'NG', 'Reference Benchmark', 'All'),
  ('PG', 'Columbia Gas TCO', 'PG', 'Supply (West Penn, Duquesne)', 'DOM, PECO'),
  ('TC', 'Columbia Gas TCO', 'TC', 'Supply (AEP, Dayton)', 'AEP, DAY'),
  ('NX', 'Tetco M-3', 'NX', 'Demand (Eastern/Coastal)', 'PECO, PSEG, JCPL'),
  ('NZ', 'Transco Zone 6', 'NZ', 'Demand (Mid-Atlantic)', 'DOM, BGE, PEPCO'),
  ('NB', 'Chicago Citygate', 'NB', 'Demand (Midwest Interface)', 'COMED'),
  ('WAHA', 'West of Hub Permian', 'WH', 'Supply (Permian Basin)', 'ERCOT');
```

---

## REC (Renewable Energy Certificate) Products

### PJM REC Futures (ICE - PPR Ticker)

**Source**: ICE PPR Contract - PJM Tri Qualified Renewable Energy Certificate Class I Future

| ICE Field | Database Column | Type | Notes |
|-----------|-----------------|------|-------|
| Settlement Date | settlement_date | DATE | Date contract settled |
| Contract Month | contract_month | VARCHAR(10) | e.g., 'Q1', 'Q2', '2026Q1' |
| Settle Price | settle_price | NUMERIC(10, 4) | $/MWh of renewable energy |
| Volume | volume_rec | NUMERIC(15, 2) | Volume in RECs (optional) |

**Unique Constraint**: UNIQUE(rec_iso_id, settlement_date, contract_month) — one entry per contract/date

**Example Row**:
```
rec_iso_id=1 (PJM), contract_month='2026Q2', settlement_date='2026-04-22',
settle_price=12.50
```

### ERCOT REC Futures (ICE - TFH Ticker)

**Source**: ICE TFH Contract - Texas Compliance Renewable Energy Certificate from CRS Listed Facilities Front Half Specific Future

| ICE Field | Database Column | Type | Notes |
|-----------|-----------------|------|-------|
| Settlement Date | settlement_date | DATE | Date contract settled |
| Contract Month | contract_month | VARCHAR(10) | e.g., 'Front Half', 'Back Half', '2026FH' |
| Settle Price | settle_price | NUMERIC(10, 4) | $/MWh of renewable energy |
| Volume | volume_rec | NUMERIC(15, 2) | Volume in RECs (optional) |

**Unique Constraint**: UNIQUE(rec_iso_id, settlement_date, contract_month) — one entry per contract/date

**Example Row**:
```
rec_iso_id=2 (ERCOT), contract_month='2026FH', settlement_date='2026-04-22',
settle_price=8.75
```

---

## Key Design Decisions

### 1. **UTC Storage for Uniqueness**
ISO APIs often return both UTC and local times. We store UTC as the primary timestamp and use it in primary/unique keys. Local-time columns (e.g., `evaluated_at_ept`, `timestamp_ept`) are stored for reference but not used for uniqueness.

### 2. **UUID-Keyed ISO Registry**
`iso_registry.id` (UUID) is the foreign key used throughout. This avoids integer sequence collisions when ingesting from multiple ISO sources concurrently and makes the schema portable — new ISOs slot in without renumbering.

### 3. **Pnode Registry with Temporal Validity**
`iso_lmps` tracks every pnode per ISO with `effective_date` and `termination_date`. This handles node additions and retirements over time without losing historical LMP associations. All nodes for PJM, MISO, and ERCOT are populated.

### 4. **LMP Decomposition in da_lmp**
`da_lmp` stores all three LMP components separately (energy, congestion, loss) plus the total. This allows ML models to target congestion-driven price divergence independently from energy or loss signals.

### 5. **Unified Transmission Outage Table**
`transmission_outage` is a single table covering all ISOs, with `facility_name`, `from_bus`/`to_bus`, `impact_mw`, and `reason`. ISO-specific fields are handled via `data_source` rather than separate tables.

### 6. **Minimal NG Fields**
Natural gas data uses only essential fields: settlement date, contract month, OHLC prices/basis, and volume. Open interest is included for liquidity context. Can expand later if needed.

---

## What This Architecture Enables

**Tier 1 - Market-Level Forecasting**:
- Train ML model on zonal load forecasts + generation outages + gas prices
- Output: Expected electricity price per zone per hour
- Example: "DOM zone expected value = $44.50/MWh at 2 PM tomorrow"

**Tier 2 - Customer Site Valuation**:
- Register customer buses (generation sites, load centers)
- Extend zone forecast to specific bus using historical local adders
- Output: Expected price at customer's exact location
- Example: "Customer's Philadelphia bus = DOM zone price + $1.50 congestion = $46/MWh"

**PPA Translation Engine**:
- Compare PPA offers against expected values
- "Customer offered $45/MWh, but expected value is $46/MWh → Negotiate"
- Works consistently across all zones and customers

---

## Next Steps

1. **Deploy Schema** to Supabase PostgreSQL ✅ (Done)
2. **Connect to ISO APIs** ✅ (PJM Data Miner 2, MISO API, ERCOT API active)
3. **Load All Pnodes** ✅ (PJM, MISO, ERCOT pnode registries fully populated in `iso_lmps`)
4. **Connect to ICE Data Feed** ✅ (Henry Hub, basis, PJM REC, ERCOT REC)
5. **Load Historical DA LMP Data** — backfill `da_lmp` for all three ISOs
6. **Load Historical Load Forecasts** — backfill `historical_load_forecasts`
7. **Build Tier 1 Model** — train on hub/interface/load data across PJM, MISO, ERCOT
8. **Register Customer Sites** — add specific buses in `iso_buses` for customer locations
9. **Build Tier 2 Model** — extend market forecasts to customer-specific pnodes
10. **Deploy PPA Translation Engine** — evaluate offers in real-time across all three ISOs
11. **Expand to NYISO / CAISO** — add new `iso_registry` row and populate pnodes

