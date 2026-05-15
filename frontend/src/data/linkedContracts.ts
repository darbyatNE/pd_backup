// Synthetic mapping of which marketplace projects (PPAs / contracts) currently
// cover slices of each in-scope site's load. Until the contracting module ships
// (Aug 2026) this is a placeholder so the Energy chart can demonstrate the
// "filled-in by contract" stack visualization.

import { LOAD_PROFILE_MAP, getLoadMultiplierForYearMonth, type SiteLoadProfile } from './loadProfile';

export type ContractShape = 'flat' | 'solar' | 'wind' | 'evening';

// Whether the contract's coverage stacks under the baseload tier (teal) or
// the peak tier (amber). Flat/dispatchable resources cover baseload first;
// shape-following resources cover peak.
export type ContractTier = 'base' | 'peak';

export interface LinkedContract {
  projectName: string;
  generationType: 'Solar' | 'Wind' | 'Nuclear' | 'Battery' | 'Hybrid' | 'Combined Cycle' | 'Peaker';
  mwCovered: number;       // contracted MW (cap)
  pricePerMwh: number;     // blended contract price ($/MWh)
  shape: ContractShape;    // delivery profile
  tier: ContractTier;      // baseload tier (teal) vs peak tier (amber)
  pattern: 'diagonal' | 'dots' | 'crosshatch' | 'vertical' | 'wave' | 'grid';
  // Active term: contract delivers from (startYear, startMonth) through
  // (endYear, endMonth) inclusive. Outside the term it contributes 0 MW.
  startYear: number;
  startMonth: number;      // 1–12
  endYear: number;
  endMonth: number;        // 1–12
  // Set on merged contracts coming out of `getContractsForSites`. Records
  // each hedged site and its MW share, so year/month load multipliers can be
  // applied per-site (a +25% bump on Manassas grows only the share that
  // hedges Manassas, not the whole contract). Absent on raw fixture entries.
  perSiteMw?: Array<{ siteKey: string; mwCovered: number }>;
}

/** True if a contract is in delivery for the given calendar year + month. */
export function isContractActiveAt(c: LinkedContract, year: number, month: number): boolean {
  const before =
    year < c.startYear || (year === c.startYear && month < c.startMonth);
  const after =
    year > c.endYear || (year === c.endYear && month > c.endMonth);
  return !before && !after;
}

// Standard load-tier colors used by the chart backgrounds.
export const LOAD_COLORS = {
  base: '#0d9488', // teal-600 — baseload (uncovered load)
  peak: '#f59e0b', // amber-500 — peak (uncovered load)
} as const;

// All contract patterns share the same dark foreground — patterns differentiate
// contracts, not color.
export const PATTERN_FG = '#1e293b'; // slate-800

// Per-site contract assignments. Terms are staggered intentionally so the
// chart reveals month/year hedge variation:
//
//   • Tucker Mtn Wind        — legacy hedge, expires Dec 2027 (mid-scope)
//   • Front Royal Hybrid     — short term, expires Dec 2027 (exposes Manassas peak in 2028)
//   • Susquehanna SMR        — forward sale, both Ashburn + Sterling slices come online Jan 2027
//   • Marcus Hook CCGT II    — comes online Apr 2027 (mid-quarter start)
//   • Loudoun Solar Garden   — comes online Jul 2027 (matches Manassas's +25% load bump)
//   • Garrett Ridge Wind     — expires Dec 2028 (last month of scope)
export const LINKED_CONTRACTS: Record<string, LinkedContract[]> = {
  'ashburn-dc': [
    // Big nuclear baseload — comes online with Phase II expansion (Jan 2027)
    { projectName: 'Susquehanna SMR',         generationType: 'Nuclear',        mwCovered: 20, pricePerMwh: 35, shape: 'flat',    tier: 'base', pattern: 'wave',
      startYear: 2027, startMonth: 1,  endYear: 2033, endMonth: 12 },
    // Long-term solar PPA — covers the full scope and beyond
    { projectName: 'Spotsylvania Solar II',   generationType: 'Solar',          mwCovered: 8,  pricePerMwh: 28, shape: 'solar',   tier: 'peak', pattern: 'dots',
      startYear: 2026, startMonth: 1,  endYear: 2032, endMonth: 12 },
    // Legacy wind — expires end of 2027, so 2028 loses 4 MW peak hedge
    { projectName: 'Tucker Mountain Wind',    generationType: 'Wind',           mwCovered: 4,  pricePerMwh: 31, shape: 'wind',    tier: 'peak', pattern: 'diagonal',
      startYear: 2024, startMonth: 1,  endYear: 2027, endMonth: 12 },
  ],
  'manassas-industrial': [
    // Strict-allocation baseload contract — 20 MW exceeds Manassas's 15 MW
    // baseload tier on purpose, so the chart reveals the 5 MW over-hedge.
    { projectName: 'North Anna Allocation',   generationType: 'Nuclear',        mwCovered: 20, pricePerMwh: 38, shape: 'flat',    tier: 'base', pattern: 'grid',
      startYear: 2026, startMonth: 1,  endYear: 2030, endMonth: 12 },
    // Short hybrid hedge — rolls off Dec 2027, leaving 2028 peak exposed
    { projectName: 'Front Royal Hybrid',      generationType: 'Hybrid',         mwCovered: 10, pricePerMwh: 45, shape: 'evening', tier: 'peak', pattern: 'crosshatch',
      startYear: 2026, startMonth: 1,  endYear: 2027, endMonth: 12 },
    // Comes online Jul 2027 — coincides with the +25% Manassas load bump
    { projectName: 'Loudoun Solar Garden',    generationType: 'Solar',          mwCovered: 5,  pricePerMwh: 28, shape: 'solar',   tier: 'peak', pattern: 'dots',
      startYear: 2027, startMonth: 7,  endYear: 2032, endMonth: 12 },
  ],
  'sterling-hyperscale': [
    // Bigger Susquehanna slice — Jan 2027 online with Sterling's allocation
    { projectName: 'Susquehanna SMR',         generationType: 'Nuclear',        mwCovered: 30, pricePerMwh: 35, shape: 'flat',    tier: 'base', pattern: 'wave',
      startYear: 2027, startMonth: 1,  endYear: 2033, endMonth: 12 },
    // Long-term hybrid for evening peaks
    { projectName: 'Hudson Co. Hybrid',       generationType: 'Hybrid',         mwCovered: 8,  pricePerMwh: 45, shape: 'evening', tier: 'peak', pattern: 'crosshatch',
      startYear: 2026, startMonth: 1,  endYear: 2032, endMonth: 12 },
    // Wind expires end of 2028 — last month of scope
    { projectName: 'Garrett Ridge Wind',      generationType: 'Wind',           mwCovered: 12, pricePerMwh: 31, shape: 'wind',    tier: 'peak', pattern: 'diagonal',
      startYear: 2026, startMonth: 1,  endYear: 2028, endMonth: 12 },
    // CCGT — comes online Apr 2027 (mid-quarter)
    { projectName: 'Marcus Hook CCGT II',     generationType: 'Combined Cycle', mwCovered: 10, pricePerMwh: 42, shape: 'flat',    tier: 'base', pattern: 'vertical',
      startYear: 2027, startMonth: 4,  endYear: 2034, endMonth: 3  },
  ],
};

// Hour-of-day shape factors (HE 0–23). Returns 0..1 of contracted MW that
// the contract delivers for that hour (assumed monthly-average behavior).
const SHAPE_HOUR: Record<ContractShape, number[]> = {
  // Nuclear / baseload: flat 100% all hours
  flat:    Array(24).fill(1.0),
  // Solar: bell curve centered around HE 12, zero at night
  solar: [
    0, 0, 0, 0, 0, 0, 0.05, 0.20, 0.45, 0.75, 0.92, 1.00,
    0.98, 0.92, 0.82, 0.66, 0.45, 0.22, 0.05, 0, 0, 0, 0, 0,
  ],
  // Wind: variable; average ~0.35, slightly stronger overnight
  wind: [
    0.42, 0.45, 0.48, 0.50, 0.48, 0.42, 0.35, 0.30, 0.28, 0.25, 0.25, 0.28,
    0.32, 0.34, 0.35, 0.37, 0.40, 0.42, 0.45, 0.48, 0.50, 0.48, 0.45, 0.42,
  ],
  // Evening peak / Hybrid + storage: discharges during dispatch window
  evening: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0.10, 0.40, 0.85, 1.00, 1.00, 0.85, 0.55, 0.25, 0.05, 0,
  ],
};

// Month-factor — small seasonal variation so contracts feel realistic
const MONTH_FACTOR: Record<ContractShape, number[]> = {
  // Nuclear: ~constant, tiny refueling outage effect in spring
  flat:    [1.00, 1.00, 0.96, 0.92, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
  // Solar: stronger late spring through early fall
  solar:   [0.78, 0.84, 1.00, 1.10, 1.18, 1.20, 1.18, 1.12, 1.00, 0.88, 0.78, 0.72],
  // Wind: stronger winter / early spring, weaker summer
  wind:    [1.18, 1.15, 1.20, 1.10, 0.92, 0.78, 0.72, 0.78, 0.92, 1.05, 1.15, 1.20],
  // Evening peakers: ~constant
  evening: [0.95, 0.95, 1.00, 1.00, 1.05, 1.10, 1.10, 1.10, 1.05, 1.00, 0.98, 0.95],
};

/** MW delivered by a contract at a given hour-of-day and month. */
export function contractMwAtHour(c: LinkedContract, hour: number, month: number): number {
  const h = SHAPE_HOUR[c.shape][hour] ?? 0;
  const m = MONTH_FACTOR[c.shape][month - 1] ?? 1;
  return Math.max(0, Math.min(c.mwCovered, c.mwCovered * h * m));
}

/** Average MW delivered by a contract over all hours of a given month. */
export function contractMwForMonth(c: LinkedContract, month: number): number {
  let sum = 0;
  for (let h = 0; h < 24; h++) sum += contractMwAtHour(c, h, month);
  return sum / 24;
}

/** Average MW delivered by a contract for a given hour, averaged across months. */
export function contractMwForHourAvg(c: LinkedContract, hour: number): number {
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += contractMwAtHour(c, hour, m);
  return sum / 12;
}

// ── Year-aware variants — gate by `isContractActiveAt` so out-of-term
// months contribute 0 MW, and scale by `getContractLoadMultAt` so the
// contract's gen shape tracks the forecasted load month-by-month and
// year-by-year.

/** MW delivered for a (hour, month, year) — 0 outside the contract's term;
 *  scaled by the load multiplier of the sites this contract hedges. */
export function contractMwAtHourInYear(
  c: LinkedContract, hour: number, month: number, year: number,
): number {
  if (!isContractActiveAt(c, year, month)) return 0;
  return contractMwAtHour(c, hour, month) * getContractLoadMultAt(c, year, month);
}

/** Average MW for a given (year, month) — 0 if out-of-term; load-tracked. */
export function contractMwForMonthInYear(
  c: LinkedContract, year: number, month: number,
): number {
  if (!isContractActiveAt(c, year, month)) return 0;
  return contractMwForMonth(c, month) * getContractLoadMultAt(c, year, month);
}

/** Year-average MW at a given hour — sums in-term months × per-month load
 *  multiplier, divides by 12. A contract active 6/12 months therefore
 *  contributes ~half of its full rate, weighted by load growth in those
 *  months. */
export function contractMwForHourAvgInYear(
  c: LinkedContract, hour: number, year: number,
): number {
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    if (isContractActiveAt(c, year, m)) {
      sum += contractMwAtHour(c, hour, m) * getContractLoadMultAt(c, year, m);
    }
  }
  return sum / 12;
}

/** Collect contracts for a set of in-scope site keys (deduped by project name,
 *  with MW summed when the same project covers multiple sites). When the same
 *  project has different terms across sites, the merged term is the UNION
 *  (earliest start, latest end) — an approximation that's exact when both
 *  sites share a term and a slight overstatement otherwise.
 *
 *  Sets `perSiteMw` on every returned contract so downstream code can
 *  apply per-site load multipliers (mid-year volume bumps, etc.) without
 *  losing the per-source MW shares the merge collapsed. */
export function getContractsForSites(siteKeys: string[]): LinkedContract[] {
  const merged = new Map<string, LinkedContract>();
  const earlier = (ay: number, am: number, by: number, bm: number) =>
    ay < by || (ay === by && am < bm);
  for (const key of siteKeys) {
    const list = LINKED_CONTRACTS[key] ?? [];
    for (const c of list) {
      const existing = merged.get(c.projectName);
      if (existing) {
        const startEarlier = earlier(c.startYear, c.startMonth, existing.startYear, existing.startMonth);
        const endLater = earlier(existing.endYear, existing.endMonth, c.endYear, c.endMonth);
        merged.set(c.projectName, {
          ...existing,
          mwCovered: existing.mwCovered + c.mwCovered,
          startYear:  startEarlier ? c.startYear  : existing.startYear,
          startMonth: startEarlier ? c.startMonth : existing.startMonth,
          endYear:    endLater     ? c.endYear    : existing.endYear,
          endMonth:   endLater     ? c.endMonth   : existing.endMonth,
          perSiteMw: [...(existing.perSiteMw ?? []), { siteKey: key, mwCovered: c.mwCovered }],
        });
      } else {
        merged.set(c.projectName, {
          ...c,
          perSiteMw: [{ siteKey: key, mwCovered: c.mwCovered }],
        });
      }
    }
  }
  return Array.from(merged.values());
}

/** MW-weighted average load multiplier across the sites this contract hedges,
 *  for a given (year, month). Lets contract delivery track forecasted load:
 *  a contract that hedges a site with a +25% bump in Jul'27 grows by the same
 *  fraction in that month (proportional to its MW share at that site).
 *  Falls back to 1 when the contract has no `perSiteMw` info or none of its
 *  sites have documented load adjustments. */
export function getContractLoadMultAt(
  c: LinkedContract, year: number, month: number,
): number {
  const sources = c.perSiteMw;
  if (!sources || sources.length === 0) return 1;
  let weightedSum = 0;
  let totalMw = 0;
  for (const { siteKey, mwCovered } of sources) {
    const profile = LOAD_PROFILE_MAP[siteKey];
    if (!profile) continue;
    const mult = getLoadMultiplierForYearMonth(profile, year, month);
    weightedSum += mult * mwCovered;
    totalMw += mwCovered;
  }
  return totalMw > 0 ? weightedSum / totalMw : 1;
}

/** SVG pattern id keyed by project + visual tier — a baseload contract
 *  spilling into peak needs the amber-bg variant of the same pattern style. */
export function patternId(c: LinkedContract, tier?: ContractTier): string {
  const t = tier ?? c.tier;
  return `pat-${c.pattern}-${t}-${c.projectName.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

// PJM convention used by the rest of the app: HE 8–23 = on-peak, HE 24 + 1–7 = off-peak.
// In the 0-indexed hour-of-day data, that's hours 7–22 vs hours {0..6, 23}.
const ON_PEAK_HOURS = new Set([7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]);

/** Effective on/off-peak hedge percentages for a site, derived from
 *  the linked contracts vs. the site's load profile. Capped at 100% per hour —
 *  over-hedged hours count as fully hedged (100%) for the percentage calculation.
 *  Formula: average of min(hedge%, 100%) weighted by load. */
export function getDerivedHedgePcts(siteKey: string): { onPeak: number; offPeak: number } {
  const profile: SiteLoadProfile | undefined = LOAD_PROFILE_MAP[siteKey];
  if (!profile) return { onPeak: 0, offPeak: 0 };
  const contracts = LINKED_CONTRACTS[siteKey] ?? [];

  let onLoad = 0, offLoad = 0;
  let onHedgedCapped = 0, offHedgedCapped = 0;

  for (let h = 0; h < 24; h++) {
    const isOnPeak = ON_PEAK_HOURS.has(h);
    const pts = profile.loadShape.filter((p) => p.hour === h);
    const avgLoad = pts.reduce((s, p) => s + p.totalMw, 0) / 12;
    const hedgeMw = contracts.reduce((s, c) => s + contractMwForHourAvg(c, h), 0);
    // Cap hedge at 100% of load for this hour (no over-hedge counting)
    const cappedHedge = Math.min(hedgeMw, avgLoad);
    if (isOnPeak) { onLoad += avgLoad; onHedgedCapped += cappedHedge; }
    else          { offLoad += avgLoad; offHedgedCapped += cappedHedge; }
  }

  return {
    onPeak:  onLoad  > 0 ? Math.round((onHedgedCapped  / onLoad)  * 100) : 0,
    offPeak: offLoad > 0 ? Math.round((offHedgedCapped / offLoad) * 100) : 0,
  };
}

/** Annual MWh contracted by a single contract — derived from its hourly
 *  delivery shape × 365 days. Term-agnostic (full-rate). */
export function getContractAnnualMwh(c: LinkedContract): number {
  let dailyMwh = 0;
  for (let h = 0; h < 24; h++) dailyMwh += contractMwForHourAvg(c, h);
  return dailyMwh * 365;
}

/** Annual MWh contracted by a single contract for a SPECIFIC year — gates by
 *  the contract's term and scales by the per-month load multiplier of the
 *  hedged sites. Days per month follow the actual calendar (28–31). */
export function getContractAnnualMwhForYear(c: LinkedContract, year: number): number {
  let total = 0;
  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m <= 12; m++) {
    if (!isContractActiveAt(c, year, m)) continue;
    const mult = getContractLoadMultAt(c, year, m);
    let dayMwh = 0;
    for (let h = 0; h < 24; h++) dayMwh += contractMwAtHour(c, h, m) * mult;
    total += dayMwh * DAYS_PER_MONTH[m - 1];
  }
  return total;
}

/** Total annual MWh contracted across a list of in-scope contracts.
 *  Term-agnostic (full-rate). */
export function getTotalTransactionMwh(contracts: LinkedContract[]): number {
  return contracts.reduce((s, c) => s + getContractAnnualMwh(c), 0);
}

/** Scope-averaged annual MWh contracted — averages each contract's
 *  year-specific (term-gated) annual MWh across the scope years. Use this
 *  when you need a single hedge figure that respects staggered terms. */
export function getScopeAvgTransactionMwh(
  contracts: LinkedContract[], startYear: number, endYear: number,
): number {
  if (endYear < startYear) return 0;
  const yearCount = endYear - startYear + 1;
  let total = 0;
  for (let y = startYear; y <= endYear; y++) {
    for (const c of contracts) total += getContractAnnualMwhForYear(c, y);
  }
  return total / yearCount;
}

// ─── Capacity sources (parallel to LinkedContract, but for capacity MW) ─────
//
// Capacity is procured by channel — utility BRA pass-through, multi-year
// fixed via competitive supplier, BTM BESS, or BTM Mini-NG. Each source
// covers some MW of the site's capacity. Sterling is greenfield so its list
// is empty until a settlement option is chosen.

export type CapacityChannel =
  | 'utility-bra'
  | 'competitive-fixed'
  | 'btm-bess'
  | 'btm-ng';

export interface CapacitySource {
  sourceName: string;
  channel: CapacityChannel;
  mwCovered: number;
  pattern: 'diagonal' | 'dots' | 'crosshatch' | 'vertical' | 'wave' | 'grid';
}

// Single solid color for the capacity bar; pattern foreground stays slate.
export const CAPACITY_COLOR = '#6366f1'; // indigo-500

export const LINKED_CAPACITY_SOURCES: Record<string, CapacitySource[]> = {
  'ashburn-dc': [
    { sourceName: 'Dominion BRA Pass-Through', channel: 'utility-bra', mwCovered: 50, pattern: 'wave' },
  ],
  'manassas-industrial': [
    { sourceName: 'Dominion BRA Pass-Through', channel: 'utility-bra', mwCovered: 30, pattern: 'wave' },
  ],
  'sterling-hyperscale': [
    // Greenfield — capacity not yet settled. Bar will show fully uncovered.
  ],
};

export function getCapacitySourcesForSites(siteKeys: string[]): CapacitySource[] {
  const merged = new Map<string, CapacitySource>();
  for (const key of siteKeys) {
    const list = LINKED_CAPACITY_SOURCES[key] ?? [];
    for (const s of list) {
      const existing = merged.get(s.sourceName);
      if (existing) {
        merged.set(s.sourceName, { ...existing, mwCovered: existing.mwCovered + s.mwCovered });
      } else {
        merged.set(s.sourceName, { ...s });
      }
    }
  }
  return Array.from(merged.values());
}

/** Stable SVG pattern id per capacity source. */
export function capacityPatternId(s: CapacitySource): string {
  return `cap-pat-${s.pattern}-${s.sourceName.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

/** Stable dataKey suffix per source — same trick as `contractKey`. */
export function capacitySourceKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_');
}
