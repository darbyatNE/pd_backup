-- Lock state for saved contracts. Drafts (committed=false) can be removed;
-- committed=true makes the terms permanent and non-removable.
ALTER TABLE public.site_contracts
  ADD COLUMN IF NOT EXISTS committed BOOLEAN NOT NULL DEFAULT false;
