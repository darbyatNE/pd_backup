-- Align projects.generation_type with the app's canonical GenerationType list so
-- every type shown in the marketplace can be created/edited. Adds 'Hydro' and
-- keeps 'Hydrogen' for back-compat with any legacy rows.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_generation_type_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_generation_type_check
    CHECK (generation_type IN ('Solar','Wind','Nuclear','Battery','Hydro','Hydrogen','Hybrid','Combined Cycle','Peaker','Virtual'));
