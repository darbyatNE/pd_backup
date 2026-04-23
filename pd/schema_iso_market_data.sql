-- ============================================================================
-- MULTI-ISO SCALABLE DATA ARCHITECTURE
-- PostgreSQL DDL Schema
-- 
-- Design: Hybrid multi-tenant with UTC-based timestamps (DST-safe)
-- Unique keys: (iso_id, location, timestamp_utc) prevents DST ambiguity
-- ============================================================================

-- ============================================================================
-- 1. CORE REFERENCE TABLES
-- ============================================================================

-- ISO Registry: Master list of all RTOs/ISOs
CREATE TABLE iso_registry (
    iso_id SERIAL PRIMARY KEY,
    iso_code VARCHAR(10) NOT NULL UNIQUE,
    iso_name VARCHAR(255) NOT NULL UNIQUE,
    region VARCHAR(100),
    country VARCHAR(50) DEFAULT 'USA',
    api_base_url VARCHAR(500),
    api_auth_method VARCHAR(50),
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Geographic Zones within an ISO (PJM has East/West/South, ERCOT has North/South/Coast)
CREATE TABLE iso_zones (
    zone_id SERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    zone_code VARCHAR(20) NOT NULL,
    zone_name VARCHAR(255) NOT NULL,
    description TEXT,
    lat NUMERIC(10, 8),
    lon NUMERIC(11, 8),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(iso_id, zone_code)
);

-- Bus/Node locations (for LMP data)
CREATE TABLE iso_buses (
    bus_id SERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    bus_code VARCHAR(50) NOT NULL,
    bus_name VARCHAR(255),
    zone_id INTEGER REFERENCES iso_zones(zone_id) ON DELETE SET NULL,
    bus_type VARCHAR(50),
    lat NUMERIC(10, 8),
    lon NUMERIC(11, 8),
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(iso_id, bus_code)
);

-- Natural Gas Hubs (Henry Hub + basis market hubs)
CREATE TABLE gas_hubs (
    hub_id SERIAL PRIMARY KEY,
    hub_code VARCHAR(20) NOT NULL UNIQUE,
    hub_name VARCHAR(255) NOT NULL,
    cme_ticker VARCHAR(20),
    market_role VARCHAR(100),
    primary_pjm_zones VARCHAR(255),
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. ELECTRICITY MARKET DATA TABLES
-- ============================================================================

-- Day-Ahead LMP (Locational Marginal Prices) - Hourly
CREATE TABLE da_lmp (
    lmp_id BIGSERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    bus_id INTEGER NOT NULL REFERENCES iso_buses(bus_id) ON DELETE RESTRICT,
    timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- LMP Components
    energy_price NUMERIC(12, 6),
    congestion_price NUMERIC(12, 6),
    loss_price NUMERIC(12, 6),
    total_lmp NUMERIC(12, 6),
    
    -- Data Quality
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_da_lmp UNIQUE(iso_id, bus_id, timestamp_utc)
);

CREATE INDEX idx_da_lmp_iso_ts ON da_lmp(iso_id, timestamp_utc);
CREATE INDEX idx_da_lmp_bus_ts ON da_lmp(bus_id, timestamp_utc);

-- Zonal Load (Demand forecasts or actual) - Hourly
CREATE TABLE zonal_load (
    load_id BIGSERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    zone_id INTEGER NOT NULL REFERENCES iso_zones(zone_id) ON DELETE RESTRICT,
    timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    
    load_mw NUMERIC(12, 2),
    load_forecast_mw NUMERIC(12, 2),
    max_capacity_mw NUMERIC(12, 2),
    
    load_type VARCHAR(50),  -- 'actual', 'forecast', 'day_ahead'
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_zonal_load UNIQUE(iso_id, zone_id, timestamp_utc, load_type)
);

CREATE INDEX idx_zonal_load_iso_ts ON zonal_load(iso_id, timestamp_utc);
CREATE INDEX idx_zonal_load_zone_ts ON zonal_load(zone_id, timestamp_utc);

-- ============================================================================
-- 3. TRANSMISSION OUTAGE DATA TABLE
-- ============================================================================

CREATE TABLE transmission_outage (
    outage_id BIGSERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    
    outage_code VARCHAR(100),
    facility_name VARCHAR(255),
    facility_type VARCHAR(50),  -- 'line', 'transformer', 'reactor', etc.
    
    from_bus VARCHAR(100),
    to_bus VARCHAR(100),
    
    start_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time_utc TIMESTAMP WITH TIME ZONE,  -- NULL if ongoing
    
    reason VARCHAR(255),
    status VARCHAR(50),  -- 'planned', 'emergency', 'cleared'
    impact_mw NUMERIC(12, 2),
    
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_transmission_outage UNIQUE(iso_id, outage_code, start_time_utc)
);

CREATE INDEX idx_outage_iso_time ON transmission_outage(iso_id, start_time_utc);
CREATE INDEX idx_outage_end_time ON transmission_outage(end_time_utc);

-- ============================================================================
-- 4. NATURAL GAS FUTURES & BASIS DATA TABLES
-- ============================================================================

-- Natural Gas Futures (Henry Hub daily closes)
CREATE TABLE ng_futures (
    futures_id BIGSERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES gas_hubs(hub_id) ON DELETE RESTRICT,
    
    contract_month VARCHAR(10),  -- 'Jan', 'Feb', or 'F27', 'G27' etc.
    settlement_date DATE NOT NULL,
    timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    
    open_price NUMERIC(10, 4),
    high_price NUMERIC(10, 4),
    low_price NUMERIC(10, 4),
    close_price NUMERIC(10, 4),
    settle_price NUMERIC(10, 4),
    
    volume_mmbtu NUMERIC(15, 2),
    open_interest INTEGER,
    
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_ng_futures UNIQUE(hub_id, contract_month, settlement_date)
);

CREATE INDEX idx_ng_futures_hub_date ON ng_futures(hub_id, settlement_date);

-- Natural Gas Basis (Basis = Location Price - Henry Hub)
CREATE TABLE ng_basis (
    basis_id BIGSERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES gas_hubs(hub_id) ON DELETE RESTRICT,
    
    contract_month VARCHAR(10),
    settlement_date DATE NOT NULL,
    timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    
    open_basis NUMERIC(10, 4),
    high_basis NUMERIC(10, 4),
    low_basis NUMERIC(10, 4),
    close_basis NUMERIC(10, 4),
    settle_basis NUMERIC(10, 4),
    
    volume_mmbtu NUMERIC(15, 2),
    open_interest INTEGER,
    
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_ng_basis UNIQUE(hub_id, contract_month, settlement_date)
);

CREATE INDEX idx_ng_basis_hub_date ON ng_basis(hub_id, settlement_date);

-- ============================================================================
-- 4. RENEWABLE ENERGY CERTIFICATE (REC) DATA TABLES
-- ============================================================================

-- PJM REC Futures (ICE PPR Ticker)
CREATE TABLE pjm_rec_futures (
    rec_id BIGSERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    
    contract_month VARCHAR(10) NOT NULL,
    settlement_date DATE NOT NULL,
    timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    
    open_price NUMERIC(10, 4),
    high_price NUMERIC(10, 4),
    low_price NUMERIC(10, 4),
    close_price NUMERIC(10, 4),
    settle_price NUMERIC(10, 4),
    
    volume_rec NUMERIC(15, 2),
    open_interest INTEGER,
    
    ice_ticker VARCHAR(20) DEFAULT 'PPR',
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_pjm_rec UNIQUE(iso_id, contract_month, settlement_date)
);

CREATE INDEX idx_pjm_rec_date ON pjm_rec_futures(settlement_date);

-- ERCOT REC Futures (ICE TFH Ticker)
CREATE TABLE ercot_rec_futures (
    rec_id BIGSERIAL PRIMARY KEY,
    iso_id INTEGER NOT NULL REFERENCES iso_registry(iso_id) ON DELETE RESTRICT,
    
    contract_month VARCHAR(10) NOT NULL,
    settlement_date DATE NOT NULL,
    timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    
    open_price NUMERIC(10, 4),
    high_price NUMERIC(10, 4),
    low_price NUMERIC(10, 4),
    close_price NUMERIC(10, 4),
    settle_price NUMERIC(10, 4),
    
    volume_rec NUMERIC(15, 2),
    open_interest INTEGER,
    
    ice_ticker VARCHAR(20) DEFAULT 'TFH',
    data_source VARCHAR(100),
    ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_ercot_rec UNIQUE(iso_id, contract_month, settlement_date)
);

CREATE INDEX idx_ercot_rec_date ON ercot_rec_futures(settlement_date);

-- ============================================================================
-- 5. DATA INGESTION AUDIT TABLE
-- ============================================================================

CREATE TABLE data_ingestion_log (
    log_id BIGSERIAL PRIMARY KEY,
    iso_id INTEGER REFERENCES iso_registry(iso_id) ON DELETE SET NULL,
    
    table_name VARCHAR(100) NOT NULL,
    endpoint VARCHAR(500),
    
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    
    ingestion_start TIMESTAMP WITH TIME ZONE,
    ingestion_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50),  -- 'success', 'partial_failure', 'failure'
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ingestion_log_iso_date ON data_ingestion_log(iso_id, created_at);

-- ============================================================================
-- 6. SAMPLE DATA INSERTION (Reference)
-- ============================================================================

INSERT INTO iso_registry (iso_code, iso_name, region, api_base_url, description) VALUES
    ('PJM', 'PJM Interconnection', 'Northeast/Mid-Atlantic', 'https://api.pjm.com', 'Pennsylvania-New Jersey-Maryland Interconnection'),
    ('ERCOT', 'ERCOT', 'Texas', 'https://api.ercot.com', 'Electric Reliability Council of Texas');

INSERT INTO iso_zones (iso_id, zone_code, zone_name, description) VALUES
    (1, 'DOM', 'Dominion Energy', 'Virginia, North Carolina'),
    (1, 'BGE', 'Baltimore Gas & Electric', 'Maryland, Delaware'),
    (1, 'PEPCO', 'Pepco Holdings', 'DC, Maryland, Delaware'),
    (1, 'AEP', 'American Electric Power', 'Ohio, Indiana, Kentucky'),
    (1, 'PECO', 'PECO Energy', 'Pennsylvania'),
    (1, 'PSEG', 'Public Service Enterprise Group', 'New Jersey');

INSERT INTO gas_hubs (hub_code, hub_name, cme_ticker, market_role, primary_pjm_zones) VALUES
    ('HH', 'Henry Hub', 'NG', 'Reference Benchmark', 'All'),
    ('PG', 'Columbia Gas TCO', 'PG', 'Supply', 'DOM, PECO'),
    ('TC', 'Columbia Gas TCO', 'TC', 'Supply', 'AEP, DAY'),
    ('NX', 'Tetco M-3', 'NX', 'Demand', 'PECO, PSEG, JCPL'),
    ('NZ', 'Transco Zone 6', 'NZ', 'Demand', 'DOM, BGE, PEPCO'),
    ('NB', 'Chicago Citygate', 'NB', 'Demand', 'ComEd'),
    ('WAHA', 'West of Hub Permian', 'WH', 'Supply', 'ERCOT');

-- ============================================================================
-- End of Schema
-- ============================================================================
