-- Contract lifecycle + company ownership on site_contracts (AWS RDS).
-- Links committed contracts to the Transactions tab and supports accept/reject.
--   origin : 'existing' (loaded at onboarding) | 'pursued' (from Examine-Fit)
--   status : pending → committed → accepted | rejected   (rejected = soft archive)
--   owner_company_id : company that owns/charts the contract (company-wide)
ALTER TABLE public.site_contracts
  ADD COLUMN IF NOT EXISTS origin           TEXT NOT NULL DEFAULT 'pursued'
    CHECK (origin IN ('existing', 'pursued')),
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'committed', 'accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS owner_company_id UUID REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS decided_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_by       UUID REFERENCES public.users(id);

-- Backfill status from the legacy `committed` flag (idempotent: only touches
-- rows still at the freshly-added default). Previously-committed rows preserve
-- their "permanent + charted" meaning as 'accepted'.
UPDATE public.site_contracts
   SET status = 'accepted'
 WHERE committed = true AND status = 'pending';

-- Backfill company ownership from each buyer's company membership.
UPDATE public.site_contracts sc
   SET owner_company_id = cm.company_id
  FROM public.company_members cm
 WHERE cm.user_id = sc.buyer_id
   AND sc.owner_company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_site_contracts_company_status
  ON public.site_contracts (owner_company_id, status);
CREATE INDEX IF NOT EXISTS idx_site_contracts_status
  ON public.site_contracts (status);
