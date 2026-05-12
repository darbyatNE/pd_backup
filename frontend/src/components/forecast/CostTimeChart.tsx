import { useMemo } from 'react'
import type { LinkedContract } from '../../data/linkedContracts'
import type { SiteLoadProfile } from '../../data/loadProfile'
import { computeCostTimeData } from './costTimeData'

const PAD = { left: 52, right: 20, top: 16, bottom: 36 }
const VW = 700, VH = 260
const CW = VW - PAD.left - PAD.right, CH = VH - PAD.top - PAD.bottom
const MIN_VAL = 20, MAX_VAL = 100, Y_TICKS = [20, 40, 60, 80, 100]

function toX(i: number, totalPoints: number) {
  return PAD.left + (i / (totalPoints - 1)) * CW
}

function toY(val: number) {
  const clamped = Math.max(MIN_VAL, Math.min(MAX_VAL, val))
  return PAD.top + CH - ((clamped - MIN_VAL) / (MAX_VAL - MIN_VAL)) * CH
}

function polylinePoints(values: number[]) {
  return values.map((v, i) => `${toX(i, values.length)},${toY(v)}`).join(' ')
}

function areaPath(values: number[]) {
  const pts = values.map((v, i) => `${toX(i, values.length)},${toY(v)}`).join(' L ')
  return `M ${pts} L ${toX(values.length - 1, values.length)},${PAD.top + CH} L ${toX(0, values.length)},${PAD.top + CH} Z`
}

interface CostTimeChartProps {
  contracts: LinkedContract[]
  profile: SiteLoadProfile
  startYear: number
  endYear: number
  granularity?: 'hours' | 'months'
}

export function CostTimeChart({ contracts, profile, startYear, endYear, granularity = 'hours' }: CostTimeChartProps) {
  const { labels, optimized, unoptimized, optAvg, unoptAvg, savingsPct } = useMemo(
    () => computeCostTimeData(contracts, profile, startYear, endYear, granularity),
    [contracts, profile, startYear, endYear, granularity]
  )

  // Pick evenly-spaced label indices so we don't crowd the axis
  const tickIndices = useMemo(() => {
    const n = labels.length
    if (n <= 6) return labels.map((_, i) => i)
    const step = Math.max(1, Math.floor(n / 6))
    const out: number[] = []
    for (let i = 0; i < n; i += step) out.push(i)
    if (out[out.length - 1] !== n - 1) out.push(n - 1)
    return out
  }, [labels])

  const subtitle = granularity === 'hours' ? '24h ahead' : 'Monthly view'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <h2 style={{ fontWeight: 700, fontSize: '20px', lineHeight: '24px', color: '#000' }}>Cost vs Time Optimization</h2>
        <div className="text-right leading-tight">
          <p style={{ fontSize: '13px', color: '#868585' }}>$/MWh</p>
          <p style={{ fontSize: '13px', color: '#868585' }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #e5e7eb' }} className="mb-4" />
      <div className="flex items-center gap-10 mb-4">
        <div className="flex items-baseline gap-2 shrink-0">
          <span style={{ fontWeight: 700, fontSize: '42px', lineHeight: 1, color: '#000' }}>{savingsPct}%</span>
          <span style={{ fontSize: '15px', color: '#000' }}>savings</span>
        </div>
        <div className="flex items-center gap-10">
          {[{ label: 'Optimized', price: optAvg, color: '#159A4C' }, { label: 'Unoptimized', price: unoptAvg, color: '#DB0000' }].map(({ label, price, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span style={{ width: 18, height: 18, background: color, borderRadius: 3, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '13px', color: '#000', marginBottom: 1 }}>{label}</p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#000' }}>${price}/MWh</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid #e5e7eb' }} className="mb-2" />
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full flex-1" style={{ minHeight: 200 }}>
        {Y_TICKS.map((tick) => {
          const y = toY(tick)
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={VW - PAD.right} y2={y} stroke="rgba(134,133,133,0.28)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="12" fontFamily="Inter" fill="#868585">${tick}</text>
            </g>
          )
        })}
        <path d={areaPath(optimized)} fill="rgba(21,154,76,0.15)" />
        <polyline points={polylinePoints(unoptimized)} fill="none" stroke="#DB0000" strokeWidth="2" strokeDasharray="6,4" />
        <polyline points={polylinePoints(optimized)} fill="none" stroke="#159A4C" strokeWidth="2.5" />
        {tickIndices.map((i) => (
          <text key={labels[i]} x={toX(i, labels.length)} y={VH - 8} textAnchor="middle" fontSize="12" fontFamily="Inter" fill="#868585">{labels[i]}</text>
        ))}
      </svg>
    </div>
  )
}
