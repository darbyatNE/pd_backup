import { useState, useMemo } from 'react'
import { useScopeContext } from '../../contexts/ScopeContext'
import {
  getContractsForSites,
} from '../../data/linkedContracts'
import type { SiteLoadProfile } from '../../data/loadProfile'
import { getForecastCapacityForYear } from '../../data/loadProfile'
import { LoadShape2D } from './LoadShape2D'
import { LoadShape3D } from './LoadShape3D'

interface LoadForecastChartProps {
  profile: SiteLoadProfile
  xAxis: 'hours' | 'months'
  onXAxisChange: (v: 'hours' | 'months') => void
  activeYear?: number
  onYearChange?: (year: number) => void
  yearMode?: 'single' | 'all'
  onYearModeChange?: (mode: 'single' | 'all') => void
}

export function LoadForecastChart({ profile, xAxis, onXAxisChange, activeYear: externalYear, onYearChange, yearMode: externalYearMode, onYearModeChange }: LoadForecastChartProps) {
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const { startYear, endYear, startMonth, endMonth, selectedSites } = useScopeContext()
  const contracts = useMemo(() => getContractsForSites(selectedSites), [selectedSites])

  const yearOptions = useMemo(() => {
    const out: number[] = []
    for (let y = startYear; y <= endYear; y++) out.push(y)
    return out
  }, [startYear, endYear])

  const [internalYearMode, setInternalYearMode] = useState<'single' | 'all'>('single')
  const [internalSelectedYear, setInternalSelectedYear] = useState<number>(startYear)

  const yearMode = externalYearMode ?? internalYearMode
  const selectedYear = externalYear ?? internalSelectedYear
  const activeYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? startYear)
  const showFullScope = view === '2d' && xAxis === 'months' && yearMode === 'all' && yearOptions.length > 1

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
        <h2 className="text-xl font-bold text-slate-900">Load Forecast &amp; Procurement</h2>

        {/* Chart controls - Year on left, View on right (matches Try On page) */}
        <div className="flex items-center justify-between gap-24">
          {/* Year tabs */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Year</span>
            <div className="bg-slate-100 rounded-lg p-1 flex gap-1">
              {yearOptions.map((yr) => (
                <button
                  key={yr}
                  onClick={() => { setSelectedYear(yr); setYearMode('single') }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    yearMode === 'single' && activeYear === yr
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {yr}
                </button>
              ))}
              {view === '2d' && xAxis === 'months' && (
                <button
                  onClick={() => setYearMode('all')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    yearMode === 'all'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title="Show every month in scope side-by-side"
                >
                  All
                </button>
              )}
            </div>
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
          fullScopeYears={showFullScope ? yearOptions : undefined}
          contracts={contracts}
          startYear={startYear}
          startMonth={startMonth}
          endYear={endYear}
          endMonth={endMonth}
        />
      )}
      {view === '3d' && <LoadShape3D profile={profile} year={activeYear} contracts={contracts} />}
    </div>
  )
}
