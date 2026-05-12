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
  getSiteCapacityForYear,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import {
  contractMwForHourAvgInYear,
  contractMwForMonthInYear,
  isContractActiveAt,
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
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs font-sans space-y-0.5">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {contracts.map((c) => {
        const k = contractKey(c.projectName)
        const inBase = get(`c_${k}_base`)
        const inPeak = get(`c_${k}_peak`)
        const total = inBase + inPeak
        totalContracted += total
        if (total <= 0) return null
        const dominantColor = inBase >= inPeak ? LOAD_COLORS.base : LOAD_COLORS.peak
        return (
          <p key={`c-${c.projectName}`}>
            <span style={{ color: dominantColor }}>■</span>{' '}
            <span className="text-slate-700">{c.projectName}</span>:{' '}
            <strong>{r1(total)} {yLabel}</strong>
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
}

export function LoadShape2D({ profile, xAxis, year, fullScopeYears, contracts }: LoadShape2DProps) {
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
    if (fullScopeYears && fullScopeYears.length > 1) {
      return fullScopeYears.flatMap((y) =>
        monthLabels.map((m, mi) => rowFor(mi + 1, y, `${m} ${yy(y)}`)),
      )
    }
    return monthLabels.map((m, mi) => rowFor(mi + 1, year, m))
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

  return (
    <div>
      <PatternDefsLayer contracts={contracts} />
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
          <Tooltip content={<ChartTooltip contracts={contracts} yLabel={yLabel} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          {(!fullScopeYears || fullScopeYears.length <= 1) && (() => {
            const cap = getSiteCapacityForYear(profile, year)
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

      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="inline-block w-5 h-3" style={{ background: LOAD_COLORS.base }} />
          <span className="font-medium text-slate-700">Baseload</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="inline-block w-5 h-3" style={{ background: LOAD_COLORS.peak }} />
          <span className="font-medium text-slate-700">Peak</span>
        </div>
        {contracts.map((c) => {
          const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          const startLabel = `${monthShort[c.startMonth - 1]} '${String(c.startYear).slice(-2)}`
          const endLabel   = `${monthShort[c.endMonth   - 1]} '${String(c.endYear).slice(-2)}`
          const visibleYears = fullScopeYears ?? [year]
          const isAnyMonthActive = visibleYears.some((y) => {
            for (let m = 1; m <= 12; m++) if (isContractActiveAt(c, y, m)) return true
            return false
          })
          return (
            <div
              key={c.projectName}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 ${isAnyMonthActive ? '' : 'opacity-40'}`}
              title={`${c.generationType} · covers ${c.tier === 'base' ? 'baseload' : 'peak'} · term ${startLabel} – ${endLabel}${isAnyMonthActive ? '' : ' · out of view'}`}
            >
              <svg width="20" height="12">
                <rect width="20" height="12" fill={LOAD_COLORS[c.tier]} />
                <rect width="20" height="12" fill={`url(#${patternId(c)})`} stroke={LOAD_COLORS[c.tier]} strokeWidth="0.5" />
              </svg>
              <span className="font-medium text-slate-700">{c.projectName}</span>
              <span className="text-slate-400">{c.mwCovered} MW</span>
              <span className="text-slate-400 text-[10px]">· {startLabel}–{endLabel}</span>
            </div>
          )
        })}
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200"
          title="MW contracted in excess of the load — over-hedge"
        >
          <svg width="20" height="12">
            <rect width="20" height="12" fill={`url(#${OVERHEDGE_PATTERN_ID})`} stroke="#b91c1c" strokeWidth="0.5" />
          </svg>
          <span className="font-medium text-rose-700">Over-hedge</span>
        </div>
      </div>
    </div>
  )
}
