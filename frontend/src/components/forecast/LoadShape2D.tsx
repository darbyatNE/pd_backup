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
  LOAD_COLORS,
  PATTERN_FG,
  getGenerationTypeOrder,
  GENERATION_TYPE_ORDER,
} from '../../data/linkedContracts'
import type { LinkedContract } from '../../data/linkedContracts'

const OVERHEDGE_PATTERN_ID = 'pat-overhedge'

function contractKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_')
}

// Map icon functions for generation types
function getMapIconSvg(generationType: string): string {
  switch (generationType) {
    case 'Wind':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="1.5" fill="#0ea5e9"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(45)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(135)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(225)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(315)"/></g></svg>`;
    case 'Hydro':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-8,4 L-3,4 L-3,-2 L3,-2 L3,4 L8,4 L8,8 L-8,8 Z" fill="#06b6d4"/><path d="M-6,10 Q-3,12 0,10 Q3,12 6,10" fill="none" stroke="#06b6d4" stroke-width="1.5"/><path d="M-6,12 Q-3,14 0,12 Q3,14 6,12" fill="none" stroke="#06b6d4" stroke-width="1.5"/></g></svg>`;
    case 'Nuclear':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="2" fill="#8b5cf6"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(0)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(60)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(120)"/></g></svg>`;
    case 'Solar':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="4" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><line x1="0" y1="-8" x2="0" y2="-6"/><line x1="5.66" y1="-5.66" x2="4.24" y2="-4.24"/><line x1="8" y1="0" x2="6" y2="0"/><line x1="5.66" y1="5.66" x2="4.24" y2="4.24"/><line x1="0" y1="8" x2="0" y2="6"/><line x1="-5.66" y1="5.66" x2="-4.24" y2="4.24"/><line x1="-8" y1="0" x2="-6" y2="0"/><line x1="-5.66" y1="-5.66" x2="-4.24" y2="-4.24"/></g></g></svg>`;
    case 'Combined Cycle':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-2" y="-8" width="4" height="12" rx="1" fill="#64748b"/><rect x="-6" y="2" width="12" height="4" rx="1" fill="#64748b"/><path d="M-2,-8 L-6,2 M2,-8 L6,2 M-2,4 L-6,2 M2,4 L6,2" stroke="#64748b" stroke-width="1" fill="none"/></g></svg>`;
    case 'Battery':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-8" y="-4" width="16" height="8" rx="1" fill="#10b981"/><rect x="8" y="-2" width="2" height="4" fill="#10b981"/><rect x="-6" y="-2" width="3" height="4" fill="white"/><rect x="-1.5" y="-2" width="3" height="4" fill="white"/><rect x="3" y="-2" width="2" height="4" fill="white"/></g></svg>`;
    case 'Hybrid':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M0,-8 L3,-2 L8,-3 L2,2 L4,8 L-2,2 L-8,3 L-3,-2 Z" fill="#06b6d4"/><circle r="2" fill="white"/></g></svg>`;
    case 'Peaker':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-6,6 L0,-8 L6,6 Z" fill="#ef4444"/><rect x="-2" y="2" width="4" height="4" fill="#dc2626"/></g></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><circle cx="12" cy="12" r="8" fill="#64748b"/></svg>`;
  }
}

/** Stable pattern ID by gen type — shared by chart bars and legend swatches */
export function genTypePatternId(generationType: string): string {
  return `pat-gentype-${generationType.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

function OverhedgePatternDef() {
  return (
    <pattern id={OVERHEDGE_PATTERN_ID} patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#fecaca" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#b91c1c" strokeWidth="2" />
    </pattern>
  )
}

/** One <pattern> per gen type — used by both chart bars and legend swatches */
function AllPatternDefs() {
  const fg = PATTERN_FG
  return (
    <>
      <pattern id={genTypePatternId('Solar')}          patternUnits="userSpaceOnUse" width="6"  height="6"><circle cx="3" cy="3" r="1.3" fill={fg} /></pattern>
      <pattern id={genTypePatternId('Wind')}           patternUnits="userSpaceOnUse" width="7"  height="7"><path d="M0,7 L7,0 M-1,1 L1,-1 M6,8 L8,6" stroke={fg} strokeWidth="1.3" /></pattern>
      <pattern id={genTypePatternId('Hydro')}          patternUnits="userSpaceOnUse" width="10" height="6"><path d="M0,3 L2.5,0 L5,3 L7.5,6 L10,3" fill="none" stroke={fg} strokeWidth="1.2" /></pattern>
      <pattern id={genTypePatternId('Nuclear')}        patternUnits="userSpaceOnUse" width="10" height="6"><path d="M0,3 Q2.5,0 5,3 T10,3" fill="none" stroke={fg} strokeWidth="1.2" /></pattern>
      <pattern id={genTypePatternId('Hybrid')}         patternUnits="userSpaceOnUse" width="8"  height="8"><path d="M0,8 L8,0" stroke={fg} strokeWidth="1" /><path d="M0,0 L8,8" stroke={fg} strokeWidth="1" /></pattern>
      <pattern id={genTypePatternId('Combined Cycle')} patternUnits="userSpaceOnUse" width="5"  height="5"><line x1="2.5" y1="0" x2="2.5" y2="5" stroke={fg} strokeWidth="1.4" /></pattern>
      <pattern id={genTypePatternId('Peaker')}         patternUnits="userSpaceOnUse" width="6"  height="6"><path d="M0,0 L6,0 M0,3 L6,3 M0,0 L0,6 M3,0 L3,6" stroke={fg} strokeWidth="0.7" /></pattern>
      <pattern id={genTypePatternId('Battery')}        patternUnits="userSpaceOnUse" width="6"  height="5"><line x1="0" y1="2.5" x2="6" y2="2.5" stroke={fg} strokeWidth="1.4" /></pattern>
    </>
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
        <AllPatternDefs />
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
    sortedContracts.forEach((c, i) => {
      const k = contractKey(c.projectName)
      row[`c_${k}_base`] = r1(cBase[i])
      row[`c_${k}_peak`] = r1(cPeak[i])
    })
    return row
  }

  // Sort contracts by generation type order, then by volume descending
  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const orderA = getGenerationTypeOrder(a.generationType)
      const orderB = getGenerationTypeOrder(b.generationType)
      if (orderA !== orderB) return orderA - orderB
      return b.mwCovered - a.mwCovered
    })
  }, [contracts])

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
      // Use HE (Hour Ending) format for energy industry standard
      const hourHE = `HE${h + 1}`
      return buildRow(hourHE, avgBase, avgPeak,
        sortedContracts.map((c) => contractMwForHourAvgInYear(c, h, year)),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, sortedContracts, year])

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
        sortedContracts.map((c) => contractMwForMonthInYear(c, y, month)),
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
      <svg width="16" height="16" className="flex-shrink-0">
        <rect width="16" height="16" fill={color} />
        {pattern && <rect width="16" height="16" fill={pattern} />}
      </svg>
      <div className="flex flex-col leading-tight">
        <span className="text-slate-700 font-medium">{label}</span>
        {sublabel && <span className="text-slate-500 text-[10px]">{sublabel}</span>}
      </div>
    </div>
  )

  const ContractLegendItem = ({ color, pattern, name, sites, mw, term, isInactive = false, title, generationType }: { color: string; pattern?: string; name: string; sites: string; mw: number; term: string; isInactive?: boolean; title?: string; generationType?: string }) => (
    <div className={`flex items-start gap-2 py-1 ${isInactive ? 'opacity-40' : ''}`} title={title}>
      <svg width="16" height="16" className="flex-shrink-0 mt-0.5">
        {generationType ? (
          <>
            <rect width="16" height="16" fill="white" stroke="#e2e8f0" strokeWidth="0.5"/>
            <rect width="16" height="16" fill={`url(#${genTypePatternId(generationType)})`} opacity="0.8"/>
          </>
        ) : (
          <>
            <rect width="16" height="16" fill={color} />
            {pattern && <rect width="16" height="16" fill={pattern} />}
          </>
        )}
      </svg>
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-1">
          {generationType && (
            <svg width="12" height="12" className="flex-shrink-0">
              <g dangerouslySetInnerHTML={{ __html: getMapIconSvg(generationType).replace('width="16" height="16"', 'width="12" height="12"').replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24"') }} />
            </svg>
          )}
          <span 
            className="text-slate-700 font-medium cursor-help" 
            title={sites ? `Serving: ${sites}` : ''}
          >
            {name}
          </span>
        </div>
        <span className="text-slate-500 text-[10px]">{mw} MW · {term}</span>
      </div>
    </div>
  )

  const LegendGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-col min-w-[140px] max-w-[180px]">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">{title}</h4>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )

  return (
    <div className="flex gap-4">
      <PatternDefsLayer />

      {/* Legend - Left Side with Columns */}
      <div className="flex-shrink-0 text-xs border-r border-slate-200 pr-4">
        <div className="flex gap-6">
          <LegendGroup title="LOAD TYPE">
            <LegendItem color={LOAD_COLORS.base} label="Baseload" />
            <LegendItem color={LOAD_COLORS.peak} label="Peak" />
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
              {baseContracts
                .sort((a, b) => {
                  const orderA = getGenerationTypeOrder(a.generationType)
                  const orderB = getGenerationTypeOrder(b.generationType)
                  if (orderA !== orderB) return orderA - orderB
                  return b.mwCovered - a.mwCovered
                })
                .map((c) => {
                const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                const startLabel = `${monthShort[c.startMonth - 1]} '${String(c.startYear).slice(-2)}`
                const endLabel = `${monthShort[c.endMonth - 1]} '${String(c.endYear).slice(-2)}`
                const visibleYears = fullScopeYears ?? [year]
                const isAnyYearActive = visibleYears.some((y) => y >= c.startYear && y <= c.endYear)
                // Extract base name and sites from projectName
                const match = c.projectName.match(/^(.*?)\s*\(([^)]+)\)$/)
                const baseName = match ? match[1] : c.projectName
                const sites = match ? match[2] : (c.perSiteMw?.map(s => s.siteKey).join(', ') ?? '')
                return (
                  <ContractLegendItem
                    key={c.projectName}
                    color={LOAD_COLORS.base}
                    pattern={`url(#${genTypePatternId(c.generationType)})`}
                    name={baseName}
                    sites={sites}
                    mw={c.mwCovered}
                    term={`${startLabel}–${endLabel}`}
                    isInactive={!isAnyYearActive}
                    title={`${c.generationType} · covers baseload · term ${startLabel} – ${endLabel}${isAnyYearActive ? '' : ' · out of view'}`}
                    generationType={c.generationType}
                  />
                )
              })}
            </LegendGroup>
          )}

          {peakContracts.length > 0 && (
            <LegendGroup title="Peaking Projects">
              {peakContracts
                .sort((a, b) => {
                  const orderA = getGenerationTypeOrder(a.generationType)
                  const orderB = getGenerationTypeOrder(b.generationType)
                  if (orderA !== orderB) return orderA - orderB
                  return b.mwCovered - a.mwCovered
                })
                .map((c) => {
                const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                const startLabel = `${monthShort[c.startMonth - 1]} '${String(c.startYear).slice(-2)}`
                const endLabel = `${monthShort[c.endMonth - 1]} '${String(c.endYear).slice(-2)}`
                const visibleYears = fullScopeYears ?? [year]
                const isAnyYearActive = visibleYears.some((y) => y >= c.startYear && y <= c.endYear)
                // Extract base name and sites from projectName
                const match = c.projectName.match(/^(.*?)\s*\(([^)]+)\)$/)
                const baseName = match ? match[1] : c.projectName
                const sites = match ? match[2] : (c.perSiteMw?.map(s => s.siteKey).join(', ') ?? '')
                return (
                  <ContractLegendItem
                    key={c.projectName}
                    color={LOAD_COLORS.peak}
                    pattern={`url(#${genTypePatternId(c.generationType)})`}
                    name={baseName}
                    sites={sites}
                    mw={c.mwCovered}
                    term={`${startLabel}–${endLabel}`}
                    isInactive={!isAnyYearActive}
                    title={`${c.generationType} · covers peak · term ${startLabel} – ${endLabel}${isAnyYearActive ? '' : ' · out of view'}`}
                    generationType={c.generationType}
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

            {sortedContracts.map((c) => {
              const k = contractKey(c.projectName)
              return (
                <Fragment key={`c-${c.projectName}`}>
                  <Bar
                    dataKey={`c_${k}_base`}
                    stackId="load"
                    fill={LOAD_COLORS.base}
                    shape={makePatternedBarShape(LOAD_COLORS.base, `url(#${genTypePatternId(c.generationType)})`)}  
                    name={c.projectName}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey={`c_${k}_peak`}
                    stackId="load"
                    fill={LOAD_COLORS.peak}
                    shape={makePatternedBarShape(LOAD_COLORS.peak, `url(#${genTypePatternId(c.generationType)})`)}  
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

        {/* Pattern Legend - Below X-axis */}
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
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
