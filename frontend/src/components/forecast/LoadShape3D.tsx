import { useState } from 'react'
import {
  getEffectiveLoadAt,
  getSiteCapacityForYear,
} from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import { contractMwAtHourInYear } from '../../data/linkedContracts'
import type { LinkedContract } from '../../data/linkedContracts'

interface LoadShape3DProps {
  profile: SiteLoadProfile
  year: number
  contracts: LinkedContract[]
}

export function LoadShape3D({ profile, year, contracts }: LoadShape3DProps) {
  const CELL_W  = 15
  const Z_DX    = 18
  const Z_DY    = 11
  const SVG_W   = 740
  const SVG_H   = 520
  const L = 52, B = 40, T = 28

  const cap  = getSiteCapacityForYear(profile, year)
  const usableY = SVG_H - B - T - 11 * Z_DY
  const MW_SCALE = Math.min(3.2, usableY / cap)

  const effectiveAt = (hour: number, mi: number) =>
    getEffectiveLoadAt(profile, hour, mi + 1, year)

  const baseForMonth = (mi: number) => effectiveAt(0, mi).baseloadMw

  const proj = (hour: number, mw: number, mi: number) => ({
    x: L + hour * CELL_W + mi * Z_DX,
    y: SVG_H - B - mw * MW_SCALE - mi * Z_DY,
  })

  const fmt = (n: number) => n.toFixed(1)

  const slabPath = (mi: number) => {
    const base = baseForMonth(mi)
    const p0 = proj(0,  0,    mi), p1 = proj(24, 0,    mi)
    const p2 = proj(24, base, mi), p3 = proj(0,  base, mi)
    return `M ${fmt(p0.x)} ${fmt(p0.y)} L ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p2.x)} ${fmt(p2.y)} L ${fmt(p3.x)} ${fmt(p3.y)} Z`
  }

  const peakPath = (mi: number) => {
    const base = baseForMonth(mi)
    const pts = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      totalMw: effectiveAt(h, mi).totalMw,
    }))

    const start = proj(0, base, mi)
    const parts = [`M ${fmt(start.x)} ${fmt(start.y)}`]

    pts.forEach(p => {
      const { x, y } = proj(p.hour, p.totalMw, mi)
      parts.push(`L ${fmt(x)} ${fmt(y)}`)
    })

    const lastPt = pts[pts.length - 1]
    const endTop  = proj(24, lastPt.totalMw, mi)
    const endBase = proj(24, base, mi)
    parts.push(`L ${fmt(endTop.x)} ${fmt(endTop.y)}`)
    parts.push(`L ${fmt(endBase.x)} ${fmt(endBase.y)} Z`)
    return parts.join(' ')
  }

  const genPath = (mi: number) => {
    const pts = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      genMw: contracts.reduce((sum, c) => sum + contractMwAtHourInYear(c, h, mi + 1, year), 0),
    }))

    const start = proj(0, 0, mi)
    const parts = [`M ${fmt(start.x)} ${fmt(start.y)}`]

    pts.forEach(p => {
      const { x, y } = proj(p.hour, p.genMw, mi)
      parts.push(`L ${fmt(x)} ${fmt(y)}`)
    })

    const lastPt = pts[pts.length - 1]
    const endTop  = proj(24, lastPt.genMw, mi)
    const endBase = proj(24, 0, mi)
    parts.push(`L ${fmt(endTop.x)} ${fmt(endTop.y)}`)
    parts.push(`L ${fmt(endBase.x)} ${fmt(endBase.y)} Z`)
    return parts.join(' ')
  }

  const groundPath = () => {
    const p0 = proj(0,  0, 0),  p1 = proj(24, 0, 0)
    const p2 = proj(24, 0, 11), p3 = proj(0,  0, 11)
    return `M ${fmt(p0.x)} ${fmt(p0.y)} L ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p2.x)} ${fmt(p2.y)} L ${fmt(p3.x)} ${fmt(p3.y)} Z`
  }

  const Y_TICKS = [0, 25, 50, 75].filter(t => t <= cap)
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const RENDER_ORDER = Array.from({ length: 12 }, (_, i) => 11 - i)

  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
        <div className="flex gap-3 text-slate-500">
          <span><span className="font-semibold text-slate-700">X</span> = Hour (0–23)</span>
          <span><span className="font-semibold text-slate-700">Y</span> = MW</span>
          <span><span className="font-semibold text-slate-700">Z</span> = Month (Jan – Dec {year})</span>
        </div>
        <div className="flex items-center gap-4 ml-auto text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-teal-500" style={{ opacity: 0.82 }} />
            Baseload ({(() => {
              let sum = 0
              for (let mi = 0; mi < 12; mi++) sum += baseForMonth(mi)
              return Math.round(sum / 12)
            })()} MW · {year} avg)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" style={{ opacity: 0.72 }} />
            Peak load
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" style={{ opacity: 0.5 }} />
            Contracted generation
          </span>
        </div>
        {hoveredMonth !== null && (
          <div className="text-xs bg-slate-800 text-white rounded-md px-3 py-1.5 font-mono ml-auto">
            {MONTH_NAMES[hoveredMonth]} {year} · hover to compare months
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        style={{ maxHeight: 560, fontFamily: 'Inter,system-ui,sans-serif' }}
      >
        <path d={groundPath()} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.8} />

        {Array.from({ length: 25 }, (_, h) => {
          const front = proj(h, 0, 0)
          const back  = proj(h, 0, 11)
          return (
            <line key={`floor-${h}`}
              x1={front.x} y1={front.y} x2={back.x} y2={back.y}
              stroke="rgba(148,163,184,0.45)" strokeWidth={0.6}
            />
          )
        })}

        {Y_TICKS.filter(mw => mw > 0).map(mw => {
          const f = proj(0, mw, 0), bk = proj(0, mw, 11)
          return (
            <line key={`yg-${mw}`}
              x1={f.x} y1={f.y} x2={bk.x} y2={bk.y}
              stroke="rgba(148,163,184,0.22)" strokeWidth={0.8} strokeDasharray="3 3"
            />
          )
        })}

        {Y_TICKS.map(mw => {
          const { x: fx, y: fy } = proj(0, mw, 0)
          const { x: ex }        = proj(24, mw, 0)
          return (
            <g key={`yt-${mw}`}>
              <line x1={fx} y1={fy} x2={ex} y2={fy} stroke="rgba(148,163,184,0.35)" strokeWidth={0.7} />
              <text x={fx - 6} y={fy + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{mw}</text>
            </g>
          )
        })}

        {(() => {
          const { x: cx0, y: cy } = proj(0, cap, 0)
          const { x: cx1 }        = proj(24, cap, 0)
          return (
            <line x1={cx0} y1={cy} x2={cx1} y2={cy}
              stroke="#ef4444" strokeWidth={1.2} strokeDasharray="5 3" opacity={0.7}
            />
          )
        })()}
        {(() => {
          const { x, y } = proj(24, cap, 0)
          return <text x={x + 4} y={y + 3} fontSize="10" fill="#ef4444" opacity={0.8}>{cap} MW cap</text>
        })()}

        {RENDER_ORDER.map(mi => {
          const isHov = hoveredMonth === mi
          return (
            <g
              key={mi}
              onMouseEnter={() => setHoveredMonth(mi)}
              onMouseLeave={() => setHoveredMonth(null)}
              style={{ cursor: 'default' }}
            >
              <path
                d={slabPath(mi)}
                fill="#0d9488"
                opacity={hoveredMonth === null ? 0.42 : isHov ? 0.95 : 0.22}
                stroke="#0f766e"
                strokeWidth={isHov ? 1.0 : 0.4}
              />
              <path
                d={peakPath(mi)}
                fill="#f59e0b"
                opacity={hoveredMonth === null ? 0.36 : isHov ? 0.88 : 0.18}
                stroke="#d97706"
                strokeWidth={isHov ? 1.2 : 0.6}
              />
              <path
                d={genPath(mi)}
                fill="#6366f1"
                opacity={hoveredMonth === null ? 0.28 : isHov ? 0.65 : 0.14}
                stroke="#4f46e5"
                strokeWidth={isHov ? 1.0 : 0.4}
              />
            </g>
          )
        })}

        {Array.from({ length: 25 }, (_, h) => {
          const top = proj(h, cap, 0)
          const bot = proj(h, 0,   0)
          return (
            <line key={`face-${h}`}
              x1={bot.x} y1={bot.y} x2={top.x} y2={top.y}
              stroke="rgba(148,163,184,0.20)" strokeWidth={0.5}
            />
          )
        })}

        {[0, 6, 12, 18, 23].map(h => {
          const { x, y } = proj(h, 0, 0)
          return (
            <text key={`hl-${h}`} x={x} y={y + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">
              {h}h
            </text>
          )
        })}

        {MONTH_NAMES.map((name, mi) => {
          const { x, y } = proj(24, 0, mi)
          const isHov = hoveredMonth === mi
          return (
            <text
              key={`ml-${mi}`}
              x={x + 5} y={y + 4}
              fontSize={isHov ? 11 : 10}
              fontWeight={isHov ? 700 : 400}
              fill={isHov ? '#f59e0b' : mi === 0 ? '#0d9488' : '#94a3b8'}
            >
              {name}
            </text>
          )
        })}

        <text
          x={proj(12, 0, 0).x} y={SVG_H - 4}
          textAnchor="middle" fontSize="10" fill="#cbd5e1"
        >
          ← Hours →
        </text>
        <text
          x={8} y={proj(0, cap / 2, 0).y + 4}
          textAnchor="middle" fontSize="10" fill="#cbd5e1"
          transform={`rotate(-90, 8, ${proj(0, cap / 2, 0).y})`}
        >
          MW ↑
        </text>
        <text
          x={proj(24, 0, 6).x + 8} y={proj(24, 0, 6).y + 4}
          fontSize="10" fill="#cbd5e1"
        >
          Months →
        </text>
      </svg>
    </div>
  )
}
