-- Power Dime - Seed Projects Only
-- Run this AFTER creating users via the create-users.js script or Supabase Dashboard
-- This creates 10 test projects for the existing sellers

-- =====================================================
-- IMPORTANT: Get the actual seller UUIDs first
-- =====================================================
-- Before running this script, you need to get the actual UUIDs
-- of seller1@solarpro.com and seller2@windpower.com
-- You can get these by running:
--
-- SELECT id, email, role FROM auth.users WHERE email LIKE 'seller%';
--
-- Then replace the UUIDs below with the actual values

-- =====================================================
-- SEED PROJECTS (10 renewable energy projects)
-- =====================================================

-- First, let's get the seller IDs
DO $$
DECLARE
  seller1_id UUID;
  seller2_id UUID;
BEGIN
  -- Get seller IDs from public.users table
  SELECT id INTO seller1_id FROM public.users WHERE email = 'seller1@solarpro.com';
  SELECT id INTO seller2_id FROM public.users WHERE email = 'seller2@windpower.com';

  IF seller1_id IS NULL OR seller2_id IS NULL THEN
    RAISE EXCEPTION 'Sellers not found! Please create users first using create-users.js';
  END IF;

  -- Solar Projects (Seller 1) — all located in PJM territory
  INSERT INTO projects (seller_id, name, generation_type, capacity_mw, location, iso, zone, price_range_min, price_range_max, status) VALUES
  (seller1_id, 'Desert Sun Solar Farm', 'Solar', 50.00, 'York, Pennsylvania', 'PJM', 'PPL', 45.00, 55.00, 'active'),
  (seller1_id, 'Coastal Solar Array', 'Solar', 25.50, 'Atlantic County, New Jersey', 'PJM', 'AECO', 50.00, 60.00, 'active'),
  (seller1_id, 'Mountain Valley Solar', 'Solar', 35.00, 'Frederick County, Maryland', 'PJM', 'BGE', 42.00, 52.00, 'active'),
  (seller1_id, 'Prairie Solar Park', 'Solar', 40.00, 'Franklin County, Ohio', 'PJM', 'AEP', 40.00, 50.00, 'active'),
  (seller1_id, 'Sunrise Solar Station', 'Solar', 60.00, 'Loudoun County, Virginia', 'PJM', 'DOM', 38.00, 48.00, 'active');

  -- Wind Projects (Seller 2) — all located in PJM territory
  INSERT INTO projects (seller_id, name, generation_type, capacity_mw, location, iso, zone, price_range_min, price_range_max, status) VALUES
  (seller2_id, 'Highland Wind Farm', 'Wind', 75.00, 'Harrison County, West Virginia', 'PJM', 'AEP', 55.00, 65.00, 'active'),
  (seller2_id, 'Offshore Atlantic Wind', 'Wind', 100.00, 'Ocean County, New Jersey', 'PJM', 'JCPL', 60.00, 70.00, 'active'),
  (seller2_id, 'Great Plains Wind Park', 'Wind', 80.00, 'Cook County, Illinois', 'PJM', 'COMED', 50.00, 60.00, 'active'),
  (seller2_id, 'Coastal Breeze Wind', 'Wind', 45.00, 'New Castle County, Delaware', 'PJM', 'DPL', 52.00, 62.00, 'active'),
  (seller2_id, 'Mountain Ridge Wind', 'Wind', 90.00, 'Allegheny County, Pennsylvania', 'PJM', 'DUQ', 48.00, 58.00, 'active');

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Projects created successfully!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Created 10 projects: 5 solar + 5 wind';
  RAISE NOTICE 'Seller 1 (Solar): %', seller1_id;
  RAISE NOTICE 'Seller 2 (Wind): %', seller2_id;
  RAISE NOTICE '==============================================';
END $$;
-- Power Dime - Seed Projects Only
-- Run this AFTER creating users via the create-users.js script or Supabase Dashboard
-- This creates 10 test projects for the existing sellers

-- =====================================================
-- IMPORTANT: Get the actual seller UUIDs first
-- =====================================================
-- Before running this script, you need to get the actual UUIDs
-- of seller1@solarpro.com and seller2@windpower.com
-- You can get these by running:
--
-- SELECT id, email, role FROM auth.users WHERE email LIKE 'seller%';
--
-- Then replace the UUIDs below with the actual values

-- =====================================================
-- SEED PROJECTS (10 renewable energy projects)
-- =====================================================

-- First, let's get the seller IDs
DO $$
DECLARE
  seller1_id UUID;
  seller2_id UUID;
BEGIN
  -- Get seller IDs from public.users table
  SELECT id INTO seller1_id FROM public.users WHERE email = 'seller1@solarpro.com';
  SELECT id INTO seller2_id FROM public.users WHERE email = 'seller2@windpower.com';

  IF seller1_id IS NULL OR seller2_id IS NULL THEN
    RAISE EXCEPTION 'Sellers not found! Please create users first using create-users.js';
  END IF;

  -- Solar Projects (Seller 1) — all located in PJM territory
  INSERT INTO projects (seller_id, name, generation_type, capacity_mw, location, iso, zone, price_range_min, price_range_max, status) VALUES
  (seller1_id, 'Desert Sun Solar Farm', 'Solar', 50.00, 'York, Pennsylvania', 'PJM', 'PPL', 45.00, 55.00, 'active'),
  (seller1_id, 'Coastal Solar Array', 'Solar', 25.50, 'Atlantic County, New Jersey', 'PJM', 'AECO', 50.00, 60.00, 'active'),
  (seller1_id, 'Mountain Valley Solar', 'Solar', 35.00, 'Frederick County, Maryland', 'PJM', 'BGE', 42.00, 52.00, 'active'),
  (seller1_id, 'Prairie Solar Park', 'Solar', 40.00, 'Franklin County, Ohio', 'PJM', 'AEP', 40.00, 50.00, 'active'),
  (seller1_id, 'Sunrise Solar Station', 'Solar', 60.00, 'Loudoun County, Virginia', 'PJM', 'DOM', 38.00, 48.00, 'active');

  -- Wind Projects (Seller 2) — all located in PJM territory
  INSERT INTO projects (seller_id, name, generation_type, capacity_mw, location, iso, zone, price_range_min, price_range_max, status) VALUES
  (seller2_id, 'Highland Wind Farm', 'Wind', 75.00, 'Harrison County, West Virginia', 'PJM', 'AEP', 55.00, 65.00, 'active'),
  (seller2_id, 'Offshore Atlantic Wind', 'Wind', 100.00, 'Ocean County, New Jersey', 'PJM', 'JCPL', 60.00, 70.00, 'active'),
  (seller2_id, 'Great Plains Wind Park', 'Wind', 80.00, 'Cook County, Illinois', 'PJM', 'COMED', 50.00, 60.00, 'active'),
  (seller2_id, 'Coastal Breeze Wind', 'Wind', 45.00, 'New Castle County, Delaware', 'PJM', 'DPL', 52.00, 62.00, 'active'),
  (seller2_id, 'Mountain Ridge Wind', 'Wind', 90.00, 'Allegheny County, Pennsylvania', 'PJM', 'DUQ', 48.00, 58.00, 'active');

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Projects created successfully!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Created 10 projects: 5 solar + 5 wind';
  RAISE NOTICE 'Seller 1 (Solar): %', seller1_id;
  RAISE NOTICE 'Seller 2 (Wind): %', seller2_id;
  RAISE NOTICE '==============================================';
END $$;
