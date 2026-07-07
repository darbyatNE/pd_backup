// Data-driven registry of scope grouping dimensions, mirroring the Planning-tab
// Grouping Schema Reference (Part 3). Each dimension knows how to enumerate its
// selectable values from a set of site attributes and how to test whether a
// site matches a selection. Filters SNAPSHOT: resolveFilter() turns a criteria
// object into a fixed list of site keys, which the scope then holds directly.

export interface SiteAttrs {
  fac_id: string;
  iso: string | null;
  state: string | null;
  country: string | null;
  utility: string | null;
  lda: string | null;
  lifecycle: string | null;
  it_cap: number | null;
  it_load: number | null;
  pue: number | null;
  interconnection_expiry: string | null; // ISO date
  transmission_agreement: string | null;
  settlement_node: string | null;
  net_zero_year: number | null;
  procurement_strategy: string | null;
  carbon_match: string | null;
  contracted_mwh: number;
  earliest_contract_end: string | null;   // "YYYY-MM"
  generation_types: string[];
}

// criteria[dimensionKey] = selected value keys (OR within a dimension).
export type FilterCriteria = Record<string, string[]>;

export interface DimOption { value: string; label: string; count: number }
export interface ScopeDimension {
  key: string;
  label: string;
  optionsFrom: (attrs: SiteAttrs[]) => DimOption[];
  matches: (attr: SiteAttrs, selected: string[]) => boolean;
  labelOf: (value: string) => string;  // display label for a value key
}

// ── time helpers for bucketed cohorts ────────────────────────────────────────
const monthsUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
};
const monthsUntilYm = (ym: string | null): number | null => {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return null;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
};

// ── bucket classifiers (return a value key per site) ─────────────────────────
const loadTierOf = (a: SiteAttrs): string => {
  if (a.it_cap == null) return 'unknown';
  if (a.it_cap < 5) return 'edge';
  if (a.it_cap < 20) return 'mid';
  if (a.it_cap < 100) return 'large';
  return 'hyperscale';
};
const pueBandOf = (a: SiteAttrs): string => {
  if (a.pue == null) return 'unknown';
  if (a.pue < 1.3) return 'efficient';
  if (a.pue <= 1.6) return 'average';
  return 'poor';
};
const hedgeBandOf = (a: SiteAttrs): string => {
  if (!a.it_load || !a.pue) return 'unknown';
  const annualLoad = a.it_load * a.pue * 8760;
  if (annualLoad <= 0) return 'unknown';
  const pct = (a.contracted_mwh / annualLoad) * 100;
  if (pct < 10) return 'unhedged';
  if (pct < 50) return 'partial';
  if (pct < 90) return 'mostly';
  return 'fully_hedged';
};
const contractExpiryOf = (a: SiteAttrs): string => {
  const m = monthsUntilYm(a.earliest_contract_end);
  if (m == null) return 'no_contract';
  if (m <= 12) return 'expiring_12mo';
  if (m <= 36) return 'expiring_1_3yr';
  return 'expiring_3plus';
};
const icExpiryOf = (a: SiteAttrs): string => {
  const m = monthsUntil(a.interconnection_expiry);
  if (m == null) return 'no_expiry';
  if (m <= 12) return 'expiring_soon';
  if (m <= 36) return 'expiring_medium';
  return 'expiring_long';
};
const netZeroOf = (a: SiteAttrs): string => {
  if (a.net_zero_year == null) return 'not_set';
  if (a.net_zero_year <= 2028) return 'urgent';
  if (a.net_zero_year <= 2032) return 'near_term';
  return 'long_term';
};

// ── builders ─────────────────────────────────────────────────────────────────
/** Direct-match dimension: options are the distinct present values. */
function directDim(
  key: string,
  label: string,
  get: (a: SiteAttrs) => string | null,
): ScopeDimension {
  return {
    key, label,
    optionsFrom: (attrs) => {
      const counts = new Map<string, number>();
      for (const a of attrs) {
        const v = get(a);
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, label: value, count }));
    },
    matches: (a, sel) => { const v = get(a); return v != null && sel.includes(v); },
    labelOf: (v) => v,
  };
}

/** Multi-value direct dimension (a site can carry several values, e.g. gen types). */
function multiDim(
  key: string,
  label: string,
  get: (a: SiteAttrs) => string[],
): ScopeDimension {
  return {
    key, label,
    optionsFrom: (attrs) => {
      const counts = new Map<string, number>();
      for (const a of attrs) for (const v of get(a)) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, label: value, count }));
    },
    matches: (a, sel) => get(a).some((v) => sel.includes(v)),
    labelOf: (v) => v,
  };
}

/** Bucketed dimension: fixed buckets, each site classified into exactly one. */
function bucketedDim(
  key: string,
  label: string,
  buckets: Array<{ value: string; label: string }>,
  classify: (a: SiteAttrs) => string,
): ScopeDimension {
  const labels = new Map(buckets.map((b) => [b.value, b.label]));
  return {
    key, label,
    optionsFrom: (attrs) => {
      const counts = new Map<string, number>();
      for (const a of attrs) { const b = classify(a); counts.set(b, (counts.get(b) ?? 0) + 1); }
      return buckets
        .map((b) => ({ ...b, count: counts.get(b.value) ?? 0 }))
        .filter((b) => b.count > 0);
    },
    matches: (a, sel) => sel.includes(classify(a)),
    labelOf: (v) => labels.get(v) ?? v,
  };
}

// ── the v1 registry (existing-column-backed dimensions) ──────────────────────
export const SCOPE_DIMENSIONS: ScopeDimension[] = [
  directDim('iso', 'ISO / RTO', (a) => a.iso),
  directDim('lda', 'LDA Zone', (a) => a.lda),
  directDim('state', 'State / Province', (a) => a.state),
  directDim('country', 'Country', (a) => a.country),
  directDim('utility', 'Utility', (a) => a.utility),
  directDim('lifecycle', 'Lifecycle Status', (a) => a.lifecycle),
  directDim('transmission_agreement', 'Transmission Agreement', (a) => a.transmission_agreement),
  directDim('procurement_strategy', 'Procurement Strategy', (a) => a.procurement_strategy),
  multiDim('generation_types', 'Generation Type', (a) => a.generation_types),
  bucketedDim('load_tier', 'Load Size Tier', [
    { value: 'edge', label: 'Edge (<5 MW)' },
    { value: 'mid', label: 'Mid (5–20 MW)' },
    { value: 'large', label: 'Large (20–100 MW)' },
    { value: 'hyperscale', label: 'Hyperscale (≥100 MW)' },
    { value: 'unknown', label: 'Unknown' },
  ], loadTierOf),
  bucketedDim('pue_band', 'PUE Efficiency', [
    { value: 'efficient', label: 'Efficient (<1.3)' },
    { value: 'average', label: 'Average (1.3–1.6)' },
    { value: 'poor', label: 'Poor (>1.6)' },
    { value: 'unknown', label: 'Unknown' },
  ], pueBandOf),
  bucketedDim('hedge_band', 'Hedge Coverage', [
    { value: 'unhedged', label: 'Unhedged (0–10%)' },
    { value: 'partial', label: 'Partial (10–50%)' },
    { value: 'mostly', label: 'Mostly (50–90%)' },
    { value: 'fully_hedged', label: 'Fully hedged (≥90%)' },
    { value: 'unknown', label: 'Unknown' },
  ], hedgeBandOf),
  bucketedDim('contract_expiry', 'Contract Expiry', [
    { value: 'expiring_12mo', label: 'Within 12 months' },
    { value: 'expiring_1_3yr', label: '1–3 years' },
    { value: 'expiring_3plus', label: '3+ years' },
    { value: 'no_contract', label: 'No contract' },
  ], contractExpiryOf),
  bucketedDim('ic_expiry', 'Interconnection Expiry', [
    { value: 'expiring_soon', label: 'Within 12 months' },
    { value: 'expiring_medium', label: '1–3 years' },
    { value: 'expiring_long', label: '3+ years' },
    { value: 'no_expiry', label: 'No expiry set' },
  ], icExpiryOf),
  bucketedDim('net_zero', 'Net-Zero Target', [
    { value: 'urgent', label: 'Urgent (≤2028)' },
    { value: 'near_term', label: 'Near-term (2029–2032)' },
    { value: 'long_term', label: 'Long-term (≥2033)' },
    { value: 'not_set', label: 'Not set' },
  ], netZeroOf),
];

export const SCOPE_DIMENSION_BY_KEY: Record<string, ScopeDimension> =
  Object.fromEntries(SCOPE_DIMENSIONS.map((d) => [d.key, d]));

/**
 * Resolve a filter to the matching site keys. AND across dimensions, OR within a
 * dimension's selected values. Only sites present in `attrs` can match; sites
 * without DB attributes are excluded from filter results.
 */
export function resolveFilter(
  criteria: FilterCriteria,
  attrs: Record<string, SiteAttrs>,
): string[] {
  const active = Object.entries(criteria).filter(([, vals]) => vals && vals.length > 0);
  const all = Object.values(attrs);
  if (active.length === 0) return all.map((a) => a.fac_id);
  return all
    .filter((a) =>
      active.every(([key, vals]) => {
        const dim = SCOPE_DIMENSION_BY_KEY[key];
        return dim ? dim.matches(a, vals) : true;
      }),
    )
    .map((a) => a.fac_id);
}

/** Short human label for the scope summary chip, e.g. "PJM · unhedged". */
export function labelForCriteria(criteria: FilterCriteria): string {
  const parts: string[] = [];
  for (const dim of SCOPE_DIMENSIONS) {
    const sel = criteria[dim.key];
    if (!sel || sel.length === 0) continue;
    parts.push(sel.map((v) => dim.labelOf(v)).join('/'));
  }
  return parts.join(' · ');
}
