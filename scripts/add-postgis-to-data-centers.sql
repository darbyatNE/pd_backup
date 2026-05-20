-- Add PostGIS extension and geography column to data_centers table
-- Run this in Supabase SQL Editor

-- Step 1: Enable PostGIS extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 2: Add geography column to data_centers table (if not exists)
-- This stores coordinates as a spatial POINT (Longitude X, Latitude Y) with SRID 4326 (WGS 84)
ALTER TABLE public.data_centers 
ADD COLUMN IF NOT EXISTS facility_location GEOGRAPHY(POINT, 4326);

-- Step 3: Create a spatial index for fast queries (e.g., "find sites within 50 miles")
CREATE INDEX IF NOT EXISTS idx_data_centers_location 
ON public.data_centers USING GIST (facility_location);

-- Step 4: Update existing rows with coordinates (example for the 3 existing sites)
-- Note: PostGIS uses POINT(Longitude Latitude) - X first, then Y
-- Coordinates:
--   Ashburn DC: 39.0438° N, 77.4874° W → POINT(-77.4874, 39.0438)
--   Manassas Industrial: 38.7509° N, 77.4753° W → POINT(-77.4753, 38.7509)
--   Sterling Hyperscale: 39.0024° N, 77.4014° W → POINT(-77.4014, 39.0024)

UPDATE public.data_centers 
SET facility_location = ST_SetSRID(ST_MakePoint(-77.4874, 39.0438), 4326)::geography
WHERE FAC_ID = 'ashburn-dc' AND facility_location IS NULL;

UPDATE public.data_centers 
SET facility_location = ST_SetSRID(ST_MakePoint(-77.4753, 38.7509), 4326)::geography
WHERE FAC_ID = 'manassas-industrial' AND facility_location IS NULL;

UPDATE public.data_centers 
SET facility_location = ST_SetSRID(ST_MakePoint(-77.4014, 39.0024), 4326)::geography
WHERE FAC_ID = 'sterling-hyperscale' AND facility_location IS NULL;

-- Step 5: Example spatial queries you can now run:

-- Find all data centers within 50 miles (80467 meters) of Ashburn DC:
-- SELECT * FROM public.data_centers 
-- WHERE ST_DWithin(
--   facility_location,
--   (SELECT facility_location FROM public.data_centers WHERE FAC_ID = 'ashburn-dc'),
--   80467  -- 50 miles in meters
-- );

-- Find distance between two data centers in miles:
-- SELECT 
--   FAC_ID,
--   ST_Distance(facility_location, 
--     (SELECT facility_location FROM public.data_centers WHERE FAC_ID = 'ashburn-dc')
--   ) / 1609.344 AS distance_miles
-- FROM public.data_centers;

-- Step 6: Verify the setup
SELECT 
    FAC_ID,
    name,
    location,
    ST_X(facility_location::geometry) AS longitude,
    ST_Y(facility_location::geometry) AS latitude,
    facility_location
FROM public.data_centers
WHERE facility_location IS NOT NULL;
