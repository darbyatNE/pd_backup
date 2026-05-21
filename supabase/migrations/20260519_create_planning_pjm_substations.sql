-- =============================================================================
-- Create planning schema and pjm_substations table
-- Source: frontend/public/PJM_subs_priced.geojson
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS planning;

CREATE TABLE IF NOT EXISTS planning.pjm_substations (
    id            BIGSERIAL PRIMARY KEY,
    objectid      INTEGER,
    sub_id        TEXT,
    name          TEXT NOT NULL,
    city          TEXT,
    state         TEXT,
    zip           TEXT,
    type          TEXT,
    status        TEXT,
    county        TEXT,
    countyfips    TEXT,
    country       TEXT,
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    naics_code    TEXT,
    naics_desc    TEXT,
    source        TEXT,
    sourcedate    BIGINT,
    val_method    TEXT,
    val_date      BIGINT,
    lines         INTEGER,
    max_volt      INTEGER,
    min_volt      INTEGER,
    max_infer     TEXT,
    min_infer     TEXT,
    pnode_id      BIGINT,
    pnode_name    TEXT,
    pnode_subtype TEXT,
    match_score   DOUBLE PRECISION,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pjm_subs_state      ON planning.pjm_substations(state);
CREATE INDEX IF NOT EXISTS idx_pjm_subs_pnode_id   ON planning.pjm_substations(pnode_id);
CREATE INDEX IF NOT EXISTS idx_pjm_subs_pnode_name ON planning.pjm_substations(pnode_name);

-- -----------------------------------------------------------------------------
-- LMP forecast table (simulated monthly LMPs per pnode)
-- Source: tools/pjm_simulated_lmps.csv
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planning.lmp_forecast (
    id        BIGSERIAL PRIMARY KEY,
    iso_id    UUID NOT NULL,
    name      TEXT NOT NULL,
    pnode_id  BIGINT,
    month     SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year      SMALLINT NOT NULL,
    total_lmp NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (iso_id, pnode_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_lmp_forecast_iso       ON planning.lmp_forecast(iso_id);
CREATE INDEX IF NOT EXISTS idx_lmp_forecast_pnode     ON planning.lmp_forecast(pnode_id);
CREATE INDEX IF NOT EXISTS idx_lmp_forecast_year_month ON planning.lmp_forecast(year, month);

-- Grant access to Supabase roles
GRANT USAGE ON SCHEMA planning TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA planning TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA planning TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning
    GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
