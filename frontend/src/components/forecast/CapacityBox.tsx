import {
  getForecastCapacityForYear,
  getScopeAvgAnnualLoadMwh,
  getEffectiveAnnualLoadMwh,
  getEffectiveLoadAt,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import {
  contractMwAtHourInYear,
  isContractActiveAt,
} from '../../data/linkedContracts'
import type { LinkedContract } from '../../data/linkedContracts'
import { scopeDayCount, daysInMonth, type PeakMode } from '../../data/peakCalendar'


interface CapacityBoxProps {
  profile: SiteLoadProfile
  startYear: number
  endYear: number
  peakMode?: PeakMode
  startHE?: number
  endHE?: number
  selectedSites?: string[]
  chartYearMode?: 'single' | 'all'
  chartActiveYear?: number
  // In-scope saved contracts (from RDS). Includes every non-rejected commitment
  // level — exploring (proposed), pending (committed), and contracted (accepted)
  // — so the KPI strip reflects all of them.
  contracts?: LinkedContract[]
}

export function CapacityBox({ profile, startYear, endYear, peakMode = 'all', startHE = 1, endHE = 24, selectedSites, chartYearMode, chartActiveYear, contracts = [] }: CapacityBoxProps) {
  // Peak scope: KPIs below are weighted by the number of in-scope days per
  // (month, hour) via the NERC 5×16 calendar — exact for on/off-peak.
  const allHours = peakMode === 'all'
  // Determine effective year based on chart selection
  const isSingleYear = chartYearMode === 'single'
  const effectiveYear = isSingleYear && chartActiveYear ? chartActiveYear : endYear

  // Calculate year-specific baseload and peak demand using load multipliers
  // Also calculate project coverage by tier (base vs peak)
  // Overhedge is calculated hour-by-hour since energy in one hour can't offset another hour
  // Single hour-by-hour pass over the HE-scoped hours: accumulates load,
  // per-tier contract coverage, overhedge, and the MWh/value totals used by the
  // % hedged and avg-price KPIs. With the default HE range (1–24) this equals
  // the full-year helpers; a narrowed range restricts every figure to those
  // hours (energy in one hour can't offset another, so this stays hour-exact).
  const getYearlyLoadStats = (year: number) => {
    const siteContracts = contracts
    let totalOverhedge = 0, totalLoad = 0, baseSum = 0, peakSum = 0, hourInst = 0
    let baseProjSum = 0, peakProjSum = 0, contractedSum = 0, contractedValue = 0

    for (let m = 1; m <= 12; m++) {
      for (let h = 0; h < 24; h++) {
        // Days this (month, hour) is in scope — 0 skips it, else the exact count.
        const days = scopeDayCount(peakMode, startHE, endHE, year, m, h + 1)
        if (days === 0) continue
        const eff = getEffectiveLoadAt(profile, h, m, year)
        const hourLoad = eff.baseloadMw + eff.peakMw
        totalLoad += hourLoad * days
        baseSum += eff.baseloadMw * days
        peakSum += eff.peakMw * days
        hourInst += days

        let hourContracted = 0
        for (const c of siteContracts) {
          if (!isContractActiveAt(c, year, m)) continue
          const mw = contractMwAtHourInYear(c, h, m, year)
          hourContracted += mw
          contractedSum += mw * days
          contractedValue += mw * c.pricePerMwh * days
          if (c.tier === 'base') baseProjSum += mw * days
          else if (c.tier === 'peak') peakProjSum += mw * days
        }
        totalOverhedge += Math.max(0, hourContracted - hourLoad) * days
      }
    }

    const totalHours = hourInst || 1
    const avgOverhedgeMw = Math.round((totalOverhedge / totalHours) * 10) / 10
    const avgTotalLoadMw = totalLoad / totalHours
    // Headline baseload/peak stay the site's design characteristics for the full
    // day; when the HE scope is narrowed the coverage bars use the selected-hours
    // load averages instead.
    const avgBaseloadMw = allHours ? Math.round(profile.baseloadMw * 10) / 10 : Math.round((baseSum / totalHours) * 10) / 10
    const avgPeakMw = allHours ? Math.round(profile.peakDemandMw * 10) / 10 : Math.round((peakSum / totalHours) * 10) / 10
    const baseProjectsMw = Math.min(baseProjSum / totalHours, avgBaseloadMw)
    const peakProjectsMw = Math.min(peakProjSum / totalHours, avgPeakMw)
    const overhedgePct = avgTotalLoadMw > 0 ? Math.round((avgOverhedgeMw / avgTotalLoadMw) * 100) : 0

    return {
      avgBaseloadMw,
      avgPeakMw,
      baseProjectsMw: Math.round(baseProjectsMw * 10) / 10,
      peakProjectsMw: Math.round(peakProjectsMw * 10) / 10,
      overhedgeMw: avgOverhedgeMw,
      overhedgePct,
      loadMwh: totalLoad,
      contractedMwh: contractedSum,
      contractedValue,
    }
  }

  const yearStats = getYearlyLoadStats(effectiveYear)

  // The years the KPI strip summarizes: a single pinned year, otherwise every
  // year in scope.
  const displayYears: number[] = []
  if (isSingleYear && chartActiveYear) displayYears.push(chartActiveYear)
  else for (let y = startYear; y <= endYear; y++) displayYears.push(y)
  const scopeLabel = `${displayYears[0]}–${displayYears[displayYears.length - 1]}`
  const isRange = displayYears.length > 1

  // Per-year, hour-weighted baseload (correct for aggregates) plus the peak
  // swing scaled by the same year-over-year load growth. "Peak Load" is total
  // demand = baseload floor + the peak swing above it.
  const yearAdjustedLoad = (year: number) => {
    let baseSum = 0
    let hours = 0
    for (let m = 1; m <= 12; m++) {
      const days = daysInMonth(year, m)
      for (let h = 0; h < 24; h++) {
        baseSum += getEffectiveLoadAt(profile, h, m, year).baseloadMw * days
        hours += days
      }
    }
    const baseloadMw = hours > 0 ? baseSum / hours : profile.baseloadMw
    const mult = profile.baseloadMw > 0 ? baseloadMw / profile.baseloadMw : 1
    const peakSwingMw = profile.peakDemandMw * mult
    return { baseloadMw, peakLoadMw: baseloadMw + peakSwingMw }
  }

  // Capacity & baseload vary by year, so the all-years view shows their range
  // across scope (matching the chart's per-year line) rather than a single year.
  const fmtRange = (vals: number[]) => {
    const lo = Math.round(Math.min(...vals))
    const hi = Math.round(Math.max(...vals))
    return lo === hi ? `${lo}` : `${lo}–${hi}`
  }
  const capacityRange = fmtRange(displayYears.map((y) => getForecastCapacityForYear(profile, y)))
  const adjusted = displayYears.map(yearAdjustedLoad)
  const baseloadRange = fmtRange(adjusted.map((a) => a.baseloadMw))
  const peakLoadRange = fmtRange(adjusted.map((a) => a.peakLoadMw))

  // Per-year HE-scoped aggregates — one source for price, load, and % hedged.
  const perYear = displayYears.map(getYearlyLoadStats)

  // Volume-weighted average contracted price across scope (HE-scoped MWh).
  const totalContractedMwh = perYear.reduce((s, y) => s + y.contractedMwh, 0)
  const totalContractedValue = perYear.reduce((s, y) => s + y.contractedValue, 0)
  const avgContractPrice = totalContractedMwh > 0 ? totalContractedValue / totalContractedMwh : 0

  // Avg annual load: full-year helpers when the whole day is in scope; otherwise
  // the average of the HE-scoped load MWh.
  const annualMwh = allHours
    ? (isSingleYear && chartActiveYear
        ? getEffectiveAnnualLoadMwh(profile, chartActiveYear)
        : getScopeAvgAnnualLoadMwh(profile, startYear, endYear))
    : perYear.reduce((s, y) => s + y.loadMwh, 0) / perYear.length
  const annualGwh = Math.round(annualMwh / 1000)

  // % hedged = contracted MWh ÷ load MWh, both over the in-scope hours.
  const totalLoadMwhAll = perYear.reduce((s, y) => s + y.loadMwh, 0)
  const totalContractedMwhAll = perYear.reduce((s, y) => s + y.contractedMwh, 0)
  const pctHedged = totalLoadMwhAll > 0 ? Math.round((totalContractedMwhAll / totalLoadMwhAll) * 100) : 0

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5 w-[112px] flex-shrink-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Site</p>
        <p className="text-sm font-bold text-slate-900 truncate">{profile.name}</p>
        {(() => {
          const parts = profile.location.split(',').map((s) => s.trim())
          const stateLabel = parts[parts.length - 1] || profile.location
          return <p className="text-xs text-slate-400 whitespace-nowrap">{stateLabel} · {profile.settlementZone}</p>
        })()}
      </div>

      <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

      {/* Flexible info strip — text-heavy columns get more room, short ones shrink */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        {/* Avg Annual Load */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-[1.15]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Avg Annual Load</p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-slate-900 leading-none">{annualGwh}</span>
            <span className="text-sm font-semibold text-slate-700">GWh</span>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            {isRange ? `avg · ${scopeLabel}` : `for ${displayYears[0]}`}
          </p>
        </div>

        <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

        <div className="flex flex-col gap-0.5 min-w-0 flex-[1.4]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Market Capacity</p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-slate-900 leading-none">{capacityRange}</span>
            <span className="text-sm font-semibold text-slate-500">MW</span>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            {isRange ? `ceiling · ${scopeLabel}` : `for ${displayYears[0]}`}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-[1.1]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Baseload</p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-teal-600 leading-none">{baseloadRange}</span>
            <span className="text-sm font-semibold text-teal-500">MW</span>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            {isRange ? `floor · ${scopeLabel}` : 'flat load floor'}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-[1.4]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Peak Load</p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-amber-500 leading-none">{peakLoadRange}</span>
            <span className="text-sm font-semibold text-amber-400">MW</span>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            {isRange ? `base+peak · ${scopeLabel}` : 'base + peak swing'}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-[1.3]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
            Avg Contracted Price
          </p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-slate-900 leading-none">${avgContractPrice.toFixed(2)}</span>
            <span className="text-sm font-semibold text-slate-700">/MWh</span>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            vol-wtd · {isRange ? `avg ${scopeLabel}` : displayYears[0]}
          </p>
        </div>

        <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

        <div className="flex flex-col gap-0.5 min-w-0 flex-[0.7]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">% Hedged</p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-slate-700 leading-none">{pctHedged}</span>
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            {isRange ? `avg · ${scopeLabel}` : `for ${displayYears[0]}`}
          </p>
        </div>
      </div>

      <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

      {/* Fixed-width Load Coverage bar with project shading */}
      <div className="w-[400px] flex-shrink-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          LOAD TYPE COVERAGE {isSingleYear && chartActiveYear && `· ${chartActiveYear}`}
        </p>
        <div className="flex">
          {/* Baseload bar (left) - sized by MW proportion, fully rounded */}
          <LoadTierBar
            loadMw={yearStats.avgBaseloadMw}
            projectsMw={yearStats.baseProjectsMw}
            bgColor="bg-teal-400"
            rounded="all"
            widthPct={yearStats.avgBaseloadMw + yearStats.avgPeakMw > 0
              ? (yearStats.avgBaseloadMw / (yearStats.avgBaseloadMw + yearStats.avgPeakMw)) * 100
              : 50}
          />
          <span className="w-2" />
          {/* Peak bar (middle) - sized by MW proportion, fully rounded */}
          <LoadTierBar
            loadMw={yearStats.avgPeakMw}
            projectsMw={yearStats.peakProjectsMw}
            bgColor="bg-amber-400"
            rounded="all"
            widthPct={yearStats.avgBaseloadMw + yearStats.avgPeakMw > 0
              ? (yearStats.avgPeakMw / (yearStats.avgBaseloadMw + yearStats.avgPeakMw)) * 100
              : 50}
          />
          {/* Overhedge bar (right) - only shown when overhedge exists, sized by % of load */}
          {yearStats.overhedgeMw > 0 && (
            <>
              <span className="w-2" />
              <LoadTierBar
                loadMw={yearStats.avgBaseloadMw + yearStats.avgPeakMw}
                projectsMw={0}
                bgColor="bg-rose-400"
                rounded="all"
                widthPct={yearStats.overhedgePct}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-teal-500" />Baseload
            {yearStats.baseProjectsMw > 0 && (
              <span className="text-teal-600">({Math.round((yearStats.baseProjectsMw / yearStats.avgBaseloadMw) * 100)}% hedged)</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-500" />Peak
            {yearStats.peakProjectsMw > 0 && (
              <span className="text-amber-600">({Math.round((yearStats.peakProjectsMw / yearStats.avgPeakMw) * 100)}% hedged)</span>
            )}
          </span>
          {yearStats.overhedgeMw > 0 && (
            <span className="flex items-center gap-1 text-rose-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-rose-500" />Overhedge {yearStats.overhedgePct}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Individual load tier bar with project shading (PROJECT VOLUMES color)
interface LoadTierBarProps {
  loadMw: number
  projectsMw: number
  bgColor: string
  rounded: 'left' | 'right' | 'all'
  widthPct: number
}

// Dotted pattern for project volume shading
const DOTTED_PATTERN = `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1.5' fill='%236366f1'/%3E%3C/svg%3E")`

function LoadTierBar({
  loadMw,
  projectsMw,
  bgColor,
  rounded,
  widthPct,
}: LoadTierBarProps) {
  // Calculate what portion of the bar should show project volume
  // The bar represents the load, and we shade the portion equal to projects/load ratio
  const coverageRatio = loadMw > 0 ? Math.min(projectsMw / loadMw, 1) : 0
  const coveragePct = coverageRatio * 100

  // Apply rounded corners - 'all' for fully rounded pill shape (like original capacity bar)
  const roundedClass = rounded === 'all'
    ? 'rounded-full'
    : rounded === 'left'
    ? 'rounded-l-md rounded-r-none'
    : 'rounded-r-md rounded-l-none'

  return (
    <div style={{ width: `${widthPct}%` }}>
      <div className={`relative h-6 overflow-hidden ${roundedClass}`}>
        {/* Background bar showing total load (teal for base, amber for peak) */}
        <div className={`absolute inset-y-0 left-0 ${bgColor}`} style={{ width: '100%' }}>
          {/* Project volume shading - dotted pattern overlay */}
          {coveragePct > 0 && (
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: `${coveragePct}%`, backgroundImage: DOTTED_PATTERN, backgroundRepeat: 'repeat' }}
            />
          )}
        </div>

      </div>
    </div>
  )
}
