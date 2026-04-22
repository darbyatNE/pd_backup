-- =============================================================================
-- Power Dime Portal — Supabase schema
--
-- One-shot, idempotent setup. Run this in the Supabase SQL editor for a fresh
-- project, or via `supabase db push` if you use the Supabase CLI. Safe to
-- re-run — every object uses IF NOT EXISTS / OR REPLACE / duplicate_object
-- guards.
--
-- After this completes, the auth trigger automatically creates a public.users
-- row whenever a user signs up via Supabase Auth. You can also create users
-- programmatically with scripts/create-users.js.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE facility_type AS ENUM ('brownfield', 'greenfield'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE buyer_document_category AS ENUM ('historical_invoice', 'utility_contract', 'meter_reading', 'grid_data', 'equipment_config', 'equipment_spec'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE seller_type AS ENUM ('carbon_free', 'utility'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE technology_type AS ENUM ('solar', 'wind', 'nuclear', 'green_hydrogen', 'battery', 'utility_contract'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE price_currency AS ENUM ('GBP', 'USD', 'EUR'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE floating_price_source AS ENUM ('N2EX', 'EPEX', 'PJM', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE eac_scheme AS ENUM ('REGO', 'AEPS', 'REC', 'GO', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE generation_module_type AS ENUM ('solar_pv', 'wind_turbine', 'battery', 'hybrid', 'nuclear', 'hydrogen'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'processed', 'needs_review', 'verified'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE settlement_type AS ENUM ('physical', 'financial', 'contract_for_difference'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Public mirror of auth.users. Populated by the on_auth_user_created trigger
-- defined at the bottom of this file.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','admin')),
  company_name TEXT,
  contact_person TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seller generation project listings with full VPPA contract terms.
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID,
  name VARCHAR(255) NOT NULL,
  generation_type VARCHAR(50) NOT NULL CHECK (generation_type IN ('Solar','Wind','Nuclear','Battery','Hydrogen','Hybrid')),
  capacity_mw NUMERIC(10,2) NOT NULL,
  location VARCHAR(255) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'published' CHECK (status IN ('draft','published','unpublished')),

  -- VPPA pricing
  fixed_price_per_mwh NUMERIC(10,4),
  eac_price_per_mwh NUMERIC(10,4),
  price_currency price_currency DEFAULT 'USD',
  annual_escalator_percent NUMERIC(5,2),
  floating_price_source floating_price_source,

  -- VPPA capacity
  expected_nameplate_capacity_mw NUMERIC(10,2),
  buyer_share_percent NUMERIC(5,2),

  -- VPPA timeline
  expected_cod DATE,
  guaranteed_cod DATE,
  earliest_cod_date DATE,
  delivery_term_years INT,

  -- VPPA security / damages
  development_security_per_mw NUMERIC(12,2),
  operational_security_per_mw NUMERIC(12,2),
  credit_rating_required VARCHAR(20),
  delay_damages_per_mw_day NUMERIC(10,2),
  delay_damages_cap NUMERIC(15,2),
  early_termination_fee NUMERIC(15,2),
  capacity_shortfall_rate_per_kw NUMERIC(10,2),

  -- VPPA availability
  guaranteed_availability_year1_percent NUMERIC(5,2),
  guaranteed_availability_ongoing_percent NUMERIC(5,2),
  availability_damages_rate NUMERIC(10,2),

  -- VPPA environmental / settlement / details
  eac_scheme eac_scheme,
  eac_transfer_deadline_days INT,
  settlement_point VARCHAR(100),
  payment_period_days INT,
  generation_modules generation_module_type,
  connection_point VARCHAR(255),
  major_equipment_description TEXT,

  -- Free-form extensions
  vppa_terms JSONB DEFAULT '{}'::jsonb,
  price_schedule JSONB DEFAULT '[]'::jsonb
);

-- Buyer interest in a project. Sellers accept or reject.
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  energy_amount_mwh NUMERIC(10,2) NOT NULL,
  start_date DATE NOT NULL,
  contract_duration_years INT NOT NULL,
  delivery_date DATE,
  net_neutral_target BOOLEAN DEFAULT FALSE,
  generation_preference VARCHAR(50),
  status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contract documents scoped to a transaction (PPAs, NDAs, etc.).
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('ppa','nda','exclusivity','technical','other')),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INT,
  uploaded_by UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seller technical documents scoped to a project (specs, grid studies, etc.).
CREATE TABLE IF NOT EXISTS public.technical_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) CHECK (file_type IN ('pdf','csv','tsv')),
  file_size INT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  uploaded_by UUID REFERENCES public.users(id),
  seller_type seller_type,
  technology_type technology_type,
  contract_type VARCHAR(100)
);

-- Buyer-side consumption / forecast uploads.
CREATE TABLE IF NOT EXISTS public.power_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID,
  plan_type VARCHAR(50) CHECK (plan_type IN ('historical','forecast','custom')),
  file_name VARCHAR(255),
  file_path VARCHAR(500),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  file_size INT,
  facility_type facility_type,
  document_category buyer_document_category
);

-- Buyer RFPs with full procurement requirements.
CREATE TABLE IF NOT EXISTS public.buyer_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_type TEXT NOT NULL CHECK (project_type IN ('brownfield','greenfield')),
  name TEXT NOT NULL,
  location TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Procurement targets
  target_capacity_mw NUMERIC(10,2),
  target_annual_quantity_mwh NUMERIC(12,2),
  preferred_term_years INT,
  equity_share_percent NUMERIC(5,2),

  -- Timeline
  target_cod DATE,
  no_earlier_than_date DATE,
  outside_cod_date DATE,

  -- Pricing preferences
  max_fixed_price_per_mwh NUMERIC(10,4),
  max_eac_price_per_mwh NUMERIC(10,4),
  preferred_escalator_percent NUMERIC(5,2),
  price_currency price_currency DEFAULT 'USD',

  -- Settlement preferences
  preferred_settlement_type settlement_type,
  preferred_settlement_point VARCHAR(100),
  settlement_zone VARCHAR(50),

  -- Technology + environmental preferences
  preferred_generation_types TEXT[] DEFAULT '{}',
  required_eac_scheme eac_scheme,
  scope2_emissions_target_mt NUMERIC(12,2),
  net_neutral_target_year INT,
  renewable_percentage_target NUMERIC(5,2),

  -- Credit terms
  buyer_credit_rating VARCHAR(20),
  buyer_security_per_mw NUMERIC(12,2),
  min_guaranteed_availability_percent NUMERIC(5,2),

  -- Document processing workflow
  processing_status processing_status DEFAULT 'pending',
  extracted_data JSONB DEFAULT '{}'::jsonb,
  processing_notes TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.users(id),

  -- Free-form extensions
  rfp_requirements JSONB DEFAULT '{}'::jsonb,
  requested_price_schedule JSONB DEFAULT '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_projects_seller_id ON public.projects(seller_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_expected_cod ON public.projects(expected_cod);
CREATE INDEX IF NOT EXISTS idx_projects_delivery_term ON public.projects(delivery_term_years);
CREATE INDEX IF NOT EXISTS idx_projects_eac_scheme ON public.projects(eac_scheme);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON public.transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON public.transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON public.transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);

CREATE INDEX IF NOT EXISTS idx_documents_transaction_id ON public.documents(transaction_id);

CREATE INDEX IF NOT EXISTS idx_technical_documents_project_id ON public.technical_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_technical_docs_seller_type ON public.technical_documents(seller_type);
CREATE INDEX IF NOT EXISTS idx_technical_docs_technology_type ON public.technical_documents(technology_type);
CREATE INDEX IF NOT EXISTS idx_technical_docs_project_seller ON public.technical_documents(project_id, seller_type);

CREATE INDEX IF NOT EXISTS idx_power_plans_buyer_id ON public.power_plans(buyer_id);
CREATE INDEX IF NOT EXISTS idx_power_plans_facility_type ON public.power_plans(facility_type);
CREATE INDEX IF NOT EXISTS idx_power_plans_document_category ON public.power_plans(document_category);
CREATE INDEX IF NOT EXISTS idx_power_plans_buyer_facility ON public.power_plans(buyer_id, facility_type);

CREATE INDEX IF NOT EXISTS idx_buyer_projects_buyer_id ON public.buyer_projects(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_projects_type ON public.buyer_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_buyer_projects_target_cod ON public.buyer_projects(target_cod);
CREATE INDEX IF NOT EXISTS idx_buyer_projects_processing_status ON public.buyer_projects(processing_status);
CREATE INDEX IF NOT EXISTS idx_buyer_projects_preferred_term ON public.buyer_projects(preferred_term_years);
CREATE INDEX IF NOT EXISTS idx_buyer_projects_target_capacity ON public.buyer_projects(target_capacity_mw);

-- -----------------------------------------------------------------------------
-- Summary views
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.seller_documents_summary AS
  SELECT td.uploaded_by AS seller_id,
         u.email AS seller_email,
         u.company_name,
         td.seller_type,
         td.technology_type,
         td.project_id,
         p.name AS project_name,
         count(*) AS document_count,
         max(td.uploaded_at) AS last_upload
    FROM public.technical_documents td
    JOIN public.users u ON td.uploaded_by = u.id
    LEFT JOIN public.projects p ON td.project_id = p.id
   WHERE td.seller_type IS NOT NULL
   GROUP BY td.uploaded_by, u.email, u.company_name, td.seller_type, td.technology_type, td.project_id, p.name;

CREATE OR REPLACE VIEW public.buyer_documents_summary AS
  SELECT pp.buyer_id,
         u.email AS buyer_email,
         u.company_name,
         pp.facility_type,
         pp.document_category,
         count(*) AS document_count,
         max(pp.created_at) AS last_upload
    FROM public.power_plans pp
    JOIN public.users u ON pp.buyer_id = u.id
   WHERE pp.document_category IS NOT NULL
   GROUP BY pp.buyer_id, u.email, u.company_name, pp.facility_type, pp.document_category;

-- -----------------------------------------------------------------------------
-- Default grants for Supabase roles. RLS only filters rows; the role still
-- needs table-level DML privileges or requests get 42501 "permission denied".
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_projects ENABLE ROW LEVEL SECURITY;

-- Users
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
CREATE POLICY "Users can view their own data" ON public.users FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
CREATE POLICY "Users can update their own data" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Projects
DROP POLICY IF EXISTS "Anyone authenticated can view published projects" ON public.projects;
CREATE POLICY "Anyone authenticated can view published projects" ON public.projects FOR SELECT
  USING (auth.role() = 'authenticated' AND status = 'published');
DROP POLICY IF EXISTS "Sellers can view own projects" ON public.projects;
CREATE POLICY "Sellers can view own projects" ON public.projects FOR SELECT USING (auth.uid() = seller_id);
DROP POLICY IF EXISTS "Sellers can insert their own projects" ON public.projects;
CREATE POLICY "Sellers can insert their own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = seller_id);
DROP POLICY IF EXISTS "Sellers can update their own projects" ON public.projects;
CREATE POLICY "Sellers can update their own projects" ON public.projects FOR UPDATE USING (auth.uid() = seller_id);
DROP POLICY IF EXISTS "Sellers can delete their own projects" ON public.projects;
CREATE POLICY "Sellers can delete their own projects" ON public.projects FOR DELETE USING (auth.uid() = seller_id);

-- Transactions
DROP POLICY IF EXISTS "Buyers can view their transactions" ON public.transactions;
CREATE POLICY "Buyers can view their transactions" ON public.transactions FOR SELECT USING (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Sellers can view their transactions" ON public.transactions;
CREATE POLICY "Sellers can view their transactions" ON public.transactions FOR SELECT USING (auth.uid() = seller_id);
DROP POLICY IF EXISTS "Buyers can create transactions" ON public.transactions;
CREATE POLICY "Buyers can create transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Sellers can update transaction status" ON public.transactions;
CREATE POLICY "Sellers can update transaction status" ON public.transactions FOR UPDATE USING (auth.uid() = seller_id);

-- Documents
DROP POLICY IF EXISTS "Transaction participants can view documents" ON public.documents;
CREATE POLICY "Transaction participants can view documents" ON public.documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
     WHERE t.id = transaction_id
       AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
  )
);

-- Technical documents
DROP POLICY IF EXISTS "Authenticated users can view technical docs" ON public.technical_documents;
CREATE POLICY "Authenticated users can view technical docs" ON public.technical_documents FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Sellers can view their own uploaded docs" ON public.technical_documents;
CREATE POLICY "Sellers can view their own uploaded docs" ON public.technical_documents FOR SELECT USING (auth.uid() = uploaded_by);
DROP POLICY IF EXISTS "Sellers can view docs for their projects" ON public.technical_documents;
CREATE POLICY "Sellers can view docs for their projects" ON public.technical_documents FOR SELECT USING (
  project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.seller_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Sellers can insert their own technical docs" ON public.technical_documents;
CREATE POLICY "Sellers can insert their own technical docs" ON public.technical_documents FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
DROP POLICY IF EXISTS "Sellers can update their own uploaded docs" ON public.technical_documents;
CREATE POLICY "Sellers can update their own uploaded docs" ON public.technical_documents FOR UPDATE USING (auth.uid() = uploaded_by);
DROP POLICY IF EXISTS "Sellers can delete their own uploaded docs" ON public.technical_documents;
CREATE POLICY "Sellers can delete their own uploaded docs" ON public.technical_documents FOR DELETE USING (auth.uid() = uploaded_by);

-- Power plans
DROP POLICY IF EXISTS "Buyers can view their own power plans" ON public.power_plans;
CREATE POLICY "Buyers can view their own power plans" ON public.power_plans FOR SELECT USING (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Buyers can manage their own power plans" ON public.power_plans;
CREATE POLICY "Buyers can manage their own power plans" ON public.power_plans FOR ALL USING (auth.uid() = buyer_id);

-- Buyer projects
DROP POLICY IF EXISTS "Buyers can view own projects" ON public.buyer_projects;
CREATE POLICY "Buyers can view own projects" ON public.buyer_projects FOR SELECT USING (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Buyers can create own projects" ON public.buyer_projects;
CREATE POLICY "Buyers can create own projects" ON public.buyer_projects FOR INSERT WITH CHECK (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Buyers can update own projects" ON public.buyer_projects;
CREATE POLICY "Buyers can update own projects" ON public.buyer_projects FOR UPDATE USING (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Buyers can delete own projects" ON public.buyer_projects;
CREATE POLICY "Buyers can delete own projects" ON public.buyer_projects FOR DELETE USING (auth.uid() = buyer_id);

-- -----------------------------------------------------------------------------
-- Auth → public.users sync trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'buyer'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
