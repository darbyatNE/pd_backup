import {
  getForecastCapacityForYear,
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
  startMonth?: number
  endMonth?: number
  peakMode?: PeakMode
  startHE?: number
  endHE?: number
  selectedMonth?: number | 'all'  // chart Month selection ('all' = every in-scope month)
  selectedSites?: string[]
  chartYearMode?: 'single' | 'all'
  chartActiveYear?: number
  // In-scope saved contracts (from RDS). Includes every non-rejected commitment
  // level — exploring (proposed), pending (committed), and contracted (accepted)
  // — so the KPI strip reflects all of them.
  contracts?: LinkedContract[]
  // Locational forward price for the "expected load cost" KPI. hourly is the
  // HE1–24 shape (index h → HE h+1); monthly is keyed `${year}-${month}`. Both
  // are already scoped to the KPI period and load-weighted across zones.
  priceHourly?: (number | null)[]
  priceMonthly?: Map<string, number>
}

export function CapacityBox({ profile, startYear, endYear, startMonth = 1, endMonth = 12, peakMode = 'all', startHE = 1, endHE = 24, selectedMonth = 'all', selectedSites, chartYearMode, chartActiveYear, contracts = [], priceHourly, priceMonthly }: CapacityBoxProps) {
  // Mean of the hourly price shape — used to spread a month's average price
  // across the day (price(m,h) ≈ monthLevel × heShape(h) / heMean) so the cost
  // reflects the diurnal shape and stays correct under an HE/peak filter.
  const heVals = (priceHourly ?? []).filter((v): v is number => v != null)
  const heMean = heVals.length ? heVals.reduce((s, v) => s + v, 0) / heVals.length : 0
  // Peak scope: KPIs below are weighted by the number of in-scope days per
  // (month, hour) via the NERC 5×16 calendar — exact for on/off-peak.
  const allHours = peakMode === 'all'
  // A month is in scope when it's inside the scope date range (bounded on the
  // boundary years) and matches the chart's Month selection.
  const monthInScope = (year: number, m: number) => {
    if (selectedMonth !== 'all' && m !== selectedMonth) return false
    if (year === startYear && m < startMonth) return false
    if (year === endYear && m > endMonth) return false
    return true
  }
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
    let baseOverSum = 0, peakOverSum = 0, totalLoad = 0, baseSum = 0, peakSum = 0, hourInst = 0
    let baseCovSum = 0, peakCovSum = 0, coveredSum = 0, contractedSum = 0, contractedValue = 0
    // Expected cost of serving the load at forecast LMPs, plus the priced MWh
    // (load that actually had a forecast price) so we can report a $/MWh average.
    let expectedCost = 0, pricedLoad = 0

    for (let m = 1; m <= 12; m++) {
      if (!monthInScope(year, m)) continue
      const monthLevel = priceMonthly?.get(`${year}-${m}`) ?? null
      for (let h = 0; h < 24; h++) {
        // Days this (month, hour) is in scope — 0 skips it, else the exact count.
        const days = scopeDayCount(peakMode, startHE, endHE, year, m, h + 1)
        if (days === 0) continue
        const eff = getEffectiveLoadAt(profile, h, m, year)
        const baseLd = eff.baseloadMw
        const peakLd = eff.peakMw
        totalLoad += (baseLd + peakLd) * days
        baseSum += baseLd * days
        peakSum += peakLd * days
        hourInst += days

        // Forecast price for this (month, hour): monthly level shaped by the hour,
        // falling back to whichever series is available.
        const heP = priceHourly?.[h] ?? null
        const price = monthLevel != null && heMean > 0 && heP != null ? monthLevel * (heP / heMean)
          : heP != null ? heP
          : monthLevel != null ? monthLevel
          : null
        if (price != null) {
          expectedCost += (baseLd + peakLd) * price * days
          pricedLoad += (baseLd + peakLd) * days
        }

        // Sum contracted MW in this hour, split by the load tier each contract
        // hedges (wind/nuclear → base, solar/peaker → peak).
        let baseC = 0, peakC = 0
        for (const c of siteContracts) {
          if (!isContractActiveAt(c, year, m)) continue
          const mw = contractMwAtHourInYear(c, h, m, year)
          contractedSum += mw * days
          contractedValue += mw * c.pricePerMwh * days
          if (c.tier === 'base') baseC += mw
          else if (c.tier === 'peak') peakC += mw
        }
        // Headline % hedged: LENIENT — total bought vs total load this hour,
        // regardless of type (no headline overhedge is surfaced).
        const hourContracted = baseC + peakC
        const hourLoad = baseLd + peakLd
        coveredSum += Math.min(hourContracted, hourLoad) * days
        // Load Type Coverage: STRICT — each tier capped by its own load, and its
        // overhedge is the per-tier excess. So wind (baseload-tier) exceeding
        // baseload shows as overhedge even when total load still exceeds it.
        baseCovSum += Math.min(baseC, baseLd) * days
        peakCovSum += Math.min(peakC, peakLd) * days
        baseOverSum += Math.max(0, baseC - baseLd) * days
        peakOverSum += Math.max(0, peakC - peakLd) * days
      }
    }

    const totalHours = hourInst || 1
    const baseOverhedgeMw = Math.round((baseOverSum / totalHours) * 10) / 10
    const peakOverhedgeMw = Math.round((peakOverSum / totalHours) * 10) / 10
    const avgOverhedgeMw = Math.round(((baseOverSum + peakOverSum) / totalHours) * 10) / 10
    const avgTotalLoadMw = totalLoad / totalHours
    // Headline baseload/peak stay the site's design characteristics for the full
    // day; when the HE scope is narrowed the coverage bars use the selected-hours
    // load averages instead.
    const avgBaseloadMw = allHours ? Math.round(profile.baseloadMw * 10) / 10 : Math.round((baseSum / totalHours) * 10) / 10
    const avgPeakMw = allHours ? Math.round(profile.peakDemandMw * 10) / 10 : Math.round((peakSum / totalHours) * 10) / 10
    // Per-hour-capped covered MW (never exceeds the tier's load average).
    const baseProjectsMw = Math.min(baseCovSum / totalHours, avgBaseloadMw)
    const peakProjectsMw = Math.min(peakCovSum / totalHours, avgPeakMw)
    const overhedgePct = avgTotalLoadMw > 0 ? Math.round((avgOverhedgeMw / avgTotalLoadMw) * 100) : 0

    return {
      avgBaseloadMw,
      avgPeakMw,
      baseProjectsMw: Math.round(baseProjectsMw * 10) / 10,
      peakProjectsMw: Math.round(peakProjectsMw * 10) / 10,
      baseOverhedgeMw,
      peakOverhedgeMw,
      overhedgeMw: avgOverhedgeMw,
      overhedgePct,
      loadMwh: totalLoad,
      coveredMwh: coveredSum,
      contractedMwh: contractedSum,
      contractedValue,
      expectedCost,
      pricedLoadMwh: pricedLoad,
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
      if (!monthInScope(year, m)) continue
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

  // Avg annual load — the mean of the in-scope load MWh across the display
  // years. Reflects the active hour + month scope (equals the full-year total
  // when nothing is narrowed), so it stays in step with the chart controls.
  const annualMwh = perYear.reduce((s, y) => s + y.loadMwh, 0) / (perYear.length || 1)
  const annualGwh = Math.round(annualMwh / 1000)

  // % hedged = per-hour-capped covered MWh ÷ load MWh (over the in-scope hours).
  // Covered caps at each hour's load, so an over-buy in one hour can't inflate
  // the coverage of an under-hedged hour.
  const totalLoadMwhAll = perYear.reduce((s, y) => s + y.loadMwh, 0)
  const totalCoveredMwhAll = perYear.reduce((s, y) => s + y.coveredMwh, 0)
  const pctHedged = totalLoadMwhAll > 0 ? Math.round((totalCoveredMwhAll / totalLoadMwhAll) * 100) : 0

  // Expected load cost at forecast LMPs: the load-weighted average $/MWh over the
  // period, plus the mean annual $ it implies. hasPrice is false when no in-scope
  // zone has a forecast (e.g. non-PJM sites), so the tile can show "—".
  const totalExpectedCost = perYear.reduce((s, y) => s + y.expectedCost, 0)
  const totalPricedMwh = perYear.reduce((s, y) => s + y.pricedLoadMwh, 0)
  const hasPrice = totalPricedMwh > 0
  const avgLoadCostPerMwh = hasPrice ? totalExpectedCost / totalPricedMwh : 0
  const annualExpectedCost = totalExpectedCost / (perYear.length || 1)
  const fmtUsd = (v: number) =>
    v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5 w-[56px] flex-shrink-0">
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

        <div className="flex flex-col gap-0.5 min-w-0 flex-[1.5]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
            Avg Expected Load Cost
          </p>
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-slate-900 leading-none">
              {hasPrice ? `$${avgLoadCostPerMwh.toFixed(2)}` : '—'}
            </span>
            {hasPrice && <span className="text-sm font-semibold text-slate-700">/MWh</span>}
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">
            {hasPrice ? `${fmtUsd(annualExpectedCost)}/yr at forecast LMP` : 'no zone forecast'}
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
        {(() => {
          const loadTotal = yearStats.avgBaseloadMw + yearStats.avgPeakMw
          const w = (mw: number) => (loadTotal > 0 ? (mw / loadTotal) * 100 : 0)
          const baseOverPct = yearStats.avgBaseloadMw > 0 ? Math.round((yearStats.baseOverhedgeMw / yearStats.avgBaseloadMw) * 100) : 0
          const peakOverPct = yearStats.avgPeakMw > 0 ? Math.round((yearStats.peakOverhedgeMw / yearStats.avgPeakMw) * 100) : 0
          return (
            <>
              <div className="flex">
                {/* Baseload bar */}
                <LoadTierBar loadMw={yearStats.avgBaseloadMw} projectsMw={yearStats.baseProjectsMw}
                  bgColor="bg-teal-400" rounded="all" widthPct={loadTotal > 0 ? w(yearStats.avgBaseloadMw) : 50} />
                {/* Baseload overhedge — between the baseload and peak bars. Fully
                    pattern-filled: it's all purchased energy sitting above load. */}
                {yearStats.baseOverhedgeMw > 0 && (
                  <>
                    <span className="w-1" />
                    <LoadTierBar loadMw={1} projectsMw={1} bgColor="bg-rose-400" rounded="all" widthPct={w(yearStats.baseOverhedgeMw)} />
                  </>
                )}
                <span className="w-2" />
                {/* Peak bar */}
                <LoadTierBar loadMw={yearStats.avgPeakMw} projectsMw={yearStats.peakProjectsMw}
                  bgColor="bg-amber-400" rounded="all" widthPct={loadTotal > 0 ? w(yearStats.avgPeakMw) : 50} />
                {/* Peak overhedge — after the peak bar. Fully pattern-filled:
                    it's all purchased energy sitting above load. */}
                {yearStats.peakOverhedgeMw > 0 && (
                  <>
                    <span className="w-1" />
                    <LoadTierBar loadMw={1} projectsMw={1} bgColor="bg-rose-400" rounded="all" widthPct={w(yearStats.peakOverhedgeMw)} />
                  </>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-teal-500" />Baseload
                  {yearStats.baseProjectsMw > 0 && (
                    <span className="text-teal-600">({Math.round((yearStats.baseProjectsMw / yearStats.avgBaseloadMw) * 100)}% hedged)</span>
                  )}
                  {yearStats.baseOverhedgeMw > 0 && <span className="text-rose-500">(+{baseOverPct}% over)</span>}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-amber-500" />Peak
                  {yearStats.peakProjectsMw > 0 && (
                    <span className="text-amber-600">({Math.round((yearStats.peakProjectsMw / yearStats.avgPeakMw) * 100)}% hedged)</span>
                  )}
                  {yearStats.peakOverhedgeMw > 0 && <span className="text-rose-500">(+{peakOverPct}% over)</span>}
                </span>
              </div>
            </>
          )
        })()}
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
