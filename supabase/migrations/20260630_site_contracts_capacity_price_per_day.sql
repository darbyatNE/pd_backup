-- Standardize the capacity price on site_contracts to $/MW-day (was $/MW-year).
ALTER TABLE public.site_contracts
  ADD COLUMN IF NOT EXISTS price_per_mw_day NUMERIC(10, 4);

-- Carry over any existing per-year values (÷365) before dropping the old column.
UPDATE public.site_contracts
   SET price_per_mw_day = ROUND(price_per_mw_year / 365.0, 4)
 WHERE price_per_mw_day IS NULL AND price_per_mw_year IS NOT NULL;

ALTER TABLE public.site_contracts DROP COLUMN IF EXISTS price_per_mw_year;
