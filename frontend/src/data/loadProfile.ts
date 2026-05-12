// Load shape worksheet — simulated placeholder until metered interval data API is connected.
// Represents 24-hour × 12-month demand profiles for each registered buyer site.
//
// baseloadMw  = flat load floor: demand that never drops below this level (servers always on, HVAC base, etc.)
// peakMw      = load above baseload driven by production/compute schedule and weather
// capacityMw  = contracted market capacity (upper bound)
//
// Shape methodology:
//   totalMw(hour, month) = baseloadMw + clamp(hourShape[hour] × peakRange × monthFactor[month], 0, peakRange)
//   hourShape: 0–1 fraction of available peak for each hour ending (HE01–HE24)
//   monthFactor: seasonal multiplier (cooling loads drive summer peaks for data centers)

export interface LoadShapePoint {
  hour: number;       // 0–23 (hour ending 1–24)
  month: number;      // 1–12
  totalMw: number;
  baseloadMw: number;
  peakMw: number;
}

export interface SiteLoadProfile {
  siteKey: string;
  name: string;
  location: string;
  settlementZone: string;
  capacityMw: number;
  baseloadMw: number;
  peakDemandMw: number;
  averageMw: number;
  loadFactorPct: number;
  loadShape: LoadShapePoint[];  // 288 points: 24 h × 12 mo
  // Sparse map of documented capacity by absolute calendar year. Sites can
  // expand or contract over time (data-center build-outs, hyperscale phases),
  // and the Capacity tab needs to size each year's bar to the value clearing
  // for that year. When omitted, callers fall back to `capacityMw`.
  capacityByYear?: Record<number, number>;
  // Documented step-change adjustments to actual load demand. Each adjustment
  // applies cumulatively from its effective (year, month) onward. Examples:
  // a tenant moving in mid-year, a phase-online date for new compute racks.
  loadAdjustments?: LoadAdjustment[];
  // For aggregate profiles only — the underlying single-site keys, so that
  // year/month load multipliers can be applied per-site at render time
  // (multipliers don't compose across sites the way capacity sums do).
  constituentSiteKeys?: string[];
}

/** A documented step-change in a site's load demand. Applied multiplicatively
 *  from (effectiveYear, effectiveMonth) onward. Multiple adjustments compound. */
export interface LoadAdjustment {
  effectiveYear: number;
  effectiveMonth: number;  // 1–12, the first month the change is in effect
  pctChange: number;        // e.g., 0.25 = +25%
  reason?: string;
}

/** Resolve a site's capacity for a given calendar year. Returns the exact
 *  documented value when present; otherwise the largest documented value at
 *  or below `year`; otherwise the static `capacityMw`. */
export function getSiteCapacityForYear(profile: SiteLoadProfile, year: number): number {
  const map = profile.capacityByYear;
  if (!map) return profile.capacityMw;
  if (map[year] !== undefined) return map[year];
  let val = profile.capacityMw;
  const documentedYears = Object.keys(map).map(Number).sort((a, b) => a - b);
  for (const y of documentedYears) {
    if (y <= year) val = map[y];
    else break;
  }
  return val;
}

/** Resolve the cumulative load multiplier in effect at a (year, month) for a
 *  single site (NOT an aggregate — for aggregates, apply per-constituent). */
export function getLoadMultiplierForYearMonth(
  profile: SiteLoadProfile,
  year: number,
  month: number,
): number {
  if (!profile.loadAdjustments || profile.loadAdjustments.length === 0) return 1;
  let mult = 1;
  for (const adj of profile.loadAdjustments) {
    const isInEffect =
      year > adj.effectiveYear ||
      (year === adj.effectiveYear && month >= adj.effectiveMonth);
    if (isInEffect) mult *= (1 + adj.pctChange);
  }
  return mult;
}

// ─── Hour shapes (0–1 normalized, fraction of peak range above baseload) ───────

// Data center: flat 24/7 profile with slight business-hours compute peak
const HOUR_SHAPE_DC = [
  0.00, 0.00, 0.00, 0.00, 0.00, 0.00,   // HE01–06 deep overnight
  0.10, 0.24, 0.50, 0.80, 0.93, 1.00,   // HE07–12 morning ramp
  0.96, 0.88, 0.82, 0.88, 0.95, 0.84,   // HE13–18 daytime plateau
  0.63, 0.43, 0.28, 0.17, 0.07, 0.01,   // HE19–24 evening decline
];

// Industrial: strong production-hours peak, negligible overnight
const HOUR_SHAPE_IND = [
  0.00, 0.00, 0.00, 0.00, 0.00, 0.06,   // HE01–06
  0.34, 0.87, 1.00, 0.96, 0.91, 0.86,   // HE07–12 production ramp
  0.82, 0.88, 0.93, 0.89, 0.71, 0.44,   // HE13–18 afternoon plateau / shift end
  0.21, 0.08, 0.02, 0.00, 0.00, 0.00,   // HE19–24
];

// Hyperscale: very flat, slight IT workload diurnal variation
const HOUR_SHAPE_HP = [
  0.03, 0.02, 0.01, 0.00, 0.00, 0.01,   // HE01–06
  0.07, 0.21, 0.46, 0.74, 0.91, 1.00,   // HE07–12
  0.96, 0.90, 0.85, 0.91, 0.99, 0.91,   // HE13–18
  0.71, 0.51, 0.35, 0.25, 0.15, 0.05,   // HE19–24
];

// ─── Month factors (1.0 = nominal; >1 = cooling season uplift) ──────────────

//                          J     F     M     A     M     J     J     A     S     O     N     D
const MONTH_DC =  [0.92, 0.88, 0.92, 0.95, 0.98, 1.07, 1.18, 1.13, 1.02, 0.96, 0.93, 0.95];
const MONTH_IND = [0.93, 0.88, 0.95, 1.01, 1.06, 1.02, 0.97, 1.00, 1.03, 1.05, 1.00, 0.89];
const MONTH_HP =  [0.91, 0.87, 0.91, 0.94, 0.97, 1.09, 1.21, 1.16, 1.04, 0.95, 0.91, 0.94];

const HOURS_IN_MONTH = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744];

function r1(n: number) { return Math.round(n * 10) / 10; }

function buildProfile(
  siteKey: string,
  name: string,
  location: string,
  settlementZone: string,
  capacityMw: number,
  baseloadMw: number,
  hourShape: number[],
  monthFactor: number[],
): SiteLoadProfile {
  const peakRange = capacityMw - baseloadMw;
  const loadShape: LoadShapePoint[] = [];

  for (let month = 1; month <= 12; month++) {
    const mf = monthFactor[month - 1];
    for (let hour = 0; hour < 24; hour++) {
      const rawPeak = hourShape[hour] * peakRange * mf;
      const peakMw = r1(Math.min(peakRange, rawPeak));
      loadShape.push({ hour, month, totalMw: r1(baseloadMw + peakMw), baseloadMw, peakMw });
    }
  }

  // "Peak Demand" by convention here is the SWING RANGE above the baseload
  // floor — i.e. capacity headroom available for production-driven peaks.
  // (Some systems report peak as max(totalMw); we report the above-baseload
  // portion so the KPI strip and capacity-utilization bar add up cleanly.)
  const peakDemandMw = capacityMw - baseloadMw;
  const averageMw = r1(loadShape.reduce((s, p) => s + p.totalMw, 0) / loadShape.length);
  const loadFactorPct = Math.round((averageMw / capacityMw) * 100);

  return { siteKey, name, location, settlementZone, capacityMw, baseloadMw, peakDemandMw, averageMw, loadFactorPct, loadShape };
}

// ─── Exported profiles ────────────────────────────────────────────────────────

// Documented capacity expansions per site. Sparse — only years where the
// nameplate steps up are recorded; intermediate years inherit the prior step.
// (Ashburn: phased data-center build-out. Sterling: hyperscale ramp.
// Manassas industrial load is mature — no documented expansion.)
const CAPACITY_BY_YEAR: Record<string, Record<number, number>> = {
  'ashburn-dc': {
    2026: 50,   // current contracted ceiling
    2027: 65,   // Phase II expansion
    2028: 80,   // Phase III expansion
  },
  'sterling-hyperscale': {
    2026: 75,
    2028: 100,  // hyperscale build-out completes
  },
};

// Documented mid-period load step-changes. Each entry is a multiplicative
// bump applied from its effective month onward and compounding with later
// entries. Manassas adds a +25% bump in mid-2027 representing a new tenant
// that comes online July 1.
const LOAD_ADJUSTMENTS: Record<string, LoadAdjustment[]> = {
  'manassas-industrial': [
    { effectiveYear: 2027, effectiveMonth: 7, pctChange: 0.25, reason: 'New tenant: industrial cold-storage line goes live Jul 2027' },
  ],
};

export const LOAD_PROFILES: SiteLoadProfile[] = [
  buildProfile('ashburn-dc',          'Ashburn Data Center',    'Ashburn, VA',  'DOM', 50, 40, HOUR_SHAPE_DC,  MONTH_DC),
  buildProfile('manassas-industrial', 'Manassas Industrial',    'Manassas, VA', 'DOM', 30, 15, HOUR_SHAPE_IND, MONTH_IND),
  buildProfile('sterling-hyperscale', 'Sterling Hyperscale DC', 'Sterling, VA', 'DOM', 75, 62, HOUR_SHAPE_HP,  MONTH_HP),
].map((p) => ({
  ...p,
  capacityByYear: CAPACITY_BY_YEAR[p.siteKey],
  loadAdjustments: LOAD_ADJUSTMENTS[p.siteKey],
}));

export const LOAD_PROFILE_MAP = Object.fromEntries(LOAD_PROFILES.map((p) => [p.siteKey, p]));

// ─── Aggregation helpers ──────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function aggregateProfiles(profiles: SiteLoadProfile[]): SiteLoadProfile {
  if (profiles.length === 1) return profiles[0];
  const totalCapacity = profiles.reduce((s, p) => s + p.capacityMw, 0);
  const totalBaseload = profiles.reduce((s, p) => s + p.baseloadMw, 0);
  const loadShape: LoadShapePoint[] = [];
  for (let month = 1; month <= 12; month++) {
    for (let hour = 0; hour < 24; hour++) {
      const totalMw = r1(profiles.reduce((s, p) => {
        const pt = p.loadShape.find((x) => x.month === month && x.hour === hour);
        return s + (pt?.totalMw ?? 0);
      }, 0));
      const peakMw = r1(Math.max(0, totalMw - totalBaseload));
      loadShape.push({ hour, month, totalMw, baseloadMw: totalBaseload, peakMw });
    }
  }
  // Aggregate peak demand mirrors the per-site convention — swing range above
  // the combined baseload, not the maximum total load.
  const peakDemandMw = totalCapacity - totalBaseload;
  const averageMw = r1(loadShape.reduce((s, p) => s + p.totalMw, 0) / loadShape.length);
  // Derive labels from the input profiles instead of hard-coding.
  // For zone: collapse to a single zone if uniform, else "DOM + AEP" or "Mixed (N)".
  // For location: show only the unique state(s) — cities aren't useful for an aggregate.
  const uniqueZones = Array.from(new Set(profiles.map((p) => p.settlementZone)));
  const zoneLabel =
    uniqueZones.length === 1 ? uniqueZones[0] :
    uniqueZones.length <= 2 ? uniqueZones.join(' + ') :
    `Mixed (${uniqueZones.length} zones)`;

  const uniqueStates = Array.from(new Set(
    profiles.map((p) => {
      const parts = p.location.split(',').map((s) => s.trim());
      return parts[parts.length - 1] || p.location;
    }),
  ));
  const stateLabel =
    uniqueStates.length === 1 ? uniqueStates[0] :
    uniqueStates.length <= 2 ? uniqueStates.join(' + ') :
    `${uniqueStates.length} states`;

  // Merge per-year capacity maps across the constituent sites. For every year
  // any site has documented, sum each site's resolved capacity for that year
  // (sites with no documentation contribute their static `capacityMw`).
  let mergedCapacityByYear: Record<number, number> | undefined;
  const documentedYears = new Set<number>();
  for (const p of profiles) {
    if (p.capacityByYear) {
      for (const y of Object.keys(p.capacityByYear)) documentedYears.add(Number(y));
    }
  }
  if (documentedYears.size > 0) {
    mergedCapacityByYear = {};
    for (const year of documentedYears) {
      mergedCapacityByYear[year] = profiles.reduce(
        (s, p) => s + getSiteCapacityForYear(p, year),
        0,
      );
    }
  }

  return {
    siteKey: 'aggregate',
    name: `${profiles.length} Sites`,
    location: stateLabel,
    settlementZone: zoneLabel,
    capacityMw: totalCapacity,
    baseloadMw: totalBaseload,
    peakDemandMw,
    averageMw,
    loadFactorPct: Math.round((averageMw / totalCapacity) * 100),
    loadShape,
    capacityByYear: mergedCapacityByYear,
    constituentSiteKeys: profiles.map((p) => p.siteKey),
  };
}

/** Effective load at a specific (hour, month, year) — applies any documented
 *  multiplier. For aggregate profiles, sums per-constituent contributions
 *  with each site's own multiplier (so a +25% bump on Manassas only inflates
 *  Manassas's slice, not the whole aggregate). */
export function getEffectiveLoadAt(
  profile: SiteLoadProfile,
  hour: number,
  month: number,
  year: number,
): { totalMw: number; baseloadMw: number; peakMw: number } {
  // Aggregate path — re-sum constituents under their own per-site multipliers.
  if (profile.constituentSiteKeys && profile.constituentSiteKeys.length > 0) {
    let total = 0;
    let base = 0;
    for (const key of profile.constituentSiteKeys) {
      const sub = LOAD_PROFILE_MAP[key];
      if (!sub) continue;
      const pt = sub.loadShape.find((p) => p.hour === hour && p.month === month);
      if (!pt) continue;
      const mult = getLoadMultiplierForYearMonth(sub, year, month);
      total += pt.totalMw * mult;
      base += pt.baseloadMw * mult;
    }
    return { totalMw: total, baseloadMw: base, peakMw: Math.max(0, total - base) };
  }
  // Single-site path
  const pt = profile.loadShape.find((p) => p.hour === hour && p.month === month);
  if (!pt) return { totalMw: 0, baseloadMw: 0, peakMw: 0 };
  const mult = getLoadMultiplierForYearMonth(profile, year, month);
  return {
    totalMw: pt.totalMw * mult,
    baseloadMw: pt.baseloadMw * mult,
    peakMw: pt.peakMw * mult,
  };
}

/** Annual MWh for a given calendar year — applies any documented load
 *  adjustments and (for aggregates) re-aggregates per-constituent. */
export function getEffectiveAnnualLoadMwh(
  profile: SiteLoadProfile, year: number,
): number {
  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    let dayMwh = 0;
    for (let h = 0; h < 24; h++) {
      const eff = getEffectiveLoadAt(profile, h, m, year);
      dayMwh += eff.totalMw;
    }
    total += dayMwh * DAYS_PER_MONTH[m - 1];
  }
  return total;
}

/** Scope-averaged annual MWh — averages `getEffectiveAnnualLoadMwh` across
 *  every year in the scope, so mid-year load bumps surface as proportional
 *  increases in the figure. */
export function getScopeAvgAnnualLoadMwh(
  profile: SiteLoadProfile, startYear: number, endYear: number,
): number {
  if (endYear < startYear) return 0;
  const n = endYear - startYear + 1;
  let total = 0;
  for (let y = startYear; y <= endYear; y++) total += getEffectiveAnnualLoadMwh(profile, y);
  return total / n;
}

/** Returns true if any documented load adjustment exists for this profile
 *  (or any of its constituents, for aggregates). */
export function hasLoadAdjustments(profile: SiteLoadProfile): boolean {
  if (profile.loadAdjustments && profile.loadAdjustments.length > 0) return true;
  if (profile.constituentSiteKeys) {
    for (const k of profile.constituentSiteKeys) {
      const sub = LOAD_PROFILE_MAP[k];
      if (sub?.loadAdjustments && sub.loadAdjustments.length > 0) return true;
    }
  }
  return false;
}

export function getMonthlyAggregates(profile: SiteLoadProfile) {
  return MONTH_LABELS.map((label, mi) => {
    const month = mi + 1;
    const hours = HOURS_IN_MONTH[mi];
    const hoursPerDay = 24;
    const days = hours / hoursPerDay;
    // Sum one representative day's hourly shape, scale to month
    const dayShape = profile.loadShape.filter((p) => p.month === month);
    const totalMwh = r1(dayShape.reduce((s, p) => s + p.totalMw, 0) * days);
    const baseloadMwh = r1(profile.baseloadMw * hours);
    const peakMwh = r1(totalMwh - baseloadMwh);
    const capacityMwh = r1(profile.capacityMw * hours);
    return { label, month, totalMwh, baseloadMwh, peakMwh, capacityMwh };
  });
}
