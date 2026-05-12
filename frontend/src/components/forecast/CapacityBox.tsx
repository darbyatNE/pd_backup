import {
  getSiteCapacityForYear,
  getScopeAvgAnnualLoadMwh,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'

const DEFAULT_ANNUAL_GROWTH = 0.05

interface CapacityBoxProps {
  profile: SiteLoadProfile
  startYear: number
  endYear: number
}

export function CapacityBox({ profile, startYear, endYear }: CapacityBoxProps) {
  const yearsOfGrowth = Math.max(0, endYear - startYear)
  const documented = profile.capacityByYear && Object.keys(profile.capacityByYear).length > 0
  const forecastCapacityMw = documented
    ? getSiteCapacityForYear(profile, endYear)
    : Math.round(profile.capacityMw * Math.pow(1 + DEFAULT_ANNUAL_GROWTH, yearsOfGrowth))
  const growthDelta = forecastCapacityMw - profile.capacityMw
  const growthPct = profile.capacityMw === 0
    ? 0
    : Math.round((growthDelta / profile.capacityMw) * 100)

  const annualMwh = getScopeAvgAnnualLoadMwh(profile, startYear, endYear)
  const annualGwh = Math.round(annualMwh / 1000)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5 flex flex-wrap items-center gap-8">
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Site</p>
        <p className="text-base font-bold text-slate-900 truncate">{profile.name}</p>
        {(() => {
          const parts = profile.location.split(',').map((s) => s.trim())
          const stateLabel = parts[parts.length - 1] || profile.location
          return <p className="text-xs text-slate-400">{stateLabel} · {profile.settlementZone}</p>
        })()}
      </div>

      <span className="w-px h-10 bg-slate-100 flex-shrink-0 hidden sm:block" />

      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Market Capacity</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-slate-900 leading-none">{profile.capacityMw}</span>
          <span className="text-sm font-semibold text-slate-500">MW</span>
        </div>
        <p className="text-xs text-slate-400">contracted ceiling</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          Forecast Capacity
        </p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-indigo-600 leading-none">{forecastCapacityMw}</span>
          <span className="text-sm font-semibold text-indigo-500">MW</span>
        </div>
        <p className="text-xs text-slate-400">
          {yearsOfGrowth === 0
            ? `same as current · ${endYear} scope`
            : <>by Dec {endYear} · <span className="text-emerald-600 font-semibold">+{growthPct}%</span></>}
        </p>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Baseload</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-teal-600 leading-none">{profile.baseloadMw}</span>
          <span className="text-sm font-semibold text-teal-500">MW</span>
        </div>
        <p className="text-xs text-slate-400">flat load floor</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Peak Demand</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-amber-500 leading-none">{profile.peakDemandMw}</span>
          <span className="text-sm font-semibold text-amber-400">MW</span>
        </div>
        <p className="text-xs text-slate-400">above baseload</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Load Factor</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-slate-700 leading-none">{profile.loadFactorPct}</span>
          <span className="text-sm font-semibold text-slate-500">%</span>
        </div>
        <p className="text-xs text-slate-400">avg / capacity</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Annual Load</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-sky-600 leading-none">{annualGwh}</span>
          <span className="text-sm font-semibold text-sky-500">GWh</span>
        </div>
        <p className="text-xs text-slate-400">projected</p>
      </div>

      <div className="flex-1 min-w-[160px]">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Capacity utilization</p>
        <div className="relative h-5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-teal-400"
            style={{ width: `${(profile.baseloadMw / profile.capacityMw) * 100}%` }}
          />
          <div
            className="absolute inset-y-0 rounded-full bg-amber-400"
            style={{
              left: `${(profile.baseloadMw / profile.capacityMw) * 100}%`,
              width: `${(profile.peakDemandMw / profile.capacityMw) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-teal-400" />Baseload
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />Peak
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-slate-200" />Headroom
          </span>
        </div>
      </div>
    </div>
  )
}
