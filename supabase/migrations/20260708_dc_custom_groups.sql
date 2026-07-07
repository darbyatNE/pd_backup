-- User-defined data-center groups for the Planning-tab scope selector (doc §19).
-- These tables were created directly by the data-platform owner; this file only
-- ensures a fresh dev database has the SAME shape (it is a no-op where the
-- tables already exist). Groups are scoped per user (buyer_id); company-wide
-- sharing is intentionally deferred to the platform owner's own multi-user work
-- and is NOT added here.
CREATE TABLE IF NOT EXISTS public.dc_custom_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid,
  name        text NOT NULL,
  color       text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.dc_group_members (
  group_id      uuid NOT NULL REFERENCES public.dc_custom_groups(id) ON DELETE CASCADE,
  datacenter_id uuid NOT NULL,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, datacenter_id)
);

CREATE INDEX IF NOT EXISTS idx_dc_custom_groups_buyer ON public.dc_custom_groups(buyer_id);
CREATE INDEX IF NOT EXISTS idx_dc_group_members_group ON public.dc_group_members(group_id);
