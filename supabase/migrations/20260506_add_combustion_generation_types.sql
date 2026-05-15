-- Allow 'Combined Cycle' and 'Peaker' as valid generation_type values,
-- and seed two east-PJM combustion projects.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run.

-- 1. Relax the CHECK constraint
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_generation_type_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_generation_type_check
    CHECK (generation_type IN ('Solar','Wind','Nuclear','Battery','Hydrogen','Hybrid','Combined Cycle','Peaker'));

-- 2. Seed two east-PJM combustion projects
INSERT INTO projects (
  seller_id, name, generation_type, capacity_mw, location, iso, zone,
  settlement_point, fixed_price_per_mwh, eac_price_per_mwh, price_currency,
  annual_escalator_percent, expected_cod, guaranteed_cod, delivery_term_years,
  guaranteed_availability_year1_percent, guaranteed_availability_ongoing_percent,
  status, metadata
)
VALUES
  (
    'b6770792-6cbb-4f79-86d3-9b4ecf53433a',
    'Hudson River Combined Cycle',
    'Combined Cycle',
    750,
    'Bergen County, New Jersey',
    'PJM', 'PSEG',
    'PSEG',
    52.0, 0, 'USD',
    2.0,
    '2026-09-15', '2027-03-15', 20,
    92, 95,
    'published',
    '{"description":"750 MW Natural Gas Combined Cycle plant in PSEG zone, Bergen County, NJ. High-efficiency NGCC suitable for shaped/firm load following.","fuel":"Natural Gas","cycle":"Combined Cycle","heat_rate_btu_kwh":6650}'::jsonb
  ),
  (
    'b6770792-6cbb-4f79-86d3-9b4ecf53433a',
    'Atlantic Peaking Station',
    'Peaker',
    220,
    'Atlantic County, New Jersey',
    'PJM', 'AECO',
    'AECO',
    88.0, 0, 'USD',
    2.5,
    '2026-06-30', '2026-12-31', 15,
    96, 97,
    'published',
    '{"description":"220 MW simple-cycle natural gas peaking unit in AECO zone, Atlantic County, NJ. Fast-start peaker for shoulder/peak hours.","fuel":"Natural Gas","cycle":"Simple Cycle","heat_rate_btu_kwh":10800}'::jsonb
  );
