// PJM LMP simulation: Western Hub vs DOM Bus (Dominion Virginia / NoVA load zone)
// Historical actuals: Jan–Apr 2026 | Forward projections: May 2026–Dec 2030
//
// Basis = DOM Bus LMP − Western Hub LMP  (positive → buyer pays congestion premium)
// NoVA data-center demand keeps DOM-WH basis structurally positive year-round,
// with strong summer congestion and rare reverse-flow months.
// On-peak:  HE 8–23 Mon–Fri (16 hrs/day, ~250 weekdays)
// Off-peak: HE 1–7 & HE 24 Mon–Fri + all Sat/Sun hours
// Energy escalation: 2.5%/yr | Congestion growth: +$0.15/MWh/yr in constrained months
//
// P10 = favorable scenario (low/reversed congestion)
// P50 = base case (normalized forward curve)
// P90 = stress scenario (widening basis, heat/cold events)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HalfPeriodData {
  whAvg: number;            // Western Hub avg $/MWh (P50 energy)
  zoneP50: number;          // Zone (DOM) Bus avg $/MWh at P50
  basisP10: number;         // Favorable: low/negative congestion $/MWh
  basisP50: number;         // Base case avg $/MWh
  basisP90: number;         // Stress: 90th-pct congestion event $/MWh
  pctPositiveBasis: number; // % of hours where DOM > WH (P50)
  pctBasisGt2: number;      // % of hours where basis > $2/MWh
}

export interface PeriodLMP {
  year: number;
  month: number;         // 1–12
  label: string;         // "Jan 2026"
  isHistorical: boolean;
  onPeak: HalfPeriodData;
  offPeak: HalfPeriodData;
}

export type UnhedgedContract = 'da-float' | 'utility-tariff';

export interface SiteProfile {
  key: string;
  name: string;
  location: string;
  settlementZone: string;
  capacityMw: number;
  loadFactorPct: number;
  annualLoadMwh: number;
  monthlyLoadMwh: number[];        // index 0 = Jan … 11 = Dec
  hedgePctOnPeak: number;          // % of on-peak load hedged at WH via FLD
  hedgePctOffPeak: number;         // % of off-peak load hedged at WH via FLD
  unhedgedContract: UnhedgedContract;
  utilityTariffPerMwh: number;     // reference retail energy rate $/MWh
  ppaContractPricePerMwh: number;  // FLD strike at Western Hub $/MWh
}

export interface RiskBand {
  p10: number;  // USD — favorable scenario
  p50: number;  // USD — base case
  p90: number;  // USD — stress scenario
}

export interface SiteRiskSummary {
  siteKey: string;
  baselineCostUsd: number;       // Annual energy cost without PPA (utility tariff P50)
  totalDeliveredCost: RiskBand;  // Annual energy cost with proposed PPA
  basePriceRisk: RiskBand;       // totalDelivered − baseline (negative = savings)
  basisRisk: RiskBand;           // Cost of AEP/WH spread on hedged volume
  unhedgedShapeRisk: RiskBand;   // Spot/tariff cost on unhedged portion
  esgComplianceRisk: RiskBand;   // REC shortfall procurement cost
}

// ─── LMP seasonal base arrays (2026, index 0 = Jan) ─────────────────────────

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BASE_WH_ON  = [48, 47, 35, 33, 40, 52, 65, 62, 45, 34, 38, 50];
const BASE_WH_OFF = [31, 30, 23, 22, 27, 35, 43, 41, 30, 23, 25, 33];

// P50 basis (DOM − WH) — NoVA data-center load drives persistent positive basis,
// strongest in summer, with rare shoulder-month reverse flow.
const BASE_B50_ON  = [ 4.5,  5.2,  2.0,  1.5,  3.5,  7.5, 12.0, 11.0,  6.0,  2.0,  3.0,  4.5];
const BASE_B50_OFF = [ 1.8,  2.0,  0.5,  0.3,  1.2,  2.8,  4.5,  4.0,  2.0,  0.5,  0.8,  1.8];

// P10 basis — favorable (mild weather, slack data-center load growth)
const BASE_B10_ON  = [ 1.5,  2.0, -0.5, -0.5,  1.0,  4.0,  7.0,  6.0,  2.5, -0.3,  0.8,  1.5];
const BASE_B10_OFF = [ 0.0,  0.3, -1.0, -1.2,  0.0,  1.2,  2.5,  2.2,  0.5, -1.0, -0.3,  0.3];

// P90 basis — stress (heat waves, transmission constraints into NoVA)
const BASE_B90_ON  = [14.0, 16.0,  7.0,  5.5, 11.0, 22.0, 32.0, 30.0, 16.0,  6.0,  9.0, 14.0];
const BASE_B90_OFF = [ 5.5,  6.5,  3.0,  2.5,  4.5,  9.0, 14.0, 13.0,  6.5,  2.5,  3.5,  5.5];

const BASE_PCT_POS_ON  = [70, 72, 55, 50, 65, 80, 88, 86, 75, 52, 60, 70];
const BASE_PCT_POS_OFF = [60, 62, 48, 45, 55, 68, 75, 73, 62, 46, 52, 60];
const BASE_GT2_ON      = [50, 55, 28, 22, 42, 65, 78, 75, 55, 22, 35, 48];
const BASE_GT2_OFF     = [25, 28, 12, 10, 18, 35, 50, 45, 25, 10, 14, 22];

// ─── Historical actuals Jan–Apr 2026 ─────────────────────────────────────────
// P10/P50/P90 represent the intra-month hourly distribution (not forecast uncertainty)

const HISTORICAL: Record<string, { op: HalfPeriodData; ofp: HalfPeriodData }> = {
  '2026-1': {
    op:  { whAvg: 49.2, zoneP50: 54.0, basisP10:  1.6, basisP50:  4.8, basisP90: 14.0, pctPositiveBasis: 70, pctBasisGt2: 50 },
    ofp: { whAvg: 32.1, zoneP50: 34.1, basisP10:  0.0, basisP50:  2.0, basisP90:  5.6, pctPositiveBasis: 60, pctBasisGt2: 26 },
  },
  '2026-2': {
    op:  { whAvg: 51.4, zoneP50: 56.9, basisP10:  2.0, basisP50:  5.5, basisP90: 16.5, pctPositiveBasis: 73, pctBasisGt2: 56 },
    ofp: { whAvg: 34.8, zoneP50: 37.2, basisP10:  0.4, basisP50:  2.4, basisP90:  6.5, pctPositiveBasis: 62, pctBasisGt2: 28 },
  },
  '2026-3': {
    op:  { whAvg: 34.1, zoneP50: 35.9, basisP10: -0.4, basisP50:  1.8, basisP90:  6.5, pctPositiveBasis: 53, pctBasisGt2: 25 },
    ofp: { whAvg: 22.8, zoneP50: 23.3, basisP10: -1.0, basisP50:  0.5, basisP90:  2.8, pctPositiveBasis: 47, pctBasisGt2: 11 },
  },
  '2026-4': {
    op:  { whAvg: 31.8, zoneP50: 33.2, basisP10: -0.6, basisP50:  1.4, basisP90:  5.0, pctPositiveBasis: 49, pctBasisGt2: 21 },
    ofp: { whAvg: 21.4, zoneP50: 21.8, basisP10: -1.2, basisP50:  0.4, basisP90:  2.2, pctPositiveBasis: 44, pctBasisGt2:  9 },
  },
};

// ─── Date boundaries ─────────────────────────────────────────────────────────
// Historical range: Jan 2020 – Apr 2026 (actuals)
// Current month:   May 2026
// Forward range:   Jun 2026 onward (projections)

export const LMP_HISTORY_START = { year: 2020, month: 1 };
export const LMP_CURRENT       = { year: 2026, month: 5 };  // update monthly
export const LMP_FORWARD_START = { year: 2026, month: 6 };

export type LmpPeriodType = 'historical' | 'current' | 'forward';

export function getLmpPeriodType(year: number, month: number): LmpPeriodType {
  if (year < LMP_CURRENT.year || (year === LMP_CURRENT.year && month < LMP_CURRENT.month)) return 'historical';
  if (year === LMP_CURRENT.year && month === LMP_CURRENT.month) return 'current';
  return 'forward';
}

// ─── Period builder ───────────────────────────────────────────────────────────

function r2(n: number) { return parseFloat(n.toFixed(2)); }
function r1(n: number) { return parseFloat(n.toFixed(1)); }

function buildPeriod(year: number, month: number): PeriodLMP {
  const m   = month - 1;
  const esc = Math.pow(1.025, year - 2026);   // de-escalates for years < 2026
  const cong = Math.max(0, (year - 2026) * 0.15);

  const key = `${year}-${month}`;
  if (year === 2026 && month <= 4 && HISTORICAL[key]) {
    const h = HISTORICAL[key];
    return { year, month, label: `${MONTH_LABELS[m]} ${year}`, isHistorical: true, onPeak: h.op, offPeak: h.ofp };
  }

  const isHistorical = getLmpPeriodType(year, month) === 'historical';
  const whOn  = r2(BASE_WH_ON[m]  * esc);
  const whOff = r2(BASE_WH_OFF[m] * esc);
  const b50On  = r2(BASE_B50_ON[m]  + (BASE_B50_ON[m]  > 0 ? cong        : 0));
  const b50Off = r2(BASE_B50_OFF[m] + (BASE_B50_OFF[m] > 0 ? cong * 0.4  : 0));
  const b10On  = r2(BASE_B10_ON[m]  + (BASE_B10_ON[m]  > 0 ? cong * 0.3  : 0));
  const b10Off = r2(BASE_B10_OFF[m] + (BASE_B10_OFF[m] > 0 ? cong * 0.15 : 0));
  const b90On  = r1(BASE_B90_ON[m]  + cong * 1.1);
  const b90Off = r1(BASE_B90_OFF[m] + cong * 0.5);

  return {
    year, month,
    label: `${MONTH_LABELS[m]} ${year}`,
    isHistorical,
    onPeak: {
      whAvg: whOn, zoneP50: r2(whOn + b50On),
      basisP10: b10On, basisP50: b50On, basisP90: b90On,
      pctPositiveBasis: Math.min(90, BASE_PCT_POS_ON[m] + Math.round(cong * 2)),
      pctBasisGt2:      Math.min(80, BASE_GT2_ON[m]     + Math.round(cong * 3)),
    },
    offPeak: {
      whAvg: whOff, zoneP50: r2(whOff + b50Off),
      basisP10: b10Off, basisP50: b50Off, basisP90: b90Off,
      pctPositiveBasis: Math.min(78, BASE_PCT_POS_OFF[m] + Math.round(cong)),
      pctBasisGt2:      Math.min(65, BASE_GT2_OFF[m]     + Math.round(cong * 2)),
    },
  };
}

function buildPeriods(fromYear: number, fromMonth: number, toYear: number, toMonth: number): PeriodLMP[] {
  const periods: PeriodLMP[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const mStart = y === fromYear ? fromMonth : 1;
    const mEnd   = y === toYear   ? toMonth   : 12;
    for (let mo = mStart; mo <= mEnd; mo++) periods.push(buildPeriod(y, mo));
  }
  return periods;
}

/** Full historical + current + forward range: Jan 2020 – Dec 2030 */
export const LMP_PERIODS_ALL: PeriodLMP[] = buildPeriods(2020, 1, 2030, 12);

/** Legacy export — 2026–2030 only (kept for Planning page compatibility) */
export const LMP_PERIODS: PeriodLMP[] = buildPeriods(2026, 1, 2030, 12);

// ─── DOM-zone site profiles ───────────────────────────────────────────────────
// Capacity, baseload, load factor, monthly MWh, and annual MWh all derive
// from the canonical hourly shapes in `loadProfile.ts` so the Risk page and
// the Plan page agree on the load denominator. Only the lmp-specific
// financial fields (hedge %, tariff, PPA strike, settlement contract type)
// are kept here.

import { LOAD_PROFILES, getMonthlyAggregates } from './loadProfile';
import { getDerivedHedgePcts } from './linkedContracts';

interface SiteFinancials {
  unhedgedContract: UnhedgedContract;
  utilityTariffPerMwh: number;
  ppaContractPricePerMwh: number;
}

// Per-site lmp-only fields (hedge percentages now derive from LINKED_CONTRACTS).
const SITE_FINANCIALS: Record<string, SiteFinancials> = {
  'ashburn-dc':          { unhedgedContract: 'da-float',       utilityTariffPerMwh: 65, ppaContractPricePerMwh: 58 },
  'manassas-industrial': { unhedgedContract: 'da-float',       utilityTariffPerMwh: 62, ppaContractPricePerMwh: 58 },
  'sterling-hyperscale': { unhedgedContract: 'utility-tariff', utilityTariffPerMwh: 67, ppaContractPricePerMwh: 58 },
};

// Cache the derived per-site annual + hedge pcts so SITE_RISK can reuse them.
interface SiteDerived {
  annualLoadMwh: number;
  monthlyLoadMwh: number[];
  hedgePctOnPeak: number;
  hedgePctOffPeak: number;
}
const SITE_DERIVED: Record<string, SiteDerived> = {};

export const SITE_PROFILES: SiteProfile[] = LOAD_PROFILES.map((lp) => {
  const monthly = getMonthlyAggregates(lp);
  const monthlyLoadMwh = monthly.map((m) => Math.round(m.totalMwh));
  const annualLoadMwh  = monthlyLoadMwh.reduce((s, v) => s + v, 0);
  const { onPeak, offPeak } = getDerivedHedgePcts(lp.siteKey);
  SITE_DERIVED[lp.siteKey] = { annualLoadMwh, monthlyLoadMwh, hedgePctOnPeak: onPeak, hedgePctOffPeak: offPeak };
  const fin = SITE_FINANCIALS[lp.siteKey] ?? { unhedgedContract: 'da-float' as const, utilityTariffPerMwh: 0, ppaContractPricePerMwh: 0 };
  return {
    key: lp.siteKey,
    name: lp.name,
    location: lp.location,
    settlementZone: lp.settlementZone,
    capacityMw: lp.capacityMw,
    loadFactorPct: lp.loadFactorPct,
    annualLoadMwh,
    monthlyLoadMwh,
    hedgePctOnPeak: onPeak,
    hedgePctOffPeak: offPeak,
    ...fin,
  };
});

// ─── Before & After risk summary (annual forward, per site) ──────────────────
// All values in USD. Positive = cost to buyer; negative = savings vs baseline.
// Computed for the near-term forward period (2026–2027 blended).
//
// Basis risk:   hedged MWh × basis scenario $/MWh
// Shape risk:   unhedged MWh × (spot or tariff premium over PPA)
// ESG risk:     estimated REC shortfall × market REC price ($10–$20/MWh)

// Annual-mean basis $/MWh — load-tier averages of the BASE_B* arrays above.
const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
const ANNUAL_BASIS = {
  on:  { p10: avg(BASE_B10_ON),  p50: avg(BASE_B50_ON),  p90: avg(BASE_B90_ON)  },
  off: { p10: avg(BASE_B10_OFF), p50: avg(BASE_B50_OFF), p90: avg(BASE_B90_OFF) },
};

// Implied $/MWh shape premium on the unhedged portion (back-derived from the
// previous static SITE_RISK numbers; same scenario across all DOM sites until
// site-specific premiums are introduced).
const SHAPE_PREMIUM = { p10: 2.8, p50: 7.5, p90: 21.0 };

// On-peak / off-peak hour fractions (PJM convention: 16/24 vs 8/24 ≈ 45% / 55%
// once you account for weekday weighting).
const ON_PEAK_FRACTION  = 0.45;
const OFF_PEAK_FRACTION = 0.55;

// Per-site fixed scenario components that don't directly track hedge %.
const SITE_FIXED_RISK: Record<string, {
  baselineCostUsd: number;
  totalDeliveredCost: RiskBand;
  basePriceRisk: RiskBand;
  esgComplianceRisk: RiskBand;
}> = {
  'ashburn-dc': {
    baselineCostUsd: 26_185_000,
    totalDeliveredCost: { p10: 20_500_000, p50: 22_700_000, p90: 25_800_000 },
    basePriceRisk:      { p10: -5_685_000, p50: -3_485_000, p90:   -385_000 },
    esgComplianceRisk:  { p10:          0, p50:    150_000, p90:    450_000 },
  },
  'manassas-industrial': {
    baselineCostUsd: 12_447_000,
    totalDeliveredCost: { p10:  9_800_000, p50: 11_200_000, p90: 13_100_000 },
    basePriceRisk:      { p10: -2_647_000, p50: -1_247_000, p90:    653_000 },
    esgComplianceRisk:  { p10:          0, p50:     80_000, p90:    250_000 },
  },
  'sterling-hyperscale': {
    baselineCostUsd: 39_431_000,
    totalDeliveredCost: { p10: 29_800_000, p50: 33_500_000, p90: 38_900_000 },
    basePriceRisk:      { p10: -9_631_000, p50: -5_931_000, p90:   -531_000 },
    esgComplianceRisk:  { p10:          0, p50:    220_000, p90:    650_000 },
  },
};

export const SITE_RISK: SiteRiskSummary[] = LOAD_PROFILES.map((lp) => {
  const der = SITE_DERIVED[lp.siteKey];
  const fixed = SITE_FIXED_RISK[lp.siteKey] ?? {
    baselineCostUsd: 0,
    totalDeliveredCost: { p10: 0, p50: 0, p90: 0 },
    basePriceRisk:      { p10: 0, p50: 0, p90: 0 },
    esgComplianceRisk:  { p10: 0, p50: 0, p90: 0 },
  };

  const onLoadMwh  = der.annualLoadMwh * ON_PEAK_FRACTION;
  const offLoadMwh = der.annualLoadMwh * OFF_PEAK_FRACTION;

  const onHedged   = onLoadMwh  * (der.hedgePctOnPeak  / 100);
  const offHedged  = offLoadMwh * (der.hedgePctOffPeak / 100);

  // Hedge can exceed 100% (over-hedge); unhedged MWh cannot go below 0.
  const onUnhedged  = Math.max(0, onLoadMwh  - onHedged);
  const offUnhedged = Math.max(0, offLoadMwh - offHedged);
  const totalUnhedged = onUnhedged + offUnhedged;

  // Basis cost = hedged MWh × annual mean basis $/MWh, split by tier.
  const basisRisk: RiskBand = {
    p10: Math.round(onHedged * ANNUAL_BASIS.on.p10 + offHedged * ANNUAL_BASIS.off.p10),
    p50: Math.round(onHedged * ANNUAL_BASIS.on.p50 + offHedged * ANNUAL_BASIS.off.p50),
    p90: Math.round(onHedged * ANNUAL_BASIS.on.p90 + offHedged * ANNUAL_BASIS.off.p90),
  };

  // Shape cost = unhedged MWh × scenario premium $/MWh.
  const unhedgedShapeRisk: RiskBand = {
    p10: Math.round(totalUnhedged * SHAPE_PREMIUM.p10),
    p50: Math.round(totalUnhedged * SHAPE_PREMIUM.p50),
    p90: Math.round(totalUnhedged * SHAPE_PREMIUM.p90),
  };

  return {
    siteKey: lp.siteKey,
    baselineCostUsd: fixed.baselineCostUsd,
    totalDeliveredCost: fixed.totalDeliveredCost,
    basePriceRisk: fixed.basePriceRisk,
    basisRisk,
    unhedgedShapeRisk,
    esgComplianceRisk: fixed.esgComplianceRisk,
  };
});

// ─── Zone basis offsets ───────────────────────────────────────────────────────
// Historical avg $/MWh differential vs PJM system price (+ = more expensive).
// Derived from PJM published zonal LMP historical averages.
export const PJM_ZONE_BASIS: Record<string, number> = {
  AECO:    +2.8,
  AEP:     -1.2,
  APS:     -0.8,
  BGE:     +1.5,
  COMED:   -2.1,
  DAY:     -1.8,
  DEOK:    -1.5,
  DOM:     +0.6,
  DPL:     +2.1,
  DUQ:     -0.5,
  EKPC:    -2.4,
  'FE-ATSI': -1.0,
  JCPL:    +3.2,
  LGE:     -2.2,
  METED:   +1.8,
  PECO:    +2.5,
  PENELEC: +0.9,
  PEPCO:   +1.2,
  PPL:     +1.4,
  PSEG:    +3.8,
  RECO:    +4.1,
  UGI:     +1.0,
};

// Zone-level congestion spread (±$/MWh max intra-zone variance).
// High-congestion eastern zones have wider node-to-node spread.
export const PJM_ZONE_SPREAD: Record<string, number> = {
  AECO:    4.5,
  AEP:     3.0,
  APS:     3.5,
  BGE:     4.0,
  COMED:   3.2,
  DAY:     2.8,
  DEOK:    2.5,
  DOM:     4.2,
  DPL:     4.8,
  DUQ:     3.1,
  EKPC:    2.2,
  'FE-ATSI': 3.8,
  JCPL:    6.5,
  LGE:     2.4,
  METED:   4.0,
  PECO:    5.5,
  PENELEC: 3.6,
  PEPCO:   4.2,
  PPL:     4.4,
  PSEG:    7.2,
  RECO:    5.8,
  UGI:     3.0,
};

// Seasonal spread multiplier — peak months have wider congestion variance.
const SEASONAL_MULT = [0.9, 0.85, 0.8, 0.85, 1.0, 1.2, 1.4, 1.35, 1.1, 0.85, 0.9, 1.0];

/**
 * Build a synthetic LmpMap for months without DB data.
 * Uses the system avg from LMP_PERIODS_ALL + zone basis offsets +
 * zone-specific spread scaled by seasonal congestion multiplier.
 */
export function buildSimulatedLmpMap(
  year: number,
  month: number,
  pnodesByZone: Record<string, number[]>,
): Map<number, number> {
  const period = LMP_PERIODS_ALL.find((p) => p.year === year && p.month === month);
  const sysAvg = period ? (period.onPeak.whAvg + period.offPeak.whAvg) / 2 : 45;
  const seasonal = SEASONAL_MULT[month - 1];
  const result = new Map<number, number>();
  for (const [zone, pnodeIds] of Object.entries(pnodesByZone)) {
    const basis  = PJM_ZONE_BASIS[zone] ?? 0;
    const spread = (PJM_ZONE_SPREAD[zone] ?? 3.0) * seasonal;
    const zoneAvg = sysAvg + basis;
    pnodeIds.forEach((pid, idx) => {
      // Deterministic noise scaled to zone spread: maps pid hash → [-1, +1] range
      const t = ((pid * 2654435761 + idx * 40503) >>> 0) / 0xFFFFFFFF; // 0..1
      const noise = (t * 2 - 1) * spread;                               // -spread..+spread
      result.set(pid, parseFloat((zoneAvg + noise).toFixed(2)));
    });
  }
  return result;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getLMP(year: number, month: number): PeriodLMP | undefined {
  return LMP_PERIODS.find((p) => p.year === year && p.month === month);
}

export function getSiteProfile(key: string): SiteProfile | undefined {
  return SITE_PROFILES.find((s) => s.key === key);
}

export function getSiteRisk(key: string): SiteRiskSummary | undefined {
  return SITE_RISK.find((r) => r.siteKey === key);
}

// Annual weighted-average basis summary for a given year and site hedge fraction
export function getAnnualBasisSummary(year: number) {
  const months = LMP_PERIODS.filter((p) => p.year === year);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    year,
    onPeakBasis:  { p10: r2(avg(months.map((p) => p.onPeak.basisP10))),  p50: r2(avg(months.map((p) => p.onPeak.basisP50))),  p90: r2(avg(months.map((p) => p.onPeak.basisP90)))  },
    offPeakBasis: { p10: r2(avg(months.map((p) => p.offPeak.basisP10))), p50: r2(avg(months.map((p) => p.offPeak.basisP50))), p90: r2(avg(months.map((p) => p.offPeak.basisP90))) },
    peakBasisMonth: months.reduce((a, b) => a.onPeak.basisP50 > b.onPeak.basisP50 ? a : b).label,
  };
}
