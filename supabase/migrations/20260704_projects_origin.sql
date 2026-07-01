-- Distinguish a customer's already-held generation contracts ('existing') from
-- seller marketplace offerings ('marketplace') within the single projects table.
-- Existing contracts are private to the owning company (visibility='private',
-- owner_company_id set) and flow through to public.site_contracts for charting.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'marketplace'
    CHECK (origin IN ('marketplace', 'existing'));

CREATE INDEX IF NOT EXISTS idx_projects_origin ON public.projects(origin);
