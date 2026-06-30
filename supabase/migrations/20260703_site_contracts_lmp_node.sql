-- Per-contract LMP pricing node (e.g. the specific pnode/settlement point the
-- deal prices at). Entered at contract creation in Examine-Fit; surfaced as the
-- "Pricing LMP" column in the Contracts ledger and portfolio. Nullable — older
-- contracts and deals without a designated node simply show "—".
ALTER TABLE public.site_contracts
  ADD COLUMN IF NOT EXISTS lmp_node TEXT;
