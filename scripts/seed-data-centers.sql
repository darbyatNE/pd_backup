-- Seed data_centers table with existing sites from ScopeContext
-- Run this in Supabase SQL Editor to backfill the three existing sites
-- Uses UPSERT: updates existing sites by FAC_ID, inserts new ones

-- NOTE: This script adds 3 NEW data centers (Ashburn, Manassas, Sterling) for buyer1@techdc.com
-- The buyer_id is: 1cc22fcb-fd36-4165-9135-1a2532bc9906

-- First ensure FAC_ID has a unique constraint (run once):
-- ALTER TABLE public.data_centers ADD CONSTRAINT unique_fac_id UNIQUE (FAC_ID);

INSERT INTO public.data_centers (
    id,                          -- UUID primary key (generated)
    FAC_ID,                      -- Site key identifier (text)
    buyer_id,                    -- Foreign key to users.id
    FACILITY_STATUS,             -- 'brownfield' or 'greenfield'
    STATE,                       -- State code (e.g., 'VA')
    ISO,                         -- ISO zone (e.g., 'DOM')
    facility_location,           -- PostGIS geography POINT(Longitude, Latitude) SRID 4326
    HIST_MW,                     -- capacity_by_year stored as JSON text
    DELTA_CAP_y,                 -- baseload_mwh_by_month stored as JSON text
    created_at
) VALUES 
-- Ashburn Data Center: 39.0438° N, 77.4874° W → POINT(-77.4874, 39.0438)
(
    gen_random_uuid(),
    'ashburn-dc',
    'BUYER_UUID_HERE',  -- Replace with actual buyer user UUID
    'brownfield',
    'VA',
    'DOM',
    ST_SetSRID(ST_MakePoint(-77.4874, 39.0438), 4326)::geography,
    '{"2024": 20, "2025": 20, "2026": 20, "2027": 22, "2028": 25}',
    '{"1": 14600, "2": 14600, "3": 14600, "4": 14600, "5": 14600, "6": 14600, "7": 14600, "8": 14600, "9": 14600, "10": 14600, "11": 14600, "12": 14600}',
    NOW()
),
-- Manassas Industrial: 38.7509° N, 77.4753° W → POINT(-77.4753, 38.7509)
(
    gen_random_uuid(),
    'manassas-industrial',
    '1cc22fcb-fd36-4165-9135-1a2532bc9906',  -- buyer1@techdc.com
    'brownfield',
    'VA',
    'DOM',
    ST_SetSRID(ST_MakePoint(-77.4753, 38.7509), 4326)::geography,
    '{"2024": 30, "2025": 30, "2026": 30, "2027": 37.5, "2028": 40}',
    '{"1": 21900, "2": 21900, "3": 21900, "4": 21900, "5": 21900, "6": 21900, "7": 21900, "8": 21900, "9": 21900, "10": 21900, "11": 21900, "12": 21900}',
    NOW()
),
-- Sterling Hyperscale DC: 39.0024° N, 77.4014° W → POINT(-77.4014, 39.0024)
(
    gen_random_uuid(),
    'sterling-hyperscale',
    '1cc22fcb-fd36-4165-9135-1a2532bc9906',  -- buyer1@techdc.com
    'greenfield',
    'VA',
    'DOM',
    ST_SetSRID(ST_MakePoint(-77.4014, 39.0024), 4326)::geography,
    '{"2026": 50, "2027": 65, "2028": 75}',
    '{"1": 43800, "2": 43800, "3": 43800, "4": 43800, "5": 43800, "6": 43800, "7": 43800, "8": 43800, "9": 43800, "10": 43800, "11": 43800, "12": 43800}',
    NOW()
)
ON CONFLICT (FAC_ID) DO UPDATE SET
    buyer_id = EXCLUDED.buyer_id,
    FACILITY_STATUS = EXCLUDED.FACILITY_STATUS,
    STATE = EXCLUDED.STATE,
    ISO = EXCLUDED.ISO,
    facility_location = EXCLUDED.facility_location,
    HIST_MW = EXCLUDED.HIST_MW,
    DELTA_CAP_y = EXCLUDED.DELTA_CAP_y,
    created_at = EXCLUDED.created_at;

-- Alternative: Auto-seed for buyer1@techdc.com using their UUID
-- Run this instead - no manual UUID replacement needed:

DO $$
DECLARE
    buyer_uuid UUID;
BEGIN
    buyer_uuid := '1cc22fcb-fd36-4165-9135-1a2532bc9906';
    
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = buyer_uuid) THEN
        RAISE EXCEPTION 'buyer1@techdc.com not found in users table';
    END IF;

    -- Insert/Update the 3 data centers for this buyer
    INSERT INTO public.data_centers (
        id, "FAC_ID", buyer_id, "FACILITY_STATUS", "STATE", "ISO", 
        facility_location, "HIST_MW", "DELTA_CAP_y", created_at
    ) VALUES 
    (gen_random_uuid(), 'ashburn-dc', buyer_uuid, 'brownfield', 'VA', 'DOM',
     ST_SetSRID(ST_MakePoint(-77.4874, 39.0438), 4326)::geography,
     '{"2024": 20, "2025": 20, "2026": 20, "2027": 22, "2028": 25}',
     '{"1": 14600, "2": 14600, "3": 14600, "4": 14600, "5": 14600, "6": 14600, "7": 14600, "8": 14600, "9": 14600, "10": 14600, "11": 14600, "12": 14600}',
     NOW()),
    (gen_random_uuid(), 'manassas-industrial', buyer_uuid, 'brownfield', 'VA', 'DOM',
     ST_SetSRID(ST_MakePoint(-77.4753, 38.7509), 4326)::geography,
     '{"2024": 30, "2025": 30, "2026": 30, "2027": 37.5, "2028": 40}',
     '{"1": 21900, "2": 21900, "3": 21900, "4": 21900, "5": 21900, "6": 21900, "7": 21900, "8": 21900, "9": 21900, "10": 21900, "11": 21900, "12": 21900}',
     NOW()),
    (gen_random_uuid(), 'sterling-hyperscale', buyer_uuid, 'greenfield', 'VA', 'DOM',
     ST_SetSRID(ST_MakePoint(-77.4014, 39.0024), 4326)::geography,
     '{"2026": 50, "2027": 65, "2028": 75}',
     '{"1": 43800, "2": 43800, "3": 43800, "4": 43800, "5": 43800, "6": 43800, "7": 43800, "8": 43800, "9": 43800, "10": 43800, "11": 43800, "12": 43800}',
     NOW())
    ON CONFLICT ("FAC_ID") DO UPDATE SET
        buyer_id = EXCLUDED.buyer_id,
        "FACILITY_STATUS" = EXCLUDED."FACILITY_STATUS",
        "STATE" = EXCLUDED."STATE",
        "ISO" = EXCLUDED."ISO",
        facility_location = EXCLUDED.facility_location,
        "HIST_MW" = EXCLUDED."HIST_MW",
        "DELTA_CAP_y" = EXCLUDED."DELTA_CAP_y";
        
    RAISE NOTICE 'Seeded 3 data centers for buyer1@techdc.com (ID: %)', buyer_uuid;
END $$;
