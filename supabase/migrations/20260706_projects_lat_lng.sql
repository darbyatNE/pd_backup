-- Optional explicit map coordinates for a project. When present the map uses
-- these directly; otherwise it falls back to the name-based lookup on `location`.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 6);
