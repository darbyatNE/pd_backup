import {
  getSiteCapacityForYear,
  getScopeAvgAnnualLoadMwh,
  getEffectiveAnnualLoadMwh,
  getEffectiveLoadAt,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import {
  getContractsForSites,
  getContractAnnualMwhForYear,
  contractMwAtHourInYear,
  isContractActiveAt,
} from '../../data/linkedContracts'

const DEFAULT_ANNUAL_GROWTH = 0.05

interface CapacityBoxProps {
  profile: SiteLoadProfile
  startYear: number
  endYear: number
  selectedSites?: string[]
  chartYearMode?: 'single' | 'all'
  chartActiveYear?: number
}

export function CapacityBox({ profile, startYear, endYear, selectedSites, chartYearMode, chartActiveYear }: CapacityBoxProps) {
  // Determine effective year based on chart selection
  const isSingleYear = chartYearMode === 'single'
  const effectiveYear = isSingleYear && chartActiveYear ? chartActiveYear : endYear

  // Year-specific capacity
  const yearCapacityMw = getSiteCapacityForYear(profile, effectiveYear)

  // Calculate year-specific baseload and peak demand using load multipliers
  // Also calculate project coverage by tier (base vs peak)
  // Overhedge is calculated hour-by-hour since energy in one hour can't offset another hour
  const getYearlyLoadStats = (year: number) => {
    let totalBaseload = 0
    let totalPeak = 0
    let totalCapacity = 0
    let totalOverhedge = 0
    let totalLoad = 0
    const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    const sitesInScope = selectedSites && selectedSites.length > 0 ? selectedSites : [profile.siteKey]
    const siteContracts = getContractsForSites(sitesInScope)

    for (let m = 1; m <= 12; m++) {
      const days = daysPerMonth[m - 1]
      for (let h = 0; h < 24; h++) {
        const eff = getEffectiveLoadAt(profile, h, m, year)
        const hourLoad = eff.baseloadMw + eff.peakMw
        totalBaseload += eff.baseloadMw * days
        totalPeak += eff.peakMw * days
        totalCapacity += yearCapacityMw * days
        totalLoad += hourLoad * days

        // Calculate total contracted MW for this hour-month
        let hourContracted = 0
        for (const c of siteContracts) {
          if (!isContractActiveAt(c, year, m)) continue
          hourContracted += contractMwAtHourInYear(c, h, m, year)
        }

        // Overhedge for this hour: excess contracted beyond load
        const hourOverhedge = Math.max(0, hourContracted - hourLoad)
        totalOverhedge += hourOverhedge * days
      }
    }

    // Convert from daily sums to average MW (divide by total hours)
    const totalHours = 365 * 24
    const avgBaseloadMw = Math.round((totalBaseload / totalHours) * 10) / 10
    const avgPeakMw = Math.round((totalPeak / totalHours) * 10) / 10
    const avgOverhedgeMw = Math.round((totalOverhedge / totalHours) * 10) / 10
    const avgTotalLoadMw = (totalLoad / totalHours)

    // Calculate project coverage by tier for the year
    let baseProjectsMw = 0
    let peakProjectsMw = 0

    for (const c of siteContracts) {
      // Only count if contract is active in this year
      const isActiveInYear = c.startYear <= year && c.endYear >= year
      if (!isActiveInYear) continue

      // Calculate average MW delivered by this contract for the year
      // Annual MWh / (365 days * 24 hours) = average MW
      const annualMwh = getContractAnnualMwhForYear(c, year)
      const avgContractMw = annualMwh / (365 * 24)

      if (c.tier === 'base') {
        baseProjectsMw += avgContractMw
      } else if (c.tier === 'peak') {
        peakProjectsMw += avgContractMw
      }
    }

    // Cap project coverage at respective load tiers (for display purposes)
    baseProjectsMw = Math.min(baseProjectsMw, avgBaseloadMw)
    peakProjectsMw = Math.min(peakProjectsMw, avgPeakMw)

    // Calculate overhedge percentage based on total load
    const overhedgePct = avgTotalLoadMw > 0 ? Math.round((avgOverhedgeMw / avgTotalLoadMw) * 100) : 0

    return {
      avgBaseloadMw,
      avgPeakMw,
      baseProjectsMw: Math.round(baseProjectsMw * 10) / 10,
      peakProjectsMw: Math.round(peakProjectsMw * 10) / 10,
      overhedgeMw: avgOverhedgeMw,
      overhedgePct,
    }
  }

  const yearStats = getYearlyLoadStats(effectiveYear)

  // Calculate volume-weighted average contracted price for the effective year
  const sitesInScope = selectedSites && selectedSites.length > 0 ? selectedSites : [profile.siteKey]
  const siteContracts = getContractsForSites(sitesInScope)
  let totalContractedMwh = 0
  let totalContractedValue = 0
  for (const c of siteContracts) {
    const annualMwh = getContractAnnualMwhForYear(c, effectiveYear)
    totalContractedMwh += annualMwh
    totalContractedValue += annualMwh * c.pricePerMwh
  }
  const avgContractPrice = totalContractedMwh > 0
    ? totalContractedValue / totalContractedMwh
    : 0

  // Annual load for the effective year
  const annualMwh = isSingleYear && chartActiveYear
    ? getEffectiveAnnualLoadMwh(profile, chartActiveYear)
    : getScopeAvgAnnualLoadMwh(profile, startYear, endYear)
  const annualGwh = Math.round(annualMwh / 1000)

  // Calculate % hedged for in-scope sites and projects
  // When chart is in single year mode, show % hedged for that year only
  // When in all mode, average across entire scope period
  const effectiveStartYear = isSingleYear && chartActiveYear ? chartActiveYear : startYear
  const effectiveEndYear = isSingleYear && chartActiveYear ? chartActiveYear : endYear
  const yearCount = Math.max(1, effectiveEndYear - effectiveStartYear + 1)
  let totalContractedMwhAll = 0
  let totalLoadMwh = 0
  for (let y = effectiveStartYear; y <= effectiveEndYear; y++) {
    totalLoadMwh += getEffectiveAnnualLoadMwh(profile, y)
    for (const c of siteContracts) {
      totalContractedMwhAll += getContractAnnualMwhForYear(c, y)
    }
  }
  const avgLoadMwh = totalLoadMwh / yearCount
  const avgContractedMwhAll = totalContractedMwhAll / yearCount
  const pctHedged = avgLoadMwh > 0 ? Math.round((avgContractedMwhAll / avgLoadMwh) * 100) : 0

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5 min-w-[140px]">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Site</p>
        <p className="text-base font-bold text-slate-900 truncate">{profile.name}</p>
        {(() => {
          const parts = profile.location.split(',').map((s) => s.trim())
          const stateLabel = parts[parts.length - 1] || profile.location
          return <p className="text-xs text-slate-400">{stateLabel} · {profile.settlementZone}</p>
        })()}
      </div>

      <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

      {/* Fixed-width container for info boxes - prevents graphic from shifting */}
      <div className="w-[750px] flex-shrink-0 flex items-center gap-4">
        {/* Annual Load */}
        <div className="flex flex-col gap-0.5 min-w-[120px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Annual Load</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-sky-600 leading-none">{annualGwh}</span>
            <span className="text-sm font-semibold text-sky-500">GWh</span>
          </div>
          <p className="text-xs text-slate-400">
            {isSingleYear && chartActiveYear ? `for ${chartActiveYear}` : 'projected'}
          </p>
        </div>

        <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

        <div className="flex flex-col gap-0.5 min-w-[120px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Market Capacity</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-900 leading-none">{yearCapacityMw}</span>
            <span className="text-sm font-semibold text-slate-500">MW</span>
          </div>
          <p className="text-xs text-slate-400">
            {isSingleYear && chartActiveYear ? `for ${chartActiveYear}` : 'contracted ceiling'}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 min-w-[100px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Baseload</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-teal-600 leading-none">{yearStats.avgBaseloadMw}</span>
            <span className="text-sm font-semibold text-teal-500">MW</span>
          </div>
          <p className="text-xs text-slate-400">
            {isSingleYear && chartActiveYear ? `avg for ${chartActiveYear}` : 'flat load floor'}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 min-w-[110px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Peak Demand</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-amber-500 leading-none">{yearStats.avgPeakMw}</span>
            <span className="text-sm font-semibold text-amber-400">MW</span>
          </div>
          <p className="text-xs text-slate-400">
            {isSingleYear && chartActiveYear ? `avg for ${chartActiveYear}` : 'above baseload'}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 min-w-[130px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">
            Avg Contracted Price
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-indigo-600 leading-none">${avgContractPrice.toFixed(2)}</span>
            <span className="text-sm font-semibold text-indigo-500">/MWh</span>
          </div>
          <p className="text-xs text-slate-400">
            volume-weighted · {effectiveYear}
          </p>
        </div>

        <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

        <div className="flex flex-col gap-0.5 min-w-[90px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">% Hedged</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-700 leading-none">{pctHedged}</span>
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
          <p className="text-xs text-slate-400">
            {isSingleYear && chartActiveYear ? `for ${chartActiveYear}` : 'projects / load'}
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
