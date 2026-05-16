-- Seed data_centers table with existing sites from ScopeContext
-- Run this in Supabase SQL Editor to backfill the three existing sites

-- Note: Replace 'BUYER_UUID_HERE' with an actual buyer user UUID from your users table
-- Or run this for each buyer user who should have access to these sites

INSERT INTO public.data_centers (
    FAC_ID,
    buyer_id,
    name,
    location,
    iso_zone,
    capacity_by_year,
    baseload_mwh_by_month,
    facility_type,
    created_at
) VALUES 
-- Ashburn Data Center
(
    'ashburn-dc',
    'BUYER_UUID_HERE',  -- Replace with actual buyer user UUID
    'Ashburn Data Center',
    'Ashburn, VA',
    'DOM',
    '{"2024": 20, "2025": 20, "2026": 20, "2027": 22, "2028": 25}'::jsonb,
    '{"1": 14600, "2": 14600, "3": 14600, "4": 14600, "5": 14600, "6": 14600, "7": 14600, "8": 14600, "9": 14600, "10": 14600, "11": 14600, "12": 14600}'::jsonb,
    'brownfield',
    NOW()
),
-- Manassas Industrial
(
    'manassas-industrial',
    'BUYER_UUID_HERE',  -- Replace with actual buyer user UUID
    'Manassas Industrial',
    'Manassas, VA',
    'DOM',
    '{"2024": 30, "2025": 30, "2026": 30, "2027": 37.5, "2028": 40}'::jsonb,  -- +25% bump in 2027
    '{"1": 21900, "2": 21900, "3": 21900, "4": 21900, "5": 21900, "6": 21900, "7": 21900, "8": 21900, "9": 21900, "10": 21900, "11": 21900, "12": 21900}'::jsonb,
    'brownfield',
    NOW()
),
-- Sterling Hyperscale DC
(
    'sterling-hyperscale',
    'BUYER_UUID_HERE',  -- Replace with actual buyer user UUID
    'Sterling Hyperscale DC',
    'Sterling, VA',
    'DOM',
    '{"2026": 50, "2027": 65, "2028": 75}'::jsonb,  -- Greenfield ramp up
    '{"1": 43800, "2": 43800, "3": 43800, "4": 43800, "5": 43800, "6": 43800, "7": 43800, "8": 43800, "9": 43800, "10": 43800, "11": 43800, "12": 43800}'::jsonb,
    'greenfield',
    NOW()
)
ON CONFLICT (FAC_ID) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    iso_zone = EXCLUDED.iso_zone,
    capacity_by_year = EXCLUDED.capacity_by_year,
    baseload_mwh_by_month = EXCLUDED.baseload_mwh_by_month,
    facility_type = EXCLUDED.facility_type,
    updated_at = NOW();

-- Alternative: Seed for ALL existing buyers (run this instead if you want all current users to have these sites)
-- Uncomment below and comment out the INSERT above:

/*
-- Get all buyer user IDs and insert sites for each
WITH buyer_users AS (
    SELECT id as buyer_id 
    FROM public.users 
    WHERE role = 'buyer'
)
INSERT INTO public.data_centers (
    FAC_ID, buyer_id, name, location, iso_zone, 
    capacity_by_year, baseload_mwh_by_month, facility_type, created_at
)
SELECT 
    'ashburn-dc',
    buyer_id,
    'Ashburn Data Center',
    'Ashburn, VA',
    'DOM',
    '{"2024": 20, "2025": 20, "2026": 20, "2027": 22, "2028": 25}'::jsonb,
    '{"1": 14600, "2": 14600, "3": 14600, "4": 14600, "5": 14600, "6": 14600, "7": 14600, "8": 14600, "9": 14600, "10": 14600, "11": 14600, "12": 14600}'::jsonb,
    'brownfield',
    NOW()
FROM buyer_users
UNION ALL
SELECT 
    'manassas-industrial',
    buyer_id,
    'Manassas Industrial',
    'Manassas, VA',
    'DOM',
    '{"2024": 30, "2025": 30, "2026": 30, "2027": 37.5, "2028": 40}'::jsonb,
    '{"1": 21900, "2": 21900, "3": 21900, "4": 21900, "5": 21900, "6": 21900, "7": 21900, "8": 21900, "9": 21900, "10": 21900, "11": 21900, "12": 21900}'::jsonb,
    'brownfield',
    NOW()
FROM buyer_users
UNION ALL
SELECT 
    'sterling-hyperscale',
    buyer_id,
    'Sterling Hyperscale DC',
    'Sterling, VA',
    'DOM',
    '{"2026": 50, "2027": 65, "2028": 75}'::jsonb,
    '{"1": 43800, "2": 43800, "3": 43800, "4": 43800, "5": 43800, "6": 43800, "7": 43800, "8": 43800, "9": 43800, "10": 43800, "11": 43800, "12": 43800}'::jsonb,
    'greenfield',
    NOW()
FROM buyer_users
ON CONFLICT (FAC_ID) DO NOTHING;
*/
