# PowerDime Demo — Enabled Features

A walkthrough of the functions wired up in the app today. PowerDime is a renewable-energy PPA marketplace for buyers (load) and sellers (generators) operating across PJM.

---

## Auth & Layout

- **Login / Protected Routes** — Supabase-backed session, every page below `/login` is gated.
- **Two-row Header** — top row: page nav (Plan / Map / Evaluate); second row: sub-tabs (Capacity / Energy / RECs) shown only on dashboard views.
- **Scope Bar** — collapsed by default (site tags + date pill + "Edit scope"); expands to multi-select site checkboxes and start/end-year dropdowns. All dashboard pages read from `ScopeContext`.

## Plan — Procurement Planning

The "Plan" link routes to `Forecast.tsx` and switches by sub-tab.

### Capacity sub-tab

- **Capacity Rollup** — totals across selected sites (cleared MW, BRA $/MW-day, est. annual cost).
- **Capacity Coverage Chart** — single-indigo bar per hour/month with each source patterned in. Uncovered remainder sits at top; sources contracted in excess of capacity drop below y=0 as the red over-hedge pattern. Same Hours/Months toggle, year tabs, and "All years" mode as the load chart.
- **Per-site Capacity Cards** — for each site:
  - Brownfield BRA pass-through panel (delivery-year clearing prices)
  - Greenfield options table: Utility Queue, Competitive Supplier multi-year fixed, BTM BESS, BTM Mini-NG
  - **View document** dialog — link an existing tariff or jump to Documents in selection mode (persisted via `localStorage`)
  - **Solicit RFQ** and **View BRA history** — Coming Soon dialogs (Aug 2026)

### Energy sub-tab

- **Capacity / KPI Summary Strip** — site label, Market Capacity, Forecast Capacity (with default 5%/yr growth ramp), Baseload, Peak Demand, Load Factor, Annual Load (GWh), capacity-utilization bar.
- **Load Forecast & Procurement Chart**
  - 2D mode: stacked bars per hour or per month; tier-colored backgrounds (teal baseload, amber peak); each linked contract shades its slice with a unique SVG pattern; over-hedge renders below 0 in red.
  - 3D mode: oblique ribbon — X = hour, Y = MW, Z = month — for one selected year.
  - Year tabs span the whole scope; "All" view tiles every month side-by-side.
  - Stable per-contract data keys + chart-key remount keep visualization correct as sites are toggled.
- **Cost vs Time Chart**, **Energy Source Mix donut**, **Procurement Schedule** card, **Risk & Alerts** card.

### RECs sub-tab

- Placeholder card — REC procurement engine landing later.

## Map — Project Map

- **OSM Basemap** via MapLibre GL (no API key, raster tiles).
- **PJM Zone Boundaries** as a GeoJSON overlay (teal fill + dark border).
- **Project Pins** for published seller projects, colored by generation type (Solar amber, Wind sky, Nuclear violet, NG slate, etc.).
- **PJM-only filter** — non-PJM projects suppressed by default.
- **Generation-type legend filter** — click a legend entry to toggle that type on/off.
- **Site Pins** — buyer load sites (Ashburn DC, Manassas Industrial, Sterling Hyperscale, all DOM zone) shown alongside projects, linked to ScopeBar selection.
- **Project Popups** — name, generation type, MW, location, price range, plus an **Examine Fit** ribbon that surfaces scope expansion when the project's term exceeds the selected scope.
- **Sidebar** — list of in-scope projects; clicking a row flies the map to the marker.

## Evaluate — Risk Report

`Planning.tsx` with three sub-tabs (Capacity / Energy / RECs).

- **Summary Cards** — Total Load Scope, Hedge Coverage (% of load contracted, allows >100%), Basis Risk, Volume Risk, Settlement Risk.
- **Energy Tab** — risk decomposition tables, per-site basis (DOM-WH math), procurement-vs-load deltas. Hedge percentages and risk components derive from `LINKED_CONTRACTS` so Plan and Evaluate share one source of truth.
- **Capacity Tab** — scaffold pointing back to Procurement Planning for capacity decisions.
- **RECs Tab** — placeholder.

## Projects (Marketplace)

- **Browse** — published seller projects with filters; rows compact so more fit per page.
- **Generation Mix** — Solar, Wind, Nuclear (incl. Susquehanna SMR 300 MW, COD 4 yrs out), Hybrid, BESS (only at on-site contexts), Combined Cycle, Peaker — east-PJM coverage with 12 small gap-fill projects.
- **Create Project** — `CreateProjectModal` with the full 27-column buyer-onboarding form (load profile, settlement zone, REC targets, etc.).

## Transactions

- **Status pipeline** — Pending → In Progress → Accepted (renamed from "Submitted").
- **Shape & Term** — every transaction carries a delivery shape and is capped at 7 years.
- **Site Allocation** — accepted transactions identify which site they hedge, including split allocations across multiple sites.
- **Allocations Persisted** — `transactionAllocations.ts` keeps allocations in `localStorage`.

## Documents

- **Document list** — backend-fetched (Express on :3000, Vite proxy `/api`).
- **Selection mode** — when launched from a capacity card's "View document" dialog, lets the user pick a doc to link as that site's tariff. Linkage stored via `tariffContracts.ts`.
- **Upload / Process** — file upload + JAM metadata pipeline (Python services).

## Shared Data Model Highlights

- `LOAD_PROFILES` — per-site hourly × monthly load (3 DOM-zone sites: Ashburn DC, Manassas Industrial, Sterling Hyperscale).
- `SITE_PROFILES.annualLoadMwh` derives from `LOAD_PROFILES`.
- `LINKED_CONTRACTS` — each site's hedge stack with shape, tier, and SVG pattern.
- `LINKED_CAPACITY_SOURCES` — parallel registry for capacity MW (BRA pass-through, multi-year fixed, BTM BESS, BTM Mini-NG).
- `getDerivedHedgePcts` — uncapped on/off-peak hedge ratios used by both Plan and Evaluate.
- `getTotalTransactionMwh` — annual MWh contracted, used by Evaluate's Hedge Coverage card.
