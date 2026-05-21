import { useMemo, useState } from 'react'
import type { LinkedContract } from '../../data/linkedContracts'
import type { SiteLoadProfile } from '../../data/loadProfile'
import { computeEnergyMix } from './energyMix'

const CX = 100, CY = 100, R = 95, IR = 60

function pt(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

const n = (v: number) => +v.toFixed(4)

function arc(startDeg: number, endDeg: number, outerR: number, innerR: number): string {
  const s = pt(outerR, startDeg), e = pt(outerR, endDeg)
  const is = pt(innerR, endDeg), ie = pt(innerR, startDeg)
  const lg = endDeg - startDeg > 180 ? 1 : 0
  return `M ${n(s.x)} ${n(s.y)} A ${outerR} ${outerR} 0 ${lg} 1 ${n(e.x)} ${n(e.y)} L ${n(is.x)} ${n(is.y)} A ${innerR} ${innerR} 0 ${lg} 0 ${n(ie.x)} ${n(ie.y)} Z`
}

interface EnergyMixChartProps {
  contracts: LinkedContract[]
  profile: SiteLoadProfile
  startYear: number
  endYear: number
}

export function EnergyMixChart({ contracts, profile, startYear, endYear }: EnergyMixChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const slices = useMemo(() => {
    const items = computeEnergyMix(contracts, profile, startYear, endYear)
    let cum = 0
    return items.map((item) => {
      const startDeg = cum * 3.6
      cum += item.value
      const endDeg = cum * 3.6
      return { ...item, startDeg, endDeg }
    })
  }, [contracts, profile, startYear, endYear])

  return (
    <div className="flex flex-col h-full">
      <h2 className="pb-4 mb-6" style={{ fontWeight: 700, fontSize: '20px', color: '#000', borderBottom: '1px solid #e5e7eb' }} title="Understand your energy portfolio composition: View the percentage breakdown of energy sources including solar, wind, nuclear, hydro, battery storage, and conventional generation to assess renewable content and diversification strategy.">
        Current Energy Mix (In Scope)
      </h2>
      <div className="flex items-center gap-16 flex-1 px-4">
        <svg viewBox="0 0 200 200" style={{ width: 230, height: 230, flexShrink: 0 }}>
          {slices.map((s, i) => (
            <g key={s.name} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
              <path d={arc(s.startDeg, s.endDeg, R, IR)} fill={s.color} opacity={hovered === null || hovered === i ? 1 : 0.5} />
            </g>
          ))}
          <circle cx={CX} cy={CY} r={IR} fill="white" />
        </svg>
        <div className="flex flex-col gap-5 flex-1 pb-4">
          {/* Header row */}
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-2">
            <span style={{ width: 14, flexShrink: 0 }} />
            <span className="flex-1">Source</span>
            <span>Rate</span>
            <span>% of Load</span>
          </div>
          {slices.map((s, i) => (
            <div
              key={s.name}
              className="flex items-center gap-4 transition-all"
              style={{ opacity: hovered === null || hovered === i ? 1 : 0.45, transform: hovered === i ? 'translateX(4px)' : 'none', cursor: 'default' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span style={{ width: 14, height: 14, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span className="flex-1 text-sm text-slate-500 font-medium">{s.name}</span>
              <span className="text-lg font-black text-slate-900">${s.cost}/MWh</span>
              <span className="text-lg font-black text-slate-900">{s.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
