import { useMemo } from 'react'
import { Fragment } from 'react'
import {
  ComposedChart as ReComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import {
  getEffectiveLoadAt,
  getForecastCapacityForYear,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import { heColumnInScope, scopeDayCount, type PeakMode } from '../../data/peakCalendar'
import {
  contractMwAtHourInYear,
  LOAD_COLORS,
  getGenerationTypeOrder,
  GENERATION_TYPE_ORDER,
  genTypePatternId,
} from '../../data/linkedContracts'
import type { LinkedContract } from '../../data/linkedContracts'
import { GenTypePatternDefsInner } from './GenPatternDefs'
import { AssetSelectionLegend, getMapIconSvg } from './AssetSelectionLegend'

const OVERHEDGE_PATTERN_ID = 'pat-overhedge'
// Locational price line — deliberately a near-black, distinct from every load /
// generation-type color (teal, amber, red, sky, violet, emerald, cyan, magenta).
const PRICE_LINE_COLOR = '#111827'

function contractKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_')
}

function OverhedgePatternDef() {
  return (
    <pattern id={OVERHEDGE_PATTERN_ID} patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#fecaca" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#b91c1c" strokeWidth="2" />
    </pattern>
  )
}


interface BarShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
}

function makePatternedBarShape(loadColor: string, patternUrl: string) {
  return (props: BarShapeProps) => {
    const { x, y, width, height } = props
    if (!width || !height || height <= 0) return null
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={loadColor} />
        <rect x={x} y={y} width={width} height={height} fill={patternUrl} stroke={loadColor} strokeWidth={0.4} />
      </g>
    )
  }
}

function PatternDefsLayer() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <GenTypePatternDefsInner />
        <OverhedgePatternDef />
      </defs>
    </svg>
  )
}

interface TooltipPayloadItem {
  dataKey: string
  value: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  contracts: LinkedContract[]
  yLabel: string
}

function ChartTooltip({ active, payload, label, contracts, yLabel }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const r1 = (n: number) => Math.round(n * 10) / 10
  const get = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0

  // Build contract display rows using project names from contracts
  const rows: Array<{ name: string; total: number; tier: 'base' | 'peak' }> = []
  let totalContracted = 0
  
  contracts.forEach((c) => {
    const k = contractKey(c.projectName)
    const inBase = get(`c_${k}_base`)
    const inPeak = get(`c_${k}_peak`)
    const total = inBase + inPeak
    if (total <= 0) return
    totalContracted += total
    rows.push({ name: c.projectName, total, tier: c.tier })
  })

  // Sort: baseload first, then by volume descending
  rows.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'base' ? -1 : 1
    return b.total - a.total
  })

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs font-sans space-y-0.5">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {rows.map((row) => {
        const contract = contracts.find(c => c.projectName === row.name)
        const generationType = contract?.generationType
        // Extract base name without site references (remove content in parentheses)
        const baseName = row.name.replace(/\s*\([^)]+\)$/, '')
        return (
          <p key={`c-${row.name}`} className="flex items-center gap-1">
            {generationType ? (
              <svg width="12" height="12" className="flex-shrink-0">
                <g dangerouslySetInnerHTML={{ __html: getMapIconSvg(generationType).replace('width="16" height="16"', 'width="12" height="12"').replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24"') }} />
              </svg>
            ) : (
              <span style={{ color: row.tier === 'base' ? LOAD_COLORS.base : LOAD_COLORS.peak }}>■</span>
            )}
            <span className="text-slate-700">{baseName}</span>:{' '}
            <strong>{r1(row.total)} {yLabel}</strong>
          </p>
        )
      })}
      <p className="text-slate-400 pt-1 border-t border-slate-100 mt-1">
        Total: <strong>{r1(totalContracted)} {yLabel}</strong>
      </p>
    </div>
  )
}

interface LoadShape2DProps {
  profile: SiteLoadProfile
  xAxis: 'hours' | 'months'
  year: number
  fullScopeYears?: number[]
  contracts: LinkedContract[]
  startYear?: number
  startMonth?: number
  endYear?: number
  endMonth?: number
  // Hours view: which month(s) feed the typical-day average ('all' = every in-scope month)
  selectedMonth?: number | 'all'
  // Peak scope: narrows the hours axis and calendar-weights the months-view average.
  peakMode?: PeakMode
  startHE?: number
  endHE?: number
  // Per-asset chart selection (owned by the parent so it stays in sync with 3D)
  selected: Set<string>
  onToggleAsset: (projectName: string) => void
  onSelectAllAssets: () => void
  onDeselectAllAssets: () => void
  // Locational forward-price line ($/MWh), drawn on a secondary Y axis. hourly is
  // indexed by HE (index h → HE h+1); monthly is keyed `${year}-${month}`.
  priceHourly?: (number | null)[]
  priceMonthly?: Map<string, number>
}

export function LoadShape2D({ profile, xAxis, year, fullScopeYears, contracts, startYear, startMonth = 1, endYear, endMonth = 12, selectedMonth = 'all', peakMode = 'all', startHE = 1, endHE = 24, selected, onToggleAsset, onSelectAllAssets, onDeselectAllAssets, priceHourly, priceMonthly }: LoadShape2DProps) {
  // Which HE columns (1..24 ⇒ index 0..23) belong to the active peak scope.
  const heInScope = (hourIndex: number) => heColumnInScope(peakMode, startHE, endHE, hourIndex + 1)
  // A contiguous in-scope block compacts to just those hours; a non-contiguous
  // one (custom wrap) keeps the full axis with out-of-scope hours blanked.
  const scopedIdx = Array.from({ length: 24 }, (_, h) => h).filter(heInScope)
  const contiguousHE = scopedIdx.length > 0 && scopedIdx[scopedIdx.length - 1] - scopedIdx[0] + 1 === scopedIdx.length
  // Only selected contracts are charted; the legend still lists them all.
  const chartContracts = useMemo(
    () => contracts.filter((c) => selected.has(c.projectName)),
    [contracts, selected],
  )

  const buildRow = (label: string, baseMw: number, peakMw: number, contractMws: number[]) => {
    const r1 = (n: number) => Math.round(n * 10) / 10
    const totalLoad = baseMw + peakMw
    let cumul = 0
    let totalOverhedge = 0

    const cBase: number[] = []
    const cPeak: number[] = []
    contractMws.forEach((want) => {
      const start = cumul
      const end = cumul + want
      const inBase = Math.max(0, Math.min(end, baseMw) - Math.max(start, 0))
      const inPeak = Math.max(0, Math.min(end, totalLoad) - Math.max(start, baseMw))
      const over = Math.max(0, end - Math.max(start, totalLoad))
      cBase.push(inBase)
      cPeak.push(inPeak)
      totalOverhedge += over
      cumul = end
    })

    const cumulInLoad = Math.min(cumul, totalLoad)
    const baseUncovered = Math.max(0, baseMw - Math.min(cumulInLoad, baseMw))
    const peakUncovered = Math.max(0, peakMw - Math.max(0, cumulInLoad - baseMw))

    const row: Record<string, number | string> = {
      label,
      capacity: profile.capacityMw,
      base_uncovered: r1(baseUncovered),
      peak_uncovered: r1(peakUncovered),
      overhedge: -r1(totalOverhedge),
      _year: year,
    }
    sortedContracts.forEach((c, i) => {
      const k = contractKey(c.projectName)
      row[`c_${k}_base`] = r1(cBase[i])
      row[`c_${k}_peak`] = r1(cPeak[i])
    })
    return row
  }

  // Sort (selected) contracts by generation type order, then by volume descending
  const sortedContracts = useMemo(() => {
    return [...chartContracts].sort((a, b) => {
      const orderA = getGenerationTypeOrder(a.generationType)
      const orderB = getGenerationTypeOrder(b.generationType)
      if (orderA !== orderB) return orderA - orderB
      return b.mwCovered - a.mwCovered
    })
  }, [chartContracts])

  // The (year, month) pairs the typical-day profile averages over. Honours the
  // selected month ('all' = every month), the selected year (or all scope years
  // when fullScopeYears is set), and the scope's start/end-month bounds.
  const hoursPairs = useMemo(() => {
    const years = fullScopeYears && fullScopeYears.length > 1 ? fullScopeYears : [year]
    const effStartYear = startYear ?? years[0]
    const effEndYear = endYear ?? years[years.length - 1]
    const pairs: Array<{ y: number; m: number }> = []
    for (const y of years) {
      for (let m = 1; m <= 12; m++) {
        if (selectedMonth !== 'all' && m !== selectedMonth) continue
        if (y === effStartYear && m < startMonth) continue
        if (y === effEndYear && m > endMonth) continue
        pairs.push({ y, m })
      }
    }
    // Fallback: if the selected month falls outside the scope, still show it for the active year.
    if (pairs.length === 0) pairs.push({ y: year, m: selectedMonth === 'all' ? 1 : selectedMonth })
    return pairs
  }, [fullScopeYears, year, selectedMonth, startYear, startMonth, endYear, endMonth])

  // A contiguous in-scope block (all, on-peak HE8–23, custom start≤end) compacts
  // to just those hours. A non-contiguous set (custom wrap) keeps the full
  // HE1–HE24 axis with the out-of-scope hours blanked so the order stays natural.
  const hourlyData = useMemo(() => {
    const n = hoursPairs.length || 1
    const rows = Array.from({ length: 24 }, (_, h) => {
      const hourHE = `HE${h + 1}` // HE (Hour Ending) — energy industry standard
      if (!contiguousHE && !heInScope(h)) {
        // Out-of-scope hour on a full axis: labelled column, no bars, no price.
        return { ...buildRow(hourHE, 0, 0, sortedContracts.map(() => 0)), price: null }
      }
      let baseSum = 0
      let peakSum = 0
      for (const { y, m } of hoursPairs) {
        const eff = getEffectiveLoadAt(profile, h, m, y)
        baseSum += eff.baseloadMw
        peakSum += eff.peakMw
      }
      return {
        ...buildRow(hourHE, baseSum / n, peakSum / n,
          sortedContracts.map((c) => {
            let s = 0
            for (const { y, m } of hoursPairs) s += contractMwAtHourInYear(c, h, m, y)
            return s / n
          }),
        ),
        price: priceHourly?.[h] ?? null,
      }
    })
    return contiguousHE ? rows.filter((_, h) => heInScope(h)) : rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, sortedContracts, hoursPairs, peakMode, startHE, endHE, contiguousHE, priceHourly])

  const monthRows = useMemo(() => {
    const yy = (y: number) => `'${String(y).slice(-2)}`
    // Calendar-weighted monthly average: each hour is weighted by the number of
    // in-scope days that month (so off-peak counts weekends/holidays correctly).
    const rowFor = (month: number, y: number, label: string) => {
      let baseSum = 0
      let peakSum = 0
      let denom = 0
      for (let h = 0; h < 24; h++) {
        const dc = scopeDayCount(peakMode, startHE, endHE, y, month, h + 1)
        if (dc === 0) continue
        const eff = getEffectiveLoadAt(profile, h, month, y)
        baseSum += eff.baseloadMw * dc
        peakSum += eff.peakMw * dc
        denom += dc
      }
      const baseMw = denom ? baseSum / denom : 0
      const peakMw = denom ? peakSum / denom : 0
      return {
        ...buildRow(label, baseMw, peakMw,
          sortedContracts.map((c) => {
            let s = 0
            for (let h = 0; h < 24; h++) {
              const dc = scopeDayCount(peakMode, startHE, endHE, y, month, h + 1)
              if (dc > 0) s += contractMwAtHourInYear(c, h, month, y) * dc
            }
            return denom ? s / denom : 0
          }),
        ),
        price: priceMonthly?.get(`${y}-${month}`) ?? null,
      }
    }
    const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    // Filter months based on selected scope (startMonth to endMonth for the active year)
    // For boundary years, only include months within the scope range
    const effectiveStartYear = startYear ?? (fullScopeYears ? fullScopeYears[0] : year)
    const effectiveEndYear = endYear ?? (fullScopeYears ? fullScopeYears[fullScopeYears.length - 1] : year)
    
    const monthsInScope: number[] = []
    for (let m = 1; m <= 12; m++) {
      // Check if this month/year combination is within the selected scope
      let inScope = true
      if (year === effectiveStartYear && m < startMonth) inScope = false
      if (year === effectiveEndYear && m > endMonth) inScope = false
      if (inScope) monthsInScope.push(m)
    }

    if (fullScopeYears && fullScopeYears.length > 1) {
      return fullScopeYears.flatMap((y) =>
        monthsInScope.map((m) => rowFor(m, y, `${monthLabels[m - 1]} ${yy(y)}`)),
      )
    }
    return monthsInScope.map((m) => rowFor(m, year, monthLabels[m - 1]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, fullScopeYears, profile, sortedContracts, peakMode, startHE, endHE, startMonth, endMonth, startYear, endYear, priceMonthly])

  const data = xAxis === 'hours' ? hourlyData : monthRows
  const yLabel = xAxis === 'hours' ? 'MW' : 'MW avg'
  // Show the locational price line only when we actually have forecast points.
  const showPrice = data.some((r) => (r as { price?: number | null }).price != null)

  const yearsKey = fullScopeYears ? fullScopeYears.join(',') : String(year)
  // Price data arrives asynchronously (after month/year already settled), so it
  // must be part of the remount key — otherwise the keyed container won't redraw
  // the price line when a new forecast lands.
  const priceKey = xAxis === 'hours'
    ? (priceHourly ?? []).map((v) => (v == null ? '_' : Math.round(v))).join('.')
    : priceMonthly
      ? Array.from(priceMonthly.entries()).map(([k, v]) => `${k}:${Math.round(v)}`).join(',')
      : ''
  const chartKey =
    profile.siteKey + '|' +
    contracts.map((c) => `${c.projectName}:${c.mwCovered}`).join('|') +
    '|sel:' + Array.from(selected).sort().join(',') +
    '|x:' + xAxis +
    '|m:' + String(selectedMonth) +
    '|he:' + peakMode + startHE + '-' + endHE +
    '|y:' + yearsKey +
    '|pr:' + priceKey

  // Calculate max capacity to ensure Y-axis includes the capacity line
  const getCap = (y: number) => {
    const c = getForecastCapacityForYear(profile, y)
    return typeof c === 'number' && !isNaN(c) && c > 0 ? c : 0
  }
  const maxCapacity = fullScopeYears && fullScopeYears.length > 1
    ? Math.max(...fullScopeYears.map(y => getCap(y)), 0)
    : getCap(year)

  return (
    <div className="flex gap-4">
      <PatternDefsLayer />

      {/* Legend - Left Side with Columns (shared with the 3D view) */}
      <AssetSelectionLegend
        contracts={contracts}
        selected={selected}
        onToggle={onToggleAsset}
        onSelectAll={onSelectAllAssets}
        onDeselectAll={onDeselectAllAssets}
        year={year}
        fullScopeYears={fullScopeYears}
      />

      {/* Chart - Right Side */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height={300} key={chartKey}>
          <ReComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: showPrice ? 8 : 16, left: 8, bottom: 4 }} barCategoryGap="20%">
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
              domain={[0, Math.round(Math.max(maxCapacity * 1.1, 10))]}
            />
            {showPrice && (
              <YAxis
                yAxisId="price"
                orientation="right"
                tick={{ fill: PRICE_LINE_COLOR, fontSize: 11, fontFamily: 'Inter' }}
                axisLine={false} tickLine={false} width={48}
                tickFormatter={(v) => `$${v}`}
                label={{ value: '$/MWh', angle: 90, position: 'insideRight', fill: PRICE_LINE_COLOR, fontSize: 11, offset: 10 }}
              />
            )}
            <Tooltip content={<ChartTooltip contracts={chartContracts} yLabel={yLabel} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            {(() => {
              // In multi-year view, show capacity line for each year segment
              // Uses getForecastCapacityForYear to match Capacity tab calculation
              if (fullScopeYears && fullScopeYears.length > 1) {
                return fullScopeYears.map((y) => {
                  const cap = getForecastCapacityForYear(profile, y)
                  if (!cap || cap <= 0) return null
                  // Find first and last data points for this year to position the line
                  const yearIndices = data
                    .map((row, idx) => ({ idx, rowYear: (row as any)._year }))
                    .filter(({ rowYear }) => rowYear === y)
                  if (yearIndices.length === 0) return null
                  const firstIdx = yearIndices[0].idx
                  const lastIdx = yearIndices[yearIndices.length - 1].idx
                  const x1 = `${(firstIdx / Math.max(1, data.length - 1)) * 100}%`
                  const x2 = `${((lastIdx + 0.5) / Math.max(1, data.length - 1)) * 100}%`
                  return (
                    <ReferenceLine
                      key={`cap-${y}`}
                      y={cap}
                      x1={x1}
                      x2={x2}
                      stroke="#ef4444"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={({ viewBox }: any) => {
                          const { x, y: ly, width } = viewBox;
                          return <text x={x + width - 4} y={ly - 4} textAnchor="end" fill="#ef4444" fontSize={10}>{`Cap. ${cap} MW (${y})`}</text>;
                        }}
                    />
                  )
                })
              }
              // Single year view - single capacity line
              const cap = getForecastCapacityForYear(profile, year)
              if (!cap || cap <= 0) return null
              return (
                <ReferenceLine y={cap} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
                  label={({ viewBox }: any) => {
                      const { x, y: ly, width } = viewBox;
                      return <text x={x + width - 4} y={ly - 4} textAnchor="end" fill="#ef4444" fontSize={10}>{`Cap. ${cap} MW`}</text>;
                    }}
                />
              )
            })()}
            <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} />

            {sortedContracts.map((c) => {
              const k = contractKey(c.projectName)
              return (
                <Fragment key={`c-${c.projectName}`}>
                  <Bar
                    dataKey={`c_${k}_base`}
                    stackId="load"
                    fill={LOAD_COLORS.base}
                    shape={makePatternedBarShape(LOAD_COLORS.base, `url(#${genTypePatternId(c.generationType, c.commitment)})`)}
                    name={c.projectName}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey={`c_${k}_peak`}
                    stackId="load"
                    fill={LOAD_COLORS.peak}
                    shape={makePatternedBarShape(LOAD_COLORS.peak, `url(#${genTypePatternId(c.generationType, c.commitment)})`)}
                    name={c.projectName}
                    isAnimationActive={false}
                  />
                </Fragment>
              )
            })}

            <Bar
              dataKey="base_uncovered"
              stackId="load"
              fill={LOAD_COLORS.base}
              stroke={LOAD_COLORS.base}
              strokeWidth={0.4}
              name="Baseload"
              isAnimationActive={false}
            />

            <Bar
              dataKey="peak_uncovered"
              stackId="load"
              fill={LOAD_COLORS.peak}
              stroke={LOAD_COLORS.peak}
              strokeWidth={0.4}
              radius={[3, 3, 0, 0]}
              name="Peak"
              isAnimationActive={false}
            />

            <Bar
              dataKey="overhedge"
              stackId="load"
              fill={`url(#${OVERHEDGE_PATTERN_ID})`}
              stroke="#b91c1c"
              strokeWidth={0.5}
              name="Over-hedge"
              isAnimationActive={false}
            />

            {showPrice && (
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke={PRICE_LINE_COLOR}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                name="Forecast $/MWh"
                isAnimationActive={false}
              />
            )}
          </ReComposedChart>
        </ResponsiveContainer>

        {/* Pattern Legend - Below X-axis */}
        <div className="mt-4 border-t border-slate-200 pt-3 space-y-2 text-xs">
          {/* Load type swatches — relocated here from the left "LOAD TYPE" column */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Load Type:</span>
            <div className="flex items-center gap-2">
              <svg width="20" height="12" className="flex-shrink-0"><rect width="20" height="12" fill={LOAD_COLORS.base} /></svg>
              <span className="text-slate-600 font-medium">Baseload</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="12" className="flex-shrink-0"><rect width="20" height="12" fill={LOAD_COLORS.peak} /></svg>
              <span className="text-slate-600 font-medium">Peak</span>
            </div>
            <div className="flex items-center gap-2" title="MW contracted in excess of the load — over-hedge">
              <svg width="20" height="12" className="flex-shrink-0">
                <rect width="20" height="12" fill="#fecaca" />
                <rect width="20" height="12" fill={`url(#${OVERHEDGE_PATTERN_ID})`} />
              </svg>
              <span className="text-slate-600 font-medium">Over-hedge</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Generation Type Patterns:</span>
            {GENERATION_TYPE_ORDER.map((genType) => {
              const visibleYears = fullScopeYears ?? [year];
              const hasActiveContracts = contracts.some(c =>
                c.generationType === genType &&
                visibleYears.some((y) => y >= c.startYear && y <= c.endYear)
              );
              if (!hasActiveContracts) return null;

              return (
                <div key={genType} className="flex items-center gap-2">
                  <svg width="20" height="12" className="flex-shrink-0">
                    <rect width="20" height="12" fill="white" stroke="#e2e8f0" strokeWidth="0.5"/>
                    <rect width="20" height="12" fill={`url(#${genTypePatternId(genType)})`} opacity="0.8"/>
                  </svg>
                  <span className="text-slate-600 font-medium">{genType}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
