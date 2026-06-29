-- Unbundled pricing on planning.project_products (AWS RDS).
--   capacity → price_per_mw_day ($/MW-day, PJM convention)
--   energy   → price_per_mwh    ($/MWh)
--   rec      → price_per_mwh    ($/MWh)
ALTER TABLE planning.project_products
  ADD COLUMN IF NOT EXISTS price_per_mw_day NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS price_per_mwh    NUMERIC(12, 4);

-- Surface the prices in the per-project summary view. Dropped first because
-- CREATE OR REPLACE can't insert columns mid-list (only append at the end).
DROP VIEW IF EXISTS planning.project_product_summary;
CREATE VIEW planning.project_product_summary AS
SELECT
    iso_id,
    bool_or(product_type = 'capacity')                                        AS has_capacity,
    max(capacity_mw)      FILTER (WHERE product_type = 'capacity')            AS capacity_mw,
    max(eda)              FILTER (WHERE product_type = 'capacity')            AS eda,
    max(price_per_mw_day) FILTER (WHERE product_type = 'capacity')            AS capacity_price_per_mw_day,
    bool_or(product_type = 'energy')                                          AS has_energy,
    min(energy_mwh_min)   FILTER (WHERE product_type = 'energy')              AS energy_mwh_min,
    max(energy_mwh_max)   FILTER (WHERE product_type = 'energy')              AS energy_mwh_max,
    max(zone)             FILTER (WHERE product_type = 'energy')              AS zone,
    max(price_per_mwh)    FILTER (WHERE product_type = 'energy')              AS energy_price_per_mwh,
    bool_or(product_type = 'rec')                                             AS has_rec,
    max(rec_pct)          FILTER (WHERE product_type = 'rec')                 AS rec_pct,
    max(retiring_agency)  FILTER (WHERE product_type = 'rec')                 AS retiring_agency,
    max(matching_format)  FILTER (WHERE product_type = 'rec')                 AS matching_format,
    max(price_per_mwh)    FILTER (WHERE product_type = 'rec')                 AS rec_price_per_mwh
FROM planning.project_products
GROUP BY iso_id;
