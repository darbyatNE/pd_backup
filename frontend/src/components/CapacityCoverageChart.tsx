'use client'

// Capacity coverage chart for the Procurement Planning → Capacity tab.
// Mirrors the load chart on the Energy tab but for capacity MW instead of
// energy MWh. Capacity is a single-tier value (no baseload/peak split), so the
// bar uses a single indigo color and sources shade slices via SVG patterns.
// Sources contracted in excess of the site's capacity show below y=0 as the
// shared red over-hedge pattern.

import { useState, useMemo, Fragment } from 'react'
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { type SiteLoadProfile, getSiteCapacityForYear } from '../data/loadProfile'
import {
  getCapacitySourcesForSites,
  capacityPatternId,
  capacitySourceKey,
  CAPACITY_COLOR,
  PATTERN_FG,
  type CapacitySource,
} from '../data/linkedContracts'
import { useScopeContext } from '../contexts/ScopeContext'

// ─── Pattern defs (single-color bg, slate fg) ─────────────────────────────

function CapacityPatternDef({ s }: { s: CapacitySource }) {
  const id = capacityPatternId(s)
  const fg = PATTERN_FG
  switch (s.pattern) {
    case 'diagonal':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="7" height="7">
          <path d="M0,7 L7,0 M-1,1 L1,-1 M6,8 L8,6" stroke={fg} strokeWidth="1.3" />
        </pattern>
      )
    case 'dots':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.3" fill={fg} />
        </pattern>
      )
    case 'crosshatch':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8">
          <path d="M0,8 L8,0" stroke={fg} strokeWidth="1" />
          <path d="M0,0 L8,8" stroke={fg} strokeWidth="1" />
        </pattern>
      )
    case 'vertical':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="5" height="5">
          <line x1="2.5" y1="0" x2="2.5" y2="5" stroke={fg} strokeWidth="1.4" />
        </pattern>
      )
    case 'wave':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="10" height="6">
          <path d="M0,3 Q2.5,0 5,3 T10,3" fill="none" stroke={fg} strokeWidth="1.2" />
        </pattern>
      )
    case 'grid':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
          <path d="M0,0 L6,0 M0,3 L6,3 M0,0 L0,6 M3,0 L3,6" stroke={fg} strokeWidth="0.7" />
        </pattern>
      )
    default:
      return null
  }
}

const CAPACITY_OVERHEDGE_PATTERN_ID = 'pat-cap-overhedge'

function CapacityOverhedgePatternDef() {
  return (
    <pattern id={CAPACITY_OVERHEDGE_PATTERN_ID} patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#fecaca" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#b91c1c" strokeWidth="2" />
    </pattern>
  )
}

function CapacityPatternDefsLayer({ sources }: { sources: CapacitySource[] }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {sources.map((s) => (
          <Fragment key={s.sourceName}>
            <CapacityPatternDef s={s} />
          </Fragment>
        ))}
        <CapacityOverhedgePatternDef />
      </defs>
    </svg>
  )
}

// Solid color rect with a transparent-bg pattern overlay — same trick as the
// load chart so the source's slate strokes sit on top of indigo.
function makePatternedBarShape(loadColor: string, patternUrl: string) {
  // eslint-disable-next-line react/display-name
  return (props: any) => {
    const { x, y, width, height } = props
    if (width <= 0 || height <= 0) return null
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={loadColor} />
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={patternUrl}
          stroke={loadColor}
          strokeWidth={0.4}
        />
      </g>
    )
  }
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── 2D capacity bars ─────────────────────────────────────────────────────

function CapacityShape2D({
  profile,
  sources,
  xAxis,
  year,
  fullScopeYears,
}: {
  profile: SiteLoadProfile
  sources: CapacitySource[]
  xAxis: 'hours' | 'months'
  year: number
  fullScopeYears?: number[]
  /** kept for forced remount key only */
  siteKey?: string
}) {
  // Capacity is flat across hours/months WITHIN a year, but documented
  // expansions can step it up year-over-year. Each row carries its own
  // capacity (resolved from `profile.capacityByYear` for the row's year),
  // so multi-year views show the bar growing as the build-out lands.
  const buildRow = (label: string, yearForRow: number) => {
    const r1 = (n: number) => Math.round(n * 10) / 10
    const capacityMw = getSiteCapacityForYear(profile, yearForRow)
    let cumul = 0
    let totalOverhedge = 0
    const cMW: number[] = []
    sources.forEach((s) => {
      const start = cumul
      const end = cumul + s.mwCovered
      const inCap = Math.max(0, Math.min(end, capacityMw) - Math.max(start, 0))
      const over = Math.max(0, end - Math.max(start, capacityMw))
      cMW.push(inCap)
      totalOverhedge += over
      cumul = end
    })
    const cumulInCap = Math.min(cumul, capacityMw)
    const uncovered = Math.max(0, capacityMw - cumulInCap)
    const row: Record<string, number | string> = {
      label,
      cap_uncovered: r1(uncovered),
      overhedge: -r1(totalOverhedge),
    }
    sources.forEach((s, i) => {
      const k = capacitySourceKey(s.sourceName)
      row[`s_${k}`] = r1(cMW[i])
    })
    return row
  }

  const hourlyData = useMemo(
    () => Array.from({ length: 24 }, (_, h) => buildRow(`${h}h`, year)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, sources, year],
  )

  const monthRows = useMemo(() => {
    const yy = (y: number) => `'${String(y).slice(-2)}`
    if (fullScopeYears && fullScopeYears.length > 1) {
      return fullScopeYears.flatMap((y) =>
        MONTH_LABELS.map((m) => buildRow(`${m} ${yy(y)}`, y)),
      )
    }
    return MONTH_LABELS.map((m) => buildRow(m, year))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullScopeYears, profile, sources, year])

  const data = xAxis === 'hours' ? hourlyData : monthRows
  const yLabel = 'MW'

  // Capacity for the active year — drives the static reference line in
  // single-year views. In all-years mode the bar tops step year-over-year, so
  // we hide the static line and let the bar heights speak for themselves.
  const activeYearCapacity = getSiteCapacityForYear(profile, year)
  const showCapRefLine = !fullScopeYears || fullScopeYears.length <= 1

  function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const r1 = (n: number) => Math.round(n * 10) / 10
    const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value ?? 0
    const unc = get('cap_uncovered')
    let totalCovered = 0
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs font-sans space-y-0.5">
        <p className="font-bold text-slate-700 mb-1">{label}</p>
        {sources.map((s) => {
          const k = capacitySourceKey(s.sourceName)
          const v = get(`s_${k}`)
          totalCovered += v
          if (v <= 0) return null
          return (
            <p key={`s-${s.sourceName}`}>
              <span style={{ color: CAPACITY_COLOR }}>■</span>{' '}
              <span className="text-slate-700">{s.sourceName}</span>:{' '}
              <strong>{r1(v)} {yLabel}</strong>
            </p>
          )
        })}
        {unc > 0 && (
          <p>
            <span style={{ color: CAPACITY_COLOR }}>■</span>{' '}
            <span className="text-slate-500">Uncovered</span>: <strong>{r1(unc)} {yLabel}</strong>
          </p>
        )}
        <p className="text-slate-400 pt-1 border-t border-slate-100 mt-1">
          Capacity: <strong>{r1(totalCovered + unc)} {yLabel}</strong>
        </p>
        {(() => {
          const v = -get('overhedge')
          if (v <= 0) return null
          return (
            <div className="pt-1 mt-1 border-t border-rose-100">
              <p className="text-rose-700 font-semibold">Over-hedge: −{r1(v)} {yLabel}</p>
            </div>
          )
        })()}
      </div>
    )
  }

  // Force remount on site / source / axis / year changes so Recharts rebuilds
  // stacks from scratch — same approach as the load chart.
  const yearsKey = fullScopeYears ? fullScopeYears.join(',') : String(year)
  const chartKey =
    profile.siteKey + '|' +
    sources.map((s) => `${s.sourceName}:${s.mwCovered}`).join('|') +
    '|x:' + xAxis +
    '|y:' + yearsKey

  return (
    <div>
      <CapacityPatternDefsLayer sources={sources} />
      <ResponsiveContainer width="100%" height={300} key={chartKey}>
        <ReBarChart data={data} stackOffset="sign" margin={{ top: 8, right: 16, left: 8, bottom: 4 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
            axisLine={false} tickLine={false}
            interval={xAxis === 'hours' ? 2 : (data.length > 18 ? 2 : 0)}
          />
          <YAxis
            tickFormatter={(v) => `${v}`}
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
            axisLine={false} tickLine={false} width={40}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          {showCapRefLine && (
            <ReferenceLine y={activeYearCapacity} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
              label={{ value: `Capacity ${activeYearCapacity} MW`, position: 'right', fill: '#ef4444', fontSize: 10 }}
            />
          )}
          <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} />

          {sources.map((s) => {
            const k = capacitySourceKey(s.sourceName)
            return (
              <Bar
                key={`s-${s.sourceName}`}
                dataKey={`s_${k}`}
                stackId="cap"
                fill={CAPACITY_COLOR}
                shape={makePatternedBarShape(CAPACITY_COLOR, `url(#${capacityPatternId(s)})`)}
                name={s.sourceName}
                isAnimationActive={false}
              />
            )
          })}

          <Bar
            dataKey="cap_uncovered"
            stackId="cap"
            fill={CAPACITY_COLOR}
            stroke={CAPACITY_COLOR}
            strokeWidth={0.4}
            radius={[3, 3, 0, 0]}
            name="Uncovered"
            isAnimationActive={false}
          />

          <Bar
            dataKey="overhedge"
            stackId="cap"
            fill={`url(#${CAPACITY_OVERHEDGE_PATTERN_ID})`}
            stroke="#b91c1c"
            strokeWidth={0.5}
            name="Over-hedge"
            isAnimationActive={false}
          />
        </ReBarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="inline-block w-5 h-3" style={{ background: CAPACITY_COLOR }} />
          <span className="font-medium text-slate-700">Capacity</span>
        </div>
        {sources.map((s) => (
          <div
            key={s.sourceName}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200"
            title={`${s.channel} · covers ${s.mwCovered} MW`}
          >
            <svg width="20" height="12">
              <rect width="20" height="12" fill={CAPACITY_COLOR} />
              <rect width="20" height="12" fill={`url(#${capacityPatternId(s)})`} stroke={CAPACITY_COLOR} strokeWidth="0.5" />
            </svg>
            <span className="font-medium text-slate-700">{s.sourceName}</span>
            <span className="text-slate-400">{s.mwCovered} MW</span>
          </div>
        ))}
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200"
          title="MW contracted in excess of capacity — over-hedge"
        >
          <svg width="20" height="12">
            <rect width="20" height="12" fill={`url(#${CAPACITY_OVERHEDGE_PATTERN_ID})`} stroke="#b91c1c" strokeWidth="0.5" />
          </svg>
          <span className="font-medium text-rose-700">Over-hedge</span>
        </div>
      </div>
    </div>
  )
}

// ─── Wrapper with view controls — mirrors LoadForecastChart ──────────────

export default function CapacityCoverageChart({ profile }: { profile: SiteLoadProfile }) {
  const [xAxis, setXAxis] = useState<'hours' | 'months'>('hours')
  const { startYear, endYear, selectedSites } = useScopeContext()
  const sources = useMemo(() => getCapacitySourcesForSites(selectedSites), [selectedSites])

  const yearOptions = useMemo(() => {
    const out: number[] = []
    for (let y = startYear; y <= endYear; y++) out.push(y)
    return out
  }, [startYear, endYear])

  const [yearMode, setYearMode] = useState<'single' | 'all'>('single')
  const [selectedYear, setSelectedYear] = useState<number>(startYear)
  const activeYear = yearOptions.includes(selectedYear) ? selectedYear : (yearOptions[0] ?? startYear)
  const showFullScope = xAxis === 'months' && yearMode === 'all' && yearOptions.length > 1
  const activeYearCapacity = getSiteCapacityForYear(profile, activeYear)
  const hasDocumentedExpansion =
    !!profile.capacityByYear && Object.keys(profile.capacityByYear).length > 1

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-bold text-slate-900">Capacity Coverage &amp; Sources</h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* X-axis toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {([['hours', 'Hours'], ['months', 'Months']] as const).map(([k, label], i) => (
              <button
                key={k}
                onClick={() => setXAxis(k)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: xAxis === k ? CAPACITY_COLOR : '#fff',
                  color: xAxis === k ? '#fff' : '#64748b',
                  borderRight: i === 0 ? '1px solid #e2e8f0' : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Year tabs — multi-year scope */}
      {yearOptions.length > 1 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Year</span>
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
            {xAxis === 'months' && (
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
          <span className="text-[11px] text-slate-400">
            {showFullScope
              ? `${yearOptions.length}-year view · ${yearOptions.length * 12} months`
              : `Showing ${activeYear} (${yearOptions[0]}–${yearOptions[yearOptions.length - 1]} in scope)`}
          </span>
        </div>
      )}

      {/* Capacity reference legend */}
      <div className="flex items-center gap-5 mb-3 text-xs text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0 border-t-2 border-dashed border-red-400" />
          <span className="font-medium">
            Capacity {activeYearCapacity} MW
            {hasDocumentedExpansion && !showFullScope && (
              <span className="text-slate-400 font-normal"> · for {activeYear}</span>
            )}
          </span>
        </div>
        {hasDocumentedExpansion && showFullScope && (
          <div className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 font-medium">
            Bar height steps year-over-year per documented expansion
          </div>
        )}
        <span className="text-slate-400">
          Bars are filled in by linked capacity sources; uncovered remainder shown as <strong>Uncovered</strong>.
        </span>
      </div>

      <CapacityShape2D
        profile={profile}
        sources={sources}
        xAxis={xAxis}
        year={activeYear}
        fullScopeYears={showFullScope ? yearOptions : undefined}
      />
    </div>
  )
}
