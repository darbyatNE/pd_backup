import { useMemo } from 'react'
import { Fragment } from 'react'
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
import {
  getEffectiveLoadAt,
  getForecastCapacityForYear,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import {
  contractMwForHourAvgInYear,
  contractMwForMonthInYear,
  patternId,
  LOAD_COLORS,
  PATTERN_FG,
} from '../../data/linkedContracts'
import type { LinkedContract, ContractTier } from '../../data/linkedContracts'

const OVERHEDGE_PATTERN_ID = 'pat-overhedge'

function contractKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_')
}

function PatternDef({ c, tier }: { c: LinkedContract; tier: ContractTier }) {
  const id = patternId(c, tier)
  const fg = PATTERN_FG
  switch (c.pattern) {
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

function PatternDefsLayer({ contracts }: { contracts: LinkedContract[] }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {contracts.map((c) => (
          <Fragment key={c.projectName}>
            <PatternDef c={c} tier="base" />
            <PatternDef c={c} tier="peak" />
          </Fragment>
        ))}
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
  const baseUnc = get('base_uncovered')
  const peakUnc = get('peak_uncovered')
  let totalContracted = 0

  // Consolidate contracts by base name (removing site suffix)
  const consolidated = new Map<string, { total: number; inBase: number; inPeak: number; count: number }>()
  contracts.forEach((c) => {
    const k = contractKey(c.projectName)
    const inBase = get(`c_${k}_base`)
    const inPeak = get(`c_${k}_peak`)
    const total = inBase + inPeak
    if (total <= 0) return
    totalContracted += total

    // Extract base name (remove " - siteKey" suffix)
    const baseName = c.projectName.replace(/\s+-\s+\S+$/, '')
    const existing = consolidated.get(baseName)
    if (existing) {
      consolidated.set(baseName, {
        total: existing.total + total,
        inBase: existing.inBase + inBase,
        inPeak: existing.inPeak + inPeak,
        count: existing.count + 1,
      })
    } else {
      consolidated.set(baseName, { total, inBase, inPeak, count: 1 })
    }
  })

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs font-sans space-y-0.5">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {Array.from(consolidated.entries()).map(([baseName, data]) => {
        const avgTotal = data.total / data.count
        const dominantColor = data.inBase >= data.inPeak ? LOAD_COLORS.base : LOAD_COLORS.peak
        const siteInfo = data.count > 1 ? ` (${r1(avgTotal)} avg per site × ${data.count})` : ''
        return (
          <p key={`c-${baseName}`}>
            <span style={{ color: dominantColor }}>■</span>{' '}
            <span className="text-slate-700">{baseName}</span>:{' '}
            <strong>{r1(data.total)} {yLabel}</strong>
            <span className="text-slate-500">{siteInfo}</span>
          </p>
        )
      })}
      {baseUnc > 0 && (
        <p>
          <span style={{ color: LOAD_COLORS.base }}>■</span>{' '}
          <span className="text-slate-500">Baseload (uncovered)</span>: <strong>{r1(baseUnc)} {yLabel}</strong>
        </p>
      )}
      {peakUnc > 0 && (
        <p>
          <span style={{ color: LOAD_COLORS.peak }}>■</span>{' '}
          <span className="text-slate-500">Peak (uncovered)</span>: <strong>{r1(peakUnc)} {yLabel}</strong>
        </p>
      )}
      <p className="text-slate-400 pt-1 border-t border-slate-100 mt-1">
        Load: <strong>{r1(totalContracted + baseUnc + peakUnc)} {yLabel}</strong>
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
}

export function LoadShape2D({ profile, xAxis, year, fullScopeYears, contracts, startYear, startMonth = 1, endYear, endMonth = 12 }: LoadShape2DProps) {
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
    contracts.forEach((c, i) => {
      const k = contractKey(c.projectName)
      row[`c_${k}_base`] = r1(cBase[i])
      row[`c_${k}_peak`] = r1(cPeak[i])
    })
    return row
  }

  const hourlyData = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => {
      let baseSum = 0
      let peakSum = 0
      for (let m = 1; m <= 12; m++) {
        const eff = getEffectiveLoadAt(profile, h, m, year)
        baseSum += eff.baseloadMw
        peakSum += eff.peakMw
      }
      const avgBase = baseSum / 12
      const avgPeak = peakSum / 12
      return buildRow(`${h}h`, avgBase, avgPeak,
        contracts.map((c) => contractMwForHourAvgInYear(c, h, year)),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, contracts, year])

  const monthRows = useMemo(() => {
    const yy = (y: number) => `'${String(y).slice(-2)}`
    const rowFor = (month: number, y: number, label: string) => {
      let baseSum = 0
      let peakSum = 0
      for (let h = 0; h < 24; h++) {
        const eff = getEffectiveLoadAt(profile, h, month, y)
        baseSum += eff.baseloadMw
        peakSum += eff.peakMw
      }
      const baseMw = baseSum / 24
      const peakMw = peakSum / 24
      return buildRow(label, baseMw, peakMw,
        contracts.map((c) => contractMwForMonthInYear(c, y, month)),
      )
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
  }, [year, fullScopeYears, profile, contracts])

  const data = xAxis === 'hours' ? hourlyData : monthRows
  const yLabel = xAxis === 'hours' ? 'MW' : 'MW avg'

  const yearsKey = fullScopeYears ? fullScopeYears.join(',') : String(year)
  const chartKey =
    profile.siteKey + '|' +
    contracts.map((c) => `${c.projectName}:${c.mwCovered}`).join('|') +
    '|x:' + xAxis +
    '|y:' + yearsKey

  // Calculate max capacity to ensure Y-axis includes the capacity line
  const getCap = (y: number) => {
    const c = getForecastCapacityForYear(profile, y)
    return typeof c === 'number' && !isNaN(c) && c > 0 ? c : 0
  }
  const maxCapacity = fullScopeYears && fullScopeYears.length > 1
    ? Math.max(...fullScopeYears.map(y => getCap(y)), 0)
    : getCap(year)

  const baseContracts = contracts.filter((c) => c.tier === 'base')
  const peakContracts = contracts.filter((c) => c.tier === 'peak')

  const LegendItem = ({ color, pattern, label, sublabel, isInactive = false, title }: { color: string; pattern?: string; label: string; sublabel?: string; isInactive?: boolean; title?: string }) => (
    <div className={`flex items-center gap-2 py-1 ${isInactive ? 'opacity-40' : ''}`} title={title}>
      <svg width="24" height="14" className="flex-shrink-0">
        <rect width="24" height="14" fill={color} />
        {pattern && <rect width="24" height="14" fill={pattern} stroke={color} strokeWidth="0.5" />}
      </svg>
      <div className="flex flex-col">
        <span className="font-medium text-slate-700 text-[11px] leading-tight">{label}</span>
        {sublabel && <span className="text-slate-400 text-[9px] leading-tight">{sublabel}</span>}
      </div>
    </div>
  )

  const LegendGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-col min-w-[140px]">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">{title}</h4>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )

  return (
    <div className="flex gap-4">
      <PatternDefsLayer contracts={contracts} />

      {/* Legend - Left Side with Columns */}
      <div className="flex-shrink-0 text-xs border-r border-slate-200 pr-4">
        <div className="flex gap-6">
          <LegendGroup title="LOAD TYPE">
            <LegendItem color={LOAD_COLORS.base} label="Baseload" sublabel="Uncovered" />
            <LegendItem color={LOAD_COLORS.peak} label="Peak" sublabel="Uncovered" />
            <LegendItem
              color="#fecaca"
              pattern={`url(#${OVERHEDGE_PATTERN_ID})`}
              label="Over-hedge"
              sublabel="Excess contracted"
              title="MW contracted in excess of the load — over-hedge"
            />
          </LegendGroup>

          {baseContracts.length > 0 && (
            <LegendGroup title="Baseload Projects">
              {baseContracts.map((c) => {
                const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                const startLabel = `${monthShort[c.startMonth - 1]} '${String(c.startYear).slice(-2)}`
                const endLabel = `${monthShort[c.endMonth - 1]} '${String(c.endYear).slice(-2)}`
                const visibleYears = fullScopeYears ?? [year]
                const isAnyYearActive = visibleYears.some((y) => y >= c.startYear && y <= c.endYear)
                return (
                  <LegendItem
                    key={c.projectName}
                    color={LOAD_COLORS.base}
                    pattern={`url(#${patternId(c)})`}
                    label={c.projectName}
                    sublabel={`${c.mwCovered} MW · ${startLabel}–${endLabel}`}
                    isInactive={!isAnyYearActive}
                    title={`${c.generationType} · covers baseload · term ${startLabel} – ${endLabel}${isAnyYearActive ? '' : ' · out of view'}`}
                  />
                )
              })}
            </LegendGroup>
          )}

          {peakContracts.length > 0 && (
            <LegendGroup title="Peaking Projects">
              {peakContracts.map((c) => {
                const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                const startLabel = `${monthShort[c.startMonth - 1]} '${String(c.startYear).slice(-2)}`
                const endLabel = `${monthShort[c.endMonth - 1]} '${String(c.endYear).slice(-2)}`
                const visibleYears = fullScopeYears ?? [year]
                const isAnyYearActive = visibleYears.some((y) => y >= c.startYear && y <= c.endYear)
                return (
                  <LegendItem
                    key={c.projectName}
                    color={LOAD_COLORS.peak}
                    pattern={`url(#${patternId(c)})`}
                    label={c.projectName}
                    sublabel={`${c.mwCovered} MW · ${startLabel}–${endLabel}`}
                    isInactive={!isAnyYearActive}
                    title={`${c.generationType} · covers peak · term ${startLabel} – ${endLabel}${isAnyYearActive ? '' : ' · out of view'}`}
                  />
                )
              })}
            </LegendGroup>
          )}
        </div>
      </div>

      {/* Chart - Right Side */}
      <div className="flex-1">
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
              domain={[0, Math.round(Math.max(maxCapacity * 1.1, 10))]}
            />
            <Tooltip content={<ChartTooltip contracts={contracts} yLabel={yLabel} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
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
                      label={{ value: `Capacity ${cap} MW (${y})`, position: 'right', fill: '#ef4444', fontSize: 10 }}
                    />
                  )
                })
              }
              // Single year view - single capacity line
              const cap = getForecastCapacityForYear(profile, year)
              if (!cap || cap <= 0) return null
              return (
                <ReferenceLine y={cap} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: `Capacity ${cap} MW`, position: 'right', fill: '#ef4444', fontSize: 10 }}
                />
              )
            })()}
            <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} />

            {contracts.map((c) => {
              const k = contractKey(c.projectName)
              return (
                <Fragment key={`c-${c.projectName}`}>
                  <Bar
                    dataKey={`c_${k}_base`}
                    stackId="load"
                    fill={LOAD_COLORS.base}
                    shape={makePatternedBarShape(LOAD_COLORS.base, `url(#${patternId(c, 'base')})`)}
                    name={c.projectName}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey={`c_${k}_peak`}
                    stackId="load"
                    fill={LOAD_COLORS.peak}
                    shape={makePatternedBarShape(LOAD_COLORS.peak, `url(#${patternId(c, 'peak')})`)}
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
          </ReBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
