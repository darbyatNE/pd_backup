-- Unbundle project pricing: energy ($/MWh) and EAC ($/MWh) are already separate
-- columns; add the capacity cost as its own price ($/MW-day, PJM convention).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS capacity_price_per_mw_day NUMERIC(10, 4);

COMMENT ON COLUMN projects.capacity_price_per_mw_day IS
  'Unbundled capacity cost in $/MW-day, tracked separately from energy (fixed_price_per_mwh) and EAC (eac_price_per_mwh).';
