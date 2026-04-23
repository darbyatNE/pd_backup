# Multi-ISO Scalable Data Architecture
## Design Documentation for Energy Market & Natural Gas Data

**Status**: Ready for Implementation  
**Database**: PostgreSQL 18+  
**Last Updated**: April 2026

---

## Executive Summary

This architecture provides a **hybrid multi-tenant database** for storing operational and market data from multiple RTOs/ISOs (starting with PJM, expanding to ERCOT). The design enables:

- **Clean ISO separation** via foreign keys while maintaining unified querying
- **DST-safe time-series data** using UTC-based absolute timestamps (handles daylight saving time edge cases)
- **Referential integrity** across 10+ tables with cascading deletes where appropriate
- **ML-friendly dimensions** (transmission company zones, buses, hubs) separated from facts (prices, load, outages)
- **Two-tier modeling strategy**: Market-level models (zone/hub/interface) feed into customer-specific models (individual bus locations with pricing risk)
- **Extensibility** to add new ISOs, data types, and granularities without schema rewrites
- **Auditability** through ingestion logs and created/updated timestamps
- **API-mapped fields**: Schema fields directly correspond to PJM Data Miner 2 API and ICE data outputs

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

### 2. **Hybrid Multi-Tenancy**

Rather than separate databases/schemas per ISO, this design uses:

- **Shared reference tables**: `iso_registry`, `iso_zones`, `iso_buses`, `gas_hubs` (small, infrequently updated)
- **ISO-aware data tables**: Foreign key `iso_id` on all market/outage tables
- **Benefits**: Single query across ISOs; easy to add new RTOs; data stays warm

### 3. **Dimension + Fact Separation with Two-Tier Modeling**

Following data warehouse principles:

- **Dimensions**: `iso_registry`, `iso_zones`, `iso_buses`, `gas_hubs` (lookup tables, slow-changing)
- **Facts**: `zonal_load`, `generation_outage`, `ng_futures`, `ng_basis` (high-volume, timestamped)
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

### Understanding PJM "Zones" vs. "Buses"

**CRITICAL CLARIFICATION**: In PJM, "zones" are NOT geographic regions—they are **transmission company operating areas**:

| Zone Name | Transmission Company | Region | Geographic Coverage |
|-----------|-------------------|--------|---------------------|
| **DOM** | Dominion Energy | South | Virginia, North Carolina |
| **BGE** | Baltimore Gas & Electric | South | Maryland, Delaware |
| **PEPCO** | Pepco Holdings | South | DC, Maryland, Delaware |
| **AEP** | American Electric Power | West | Ohio, Indiana, Kentucky |
| **DAY** (or **Dayton Power**) | Dayton Power & Light | West | Ohio |
| **PECO** | PECO Energy | East | Pennsylvania |
| **PSEG** | Public Service Enterprise Group | East | New Jersey |
| **JCPL** | Jersey Central Power & Light | East | New Jersey |
| **ComEd** | ComEd (at interface) | West | Illinois (interface pricing) |

**Example**: When you see "BGE Zone" expected value = $45/MWh, this means the **average electricity price in Baltimore Gas & Electric's service territory** is $45/MWh. This zone is where BGE buys/sells power on the PJM market.

### Buses (Individual Trading Points)

**Buses** are specific physical points or trading hubs within a zone:
- Individual substations
- Generation facilities
- Major demand centers
- Transfer interfaces to other RTOs

Each bus can have a unique LMP (Locational Marginal Price), which is why we track them separately.

### System Diagram

REFERENCE TABLES (Master Lookup Data)
=====================================
iso_registry <- iso_zones <- iso_buses    gas_hubs
(ISOs)          (Transmission Cos:        (NG Hubs:
                 DOM, BGE, PEPCO,         Henry Hub,
                 AEP, PECO, etc.)         PG, TC, NX, etc.)
                    ^              ^            ^
                    | Foreign Keys |            |
                    +--+--+--+--+--+--+--+--+--+


TIME-SERIES MARKET DATA (PJM API Fields)
========================================
zonal_load                  generation_outage
- Evaluated At UTC          - Forecast Execution Date
- Datetime Beginning        - Forecast Date
- Forecast Area             - Forecast MW (RTO/West/Other)
- Forecast Load MW          - Capacity Impact

ng_futures                  ng_basis
- Settlement Date           - Settlement Date
- Contract Month            - Contract Month
- Settle Price              - Settle Basis
- Volume                    (ICE data, minimal fields)


AUDIT & OPERATIONS (Metadata)
=============================
data_ingestion_log
- ISO, table, endpoint
- Records inserted/updated/failed
- Timestamps, status, error messages

---

## Field Mapping: PJM API → Database Schema

### Zonal Load (PJM Data Miner 2 - Forecast API)

**Source**: PJM Data Miner 2 Forecast Load API

| PJM API Field | Database Column | Type | Notes |
|---------------|-----------------|------|-------|
| Evaluated At UTC | evaluated_at_utc | TIMESTAMP WITH TIME ZONE | When forecast was created (UTC) |
| Evaluated At EPT | evaluated_at_ept | TIMESTAMP WITH TIME ZONE | When forecast was created (EPT) - for reference |
| Datetime Beginning UTC | datetime_beginning_utc | TIMESTAMP WITH TIME ZONE | **Forecast period start (UTC)** - used for uniqueness |
| Datetime Beginning EPT | datetime_beginning_ept | TIMESTAMP WITH TIME ZONE | Forecast period start (EPT) - for reference |
| Forecast Area | zone_id | INTEGER (FK to iso_zones) | Zone (DOM, BGE, PEPCO, AEP, etc.) |
| Forecast Load MW | forecast_load_mw | NUMERIC(12, 2) | Load forecast in megawatts |

**Unique Constraint**: `UNIQUE(iso_id, zone_id, datetime_beginning_utc)` — prevents duplicate forecasts for same zone/time

**Example Row**:
```
iso_id=1, zone_id=2 (BGE), 
datetime_beginning_utc='2026-04-22 16:00:00+00',
forecast_load_mw=15250.5
```

---

### Generation Outage (PJM Data Miner 2 - Outage Forecast API)

**Source**: PJM Data Miner 2 Generation Outage Forecast API

| PJM API Field | Database Column | Type | Notes |
|---------------|-----------------|------|-------|
| Forecast Execution Date | forecast_execution_date_utc | TIMESTAMP WITH TIME ZONE | When forecast was created (converted to UTC) |
| Forecast Date | forecast_date | DATE | Date outage is forecasted for |
| Forecast generation outage MW RTO | outage_mw_rto | NUMERIC(12, 2) | Outage MW for entire RTO |
| Forecast generation outage MW West | outage_mw_west | NUMERIC(12, 2) | Outage MW for West region/zone |
| Forecast generation outage MW Other | outage_mw_other | NUMERIC(12, 2) | Outage MW for non-West region/zone |
| (Derived) | outage_timestamp_utc | TIMESTAMP WITH TIME ZONE | UTC timestamp for uniqueness (midnight UTC of forecast date) |

**Unique Constraint**: `UNIQUE(iso_id, forecast_date, forecast_type)` — one entry per day per outage type (RTO/West/Other)

**Example Rows**:
```
iso_id=1, forecast_type='RTO', forecast_date='2026-04-22', 
forecast_execution_date_utc='2026-04-22 05:00:00+00',
outage_mw_rto=1250.0

iso_id=1, forecast_type='WEST', forecast_date='2026-04-22',
forecast_execution_date_utc='2026-04-22 05:00:00+00', 
outage_mw_west=450.0
```

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

## Zone Reference Data

### PJM Transmission Company Zones

When populating `iso_zones` for PJM (iso_id=1):

```sql
INSERT INTO iso_zones (iso_id, zone_code, zone_name, description) VALUES
  (1, 'DOM', 'Dominion Energy', 'Virginia, North Carolina'),
  (1, 'BGE', 'Baltimore Gas & Electric', 'Maryland, Delaware'),
  (1, 'PEPCO', 'Pepco Holdings', 'DC, Maryland, Delaware'),
  (1, 'AEP', 'American Electric Power', 'Ohio, Indiana, Kentucky'),
  (1, 'DAY', 'Dayton Power & Light', 'Ohio'),
  (1, 'PECO', 'PECO Energy', 'Pennsylvania'),
  (1, 'PSEG', 'Public Service Enterprise Group', 'New Jersey'),
  (1, 'JCPL', 'Jersey Central Power & Light', 'New Jersey'),
  (1, 'COMED', 'ComEd (Interface)', 'Illinois Interface');
```

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
PJM Data Miner 2 returns both UTC and EPT times. We store UTC as the primary timestamp and use it in unique constraints. EPT is stored for reference/audit but not used for uniqueness.

### 2. **Zone = Transmission Company**
PJM's data structure centers on transmission company zones (DOM, BGE, PEPCO, etc.), not geographic regions. Our `iso_zones` table reflects this reality.

### 3. **Separate Outage Buckets**
Instead of one `transmission_outage` table, we have `generation_outage` that captures RTO/West/Other forecasts. This matches PJM API structure.

### 4. **Minimal NG Fields**
Natural gas data uses only essential fields: settlement date, contract month, price/basis, and volume. Can expand later if needed (open interest, liquidity, etc.).

### 5. **Forecasted Data (Not Real-Time)**
Initial load focuses on **forecasted** data from PJM Data Miner 2. Real-time LMP and actual outages can be added in Phase 2.

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

1. **Deploy Schema** to EC2 PostgreSQL ✅ (Done)
2. **Connect to PJM Data Miner 2 API** — authenticate and pull forecasted load data
3. **Connect to ICE Data Feed** — pull Henry Hub and basis prices
4. **Load 24 months of Historical Data** — populate tables with past forecasts
5. **Build Tier 1 Model** — train on zone/hub/interface data
6. **Register Customer Sites** — add specific buses for your customers
7. **Build Tier 2 Model** — extend market forecasts to customer sites
8. **Deploy PPA Translation Engine** — evaluate offers in real-time
9. **Expand to ERCOT** — repeat for Texas market

