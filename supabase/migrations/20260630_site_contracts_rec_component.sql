-- Unbundled contracting: let a saved/committed contract carry a REC component
-- alongside (or instead of) capacity / energy. Runs on AWS RDS.

ALTER TABLE public.site_contracts
  ADD COLUMN IF NOT EXISTS rec_pct         NUMERIC(5, 2),   -- % matched
  ADD COLUMN IF NOT EXISTS retiring_agency TEXT,            -- REC tracking system
  ADD COLUMN IF NOT EXISTS matching_format TEXT;            -- 'yearly' | 'monthly' | '24x7'

-- Allowed REC tracking systems + matching formats (mirror planning.project_products).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_contracts_retiring_agency_chk') THEN
    ALTER TABLE public.site_contracts ADD CONSTRAINT site_contracts_retiring_agency_chk CHECK (
      retiring_agency IS NULL OR retiring_agency IN
        ('PJM-EIS GATS', 'M-RETS', 'NYGATS', 'NC-RETS', 'NEPOOL GIS', 'NAR')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_contracts_matching_format_chk') THEN
    ALTER TABLE public.site_contracts ADD CONSTRAINT site_contracts_matching_format_chk CHECK (
      matching_format IS NULL OR matching_format IN ('yearly', 'monthly', '24x7')
    );
  END IF;
END $$;

-- Relax the "amount present" rule so a REC-only contract is valid: a row must
-- carry at least one component (capacity, energy, or REC).
ALTER TABLE public.site_contracts DROP CONSTRAINT IF EXISTS site_contracts_amount_present;
ALTER TABLE public.site_contracts ADD CONSTRAINT site_contracts_amount_present CHECK (
  capacity_mw IS NOT NULL OR energy_mwh IS NOT NULL OR retiring_agency IS NOT NULL
);
