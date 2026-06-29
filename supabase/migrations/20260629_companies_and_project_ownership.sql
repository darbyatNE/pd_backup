-- Multi-tenant ownership: companies + per-company membership/authorization levels,
-- and project ownership/visibility (marketplace vs company-private).

-- 1. Companies (a tenant). Name is unique so backfill is idempotent.
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Company membership + per-company authorization level (future granular auth).
CREATE TABLE IF NOT EXISTS public.company_members (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','admin','editor','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON public.company_members (user_id);

-- 3. Backfill: one company per distinct company_name (fallback to email), and a
--    membership per user. Global admins map to an 'admin' company role.
INSERT INTO public.companies (name)
SELECT DISTINCT COALESCE(NULLIF(u.company_name, ''), u.email)
FROM public.users u
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.company_members (company_id, user_id, role)
SELECT c.id, u.id, CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'owner' END
FROM public.users u
JOIN public.companies c ON c.name = COALESCE(NULLIF(u.company_name, ''), u.email)
ON CONFLICT (company_id, user_id) DO NOTHING;

-- 4. Project ownership / visibility.
--    owner_company_id NULL  + visibility 'marketplace' = available to contract by anyone (PowerDime pool).
--    owner_company_id <set>  + visibility 'private'     = owned by and visible only to that company.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_company_id UUID REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'marketplace'
    CHECK (visibility IN ('marketplace', 'private'));

CREATE INDEX IF NOT EXISTS idx_projects_owner_company ON public.projects (owner_company_id);
