import { useState, useMemo, useEffect, useRef } from 'react'
import { useScopeContext } from '../../contexts/ScopeContext'
import type { LinkedContract } from '../../data/linkedContracts'
import type { SiteLoadProfile } from '../../data/loadProfile'
import { getForecastCapacityForYear } from '../../data/loadProfile'
import { LoadShape2D } from './LoadShape2D'
import { LoadShape3D } from './LoadShape3D'

interface LoadForecastChartProps {
  profile: SiteLoadProfile
  contracts: LinkedContract[]
  xAxis: 'hours' | 'months'
  onXAxisChange: (v: 'hours' | 'months') => void
  activeYear?: number
  onYearChange?: (year: number) => void
  yearMode?: 'single' | 'all'
  onYearModeChange?: (mode: 'single' | 'all') => void
}

export function LoadForecastChart({ profile, contracts, xAxis, onXAxisChange, activeYear: externalYear, onYearChange, yearMode: externalYearMode, onYearModeChange }: LoadForecastChartProps) {
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const { startYear, endYear, startMonth, endMonth } = useScopeContext()

  // Per-asset chart selection — owned here so the 2D and 3D views stay in sync.
  // Every asset defaults to checked; de-selections drop it from whichever chart is shown.
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(() => new Set(contracts.map((c) => c.projectName)))
  const knownNamesRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    setSelectedAssets((prev) => {
      const current = new Set(contracts.map((c) => c.projectName))
      const next = new Set<string>()
      prev.forEach((n) => { if (current.has(n)) next.add(n) })
      contracts.forEach((c) => { if (!knownNamesRef.current.has(c.projectName)) next.add(c.projectName) })
      knownNamesRef.current = current
      return next
    })
  }, [contracts])
  const toggleAsset = (projectName: string) =>
    setSelectedAssets((prev) => {
      const next = new Set(prev)
      if (next.has(projectName)) next.delete(projectName)
      else next.add(projectName)
      return next
    })
  const selectAllAssets = () => setSelectedAssets(new Set(contracts.map((c) => c.projectName)))
  const deselectAllAssets = () => setSelectedAssets(new Set())

  const yearOptions = useMemo(() => {
    const out: number[] = []
    for (let y = startYear; y <= endYear; y++) out.push(y)
    return out
  }, [startYear, endYear])

  const [internalYearMode, setInternalYearMode] = useState<'single' | 'all'>('single')
  const [internalSelectedYear, setInternalSelectedYear] = useState<number>(startYear)
  // Hours view: which month feeds the typical-day average ('all' = every in-scope month)
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all')

  const yearMode = externalYearMode ?? internalYearMode
  const selectedYear = externalYear ?? internalSelectedYear
  const activeYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? startYear)
  const allYears = yearMode === 'all' && yearOptions.length > 1
  const showFullScope = view === '2d' && xAxis === 'months' && allYears
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Caption describing the period currently charted.
  const periodCaption = (() => {
    const yearLabel = allYears && yearOptions.length > 1
      ? `${yearOptions[0]}–${yearOptions[yearOptions.length - 1]}`
      : String(activeYear)
    if (xAxis === 'hours') {
      if (allYears && selectedMonth === 'all') return `Entire period · ${yearLabel} · avg typical day`
      const monthLabel = selectedMonth === 'all' ? 'All months' : MONTH_LABELS[selectedMonth - 1]
      return `${monthLabel} · ${yearLabel} · avg typical day`
    }
    return allYears ? `All months · ${yearLabel}` : yearLabel
  })()

  const setYearMode = (mode: 'single' | 'all') => {
    if (onYearModeChange) {
      onYearModeChange(mode)
    } else {
      setInternalYearMode(mode)
    }
  }

  const setSelectedYear = (year: number) => {
    if (onYearChange) {
      onYearChange(year)
    } else {
      setInternalSelectedYear(year)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-bold text-slate-900" title="Visualize your energy consumption patterns and contract coverage: Compare hourly/monthly demand against contracted positions, identify coverage gaps, and optimize procurement timing to minimize costs and ensure reliable supply.">
          Load Forecast &amp; Procurement
        </h2>

        {/* Chart controls - Year on left, View on right (matches Try On page) */}
        <div className="flex items-center justify-between gap-24">
          {/* Year tabs */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Year</span>
            <div className="bg-slate-100 rounded-lg p-1 flex gap-1 max-w-[360px] overflow-x-auto">
              {yearOptions.map((yr) => (
                <button
                  key={yr}
                  onClick={() => { setSelectedYear(yr); setYearMode('single') }}
                  className={`flex-shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    yearMode === 'single' && activeYear === yr
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {yr}
                </button>
              ))}
              {view === '2d' && (
                <button
                  onClick={() => setYearMode('all')}
                  className={`flex-shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    yearMode === 'all'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title={xAxis === 'months' ? 'Show every month in scope side-by-side' : 'Average across every year in scope'}
                >
                  All
                </button>
              )}
            </div>

            {/* Month selector — narrows the typical-day average to one month (Hours view) */}
            {view === '2d' && xAxis === 'hours' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Month</span>
                <select
                  value={String(selectedMonth)}
                  onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="text-xs font-medium bg-slate-100 rounded-md px-2 py-1 text-slate-700 border-0 focus:ring-1 focus:ring-teal-500"
                  title="Average the whole period or isolate a single month"
                >
                  <option value="all">All months (avg)</option>
                  {MONTH_LABELS.map((label, i) => (
                    <option key={label} value={i + 1}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* View tabs with 2d/3d and hours/months */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">View</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {(['2d', '3d'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    background: view === v ? '#0D0630' : '#fff',
                    color: view === v ? '#fff' : '#64748b',
                    borderRight: v === '2d' ? '1px solid #e2e8f0' : undefined,
                  }}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>

            {view === '2d' && (
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {([['hours', 'Hours'], ['months', 'Months']] as const).map(([k, label], i) => (
                  <button
                    key={k}
                    onClick={() => onXAxisChange(k)}
                    className="px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: xAxis === k ? '#0d9488' : '#fff',
                      color: xAxis === k ? '#fff' : '#64748b',
                      borderRight: i === 0 ? '1px solid #e2e8f0' : undefined,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {view === '2d' && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{periodCaption}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{xAxis === 'hours' ? 'Hours (HE)' : 'Months'}</span>
        </div>
      )}

      {view === '2d' && (
        <div className="flex items-center gap-5 mb-3 text-xs text-slate-500 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0 border-t-2 border-dashed border-red-400" />
            <span className="font-medium">
              {showFullScope && profile.capacityByYear && Object.keys(profile.capacityByYear).length > 1
                ? `Capacity varies by year (scope: ${yearOptions.join(', ')})`
                : `Capacity ${getForecastCapacityForYear(profile, activeYear)} MW${
                    profile.capacityByYear && Object.keys(profile.capacityByYear).length > 1 ? ` · for ${activeYear}` : ''
                  }`
              }
            </span>
          </div>
          {showFullScope && profile.capacityByYear && Object.keys(profile.capacityByYear).length > 1 && (
            <div className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 font-medium">
              Red line shows summed capacity per year — steps up as build-out lands
            </div>
          )}
          <span className="text-slate-400">Bars are filled in by linked contracts; uncovered remainder shown as <strong>Unhedged</strong>.</span>
        </div>
      )}

      {view === '2d' && (
        <LoadShape2D
          profile={profile}
          xAxis={xAxis}
          year={activeYear}
          fullScopeYears={allYears ? yearOptions : undefined}
          contracts={contracts}
          startYear={startYear}
          startMonth={startMonth}
          endYear={endYear}
          endMonth={endMonth}
          selectedMonth={selectedMonth}
          selected={selectedAssets}
          onToggleAsset={toggleAsset}
          onSelectAllAssets={selectAllAssets}
          onDeselectAllAssets={deselectAllAssets}
        />
      )}
      {view === '3d' && (
        <LoadShape3D
          profile={profile}
          year={activeYear}
          contracts={contracts}
          selected={selectedAssets}
          onToggleAsset={toggleAsset}
          onSelectAllAssets={selectAllAssets}
          onDeselectAllAssets={deselectAllAssets}
        />
      )}
    </div>
  )
}
