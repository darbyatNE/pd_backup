import { useState } from 'react';
import {
  LMP_PERIODS,
  SITE_PROFILES,
  SITE_RISK,
  type RiskBand,
  type SiteRiskSummary,
  type SiteProfile,
} from '../data/lmpData';
import { LOAD_PROFILES, LOAD_PROFILE_MAP, getEffectiveAnnualLoadMwh } from '../data/loadProfile';
import { useScopeContext } from '../contexts/ScopeContext';
import { useDashboardView } from '../contexts/DashboardViewContext';
import { CapacityRollup } from '../components/CapacitySettlement';
import ModuleHandoffDialog from '../components/ModuleHandoffDialog';
import { 
  getContractAnnualMwhForYear,
  getHedgesForSite,
  SITE_FACILITIES,
} from '../data/linkedContracts';
import PageNav from '../components/PageNav';

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtM(usd: number): string {
  const absM = Math.abs(usd) / 1_000_000;
  const sign = usd < 0 ? '-' : '';
  return `${sign}$${absM.toFixed(1)}M`;
}

function fmtBasis(val: number): string {
  const sign = val >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(val).toFixed(2)}`;
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

type BandKey = keyof Pick<
  SiteRiskSummary,
  'totalDeliveredCost' | 'basePriceRisk' | 'basisRisk' | 'unhedgedShapeRisk' | 'esgComplianceRisk'
>;

function sumBand(risks: SiteRiskSummary[], key: BandKey): RiskBand {
  return risks.reduce(
    (acc, r) => ({
      p10: acc.p10 + r[key].p10,
      p50: acc.p50 + r[key].p50,
      p90: acc.p90 + r[key].p90,
    }),
    { p10: 0, p50: 0, p90: 0 }
  );
}

function getSelectedRisks(sites: string[]): SiteRiskSummary[] {
  if (sites.length === SITE_RISK.length) return SITE_RISK;
  return SITE_RISK.filter((r) => sites.includes(r.siteKey));
}

function getSelectedProfiles(sites: string[]): SiteProfile[] {
  if (sites.length === SITE_PROFILES.length) return SITE_PROFILES;
  return SITE_PROFILES.filter((p) => sites.includes(p.key));
}

// ─── Local sub-components ─────────────────────────────────────────────────────

interface CardProps {
  title: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

function SummaryCard({ title, value, sub, highlight }: CardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4 flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <p
        className={`text-2xl font-bold leading-tight ${
          highlight ? 'text-teal-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

interface RiskRowProps {
  label: string;
  sub?: string;
  baseline: string;
  band: RiskBand;
  baselineUsd: number;
  isTotal?: boolean;
  isBasis?: boolean;
  isEsg?: boolean;
}

function riskCellClass(val: number, baseline: number, isTotal: boolean, isBasis: boolean): string {
  if (isTotal) {
    return val < baseline ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold';
  }
  if (isBasis) {
    if (val < 0) return 'text-emerald-600';
    if (val > 1_500_000) return 'text-red-600';
    if (val > 500_000) return 'text-amber-600';
    return 'text-amber-500';
  }
  if (val < 0) return 'text-emerald-600';
  return 'text-red-500';
}

function RiskRow({ label, sub, baseline, band, baselineUsd, isTotal, isBasis, isEsg }: RiskRowProps) {
  const p10Class = isEsg && band.p10 === 0
    ? 'text-emerald-600'
    : isTotal
    ? riskCellClass(band.p10, baselineUsd, true, false)
    : isBasis
    ? riskCellClass(band.p10, baselineUsd, false, true)
    : band.p10 < 0
    ? 'text-emerald-600'
    : 'text-red-500';

  const p50Class = isTotal
    ? riskCellClass(band.p50, baselineUsd, true, false)
    : isBasis
    ? riskCellClass(band.p50, baselineUsd, false, true)
    : band.p50 < 0
    ? 'text-emerald-600'
    : 'text-red-500';

  const p90Class = isTotal
    ? riskCellClass(band.p90, baselineUsd, true, false)
    : isBasis
    ? riskCellClass(band.p90, baselineUsd, false, true)
    : band.p90 < 0
    ? 'text-emerald-600'
    : 'text-red-500';

  return (
    <tr className="border-b border-slate-100">
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 text-right">{baseline}</td>
      <td className={`py-3 px-4 text-sm text-right ${p10Class}`}>{fmtM(band.p10)}</td>
      <td className={`py-3 px-4 text-sm text-right ${p50Class}`}>{fmtM(band.p50)}</td>
      <td className={`py-3 px-4 text-sm text-right ${p90Class}`}>{fmtM(band.p90)}</td>
    </tr>
  );
}

interface HedgeBarProps {
  label: string;
  pct: number;
}

function HedgeBar({ label, pct }: HedgeBarProps) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-teal-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Capacity Risk Tab (lightweight scaffold) ────────────────────────────────
// The decision/options view lives on the Procurement Planning page.
// This tab is reserved for capacity-cost RISK: BRA volatility, P10/P50/P90
// scenarios, and the value of fixed-term lock-in.

function CapacityRiskTab({
  selectedSites,
  endYear,
}: {
  selectedSites: string[];
  endYear: number;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (selectedSites.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
        Select at least one site in the scope bar to review capacity-risk exposure.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dialogOpen && (
        <ModuleHandoffDialog
          kind="capacity-risk"
          onClose={() => setDialogOpen(false)}
          payload={
            <div className="space-y-1">
              <p><span className="text-slate-500">Sites:</span> <span className="font-medium">{selectedSites.length}</span></p>
              <p><span className="text-slate-500">Analysis year:</span> <span className="font-medium">{endYear}</span></p>
            </div>
          }
        />
      )}
      <CapacityRollup selectedSites={selectedSites} endYear={endYear} />

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1">BRA volatility exposure</h3>
        <p className="text-xs text-slate-500 mb-4">
          DOM zone PJM Base Residual Auction has cleared between $34/MW-day (DY 2024/25)
          and $269.92/MW-day (DY 2026/27). Sites on annual pass-through carry that volatility.
        </p>
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center text-xs text-slate-400 mb-4">
          P10 / P50 / P90 capacity-cost band by year — coming once the BRA-forward forecast feed lands.
          Multi-year fixed-term offers (from the Planning · Capacity tab) reduce the P90–P50 spread
          to ~zero in exchange for a small premium over the P50.
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="text-xs font-semibold px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
        >
          Preview capacity-risk forecast module
        </button>
      </div>

      <div className="text-xs text-slate-500 italic">
        For procurement decisions and RFQ solicitation, see <strong>Procurement Planning &rarr; Capacity</strong>.
      </div>
    </div>
  );
}

// ─── RECs Tab (placeholder) ──────────────────────────────────────────────────

function RECsTab({
  selectedSites,
  startYear,
  endYear,
}: {
  selectedSites: string[];
  startYear: number;
  endYear: number;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      {dialogOpen && (
        <ModuleHandoffDialog
          kind="recs"
          onClose={() => setDialogOpen(false)}
          payload={
            <div className="space-y-1">
              <p><span className="text-slate-500">Sites in scope:</span> <span className="font-medium">{selectedSites.length}</span></p>
              <p><span className="text-slate-500">Scope years:</span> <span className="font-medium">{startYear}–{endYear}</span></p>
            </div>
          }
        />
      )}
      <p className="text-sm font-semibold text-slate-700 mb-2">RECs analysis — coming soon</p>
      <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
        Will derive REC procurement targets from each site's <em>REC Coverage Target (%)</em> and
        time-matching requirement, then surface scheme options (REC, AEPS, etc.) and short/long
        positions vs. forecast load.
      </p>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="text-xs font-semibold px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
      >
        Preview REC procurement module
      </button>
    </div>
  );
}

// ─── Transmission & Basis Risk Tab (placeholder) ─────────────────────────────

function TransmissionTab({
  selectedSites,
  startYear,
  endYear,
}: {
  selectedSites: string[];
  startYear: number;
  endYear: number;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      {dialogOpen && (
        <ModuleHandoffDialog
          kind="transmission"
          onClose={() => setDialogOpen(false)}
          payload={
            <div className="space-y-1">
              <p><span className="text-slate-500">Sites in scope:</span> <span className="font-medium">{selectedSites.length}</span></p>
              <p><span className="text-slate-500">Scope years:</span> <span className="font-medium">{startYear}–{endYear}</span></p>
            </div>
          }
        />
      )}
      <p className="text-sm font-semibold text-slate-700 mb-2">Transmission &amp; Basis Risk — coming soon</p>
      <p className="text-xs text-slate-500 max-w-lg mx-auto mb-4">
        Will surface congestion and basis exposure for each site's settlement node, and model
        hedging strategies via <em>Auction Revenue Rights (ARRs)</em>, <em>Financial Transmission
        Rights (FTRs)</em>, and <em>Network Integration Transmission Service (NITS)</em> in PJM.
        Includes historical basis spreads by zone, FTR auction cost vs. hedge value, and
        annual NITS cost allocation by load ratio share.
      </p>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="text-xs font-semibold px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
      >
        Preview transmission risk module
      </button>
    </div>
  );
}

// ─── Main Planning component ──────────────────────────────────────────────────

const ALL_YEARS = [2026, 2027, 2028, 2029, 2030];

export default function Planning() {
  const { selectedSites, startYear, endYear, startMonth, endMonth } = useScopeContext();
  const { subTab: activeTab } = useDashboardView();
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // ── Aggregated data driven by scope ─────────────────────────────────────
  const risks    = getSelectedRisks(selectedSites);
  const profiles = getSelectedProfiles(selectedSites);

  const baselineCostUsd = risks.reduce((sum, r) => sum + r.baselineCostUsd, 0);
  const totalDeliveredCost = sumBand(risks, 'totalDeliveredCost');
  const basePriceRisk = sumBand(risks, 'basePriceRisk');
  const basisRisk = sumBand(risks, 'basisRisk');
  const unhedgedShapeRisk = sumBand(risks, 'unhedgedShapeRisk');
  const esgComplianceRisk = sumBand(risks, 'esgComplianceRisk');

  // ── Year options limited to scope range; clamp selectedYear ─────────────
  const yearOptions = ALL_YEARS.filter((y) => y >= startYear && y <= endYear);
  const activeYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? startYear);

  // Single-year load + contracted MWh, computed for the year the user is
  // currently viewing. Matches the Energy chart's per-year totals so the
  // headline % stays in sync with what the bars are showing. Switching the
  // year selector below updates this card and the chart in lockstep.
  const annualLoadMwh = selectedSites.reduce((sum, key) => {
    const lp = LOAD_PROFILE_MAP[key];
    return lp ? sum + getEffectiveAnnualLoadMwh(lp, activeYear) : sum;
  }, 0);
  
  // Use new facility-aware hedge generation (brownfield/greenfield logic)
  const linkedContracts = selectedSites.flatMap(siteKey => getHedgesForSite(siteKey));
  const totalTransactionMwh = linkedContracts.reduce(
    (s, c) => s + getContractAnnualMwhForYear(c, activeYear),
    0,
  );
  const hedgeCoveragePct = annualLoadMwh > 0
    ? Math.round((totalTransactionMwh / annualLoadMwh) * 100)
    : 0;
  
  // Calculate facility-type-aware hedge percentages
  const siteHedgeData = selectedSites.map(siteKey => {
    const facility = SITE_FACILITIES[siteKey];
    const siteContracts = getHedgesForSite(siteKey);
    const siteHedgeMwh = siteContracts.reduce(
      (s, c) => s + getContractAnnualMwhForYear(c, activeYear),
      0,
    );
    const loadProfile = LOAD_PROFILE_MAP[siteKey];
    const siteLoadMwh = loadProfile ? getEffectiveAnnualLoadMwh(loadProfile, activeYear) : 0;
    
    // Calculate peak/off-peak split based on facility type
    let onPeakPct = 0;
    let offPeakPct = 0;
    
    if (facility && siteLoadMwh > 0) {
      const hedgeRatio = siteHedgeMwh / siteLoadMwh;
      if (facility.facilityType === 'brownfield') {
        // Brownfields: 75-95% on-peak, 95-120% off-peak (may over-hedge)
        onPeakPct = Math.min(100, Math.round(hedgeRatio * 85));
        offPeakPct = Math.min(120, Math.round(hedgeRatio * 110));
      } else {
        // Greenfields: 20-40% hedged across both periods
        onPeakPct = Math.round(hedgeRatio * 30);
        offPeakPct = Math.round(hedgeRatio * 35);
      }
    } else {
      // Fallback to static profile data
      const profile = profiles.find(p => p.key === siteKey);
      onPeakPct = profile?.hedgePctOnPeak ?? 0;
      offPeakPct = profile?.hedgePctOffPeak ?? 0;
    }
    
    return {
      siteKey,
      facilityType: facility?.facilityType ?? 'brownfield',
      onPeakPct,
      offPeakPct,
      hedgeMwh: siteHedgeMwh,
      loadMwh: siteLoadMwh,
    };
  });
  const savings = baselineCostUsd - totalDeliveredCost.p50;
  const savingsPct = baselineCostUsd > 0 ? (savings / baselineCostUsd) * 100 : 0;

  // ── Monthly basis periods — filtered to scope month range when on boundary year
  const monthPeriods = LMP_PERIODS.filter((p) => {
    if (p.year !== activeYear) return false;
    if (p.year === startYear && p.month < startMonth) return false;
    if (p.year === endYear   && p.month > endMonth)   return false;
    return true;
  });

  // ── Basis cell color helpers ──────────────────────────────────────────────
  function basisP10Color(val: number) {
    return val < 0 ? 'text-emerald-600' : 'text-amber-500';
  }
  function basisP50Color(val: number) {
    if (val < 0) return 'text-emerald-600';
    if (val > 2) return 'text-red-500';
    return 'text-amber-500';
  }
  function basisP90Color(val: number) {
    if (val > 5) return 'text-red-700 font-semibold';
    if (val > 2) return 'text-red-500';
    return 'text-amber-500';
  }

  return (
    <div className="space-y-6">

        {/* ── Page header (title left, cross-page links right) ──────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Risk Report</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              P10 / P50 / P90 exposure across capacity, energy, and REC obligations
            </p>
          </div>
          <PageNav />
        </div>

        {/* ── Universal: year controls, load-profile strip, summary cards ──
            These render for every sub-tab so the headline risk overview is
            visible whether the user is on Capacity, Energy, or RECs. */}

        {/* Year controls (site/date scope comes from the global ScopeBar) */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-100 rounded-lg p-1 flex gap-1">
            {yearOptions.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeYear === yr
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        {/* Load profile context strip */}
        {(() => {
          const loadProfiles = selectedSites.length === LOAD_PROFILES.length
            ? LOAD_PROFILES
            : selectedSites.map((k) => LOAD_PROFILE_MAP[k]).filter(Boolean);
          if (!loadProfiles.length) return null;
          const totalCapacity = loadProfiles.reduce((s, p) => s + p.capacityMw, 0);
          const totalBaseload = loadProfiles.reduce((s, p) => s + p.baseloadMw, 0);
          const peakDemand = loadProfiles.reduce((s, p) => s + p.peakDemandMw, 0);
          return (
            <div className="flex flex-wrap gap-4 items-center bg-slate-50 rounded-xl border border-slate-200 px-5 py-3 text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-widest">Load Profile</span>
              <span className="w-px h-4 bg-slate-200" />
              <span className="text-slate-500">
                Market Capacity: <strong className="text-slate-800">{totalCapacity} MW</strong>
              </span>
              <span className="text-slate-500">
                Baseload: <strong className="text-teal-600">{totalBaseload} MW</strong>
                <span className="text-slate-400 ml-1">(flat floor)</span>
              </span>
              <span className="text-slate-500">
                Peak Demand: <strong className="text-amber-500">{peakDemand} MW</strong>
                <span className="text-slate-400 ml-1">(above baseload)</span>
              </span>
              <span className="ml-auto text-slate-400 italic">simulated · metered API pending</span>
            </div>
          );
        })()}

        {/* Five summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <SummaryCard
            title="Baseline Annual Cost"
            value={fmtM(baselineCostUsd)}
            sub={`Utility tariff — ${profiles.length} site${profiles.length > 1 ? 's' : ''}`}
          />
          <SummaryCard
            title="Proposed Cost (P50)"
            value={fmtM(totalDeliveredCost.p50)}
            sub={`${fmtM(totalDeliveredCost.p10)} – ${fmtM(totalDeliveredCost.p90)} range`}
          />
          <SummaryCard
            title="Expected Annual Savings"
            value={fmtM(savings)}
            sub={`${savingsPct.toFixed(1)}% vs baseline`}
            highlight
          />
          <SummaryCard
            title="Contracted Coverage"
            value={`${hedgeCoveragePct}%`}
            sub={`${(totalTransactionMwh / 1000).toFixed(1)} GWh contracted vs ${(annualLoadMwh / 1000).toFixed(1)} GWh load · ${activeYear}`}
            highlight={hedgeCoveragePct >= 100}
          />
          <SummaryCard
            title="Total Load Scope"
            value={`${(annualLoadMwh / 1000).toFixed(1)} GWh/yr`}
            sub={
              profiles.length === 1
                ? `${profiles[0].capacityMw} MW · ${profiles[0].loadFactorPct}% LF`
                : `${profiles.length} sites · ${profiles.reduce((s, p) => s + p.capacityMw, 0)} MW total`
            }
          />
        </div>

        {/* ── Capacity tab — risk-exposure view (decisions live on Procurement Planning) ── */}
        {activeTab === 'capacity' && (
          <CapacityRiskTab
            selectedSites={selectedSites}
            endYear={endYear}
          />
        )}

        {/* ── RECs tab ────────────────────────────────────────────────────── */}
        {activeTab === 'recs' && <RECsTab selectedSites={selectedSites} startYear={startYear} endYear={endYear} />}

        {/* ── Transmission & Basis Risk tab ───────────────────────────────── */}
        {activeTab === 'transmission' && <TransmissionTab selectedSites={selectedSites} startYear={startYear} endYear={endYear} />}

        {/* ── Energy tab — risk decomposition + contracted position ───────── */}
        {activeTab === 'energy' && (<>

        {/* ── Two-column grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT 2/3: Risk Report table */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Before &amp; After Risk Position Report
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-1/3">
                      Risk Metric
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Unoptimized
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                      P10 Favorable
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      P50 Expected
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-red-500">
                      P90 Stress
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <RiskRow
                    label="Total Delivered Cost"
                    baseline={fmtM(baselineCostUsd)}
                    band={totalDeliveredCost}
                    baselineUsd={baselineCostUsd}
                    isTotal
                  />
                  <RiskRow
                    label="Base Price Risk"
                    baseline="—"
                    band={basePriceRisk}
                    baselineUsd={baselineCostUsd}
                  />
                  <RiskRow
                    label="Basis / Locational Risk"
                    sub="DOM Bus − Western Hub on hedged load"
                    baseline="$0"
                    band={basisRisk}
                    baselineUsd={baselineCostUsd}
                    isBasis
                  />
                  <RiskRow
                    label="Unhedged Shape Risk"
                    sub="Spot/tariff cost on unhedged portion"
                    baseline="—"
                    band={unhedgedShapeRisk}
                    baselineUsd={baselineCostUsd}
                  />
                  <RiskRow
                    label="ESG / Compliance Risk"
                    sub="Projected REC shortfall at market rates"
                    baseline="—"
                    band={esgComplianceRisk}
                    baselineUsd={baselineCostUsd}
                    isEsg
                  />
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-xs text-slate-400 italic border-t border-slate-100">
                      Analysis of additional risk including Long-Term Market, Execution/Timeline, Counterparty/Credit — coming in next module release
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* RIGHT 1/3: Contracted Position + Scenario Key */}
          <div className="flex flex-col gap-4">

            {/* Card A: Contracted Position */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Contracted Position</h2>
              </div>
              <div className="px-6 py-4">
                {selectedSites.length === SITE_PROFILES.length ? (
                  <div className="space-y-5">
                    {siteHedgeData.map((siteData) => {
                      const profile = profiles.find(p => p.key === siteData.siteKey);
                      return (
                        <div key={siteData.siteKey}>
                          <p className="text-xs font-semibold text-slate-600 mb-2">{profile?.name ?? siteData.siteKey}</p>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${siteData.facilityType === 'brownfield' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                              {siteData.facilityType}
                            </span>
                            <span className="text-xs text-slate-400">
                              {Math.round(siteData.hedgeMwh / 1000)} GWh / {Math.round(siteData.loadMwh / 1000)} GWh
                            </span>
                          </div>
                          <HedgeBar label="On-Peak" pct={siteData.onPeakPct} />
                          <HedgeBar label="Off-Peak" pct={siteData.offPeakPct} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  siteHedgeData.map((siteData) => {
                    const profile = profiles.find(p => p.key === siteData.siteKey);
                    return (
                      <div key={siteData.siteKey}>
                        <dl className="space-y-2 mb-4 text-xs">
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Settlement Zone</dt>
                            <dd className="font-medium text-slate-800">{profile?.settlementZone ?? '-'}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Facility Type</dt>
                            <dd className="font-medium text-slate-800 capitalize">{siteData.facilityType}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">PPA Strike</dt>
                            <dd className="font-medium text-slate-800">${profile?.ppaContractPricePerMwh ?? '-'}/MWh</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Hedge Coverage</dt>
                            <dd className="font-medium text-slate-800">
                              {siteData.loadMwh > 0 ? Math.round((siteData.hedgeMwh / siteData.loadMwh) * 100) : 0}%
                            </dd>
                          </div>
                        </dl>
                        <HedgeBar label="On-Peak Hedged" pct={siteData.onPeakPct} />
                        <HedgeBar label="Off-Peak Hedged" pct={siteData.offPeakPct} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Card B: Scenario Key */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Scenario Key</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div className="flex gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">P10 — Favorable</p>
                    <p className="text-xs text-slate-500">Low congestion, mild DA prices</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-slate-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">P50 — Base Case</p>
                    <p className="text-xs text-slate-500">Normalized forward curve</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500" />
                  <div>
                    <p className="text-xs font-semibold text-red-700">P90 — Stress</p>
                    <p className="text-xs text-slate-500">Widening basis, heat/cold events</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── 5. Monthly Basis Detail table ────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Monthly Basis Detail — {selectedYear}
            </h2>
            <span className="text-xs rounded-full bg-slate-100 px-3 py-1 text-slate-500 font-medium">
              {selectedYear === 2026
                ? 'Jan–Apr actual · May–Dec forward'
                : 'Forward projection'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-500" rowSpan={2}>
                    Month
                  </th>
                  <th
                    className="text-center py-2 px-2 font-semibold text-slate-600 border-l border-slate-200"
                    colSpan={4}
                  >
                    On-Peak
                  </th>
                  <th
                    className="text-center py-2 px-2 font-semibold text-slate-600 border-l border-slate-200"
                    colSpan={4}
                  >
                    Off-Peak
                  </th>
                  <th
                    className="text-center py-3 px-4 font-semibold text-slate-500 border-l border-slate-200"
                    rowSpan={2}
                  >
                    % Hrs Pos<br />(on-peak)
                  </th>
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-right py-2 px-3 font-medium text-slate-400 border-l border-slate-200">WH Avg</th>
                  <th className="text-right py-2 px-3 font-medium text-emerald-600">P10</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-500">P50</th>
                  <th className="text-right py-2 px-3 font-medium text-red-500">P90</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-400 border-l border-slate-200">WH Avg</th>
                  <th className="text-right py-2 px-3 font-medium text-emerald-600">P10</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-500">P50</th>
                  <th className="text-right py-2 px-3 font-medium text-red-500">P90</th>
                </tr>
              </thead>
              <tbody>
                {monthPeriods.map((period) => (
                  <tr
                    key={period.label}
                    className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                      period.isHistorical ? 'bg-slate-50/50' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {period.isHistorical && (
                        <span className="mr-1 text-slate-400">&bull;</span>
                      )}
                      {period.label}
                    </td>
                    {/* On-peak columns */}
                    <td className="py-2.5 px-3 text-right text-slate-600 border-l border-slate-100">
                      ${period.onPeak.whAvg.toFixed(2)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${basisP10Color(period.onPeak.basisP10)}`}>
                      {fmtBasis(period.onPeak.basisP10)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${basisP50Color(period.onPeak.basisP50)}`}>
                      {fmtBasis(period.onPeak.basisP50)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${basisP90Color(period.onPeak.basisP90)}`}>
                      {fmtBasis(period.onPeak.basisP90)}
                    </td>
                    {/* Off-peak columns */}
                    <td className="py-2.5 px-3 text-right text-slate-600 border-l border-slate-100">
                      ${period.offPeak.whAvg.toFixed(2)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${basisP10Color(period.offPeak.basisP10)}`}>
                      {fmtBasis(period.offPeak.basisP10)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${basisP50Color(period.offPeak.basisP50)}`}>
                      {fmtBasis(period.offPeak.basisP50)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${basisP90Color(period.offPeak.basisP90)}`}>
                      {fmtBasis(period.offPeak.basisP90)}
                    </td>
                    {/* % Hrs Positive */}
                    <td className="py-2.5 px-4 text-right text-slate-600 border-l border-slate-100">
                      {period.onPeak.pctPositiveBasis}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={10} className="px-4 py-3 text-xs text-slate-400 italic border-t border-slate-100">
                    &bull; = historical settled value &middot; basis in $/MWh (AEP &minus; WH)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        </>)}

    </div>
  );
}
