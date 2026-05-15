-- Add ISO and zone columns to seller projects table
-- and backfill existing rows with PJM + derived zone from location.

-- 1. Add columns
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS iso VARCHAR(10),
  ADD COLUMN IF NOT EXISTS zone VARCHAR(50);

-- 2. Backfill ISO for all existing projects
UPDATE projects
SET iso = 'PJM'
WHERE iso IS NULL;

-- 3. Derive zone from location for existing projects (PJM footprint only)
UPDATE projects
SET zone = CASE
  -- New Jersey zones
  WHEN location ILIKE '%pseg%' OR location ILIKE '%berg%' THEN 'PSEG'
  WHEN location ILIKE '%aeco%' OR location ILIKE '%atlantic%' THEN 'AECO'
  WHEN location ILIKE '%jcpl%' OR location ILIKE '%jersey central%' THEN 'JCPL'
  WHEN location ILIKE '%meted%' THEN 'METED'
  WHEN location ILIKE '%reco%' THEN 'RECO'
  WHEN location ILIKE '%new jersey%' OR location ILIKE '%nj%' THEN 'PSEG'

  -- Pennsylvania zones
  WHEN location ILIKE '%ppl%' OR location ILIKE '%pennsylvania power%' THEN 'PPL'
  WHEN location ILIKE '%peco%' OR location ILIKE '%philadelphia%' THEN 'PECO'
  WHEN location ILIKE '%penelec%' OR location ILIKE '%pennsylvania electric%' THEN 'PENELEC'
  WHEN location ILIKE '%duq%' OR location ILIKE '%duquesne%' OR location ILIKE '%pittsburgh%' THEN 'DUQ'
  WHEN location ILIKE '%aps%' OR location ILIKE '%allegheny%' THEN 'APS'
  WHEN location ILIKE '%aep%' OR location ILIKE '%american electric%' THEN 'AEP'
  WHEN location ILIKE '%pennsylvania%' OR location ILIKE '%pa%' THEN 'PPL'

  -- Maryland / DC zones
  WHEN location ILIKE '%bge%' OR location ILIKE '%baltimore%' THEN 'BGE'
  WHEN location ILIKE '%pepco%' OR location ILIKE '%potomac%' OR location ILIKE '%washington dc%' OR location ILIKE '%dc%' THEN 'PEPCO'
  WHEN location ILIKE '%maryland%' OR location ILIKE '%md%' THEN 'BGE'

  -- Delaware
  WHEN location ILIKE '%dpl%' OR location ILIKE '%delmarva%' OR location ILIKE '%delaware%' THEN 'DPL'

  -- Virginia
  WHEN location ILIKE '%dom%' OR location ILIKE '%virginia power%' OR location ILIKE '%virginia%' OR location ILIKE '%va%' OR location ILIKE '%ashburn%' OR location ILIKE '%manassas%' OR location ILIKE '%sterling%' THEN 'DOM'
  WHEN location ILIKE '%north carolina%' OR location ILIKE '%nc%' THEN 'DOM'

  -- West Virginia
  WHEN location ILIKE '%west virginia%' OR location ILIKE '%wv%' THEN 'AEP'

  -- Ohio zones
  WHEN location ILIKE '%day%' OR location ILIKE '%dayton%' THEN 'DAY'
  WHEN location ILIKE '%deok%' OR location ILIKE '%duke energy ohio%' OR location ILIKE '%cleveland%' THEN 'DEOK'
  WHEN location ILIKE '%atsi%' OR location ILIKE '%firstenergy%' THEN 'ATSI'
  WHEN location ILIKE '%fe-atsi%' THEN 'ATSI'
  WHEN location ILIKE '%ohio%' OR location ILIKE '%oh%' THEN 'AEP'

  -- Kentucky
  WHEN location ILIKE '%ekpc%' OR location ILIKE '%east kentucky%' THEN 'EKPC'
  WHEN location ILIKE '%lge%' OR location ILIKE '%louisville%' THEN 'LGE'
  WHEN location ILIKE '%kentucky%' OR location ILIKE '%ky%' THEN 'EKPC'

  -- Illinois / Indiana
  WHEN location ILIKE '%comed%' OR location ILIKE '%commonwealth edison%' OR location ILIKE '%illinois%' OR location ILIKE '%il%' OR location ILIKE '%chicago%' THEN 'COMED'
  WHEN location ILIKE '%indiana%' OR location ILIKE '%in%' THEN 'COMED'

  -- UGI
  WHEN location ILIKE '%ugi%' THEN 'UGI'

  ELSE zone
END
WHERE zone IS NULL;
