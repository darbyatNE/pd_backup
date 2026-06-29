-- Saved hedge/contract selections linked to a data center ("Examine Fit" → Save).
-- Feeds the load-shape chart: capacity_mw renders as a flat baseload band
-- (MW-year), energy_mwh as a shaped peaking band. A row may carry capacity,
-- energy, or both. The precise hour/month/year energy shape is a future
-- enhancement (captured via `shape` / `metadata` for now).
CREATE TABLE IF NOT EXISTS public.site_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fac_id TEXT NOT NULL,                         -- data center FAC_ID (load-chart site key)
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL,
  generation_type TEXT NOT NULL,

  capacity_mw NUMERIC(12,2),                    -- MW-year, flat baseload commitment
  energy_mwh NUMERIC(14,2),                     -- annual energy, shaped peaking commitment

  price_per_mwh NUMERIC(12,4),
  price_per_mw_year NUMERIC(14,2),
  lda TEXT,
  shape TEXT NOT NULL DEFAULT 'flat',           -- 'flat'|'solar'|'wind'|'evening' (future: full hourly shape)

  start_year INT NOT NULL,
  start_month INT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  end_year INT NOT NULL,
  end_month INT NOT NULL CHECK (end_month BETWEEN 1 AND 12),

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- at least one of capacity / energy must be specified
  CONSTRAINT site_contracts_amount_present CHECK (capacity_mw IS NOT NULL OR energy_mwh IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_site_contracts_buyer_fac
  ON public.site_contracts (buyer_id, fac_id);
