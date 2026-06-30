-- Allow 'Virtual' as a valid projects.generation_type. A Virtual deal is an
-- energy-only contract-for-differences listed alongside the physical PPA types;
-- its location is the LMP node it prices off. (site_contracts.generation_type
-- is unconstrained text, so no change is needed there.)
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_generation_type_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_generation_type_check
    CHECK (generation_type IN ('Solar','Wind','Nuclear','Battery','Hydrogen','Hybrid','Combined Cycle','Peaker','Virtual'));
