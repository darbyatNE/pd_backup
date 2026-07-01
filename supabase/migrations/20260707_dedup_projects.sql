-- Remove duplicate project rows that share the same name (e.g. Atlantic Peaking
-- Station / Hudson River Combined Cycle, which a non-idempotent combustion seed
-- could insert more than once). Keep the earliest row per name; deleting the
-- duplicates cascades their planning.project_products and nulls any
-- site_contracts.project_id references.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY name ORDER BY created_at, id) AS rn
  FROM public.projects
)
DELETE FROM public.projects p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;
