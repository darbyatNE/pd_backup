-- =============================================================================
-- Unbundled project products: Capacity, Energy, RECs tracked independently.
--
-- Each generation project (planning ISO registry row) may carry one OR all of:
--   • Capacity (MW)  — needs an EDA (deliverability area) identification
--   • Energy (MWh)   — a min–max annual range, needs a settlement Zone
--   • RECs           — a % matched, a Retiring Agency (REC tracking system),
--                      and a matching format (yearly / monthly / 24x7)
--
-- One row per (project, product_type) so the three products are entered and
-- tracked independently. Tied to the ISO registry via iso_id (UUID), the same
-- convention planning.lmp_forecast already uses.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS planning;

CREATE TABLE IF NOT EXISTS planning.project_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iso_id          UUID NOT NULL,            -- → iso_registry.id (the generation project)
    product_type    TEXT NOT NULL CHECK (product_type IN ('capacity', 'energy', 'rec')),

    -- Capacity product ----------------------------------------------------------
    capacity_mw     NUMERIC(10, 2),           -- e.g. 275.00
    eda             TEXT,                      -- Effective Deliverability Area, e.g. 'Penelec'

    -- Energy product ------------------------------------------------------------
    energy_mwh_min  NUMERIC(12, 2),           -- annual range low,  e.g. 0
    energy_mwh_max  NUMERIC(12, 2),           -- annual range high, e.g. 400
    zone            TEXT,                      -- settlement zone, e.g. 'Penelec'

    -- REC product ---------------------------------------------------------------
    rec_pct         NUMERIC(5, 2),            -- percent matched, e.g. 100.00
    retiring_agency TEXT,                      -- REC tracking system (see CHECK below)
    matching_format TEXT,                      -- 'yearly' | 'monthly' | '24x7'

    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Allowed REC tracking systems (retiring agencies) in scope.
    CONSTRAINT project_products_retiring_agency_chk CHECK (
        retiring_agency IS NULL OR retiring_agency IN (
            'PJM-EIS GATS',   -- Generation Attribute Tracking System (PJM)
            'M-RETS',         -- Midwest Renewable Energy Tracking System
            'NYGATS',         -- New York Generation Attribute Tracking System
            'NC-RETS',        -- North Carolina Renewable Energy Tracking System
            'NEPOOL GIS',     -- New England Power Pool Generation Information System
            'NAR'             -- North American Renewables Registry
        )
    ),

    CONSTRAINT project_products_matching_format_chk CHECK (
        matching_format IS NULL OR matching_format IN ('yearly', 'monthly', '24x7')
    ),

    -- Require the fields that define each product type.
    CONSTRAINT project_products_fields_chk CHECK (
        (product_type = 'capacity' AND capacity_mw IS NOT NULL AND eda IS NOT NULL)
     OR (product_type = 'energy'   AND zone IS NOT NULL)
     OR (product_type = 'rec'      AND retiring_agency IS NOT NULL AND matching_format IS NOT NULL)
    ),

    -- One capacity / energy / rec product per project.
    UNIQUE (iso_id, product_type)
);

CREATE INDEX IF NOT EXISTS idx_project_products_iso  ON planning.project_products(iso_id);
CREATE INDEX IF NOT EXISTS idx_project_products_type ON planning.project_products(product_type);

-- -----------------------------------------------------------------------------
-- Tie to the ISO registry. Added conditionally so this migration applies whether
-- iso_registry lives in public or another schema (and is skipped, with a notice,
-- if it's a view/foreign table that can't be a FK target).
-- -----------------------------------------------------------------------------
DO $$
DECLARE rel regclass;
BEGIN
    SELECT c.oid INTO rel
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'iso_registry'
       AND c.relkind IN ('r', 'p')              -- ordinary / partitioned table only
       AND EXISTS (
           SELECT 1 FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped
       )
     ORDER BY (n.nspname = 'public') DESC
     LIMIT 1;

    IF rel IS NOT NULL THEN
        BEGIN
            EXECUTE format(
                'ALTER TABLE planning.project_products
                   ADD CONSTRAINT project_products_iso_fk
                   FOREIGN KEY (iso_id) REFERENCES %s (id) ON DELETE CASCADE', rel);
            RAISE NOTICE 'Linked planning.project_products.iso_id → %.id', rel;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        WHEN others THEN
            RAISE NOTICE 'Skipped FK to iso_registry: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'iso_registry(id) not found — created without a hard FK (iso_id references iso_registry.id by convention).';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Per-project summary: pivots the (up to three) product rows into one row, so a
-- project can render a single line like:
--   Solar · CAP: 275MW, ENERGY: 0-400MWh, RECs: 100%, Monthly-GATS · EDA: Penelec, Zone Penelec
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW planning.project_product_summary AS
SELECT
    iso_id,
    bool_or(product_type = 'capacity')                                        AS has_capacity,
    max(capacity_mw)     FILTER (WHERE product_type = 'capacity')             AS capacity_mw,
    max(eda)             FILTER (WHERE product_type = 'capacity')             AS eda,
    bool_or(product_type = 'energy')                                          AS has_energy,
    min(energy_mwh_min)  FILTER (WHERE product_type = 'energy')               AS energy_mwh_min,
    max(energy_mwh_max)  FILTER (WHERE product_type = 'energy')               AS energy_mwh_max,
    max(zone)            FILTER (WHERE product_type = 'energy')               AS zone,
    bool_or(product_type = 'rec')                                             AS has_rec,
    max(rec_pct)         FILTER (WHERE product_type = 'rec')                  AS rec_pct,
    max(retiring_agency) FILTER (WHERE product_type = 'rec')                  AS retiring_agency,
    max(matching_format) FILTER (WHERE product_type = 'rec')                  AS matching_format
FROM planning.project_products
GROUP BY iso_id;

-- No GRANTs: this runs on AWS RDS, where the application connects as the owning
-- role. (Supabase's anon/authenticated/service_role grants are intentionally
-- omitted — Supabase is no longer used.)

-- -----------------------------------------------------------------------------
-- Example seed — "Sunny Solar" (Altoona, PA) for the given ISO registry row.
-- Guarded so it only runs when that project exists (avoids a FK violation).
--   Solar · CAP: 275MW, ENERGY: 0-400MWh, RECs: 100%, Monthly-GATS
--   EDA: Penelec, Zone Penelec
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_iso_id UUID := 'dc6a8309-d023-4fc0-87bb-396091d6b178';
    rel      regclass;
    v_exists BOOLEAN := TRUE;   -- assume present when iso_registry isn't resolvable
BEGIN
    SELECT c.oid INTO rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'iso_registry' AND c.relkind IN ('r', 'p')
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped)
     ORDER BY (n.nspname = 'public') DESC LIMIT 1;

    IF rel IS NOT NULL THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1)', rel)
            INTO v_exists USING v_iso_id;
    END IF;

    IF v_exists THEN
        INSERT INTO planning.project_products (iso_id, product_type, capacity_mw, eda)
        VALUES (v_iso_id, 'capacity', 275, 'Penelec')
        ON CONFLICT (iso_id, product_type) DO NOTHING;

        INSERT INTO planning.project_products (iso_id, product_type, energy_mwh_min, energy_mwh_max, zone)
        VALUES (v_iso_id, 'energy', 0, 400, 'Penelec')
        ON CONFLICT (iso_id, product_type) DO NOTHING;

        INSERT INTO planning.project_products (iso_id, product_type, rec_pct, retiring_agency, matching_format)
        VALUES (v_iso_id, 'rec', 100, 'PJM-EIS GATS', 'monthly')
        ON CONFLICT (iso_id, product_type) DO NOTHING;

        RAISE NOTICE 'Seeded Sunny Solar example products for iso_id %', v_iso_id;
    ELSE
        RAISE NOTICE 'iso_id % not found in iso_registry — skipped example seed.', v_iso_id;
    END IF;
END $$;
