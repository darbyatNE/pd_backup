# Sites ↔ Projects Data Cross-Reference

This document maps every field required by the Profiling ↔ Planning interface against its current location in the PowerDime codebase. It answers three questions for each field:
1. **In DB schema?** — does the Supabase `public` schema already store it?
2. **In frontend code?** — is there a TypeScript interface or hardcoded fixture for it?
3. **Action needed** — what to do next.

---

## 1. Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Exists in named location |
| ⚠️ | Partially exists (column exists but data model is wrong, or data lives in JSONB without schema enforcement) |
| ❌ | Does not exist |
| 🔄 | Needs migration or refactor |

---

## 2. `public.projects` (Generation Offers / Seller Assets)

| # | Field | Type (DB) | In `schema.sql`? | In `types/index.ts` or `ppa.ts`? | Notes / Action |
|---|-------|-----------|------------------|-----------------------------------|----------------|
| 2.1 | `id` | UUID PK | ✅ | ✅ `Project.id` | — |
| 2.2 | `seller_id` | UUID FK → users | ✅ | ✅ `Project.seller_id` | — |
| 2.3 | `name` | VARCHAR(255) | ✅ | ✅ `Project.name` | — |
| 2.4 | `generation_type` | VARCHAR(50) CHECK | ✅ | ✅ `GenerationType` enum | 8 types incl. `Combined Cycle`, `Peaker` |
| 2.5 | `capacity_mw` | NUMERIC(10,2) | ✅ | ✅ `Project.capacity_mw` | — |
| 2.6 | `location` | VARCHAR(255) | ✅ | ✅ `Project.location` | — |
| 2.7 | `iso` | VARCHAR(10) | ✅ | ✅ `Project.iso` | Added via migration |
| 2.8 | `zone` | VARCHAR(50) | ✅ | ✅ `Project.zone` | Added via migration |
| 2.9 | `status` | TEXT CHECK | ✅ (`draft`,`published`,`unpublished`) | ✅ `ProjectStatus` (6 values: adds `active`,`inactive`,`sold`) | **Mismatch:** DB enum is narrower than TS type |
| 2.10 | `metadata` | JSONB | ✅ | ✅ `Metadata` | Free-form catch-all |
| 2.11 | `created_at` | TIMESTAMPTZ | ✅ | ✅ | — |
| 2.12 | `updated_at` | TIMESTAMPTZ | ✅ | ✅ | — |
| 2.13 | `fixed_price_per_mwh` | NUMERIC(10,4) | ✅ | ✅ `Project.fixed_price_per_mwh` | — |
| 2.14 | `eac_price_per_mwh` | NUMERIC(10,4) | ✅ | ✅ `Project.eac_price_per_mwh` | — |
| 2.15 | `price_currency` | ENUM `price_currency` | ✅ | ✅ `PriceCurrency` | — |
| 2.16 | `annual_escalator_percent` | NUMERIC(5,2) | ✅ | ✅ `Project.annual_escalator_percent` | — |
| 2.17 | `floating_price_source` | ENUM `floating_price_source` | ✅ | ✅ `FloatingPriceSource` | — |
| 2.18 | `expected_nameplate_capacity_mw` | NUMERIC(10,2) | ✅ | ✅ `VPPACapacity` | Redundant with `capacity_mw`? |
| 2.19 | `buyer_share_percent` | NUMERIC(5,2) | ✅ | ✅ `VPPACapacity` | — |
| 2.20 | `expected_cod` | DATE | ✅ | ✅ `Project.expected_cod` | — |
| 2.21 | `guaranteed_cod` | DATE | ✅ | ✅ `Project.guaranteed_cod` | — |
| 2.22 | `earliest_cod_date` | DATE | ✅ | ✅ `VPPATimeline` | — |
| 2.23 | `delivery_term_years` | INT | ✅ | ✅ `Project.delivery_term_years` | — |
| 2.24 | `development_security_per_mw` | NUMERIC(12,2) | ✅ | ✅ `VPPASecurity` | — |
| 2.25 | `operational_security_per_mw` | NUMERIC(12,2) | ✅ | ✅ `VPPASecurity` | — |
| 2.26 | `credit_rating_required` | VARCHAR(20) | ✅ | ✅ `VPPASecurity` | — |
| 2.27 | `delay_damages_per_mw_day` | NUMERIC(10,2) | ✅ | ✅ `VPPADamages` | — |
| 2.28 | `delay_damages_cap` | NUMERIC(15,2) | ✅ | ✅ `VPPADamages` | — |
| 2.29 | `early_termination_fee` | NUMERIC(15,2) | ✅ | ✅ `VPPADamages` | — |
| 2.30 | `capacity_shortfall_rate_per_kw` | NUMERIC(10,2) | ✅ | ✅ `VPPADamages` | — |
| 2.31 | `guaranteed_availability_year1_percent` | NUMERIC(5,2) | ✅ | ✅ `Project.guaranteed_availability_year1_percent` | — |
| 2.32 | `guaranteed_availability_ongoing_percent` | NUMERIC(5,2) | ✅ | ✅ `Project.guaranteed_availability_ongoing_percent` | — |
| 2.33 | `availability_damages_rate` | NUMERIC(10,2) | ✅ | ✅ `VPPAAvailability` | — |
| 2.34 | `eac_scheme` | ENUM `eac_scheme` | ✅ | ✅ `Project.eac_scheme` | — |
| 2.35 | `eac_transfer_deadline_days` | INT | ✅ | ✅ `VPPAEnvironmental` | — |
| 2.36 | `settlement_point` | VARCHAR(100) | ✅ | ✅ `Project.settlement_point` | — |
| 2.37 | `payment_period_days` | INT | ✅ | ✅ `VPPASettlement` | — |
| 2.38 | `generation_modules` | ENUM `generation_module_type` | ✅ | ✅ `GenerationModuleType` | — |
| 2.39 | `connection_point` | VARCHAR(255) | ✅ | ✅ `Project.connection_point` | — |
| 2.40 | `major_equipment_description` | TEXT | ✅ | ✅ `VPPAProjectDetails` | — |
| 2.41 | `vppa_terms` | JSONB | ✅ | ✅ `VPPAAdditionalTerms` | Free-form extensions |
| 2.42 | `price_schedule` | JSONB | ✅ | ✅ `PriceSchedule` | Array of year entries |
| 2.43 | **`hourly_shape`** | JSONB | ❌ | ❌ (shape is hardcoded in `linkedContracts.ts`) | **Needed** — normalized 24×12 delivery fractions per generation type |
| 2.44 | **`availability_by_month`** | JSONB | ❌ | ❌ | **Future** — seasonal availability factor per month |

### Projects Summary
- **42 of 44 fields** already exist in the DB.
- **2 fields missing:** `hourly_shape`, `availability_by_month`.
- **1 mismatch:** `status` DB enum (`draft`/`published`/`unpublished`) is narrower than TS type (`active`/`inactive`/`sold` added).

---

## 3. `public.buyer_projects` (Currently: Buyer RFPs + Site Proxy)

**Problem:** This table conflates **RFP intent** with **physical site**. It is the closest thing to a "Sites" table today.

| # | Field | Type (DB) | In `schema.sql`? | In frontend code? | Notes / Action |
|---|-------|-----------|------------------|-------------------|----------------|
| 3.1 | `id` | UUID PK | ✅ | ✅ `BuyerProject.id` / `BuyerSite.id` | — |
| 3.2 | `buyer_id` | UUID FK → users | ✅ | ✅ `BuyerProject.buyer_id` | Maps to **Customer** |
| 3.3 | `project_type` | TEXT CHECK | ✅ (`brownfield`/`greenfield`) | ✅ `BuyerProject.project_type` | — |
| 3.4 | `name` | TEXT | ✅ | ✅ `BuyerProject.name` / `BuyerSite.name` | Site name |
| 3.5 | `location` | TEXT | ✅ | ✅ `BuyerProject.location` / `BuyerSite.location` | — |
| 3.6 | `metadata` | JSONB | ✅ | ✅ `BuyerProject.metadata` | — |
| 3.7 | `created_at` | TIMESTAMPTZ | ✅ | ✅ | — |
| 3.8 | `updated_at` | TIMESTAMPTZ | ✅ | ✅ | — |
| 3.9 | `target_capacity_mw` | NUMERIC(10,2) | ✅ | ✅ `BuyerProject.target_capacity_mw` / `BuyerSite.target_capacity_mw` | RFP target, not physical capacity |
| 3.10 | `target_annual_quantity_mwh` | NUMERIC(12,2) | ✅ | ✅ `BuyerProject.target_annual_quantity_mwh` | RFP energy target |
| 3.11 | `preferred_term_years` | INT | ✅ | ✅ `BuyerProject.preferred_term_years` | RFP term |
| 3.12 | `equity_share_percent` | NUMERIC(5,2) | ✅ | ✅ `RFPRequirements` | — |
| 3.13 | `target_cod` | DATE | ✅ | ✅ `BuyerProject.target_cod` / `RFPTimeline` | RFP COD preference |
| 3.14 | `no_earlier_than_date` | DATE | ✅ | ✅ `RFPTimeline` | — |
| 3.15 | `outside_cod_date` | DATE | ✅ | ✅ `RFPTimeline` | — |
| 3.16 | `max_fixed_price_per_mwh` | NUMERIC(10,4) | ✅ | ✅ `RFPPricing` | — |
| 3.17 | `max_eac_price_per_mwh` | NUMERIC(10,4) | ✅ | ✅ `RFPPricing` | — |
| 3.18 | `preferred_escalator_percent` | NUMERIC(5,2) | ✅ | ✅ `RFPPricing` | — |
| 3.19 | `price_currency` | ENUM | ✅ | ✅ `RFPPricing` | — |
| 3.20 | `preferred_settlement_type` | ENUM | ✅ | ✅ `RFPSettlement` | — |
| 3.21 | `preferred_settlement_point` | VARCHAR(100) | ✅ | ✅ `RFPSettlement` | — |
| 3.22 | `settlement_zone` | VARCHAR(50) | ✅ | ✅ `BuyerProject.settlement_zone` / `BuyerSite.settlement_zone` | — |
| 3.23 | `preferred_generation_types` | TEXT[] | ✅ | ✅ `BuyerProject.preferred_generation_types` | — |
| 3.24 | `required_eac_scheme` | ENUM | ✅ | ✅ `RFPEnvironmental` | — |
| 3.25 | `scope2_emissions_target_mt` | NUMERIC(12,2) | ✅ | ✅ `RFPEnvironmental` | — |
| 3.26 | `net_neutral_target_year` | INT | ✅ | ✅ `RFPEnvironmental` | — |
| 3.27 | `renewable_percentage_target` | NUMERIC(5,2) | ✅ | ✅ `RFPEnvironmental` | — |
| 3.28 | `buyer_credit_rating` | VARCHAR(20) | ✅ | ✅ `RFPCredit` | — |
| 3.29 | `buyer_security_per_mw` | NUMERIC(12,2) | ✅ | ✅ `RFPCredit` | — |
| 3.30 | `min_guaranteed_availability_percent` | NUMERIC(5,2) | ✅ | ✅ `RFPCredit` | — |
| 3.31 | `processing_status` | ENUM | ✅ | ✅ `ProcessingWorkflow` | — |
| 3.32 | `extracted_data` | JSONB | ✅ | ✅ `ExtractedBuyerData` | — |
| 3.33 | `processing_notes` | TEXT | ✅ | ✅ `ProcessingWorkflow` | — |
| 3.34 | `processed_at` | TIMESTAMPTZ | ✅ | ✅ `ProcessingWorkflow` | — |
| 3.35 | `processed_by` | UUID FK → users | ✅ | ✅ `ProcessingWorkflow` | — |
| 3.36 | `rfp_requirements` | JSONB | ✅ | ✅ `RFPAdditionalRequirements` | — |
| 3.37 | `requested_price_schedule` | JSONB | ✅ | ✅ `PriceSchedule` | — |
| 3.38 | **`site_key`** | — | ❌ | ✅ Hardcoded in `ScopeContext.tsx` (`ashburn-dc`, `manassas-industrial`, `sterling-hyperscale`) | **Needed** — stable slug for UI scope |
| 3.39 | **`site_type`** | — | ❌ | ✅ Implied by `loadProfile.ts` templates (`HOUR_SHAPE_DC`, `HOUR_SHAPE_IND`, `HOUR_SHAPE_HP`) | **Needed** — enum: `data_center`, `industrial`, `hyperscale` |
| 3.40 | **`capacity_mw`** (physical) | — | ❌ | ✅ `SiteLoadProfile.capacityMw` (50, 30, 75) | **Needed** — nameplate / BRA ceiling |
| 3.41 | **`capacity_by_year`** | — | ❌ | ✅ `SiteLoadProfile.capacityByYear` JSONB | **Needed** — sparse year→MW map |
| 3.42 | **`baseload_mw`** | — | ❌ | ✅ `SiteLoadProfile.baseloadMw` (40, 15, 62) | **Needed** — flat floor demand |
| 3.43 | **`peak_demand_mw`** | — | ❌ | ✅ `SiteLoadProfile.peakDemandMw` (computed as `capacity - baseload`) | **Needed** — swing range |
| 3.44 | **`average_mw`** | — | ❌ | ✅ `SiteLoadProfile.averageMw` | **Needed** — scope-averaged demand |
| 3.45 | **`load_factor_pct`** | — | ❌ | ✅ `SiteLoadProfile.loadFactorPct` | **Needed** |
| 3.46 | **`load_shape`** (24×12) | — | ❌ | ✅ `SiteLoadProfile.loadShape` — 288-point array | **Needed** — hour×month demand profile |
| 3.47 | **`load_adjustments`** | — | ❌ | ✅ `SiteLoadProfile.loadAdjustments` | **Needed** — step-change events |
| 3.48 | **`iso`** | — | ❌ | ❌ | **Needed** — currently hard-inferred as "PJM" |
| 3.49 | **`parent_company`** | — | ❌ | ❌ | **Future** — for consolidated reporting |

### Buyer Projects / Sites Summary
- **37 of 49 fields** exist in `buyer_projects` table.
- **All 37 existing fields are RFP/preference fields** — not physical site data.
- **12 site-physical fields are completely missing** from the DB: `site_key`, `site_type`, `capacity_mw` (physical), `capacity_by_year`, `baseload_mw`, `peak_demand_mw`, `average_mw`, `load_factor_pct`, `load_shape`, `load_adjustments`, `iso`, `parent_company`.
- **The `buyer_projects` table should be split:** physical site attributes → new `sites` table; RFP attributes stay in `buyer_projects` with a `site_id` FK.

---

## 4. Linking / Relationship Tables

### 4.1 `public.transactions` (Project ↔ Buyer)

| Field | Type | In DB? | Notes |
|-------|------|--------|-------|
| `id` | UUID PK | ✅ | — |
| `project_id` | UUID FK → projects | ✅ | Links to **Generation Offer** |
| `buyer_id` | UUID FK → users | ✅ | Links to **Customer** (not Site) |
| `seller_id` | UUID FK → users | ✅ | — |
| `energy_amount_mwh` | NUMERIC | ✅ | Transaction volume |
| `start_date` | DATE | ✅ | — |
| `contract_duration_years` | INT | ✅ | — |
| `status` | ENUM | ✅ | `submitted`/`accepted`/`rejected` |

**Gap:** `transactions` links **Project** to **Customer** (buyer_id), not to a **Site**. When a single customer has multiple sites, the transaction does not record which site is being hedged. The `project_site_links` junction table is needed for this.

### 4.2 `public.project_site_links` (Proposed)

| Field | Type | In DB? | Notes |
|-------|------|--------|-------|
| `id` | UUID PK | ❌ | Surrogate key |
| `project_id` | UUID FK → projects | ❌ | — |
| `site_id` | UUID FK → sites | ❌ | — |
| `mw_allocated` | NUMERIC(10,2) | ❌ | Per-site MW share |
| `start_year` / `start_month` | INT | ❌ | Allocation term start |
| `end_year` / `end_month` | INT | ❌ | Allocation term end |

This is **only modeled in frontend code** today: `LinkedContract.perSiteMw` in `linkedContracts.ts` holds the same data as a hardcoded fixture.

---

## 5. Frontend-Only Data Fixtures (Not in DB)

These are the **critical** data structures that drive the Profiling module charts but live only in TypeScript files.

### 5.1 `frontend/src/data/loadProfile.ts` — `SiteLoadProfile`

```typescript
export interface SiteLoadProfile {
  siteKey: string;               // e.g. 'ashburn-dc'
  name: string;                  // 'Ashburn Data Center'
  location: string;              // 'Ashburn, VA'
  settlementZone: string;        // 'DOM'
  capacityMw: number;            // 50
  baseloadMw: number;            // 40
  peakDemandMw: number;          // 10 (computed)
  averageMw: number;             // computed
  loadFactorPct: number;         // computed
  loadShape: LoadShapePoint[];   // 24h × 12mo = 288 points
  capacityByYear?: Record<number, number>;
  loadAdjustments?: LoadAdjustment[];
  constituentSiteKeys?: string[];
}
```

**Status:** ❌ Not in DB. Hardcoded for 3 sites only.

### 5.2 `frontend/src/data/linkedContracts.ts` — `LinkedContract`

```typescript
export interface LinkedContract {
  projectName: string;           // e.g. 'Susquehanna SMR'
  generationType: GenerationType;
  mwCovered: number;             // 20
  pricePerMwh: number;           // 35
  shape: 'flat' | 'solar' | 'wind' | 'evening';
  tier: 'base' | 'peak';
  pattern: 'diagonal' | 'dots' | ...;
  startYear: number; startMonth: number;
  endYear: number; endMonth: number;
  perSiteMw?: Array<{ siteKey: string; mwCovered: number }>;
}
```

**Status:** ❌ Not in DB. Hardcoded for 3 sites × 8 contracts.

### 5.3 `frontend/src/data/linkedContracts.ts` — `CapacitySource`

```typescript
export interface CapacitySource {
  sourceName: string;            // 'Dominion BRA Pass-Through'
  channel: 'utility-bra' | 'competitive-fixed' | 'btm-bess' | 'btm-ng';
  mwCovered: number;             // 50
  pattern: 'diagonal' | 'dots' | ...;
}
```

**Status:** ❌ Not in DB. Hardcoded for 2 of 3 sites.

### 5.4 `frontend/src/contexts/ScopeContext.tsx`

```typescript
export interface ScopeState {
  selectedSites: string[];        // ['ashburn-dc', 'manassas-industrial', ...]
  startYear: number;            // 2026
  startMonth: number;           // 1
  endYear: number;              // 2028
  endMonth: number;             // 12
}
```

**Status:** ⚠️ State is pure React; no DB persistence. Scope is ephemeral per session.

---

## 6. Complete Gap Matrix

| Category | Total Fields | In DB | In Frontend Only | Completely Missing | Action |
|----------|--------------|-------|------------------|---------------------|--------|
| **Project (Generation Offer)** | 44 | 42 | 0 | 2 (`hourly_shape`, `availability_by_month`) | Minor additions |
| **Site (Data Center / Facility)** | 49 | 37* | 10 | 2 (`iso`, `parent_company`) | **Major refactor needed** |
| **Project → Site Links** | 6 | 0 | 5 (`perSiteMw`) | 1 (`id`) | **New table needed** |
| **Scope / Time Window** | 5 | 0 | 5 | 0 | Consider persisting scope |

\* All 37 fields in `buyer_projects` are RFP fields, not physical site fields.

---

## 7. What to Add / Change

### 7.1 New Table: `public.sites`

Physical facility data currently scattered across hardcoded fixtures:

| Column | Type | Source in code |
|--------|------|----------------|
| `id` | UUID PK | New |
| `customer_id` | UUID FK → users | `buyer_projects.buyer_id` |
| `site_key` | TEXT UNIQUE | `ScopeContext` hardcoded strings |
| `name` | TEXT | `loadProfile.ts` names |
| `location` | TEXT | `loadProfile.ts` locations |
| `iso` | VARCHAR(10) | Hardcoded "PJM" |
| `settlement_zone` | VARCHAR(10) | `loadProfile.ts` settlementZone |
| `site_type` | ENUM | Inferred from shape templates |
| `capacity_mw` | NUMERIC(10,2) | `SiteLoadProfile.capacityMw` |
| `baseload_mw` | NUMERIC(10,2) | `SiteLoadProfile.baseloadMw` |
| `peak_demand_mw` | NUMERIC(10,2) | `SiteLoadProfile.peakDemandMw` |
| `average_mw` | NUMERIC(10,2) | `SiteLoadProfile.averageMw` |
| `load_factor_pct` | NUMERIC(5,2) | `SiteLoadProfile.loadFactorPct` |
| `load_shape` | JSONB | `SiteLoadProfile.loadShape` (288 pts) |
| `capacity_by_year` | JSONB | `SiteLoadProfile.capacityByYear` |
| `load_adjustments` | JSONB | `SiteLoadProfile.loadAdjustments` |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard |

### 7.2 New Table: `public.project_site_links`

Contract-to-site allocations currently in `LinkedContract.perSiteMw`:

| Column | Type | Source in code |
|--------|------|----------------|
| `id` | UUID PK | New |
| `project_id` | UUID FK → projects | `LinkedContract` name + `projects.id` lookup |
| `site_id` | UUID FK → sites | New `sites.id` |
| `mw_allocated` | NUMERIC(10,2) | `perSiteMw[].mwCovered` |
| `start_year` / `start_month` | INT | `LinkedContract.startYear/Month` |
| `end_year` / `end_month` | INT | `LinkedContract.endYear/Month` |
| `price_per_mwh` | NUMERIC(10,4) | `LinkedContract.pricePerMwh` |

### 7.3 Alter Table: `public.projects`

| Column | Type | Source in code |
|--------|------|----------------|
| `hourly_shape` | JSONB | `SHAPE_HOUR` constants in `linkedContracts.ts` (24×12 array per gen type) |
| `availability_by_month` | JSONB | `MONTH_FACTOR` constants in `linkedContracts.ts` |

### 7.4 Alter Table: `public.buyer_projects`

| Column | Type | Action |
|--------|------|--------|
| `site_id` | UUID FK → sites | Add FK; backfill for existing rows; eventually make NOT NULL |
| Keep all existing RFP columns | — | These stay — `buyer_projects` becomes pure "RFP / procurement intent" |

### 7.5 New Table: `public.site_capacity_sources`

Capacity channel data currently in `LINKED_CAPACITY_SOURCES`:

| Column | Type | Source in code |
|--------|------|----------------|
| `id` | UUID PK | New |
| `site_id` | UUID FK → sites | New `sites.id` |
| `source_name` | TEXT | `CapacitySource.sourceName` |
| `channel` | ENUM | `CapacitySource.channel` |
| `mw_covered` | NUMERIC(10,2) | `CapacitySource.mwCovered` |
| `effective_from` | DATE | New |
| `effective_until` | DATE | New |

---

## 8. File Inventory: Where Each Piece Lives Today

| Concept | File Path | Type | Scope |
|---------|-----------|------|-------|
| DB Schema (Projects) | `supabase/schema.sql` | SQL | All project VPPA columns |
| DB Schema (Buyer Projects) | `supabase/schema.sql` | SQL | All buyer RFP columns |
| DB Migrations | `supabase/migrations/*.sql` | SQL | Incremental schema changes (iso/zone, combustion gen types) |
| Project TypeScript Interface | `frontend/src/types/index.ts` | TS | `Project`, `GenerationType`, `ProjectStatus` |
| VPPA/PPA TypeScript Types | `frontend/src/types/ppa.ts` | TS | `VPPAPricing`, `VPPATimeline`, `BuyerProjectRFP`, etc. |
| Site Load Profile (hardcoded) | `frontend/src/data/loadProfile.ts` | TS | `SiteLoadProfile`, `LOAD_PROFILES`, `LOAD_PROFILE_MAP` |
| Linked Contracts (hardcoded) | `frontend/src/data/linkedContracts.ts` | TS | `LinkedContract`, `LINKED_CONTRACTS`, `CapacitySource` |
| LMP Price Data (hardcoded) | `frontend/src/data/lmpData.ts` | TS | Hourly wholesale price fixtures |
| Scope State (React only) | `frontend/src/contexts/ScopeContext.tsx` | TS | `ScopeState`, `ALL_SITE_KEYS` |
| Map Page (reads both) | `frontend/src/pages/Map.tsx` | TSX | Fetches `projects` + `buyer_projects`; renders markers |
| Forecast / Planning Charts | `frontend/src/pages/Forecast.tsx`, `frontend/src/components/forecast/*.tsx` | TSX | Consumes `loadProfile.ts` + `linkedContracts.ts` |
| Try-On Overlay | `frontend/src/components/tryon/*.tsx` | TSX | Consumes `loadProfile.ts` + `linkedContracts.ts` |
| Backend API | `backend/src/routes/projects.js` | JS | CRUD for `projects` + `buyer_projects` |

---

## 9. Recommended Implementation Order

1. **Create `sites` table** and seed with the 3 hardcoded profiles from `loadProfile.ts`.
2. **Add `site_id` FK to `buyer_projects`** and backfill existing rows.
3. **Create `project_site_links` table** and seed from `linkedContracts.ts` fixtures.
4. **Add `hourly_shape` and `availability_by_month` to `projects`**.
5. **Update frontend** to query `sites` and `project_site_links` from Supabase instead of importing from `loadProfile.ts` and `linkedContracts.ts`.
6. **Create `site_capacity_sources` table** and migrate `LINKED_CAPACITY_SOURCES`.
7. **(Future)** Build admin UI for buyers to manage their site profiles, capacity timelines, and load adjustments.
