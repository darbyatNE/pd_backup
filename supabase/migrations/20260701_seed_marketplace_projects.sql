-- =============================================================================
-- Populate marketplace projects + their unbundled product detail (AWS RDS).
-- Matches existing public.projects rows BY NAME. Run the whole file at once.
--
-- Mapping decisions (edit if needed):
--   • Status  → expected_cod: "Available" = NULL; "Est <Mon YYYY>" = 1st of month.
--   • LDA Zone / RECs Zone → projects.zone (single zone; identical in source).
--   • Est. Hourly MWh → planning.project_products energy.energy_mwh_max.
--   • RECs % 0 / "N/A" → no REC product (displays as "—").
--   • Tracking "NAR / Green-e" → 'NAR' (allowed set); matching_format → 'yearly'
--     (source didn't specify a matching format — change if needed).
--   • Est. Cap Cost range "$X-$Y" → low end stored in capacity_price_per_mw_day.
--   • Term Start/Stop → projects.term_start_date / term_end_date.
-- =============================================================================

-- ── Prerequisites ────────────────────────────────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS term_start_date DATE,
  ADD COLUMN IF NOT EXISTS term_end_date   DATE;

-- Allow product detail to key on the public.projects id (the id the app uses),
-- not just planning.iso_registry.
ALTER TABLE planning.project_products DROP CONSTRAINT IF EXISTS project_products_iso_fk;

-- ── Data load (single transaction) ───────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _seed (
  name text, gtype text, cap numeric, zone text,
  cod date, tstart date, tend date,
  cost_low numeric, hourly numeric, rec_pct numeric, agency text
) ON COMMIT DROP;

INSERT INTO _seed (name, gtype, cap, zone, cod, tstart, tend, cost_low, hourly, rec_pct, agency) VALUES
  ('Allegheny Highlands Wind','Wind',250,'DOM',NULL,NULL,NULL,50,87.5,100,'PJM-EIS GATS'),
  ('Atlantic Peaking Station','Peaker',220,'AECO',DATE '2026-06-01',DATE '2027-06-01',DATE '2042-06-01',50,22.0,0,NULL),
  ('Atlantic Shores Offshore Wind','Wind',300,'PSEG',NULL,NULL,NULL,50,120.0,100,'NYGATS'),
  ('Atlantic Wind Farm','Wind',190,'AECO',NULL,NULL,NULL,50,66.5,100,'PJM-EIS GATS'),
  ('Backbone Mountain Wind','Wind',175,'DOM',NULL,NULL,NULL,50,61.25,100,'NC-RETS'),
  ('Berks County Solar Farm','Solar',50,'PPL',NULL,DATE '2027-01-01',DATE '2042-01-01',30,10.0,100,'PJM-EIS GATS'),
  ('Blue Mountain Solar','Solar',100,'BGE',NULL,DATE '2027-03-01',DATE '2042-03-01',50,20.0,100,'PJM-EIS GATS'),
  ('Blue Ridge Solar Farm','Solar',100,'DOM',DATE '2026-07-01',DATE '2027-07-01',DATE '2052-07-01',50,20.0,100,'PJM-EIS GATS'),
  ('Camden Peaker','Peaker',25,'PSEG',NULL,DATE '2027-05-01',DATE '2042-05-01',50,2.5,0,NULL),
  ('Chester Solar Farm','Solar',75,'PPL',NULL,NULL,NULL,30,15.0,100,'PJM-EIS GATS'),
  ('Cumberland Solar','Solar',10,'PPL',DATE '2026-10-01',DATE '2027-10-01',DATE '2039-10-01',30,2.0,100,'PJM-EIS GATS'),
  ('Eastern Shore Solar','Solar',200,'DOM',DATE '2026-07-01',DATE '2027-07-01',DATE '2052-07-01',50,40.0,100,'PJM-EIS GATS'),
  ('Front Royal Hybrid','Hybrid',22,'DOM',DATE '2026-09-01',DATE '2027-09-01',DATE '2042-09-01',50,5.5,100,'PJM-EIS GATS'),
  ('Garrett Ridge Wind','Wind',18,'APS',DATE '2026-11-01',DATE '2028-11-01',DATE '2043-11-01',30,6.3,100,'PJM-EIS GATS'),
  ('Hudson Co. Hybrid','Hybrid',10,'PSEG',DATE '2026-09-01',DATE '2027-09-01',DATE '2039-09-01',50,2.5,100,'PJM-EIS GATS'),
  ('Hudson River Combined Cycle','Combined Cycle',750,'PSEG',DATE '2026-09-01',DATE '2028-09-01',DATE '2048-09-01',50,450.0,0,NULL),
  ('Lehigh Valley Solar','Solar',15,'PPL',DATE '2026-07-01',DATE '2027-07-01',DATE '2042-07-01',30,3.0,100,'PJM-EIS GATS'),
  ('Loudoun Solar Garden','Solar',12,'DOM',DATE '2026-08-01',DATE '2027-08-01',DATE '2039-08-01',50,2.4,100,'PJM-EIS GATS'),
  ('Marcus Hook CCGT II','Combined Cycle',50,'PPL',DATE '2027-01-01',DATE '2029-01-01',DATE '2044-01-01',30,30.0,0,NULL),
  ('Mercer County Solar','Solar',8,'PSEG',DATE '2026-09-01',DATE '2027-09-01',DATE '2037-09-01',50,1.6,100,'PJM-EIS GATS'),
  ('Musconetcong Ridge Wind','Wind',80,'PSEG',NULL,NULL,NULL,50,28.0,100,'PJM-EIS GATS'),
  ('Muskingum Valley Solar','Solar',200,'AEP',NULL,NULL,NULL,30,40.0,100,'M-RETS'),
  ('Potomac Solar Resources','Solar',50,'DOM',DATE '2026-07-01',DATE '2027-07-01',DATE '2052-07-01',50,10.0,100,'PJM-EIS GATS'),
  ('Prairie State Wind Farm','Wind',220,'COMED',NULL,NULL,NULL,30,77.0,100,'M-RETS'),
  ('Rappahannock Solar Farm','Solar',180,'DOM',NULL,NULL,NULL,50,36.0,100,'NC-RETS'),
  ('Southern Maryland Solar','Solar',120,'BGE',NULL,NULL,NULL,50,24.0,100,'NAR'),
  ('Spotsylvania Solar II','Solar',14,'DOM',DATE '2026-08-01',DATE '2027-08-01',DATE '2039-08-01',50,2.8,100,'PJM-EIS GATS'),
  ('Susquehanna SMR','Nuclear',300,'PPL',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',30,285.0,0,NULL),
  ('Susquehanna Valley Solar','Solar',150,'PPL',NULL,NULL,NULL,30,30.0,100,'PJM-EIS GATS'),
  ('Tucker Mountain Wind','Wind',20,'DOM',DATE '2026-08-01',DATE '2028-08-01',DATE '2043-08-01',50,7.0,100,'PJM-EIS GATS'),
  ('Wilmington Mini-NG','Peaker',15,'DPL',NULL,DATE '2027-06-01',DATE '2039-06-01',50,1.5,0,NULL);

-- Core project fields (matched by name; affects all rows with that name).
UPDATE public.projects p SET
  generation_type = s.gtype,
  capacity_mw = s.cap,
  zone = s.zone,
  expected_cod = s.cod,
  term_start_date = s.tstart,
  term_end_date = s.tend,
  capacity_price_per_mw_day = s.cost_low,
  delivery_term_years = CASE WHEN s.tstart IS NOT NULL AND s.tend IS NOT NULL
    THEN EXTRACT(YEAR FROM age(s.tend, s.tstart))::int ELSE p.delivery_term_years END,
  status = 'published',
  visibility = 'marketplace',
  updated_at = NOW()
FROM _seed s
WHERE p.name = s.name;

-- Reload unbundled product detail for these projects (clean replace).
DELETE FROM planning.project_products pp
USING public.projects p, _seed s
WHERE s.name = p.name AND pp.iso_id = p.id;

INSERT INTO planning.project_products (iso_id, product_type, capacity_mw, eda, price_per_mw_day)
SELECT p.id, 'capacity', s.cap, s.zone, s.cost_low
FROM _seed s JOIN public.projects p ON p.name = s.name;

INSERT INTO planning.project_products (iso_id, product_type, energy_mwh_max, zone)
SELECT p.id, 'energy', s.hourly, s.zone
FROM _seed s JOIN public.projects p ON p.name = s.name;

INSERT INTO planning.project_products (iso_id, product_type, rec_pct, retiring_agency, matching_format)
SELECT p.id, 'rec', s.rec_pct, s.agency, 'yearly'
FROM _seed s JOIN public.projects p ON p.name = s.name
WHERE s.rec_pct > 0 AND s.agency IS NOT NULL;

COMMIT;
