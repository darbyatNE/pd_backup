# Profiling ↔ Planning Module Interface Specification

## 1. Purpose

This document defines the **contract of data** that must flow between the **Profiling module** (load forecasting, capacity sizing, settlement-zone mapping) and the **Planning module** (procurement scheduling, project matching, hedge optimization). It covers:

- **Sites** — physical buyer facilities with metered demand.
- **Projects** — generation assets (seller-side) available for contracting.
- **Mapping granularity** — temporal and geographic resolution.
- **Capacity & energy** — the quantified interface between a site's need and a project's supply.

REC attributes are **out of scope** for this revision; they will be addressed when the environmental-reporting layer is designed.

---

## 2. Entity Relationship Overview

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Customer  │1      * │    Site     │*      * │   Project   │
│   (users)   │─────────│(buyer site) │─────────│ (generation)│
└─────────────┘         └─────────────┘         └─────────────┘
                               │
                               │ 1
                               │
                          ┌────┴────┐
                          │  Load   │
                          │ Profile │
                          │(hourly) │
                          └─────────┘
```

**Rules:**
- A **Customer** (buyer) owns one or more **Sites**.
- A **Site** carries a granular load profile and a capacity timeline.
- A **Project** (seller asset) can be **linked** to one or more Sites via a contract/transaction.
- Profiling feeds *site-level* demand data into Planning. Planning feeds *project-level* supply data back into Profiling for coverage analysis.

---

## 3. Site (Buyer Facility) — Required Interface Fields

These fields must be available to **both** modules. Profiling authors them; Planning consumes them for scope, matching, and scheduling.

| # | Field | Type | Granularity | Source Module | Consumed By | Status | Notes |
|---|-------|------|-------------|---------------|-------------|--------|-------|
| 3.1 | `site_id` | UUID | — | Profiling | Planning | **Existing** | `buyer_projects.id` today; should become independent `sites` table. |
| 3.2 | `customer_id` | UUID | — | Profiling | Planning | **Existing** | FK to `users.id` (buyer). |
| 3.3 | `site_key` | string | — | Profiling | Planning | **Existing** | Stable slug: `ashburn-dc`, `manassas-industrial`, `sterling-hyperscale`. |
| 3.4 | `name` | string | — | Profiling | Planning | **Existing** | Human-readable facility name. |
| 3.5 | `location` | string | — | Profiling | Planning | **Existing** | City, State — drives map coords & zone lookup. |
| 3.6 | `settlement_zone` | string | — | Profiling | Planning | **Existing** | PJM zone abbreviation (`DOM`, `AEP`, `PPL`, etc.). |
| 3.7 | `iso` | string | — | Profiling | Planning | **Existing** | `PJM` (extendable for ERCOT, CAISO, etc.). |
| 3.8 | `site_type` | enum | — | Profiling | Planning | **Needed** | `data_center`, `industrial`, `hyperscale`, `commercial`. Drives load-shape template selection. |
| 3.9 | `capacity_mw` | numeric | annual | Profiling | Planning | **Existing** | Nameplate / contracted market capacity. |
| 3.10 | `capacity_by_year` | JSONB | year | Profiling | Planning | **Partial** | `SiteLoadProfile.capacityByYear` in code; not yet in DB schema. |
| 3.11 | `baseload_mw` | numeric | annual | Profiling | Planning | **Needed** | Flat floor demand (servers always on, HVAC base). |
| 3.12 | `peak_demand_mw` | numeric | annual | Profiling | Planning | **Needed** | Swing range above baseload (`capacity - baseload`). |
| 3.13 | `average_mw` | numeric | annual | Profiling | Planning | **Needed** | Scope-averaged effective demand. |
| 3.14 | `load_factor_pct` | numeric | annual | Profiling | Planning | **Needed** | `average / capacity * 100`. |
| 3.15 | `load_shape` | JSONB | hour × month | Profiling | Planning | **Needed** | 288-point array (24h × 12mo). Each point: `{hour, month, totalMw, baseloadMw, peakMw}`. |
| 3.16 | `load_adjustments` | JSONB | year/month | Profiling | Planning | **Partial** | Step-change events (tenant move-in, phase online). `SiteLoadProfile.loadAdjustments` in code only. |
| 3.17 | `project_type` | enum | — | Profiling | Planning | **Existing** | `brownfield` (has metered history) or `greenfield` (forecast-only). From `buyer_projects.project_type`. |
| 3.18 | `target_capacity_mw` | numeric | — | Profiling | Planning | **Existing** | Procurement target from RFP. From `buyer_projects.target_capacity_mw`. |
| 3.19 | `target_annual_quantity_mwh` | numeric | — | Profiling | Planning | **Existing** | Annual energy target. From `buyer_projects.target_annual_quantity_mwh`. |

---

## 4. Project (Generation Asset) — Required Interface Fields

These fields must be available to **both** modules. Planning authors them; Profiling consumes them for coverage, hedge, and cost-time optimization.

| # | Field | Type | Granularity | Source Module | Consumed By | Status | Notes |
|---|-------|------|-------------|---------------|-------------|--------|-------|
| 4.1 | `project_id` | UUID | — | Planning | Profiling | **Existing** | `projects.id`. |
| 4.2 | `seller_id` | UUID | — | Planning | Profiling | **Existing** | FK to `users.id` (seller). |
| 4.3 | `name` | string | — | Planning | Profiling | **Existing** | Project name. |
| 4.4 | `generation_type` | enum | — | Planning | Profiling | **Existing** | `Solar`, `Wind`, `Nuclear`, `Battery`, `Hydrogen`, `Hybrid`, `Combined Cycle`, `Peaker`. |
| 4.5 | `capacity_mw` | numeric | — | Planning | Profiling | **Existing** | Installed / offered nameplate capacity. |
| 4.6 | `location` | string | — | Planning | Profiling | **Existing** | Drives map marker coords. |
| 4.7 | `iso` | string | — | Planning | Profiling | **Existing** | Market/ISO identifier. |
| 4.8 | `zone` | string | — | Planning | Profiling | **Existing** | Settlement zone. |
| 4.9 | `status` | enum | — | Planning | Profiling | **Existing** | `draft`, `published`, `active`, `inactive`, `sold`. |
| 4.10 | `fixed_price_per_mwh` | numeric | — | Planning | Profiling | **Existing** | Blended fixed energy price. |
| 4.11 | `eac_price_per_mwh` | numeric | — | Planning | Profiling | **Existing** | REC/EAC premium price. |
| 4.12 | `price_currency` | string | — | Planning | Profiling | **Existing** | `USD` default. |
| 4.13 | `annual_escalator_percent` | numeric | — | Planning | Profiling | **Existing** | Contract price escalator. |
| 4.14 | `expected_cod` | date | — | Planning | Profiling | **Existing** | Estimated commercial operation date. |
| 4.15 | `guaranteed_cod` | date | — | Planning | Profiling | **Existing** | Firm COD commitment. |
| 4.16 | `delivery_term_years` | int | — | Planning | Profiling | **Existing** | Contract term length. |
| 4.17 | `guaranteed_availability_year1_percent` | numeric | — | Planning | Profiling | **Existing** | Year-1 availability guarantee. |
| 4.18 | `guaranteed_availability_ongoing_percent` | numeric | — | Planning | Profiling | **Existing** | Ongoing availability guarantee. |
| 4.19 | `eac_scheme` | enum | — | Planning | Profiling | **Existing** | `none`, `bundled`, `unbundled`. |
| 4.20 | `settlement_point` | string | — | Planning | Profiling | **Existing** | Nodal or zonal settlement ID. |
| 4.21 | `connection_point` | string | — | Planning | Profiling | **Existing** | POI / interconnection. |
| 4.22 | `hourly_shape` | JSONB | hour × month | Planning | Profiling | **Needed** | Normalized delivery shape per generation type (0–1 fraction). Needed for load-following hedge analysis. |
| 4.23 | `availability_by_month` | JSONB | month | Planning | Profiling | **Future** | Seasonal availability factor per month. |

---

## 5. Mapping & Temporal Granularity

This section defines the **time and geography axes** over which Sites and Projects must align.

| # | Dimension | Values | Purpose | Status |
|---|-----------|--------|---------|--------|
| 5.1 | **Geographic scope** | `iso` + `zone` | PJM zone-level (`DOM`, `AEP`, etc.) settlement & LMP mapping. | **Existing** |
| 5.2 | **Site location** | lat/lng | Map marker placement, zone overlay, distance-to-project calc. | **Existing** (derived from `location` via `getZoneCoords`). |
| 5.3 | **Year granularity** | 2026, 2027, 2028, … | Capacity expansion steps, COD alignment, scope bounding. | **Existing** |
| 5.4 | **Month granularity** | 1–12 | Seasonal load variation, contract start/end alignment, availability curves. | **Existing** |
| 5.5 | **Hour granularity** | 0–23 (HE01–HE24) | Load shape, on-peak/off-peak hedge analysis, shape-matching. | **Existing in code** (`loadShape`, `contractMwAtHour`). |
| 5.6 | **Scope window** | `(startYear, startMonth)` → `(endYear, endMonth)` | The analytical window shared by Profiling charts and Planning optimizer. | **Existing** (`ScopeContext`). |

---

## 6. Energy Information — Interface Fields

Energy is the **volume bridge** between a site's demand and a project's supply.

| # | Field | Formula / Source | Module | Status |
|---|-------|-----------------|--------|--------|
| 6.1 | `site_annual_mwh` | `Σ(hour,month) totalMw(h,m) × hoursInMonth(m)` | Profiling → Planning | **Needed** (computed on-the-fly today). |
| 6.2 | `site_monthly_mwh` | `Σ(hour) totalMw(h,m) × hoursInMonth(m)` per month | Profiling → Planning | **Needed** |
| 6.3 | `site_hourly_avg_mw` | `Σ(month) totalMw(h,m) / 12` per hour | Profiling → Planning | **Existing in code** |
| 6.4 | `project_annual_mwh` | `capacity_mw × 365 × 24 × availability_factor` | Planning → Profiling | **Needed** (currently hardcoded shapes). |
| 6.5 | `project_monthly_mwh` | `project_annual_mwh × month_shape_factor` | Planning → Profiling | **Needed** |
| 6.6 | `contracted_mwh` | Sum of linked contract annual MWh | Both | **Existing in code** (`getContractAnnualMwh`). |
| 6.7 | `hedge_pct_on_peak` | `onPeakHedgeMw / onPeakLoadMw × 100` | Both | **Existing in code** (`getDerivedHedgePcts`). |
| 6.8 | `hedge_pct_off_peak` | `offPeakHedgeMw / offPeakLoadMw × 100` | Both | **Existing in code** |
| 6.9 | `energy_gap_mwh` | `site_annual_mwh − contracted_mwh` | Profiling → Planning | **Existing in code** (chart stacks show gap). |

---

## 7. Capacity Information — Interface Fields

Capacity is the **power bridge** — instantaneous MW that must be covered.

| # | Field | Formula / Source | Module | Status |
|---|-------|-----------------|--------|--------|
| 7.1 | `site_capacity_mw` | Nameplate / BRA ceiling | Profiling → Planning | **Existing** |
| 7.2 | `site_baseload_mw` | Flat floor demand | Profiling → Planning | **Needed** (in `loadProfile.ts` only). |
| 7.3 | `site_peak_range_mw` | `capacity − baseload` | Profiling → Planning | **Needed** |
| 7.4 | `project_capacity_mw` | Installed / offered MW | Planning → Profiling | **Existing** |
| 7.5 | `contracted_capacity_mw` | Sum of `mwCovered` across linked contracts | Both | **Existing in code** (`LINKED_CONTRACTS`). |
| 7.6 | `capacity_gap_mw` | `site_capacity_mw − contracted_capacity_mw` | Profiling → Planning | **Existing in code** (CapacityCoverageChart). |
| 7.7 | `capacity_by_year` | Step-change timeline per site | Profiling → Planning | **Partial** (code only, not DB). |
| 7.8 | `capacity_channel` | `utility-bra`, `competitive-fixed`, `btm-bess`, `btm-ng` | Planning → Profiling | **Existing in code** (`CapacitySource`). |

---

## 8. Relationship / Linking Fields

These fields enable the **many-to-many** connections required by the user.

### 8.1 Project → Site Linkage

| Field | Type | Cardinality | Purpose | Status |
|-------|------|-------------|---------|--------|
| `project_site_link_id` | UUID | — | Surrogate key for link table. | **Needed** |
| `project_id` | UUID | * | FK to `projects`. | **Existing** |
| `site_id` | UUID | * | FK to `sites` (or `buyer_projects` today). | **Existing** (via `transactions.project_id` + buyer inference). |
| `mw_allocated` | numeric | — | How many MW of the project are assigned to this site. | **Existing in code** (`perSiteMw`). |
| `start_year`, `start_month` | int | — | When the allocation begins. | **Existing in code** |
| `end_year`, `end_month` | int | — | When the allocation ends. | **Existing in code** |

### 8.2 Site → Customer Linkage

| Field | Type | Cardinality | Purpose | Status |
|-------|------|-------------|---------|--------|
| `site.customer_id` | UUID | *→1 | FK to `users.id` (buyer role). | **Existing** (`buyer_projects.buyer_id`). |
| `site.parent_company` | string | — | Legal entity name for consolidated reporting. | **Future** |

---

## 9. Recommended Database Schema Additions

To make the interface above durable, the following schema changes are recommended:

### 9.1 New `sites` Table

Currently `buyer_projects` conflates **RFP intent** with **physical site**. Separate them:

```sql
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_key TEXT NOT NULL UNIQUE,           -- e.g. 'ashburn-dc'
  name TEXT NOT NULL,
  location TEXT,
  iso VARCHAR(10),
  settlement_zone VARCHAR(10),
  site_type TEXT CHECK (site_type IN ('data_center','industrial','hyperscale','commercial')),
  capacity_mw NUMERIC(10,2),
  baseload_mw NUMERIC(10,2),
  peak_demand_mw NUMERIC(10,2),
  average_mw NUMERIC(10,2),
  load_factor_pct NUMERIC(5,2),
  load_shape JSONB,                          -- 24×12 array of {hour,month,totalMw,baseloadMw,peakMw}
  capacity_by_year JSONB,                    -- { "2026": 50, "2027": 65 }
  load_adjustments JSONB,                    -- [{ effectiveYear, effectiveMonth, pctChange, reason }]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.2 New `project_site_links` Table

Explicit many-to-many with allocation metadata:

```sql
CREATE TABLE public.project_site_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  mw_allocated NUMERIC(10,2) NOT NULL,
  start_year INT NOT NULL,
  start_month INT NOT NULL,
  end_year INT NOT NULL,
  end_month INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, site_id)
);
```

### 9.3 Extend `projects` Table

Add normalized hourly shape for load-following analysis:

```sql
ALTER TABLE public.projects
  ADD COLUMN hourly_shape JSONB,             -- 24×12 array of 0–1 fractions
  ADD COLUMN availability_by_month JSONB;    -- 12-element array of 0–1 factors
```

### 9.4 Migrate `buyer_projects`

After `sites` table exists, `buyer_projects` should become **RFP-specific** and reference `site_id`:

```sql
ALTER TABLE public.buyer_projects
  ADD COLUMN site_id UUID REFERENCES public.sites(id);
-- Future: backfill site_id for existing rows, then enforce NOT NULL.
```

---

## 10. Data Flow Summary

```
Profiling Module                          Planning Module
─────────────────────────────────────────────────────────────────
Sites (with load profiles)  ──────────►  Scope definition
                                           (which sites, years)
                                           ▼
Capacity by year            ──────────►  Gap analysis
                                           (what MW is uncovered)
                                           ▼
Hourly/monthly load shape   ──────────►  Project matching
                                           (which gen types fit)
                                           ▼
                                          Contract scheduling
                                           (term alignment)
                                           ▼
Projects (with shapes)      ◄──────────  Hedge optimization
                                           (cost vs time curves)
                                           ▼
Energy gap / coverage       ◄──────────  Capacity allocation
                                           (per-site MW shares)
```

---

## 11. REC & Environmental Attributes (Deferred)

| Field | Type | Purpose | Status |
|-------|------|---------|--------|
| `eac_scheme` | enum | `bundled`, `unbundled`, `none` | **Existing** |
| `renewable_percentage_target` | numeric | Buyer mandate | **Existing** on `buyer_projects` |
| `scope2_emissions_target_mt` | numeric | GHG target | **Existing** on `buyer_projects` |
| `net_neutral_target_year` | int | Carbon-neutral goal year | **Existing** on `buyer_projects` |
| `project_emissions_factor` | numeric | tCO₂e / MWh for project | **Future** |
| `project_additionality` | boolean | New-build vs existing | **Future** |

These will be promoted to first-class interface fields when the environmental-reporting module is scoped.

---

## 12. Checklist for Implementation

- [ ] Create `sites` table and migrate `buyer_projects.site_id` FK.
- [ ] Move `SiteLoadProfile` data from `frontend/src/data/loadProfile.ts` into `sites` table rows.
- [ ] Create `project_site_links` junction table.
- [ ] Add `hourly_shape` and `availability_by_month` to `projects`.
- [ ] Update `ScopeContext` to source `selectedSites` from `sites` table instead of hardcoded keys.
- [ ] Update `Map.tsx` to join `projects` → `project_site_links` → `sites` for bidirectional marker logic.
- [ ] Update Forecast/Planning charts to query `sites.load_shape` from DB rather than in-memory fixtures.
- [ ] Build admin UI for managing site profiles, capacity-by-year, and load adjustments.
