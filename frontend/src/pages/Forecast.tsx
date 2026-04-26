'use client'

import React, { useState } from 'react'

import {
    BarChart as ReBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'


// ─── KPI Cards ───────────────────────────────────────────────────────────────
const kpiData = [
    {
        title: 'Actual Base Load',
        value: '48.2',
        unit: 'MW',
        change: '2 MW',
        direction: 'down' as const,
        changeLabel: 'vs Yesterday',
        good: false,
    },
    {
        title: 'Actual Peak Load',
        value: '62.7',
        unit: 'MW',
        change: '1.2 MW',
        direction: 'up' as const,
        changeLabel: 'vs Yesterday',
        good: false,
    },
    {
        title: 'Procurement Cost',
        value: '$184',
        unit: '/MWh',
        change: '3%',
        direction: 'down' as const,
        changeLabel: 'vs Yesterday',
        good: true,
    },
    {
        title: 'PUE',
        value: '1.3',
        unit: '',
        change: '0.1',
        direction: 'up' as const,
        changeLabel: 'vs Yesterday',
        good: false,
    },
]

export function KPICards() {
    return (
        <>
            {kpiData.map((card, i) => {
                const color = card.good === (card.direction === 'down') ? '#22c55e' : '#ef4444'
                return (
                    <div
                        key={i}
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: '20px 24px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                        }}
                    >
                        <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, margin: 0 }}>{card.title}</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                            <span style={{ fontSize: 34, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{card.value}</span>
                            {card.unit && <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{card.unit}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill={color}>
                                {card.direction === 'up'
                                    ? <polygon points="7,2 13,12 1,12" />
                                    : <polygon points="7,12 13,2 1,2" />
                                }
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color }}>{card.change}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{card.changeLabel}</span>
                        </div>
                    </div>
                )
            })}
        </>
    )
}

// ─── Energy Mix Chart ─────────────────────────────────────────────────────────
const energySources = [
    { name: 'Solar PPA', cost: 28, value: 34, color: '#2563eb' },
    { name: 'Wind PPA', cost: 31, value: 22, color: '#f97316' },
    { name: 'Grid Baseload', cost: 44, value: 27, color: '#16a34a' },
    { name: 'Spot', cost: 68, value: 17, color: '#eab308' },
]

export function EnergyMixChart() {
    const [hovered, setHovered] = useState<number | null>(null)

    const CX = 100
    const CY = 100
    const R = 95
    const IR = 60

    function pt(r: number, deg: number) {
        const rad = ((deg - 90) * Math.PI) / 180
        return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
    }

    const n = (v: number) => +v.toFixed(4)

    function arc(startDeg: number, endDeg: number, outerR: number, innerR: number): string {
        const s = pt(outerR, startDeg)
        const e = pt(outerR, endDeg)
        const is = pt(innerR, endDeg)
        const ie = pt(innerR, startDeg)
        const lg = endDeg - startDeg > 180 ? 1 : 0
        return (
            `M ${n(s.x)} ${n(s.y)} A ${outerR} ${outerR} 0 ${lg} 1 ${n(e.x)} ${n(e.y)} ` +
            `L ${n(is.x)} ${n(is.y)} A ${innerR} ${innerR} 0 ${lg} 0 ${n(ie.x)} ${n(ie.y)} Z`
        )
    }

    let cum = 0
    const slices = energySources.map((src) => {
        const startDeg = cum * 3.6
        cum += src.value
        const endDeg = cum * 3.6
        return { ...src, startDeg, endDeg }
    })

    return (
        <div className="flex flex-col h-full">
            <h2
                className="pb-4 mb-6"
                style={{ fontWeight: 700, fontSize: '20px', color: '#000', borderBottom: '1px solid #e5e7eb' }}
            >
                Energy Source Mix
            </h2>

            <div className="flex items-center gap-16 flex-1 px-4">
                <svg viewBox="0 0 200 200" style={{ width: 230, height: 230, flexShrink: 0 }}>
                    {slices.map((s, i) => (
                        <g
                            key={s.name}
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                            style={{ cursor: 'pointer' }}
                        >
                            <path
                                d={arc(s.startDeg, s.endDeg, R, IR)}
                                fill={s.color}
                                opacity={hovered === null || hovered === i ? 1 : 0.5}
                            />
                            <path d={arc(s.startDeg, s.endDeg, R + 8, IR - 6)} fill="transparent" />
                        </g>
                    ))}
                    <circle cx={CX} cy={CY} r={IR} fill="white" />
                </svg>

                <div className="flex flex-col gap-5 flex-1 pb-4">
                    {slices.map((s, i) => (
                        <div
                            key={s.name}
                            className="flex items-start gap-4 transition-all"
                            style={{
                                opacity: hovered === null || hovered === i ? 1 : 0.45,
                                transform: hovered === i ? 'translateX(4px)' : 'none',
                                cursor: 'default',
                            }}
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <span
                                style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 3,
                                    background: s.color,
                                    flexShrink: 0,
                                    marginTop: 4,
                                }}
                            />
                            <div>
                                <p className="text-sm leading-tight mb-0.5 text-slate-500 font-medium">{s.name}</p>
                                <p className="text-lg font-black leading-snug tracking-tighter text-slate-900">
                                    ${s.cost}/MWh{' '}
                                    <span className="font-normal text-slate-300 mx-1">|</span>{' '}
                                    {s.value}%
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─── Cost vs Time Chart ───────────────────────────────────────────────────────
export function CostTimeChart() {
    const timeLabels = ['00:00', '06:00', '12:00', '18:00', '24:00']
    const optimized = [36, 30, 38, 48, 38]
    const unoptimized = [50, 55, 72, 93, 65]

    const PAD = { left: 52, right: 20, top: 16, bottom: 36 }
    const VW = 700
    const VH = 260
    const CW = VW - PAD.left - PAD.right
    const CH = VH - PAD.top - PAD.bottom
    const MIN_VAL = 20
    const MAX_VAL = 100
    const Y_TICKS = [20, 40, 60, 80, 100]

    function toX(i: number) {
        return PAD.left + (i / (timeLabels.length - 1)) * CW
    }
    function toY(val: number) {
        return PAD.top + CH - ((val - MIN_VAL) / (MAX_VAL - MIN_VAL)) * CH
    }
    function polylinePoints(values: number[]) {
        return values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
    }
    function areaPath(values: number[]) {
        const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' L ')
        return `M ${pts} L ${toX(values.length - 1)},${PAD.top + CH} L ${toX(0)},${PAD.top + CH} Z`
    }

    const optAvg = Math.round(optimized.reduce((a, b) => a + b, 0) / optimized.length)
    const unoptAvg = Math.round(unoptimized.reduce((a, b) => a + b, 0) / unoptimized.length)
    const savings = Math.round(((unoptAvg - optAvg) / unoptAvg) * 100)

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
                <h2 style={{ fontWeight: 700, fontSize: '20px', lineHeight: '24px', color: '#000' }}>
                    Cost vs Time Optimization
                </h2>
                <div className="text-right leading-tight">
                    <p style={{ fontSize: '13px', color: '#868585' }}>$/MWh</p>
                    <p style={{ fontSize: '13px', color: '#868585' }}>24h ahead</p>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb' }} className="mb-4" />

            <div className="flex items-center gap-10 mb-4">
                <div className="flex items-baseline gap-2 shrink-0">
                    <span style={{ fontWeight: 700, fontSize: '42px', lineHeight: 1, color: '#000' }}>{savings}%</span>
                    <span style={{ fontSize: '15px', color: '#000' }}>savings</span>
                </div>

                <div className="flex items-center gap-10">
                    {[
                        { label: 'Optimized', price: optAvg, color: '#159A4C' },
                        { label: 'Unoptimized', price: unoptAvg, color: '#DB0000' },
                    ].map(({ label, price, color }) => (
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
                {timeLabels.map((label, i) => (
                    <text key={label} x={toX(i)} y={VH - 8} textAnchor="middle" fontSize="12" fontFamily="Inter" fill="#868585">{label}</text>
                ))}
            </svg>
        </div>
    )
}

// ─── Load Forecast Chart ──────────────────────────────────────────────────────
const barData = [
    { time: '0hr', baseLoad: 34, peakLoad: 41, PPA: 3, spotMarket: 20 },
    { time: '1hr', baseLoad: 33, peakLoad: 39, PPA: 2, spotMarket: 18 },
    { time: '2hr', baseLoad: 32, peakLoad: 37, PPA: 2, spotMarket: 16 },
    { time: '3hr', baseLoad: 31, peakLoad: 36, PPA: 2, spotMarket: 15 },
    { time: '4hr', baseLoad: 30, peakLoad: 35, PPA: 2, spotMarket: 14 },
    { time: '5hr', baseLoad: 31, peakLoad: 38, PPA: 5, spotMarket: 16 },
    { time: '6hr', baseLoad: 33, peakLoad: 44, PPA: 10, spotMarket: 19 },
    { time: '7hr', baseLoad: 36, peakLoad: 51, PPA: 18, spotMarket: 17 },
    { time: '8hr', baseLoad: 40, peakLoad: 58, PPA: 26, spotMarket: 14 },
    { time: '9hr', baseLoad: 43, peakLoad: 63, PPA: 33, spotMarket: 11 },
    { time: '10hr', baseLoad: 44, peakLoad: 64, PPA: 38, spotMarket: 8 },
    { time: '11hr', baseLoad: 45, peakLoad: 62, PPA: 41, spotMarket: 5 },
    { time: '12hr', baseLoad: 45, peakLoad: 60, PPA: 43, spotMarket: 4 },
    { time: '13hr', baseLoad: 44, peakLoad: 59, PPA: 41, spotMarket: 5 },
    { time: '14hr', baseLoad: 44, peakLoad: 61, PPA: 37, spotMarket: 8 },
    { time: '15hr', baseLoad: 45, peakLoad: 65, PPA: 30, spotMarket: 14 },
    { time: '16hr', baseLoad: 46, peakLoad: 70, PPA: 20, spotMarket: 22 },
    { time: '17hr', baseLoad: 46, peakLoad: 74, PPA: 10, spotMarket: 30 },
    { time: '18hr', baseLoad: 45, peakLoad: 72, PPA: 5, spotMarket: 34 },
    { time: '19hr', baseLoad: 43, peakLoad: 66, PPA: 3, spotMarket: 29 },
    { time: '20hr', baseLoad: 41, peakLoad: 58, PPA: 2, spotMarket: 24 },
    { time: '21hr', baseLoad: 39, peakLoad: 52, PPA: 2, spotMarket: 21 },
    { time: '22hr', baseLoad: 37, peakLoad: 48, PPA: 2, spotMarket: 20 },
    { time: '23hr', baseLoad: 35, peakLoad: 44, PPA: 2, spotMarket: 20 },
    { time: '24hr', baseLoad: 34, peakLoad: 41, PPA: 3, spotMarket: 20 },
]

const HIST_YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']
const FWD5_YEARS = ['2027', '2028', '2029', '2030', '2031']
const FWD10_YEARS = ['2027', '2028', '2029', '2030', '2031', '2032', '2033', '2034', '2035', '2036']
const historicalValues = [46, 44, 47, 50, 52, 55, 57, 58]
const p10_5y = [60, 62, 58, 61, 57]
const p50_5y = [55, 52, 50, 52, 54]
const p90_5y = [50, 46, 43, 45, 48]
const p10_10y = [60, 62, 58, 61, 57, 59, 62, 64, 61, 58]
const p50_10y = [55, 52, 50, 52, 54, 51, 50, 53, 55, 52]
const p90_10y = [50, 46, 43, 45, 48, 44, 42, 45, 47, 44]

const OVERLAP_SERIES = [
    { key: 'peakLoad', label: 'Peak Load', color: '#ef4444' },
    { key: 'baseLoad', label: 'Base Load', color: '#3b82f6' },
    { key: 'PPA', label: 'PPA', color: '#10b981' },
    { key: 'spotMarket', label: 'Spot Market', color: '#f59e0b' },
]

function BarChart({ showLegend = true }: { showLegend?: boolean }) {
    const MAJOR_TICKS = new Set(['0hr', '6hr', '12hr', '18hr', '24hr'])

    const CustomXAxisTick = (props: any) => {
        const { x, y, payload } = props
        if (!MAJOR_TICKS.has(payload.value)) return null
        const isFirst = payload.value === '0hr'
        const isLast = payload.value === '24hr'
        return (
            <g transform={`translate(${x},${y})`}>
                <text
                    x={0} y={0} dy={16}
                    textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                    fill="#868585" fontSize={13} fontFamily="Inter"
                >
                    {payload.value}
                </text>
            </g>
        )
    }

    function OverlapBars(props: any) {
        const { background, y, height, payload } = props
        if (!height || height <= 0 || !payload?.peakLoad) return null

        const cx = background.x + background.width / 2
        const bw = Math.max(6, background.width * 0.75)
        const base = y + height
        const scale = height / payload.peakLoad

        const sorted = [...OVERLAP_SERIES].sort(
            (a, b) => (payload[b.key] as number) - (payload[a.key] as number)
        )

        return (
            <g>
                {sorted.map(({ key, color }) => {
                    const val = payload[key] as number
                    const bh = val * scale
                    return (
                        <rect key={key} x={cx - bw / 2} y={base - bh} width={bw} height={bh} fill={color} opacity={0.88} rx={3} />
                    )
                })}
            </g>
        )
    }

    function BarTooltip({ active, payload }: any) {
        if (!active || !payload?.[0]) return null
        const d = payload[0].payload
        return (
            <div style={{
                background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 8, padding: '10px 14px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                fontSize: 12, fontFamily: 'Inter',
            }}>
                {OVERLAP_SERIES.map(({ key, label, color }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ color: '#64748b' }}>{label}:</span>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{d[key]} MWh</span>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div>
            <ResponsiveContainer width="100%" height={310}>
                <ReBarChart data={barData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.3)" />
                    <XAxis dataKey="time" tick={<CustomXAxisTick />} axisLine={false} tickLine={false} interval={0} />
                    <YAxis
                        tickFormatter={(v) => `${v} MWh`}
                        tick={{ fill: '#868585', fontSize: 12, fontFamily: 'Inter' }}
                        axisLine={false} tickLine={false} width={68}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="peakLoad" shape={<OverlapBars />} isAnimationActive={false} />
                </ReBarChart>
            </ResponsiveContainer>
            {showLegend && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, paddingTop: 10 }}>
                    {OVERLAP_SERIES.map(({ label, color }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontFamily: 'Inter', color: '#64748b' }}>{label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function ForecastChart({ fwdYears, p10, p50, p90 }: {
    years: string[]
    fwdYears: string[]
    p10: number[]
    p50: number[]
    p90: number[]
}) {
    const allYears = [...HIST_YEARS, ...fwdYears]
    const total = allYears.length
    const histEnd = HIST_YEARS.length - 1

    const L_PAD = { left: 60, right: 30, top: 20, bottom: 40 }
    const L_VW = 900
    const L_VH = 280
    const L_CW = L_VW - L_PAD.left - L_PAD.right
    const L_CH = L_VH - L_PAD.top - L_PAD.bottom
    const L_MAX = 70
    const L_MIN = 0
    const L_YTICKS = [0, 10, 20, 30, 40, 50, 60]

    function lToY(val: number) {
        return L_PAD.top + L_CH - ((val - L_MIN) / (L_MAX - L_MIN)) * L_CH
    }
    function lToX(idx: number, total: number) {
        return L_PAD.left + (idx / (total - 1)) * L_CW
    }
    function linePath(pts: [number, number][]) {
        return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
    }
    function areaPath(pts: [number, number][]) {
        const bottom = L_PAD.top + L_CH
        return (
            pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') +
            ` L ${pts[pts.length - 1][0]} ${bottom} L ${pts[0][0]} ${bottom} Z`
        )
    }

    const sepX = lToX(histEnd, total)
    const histPts: [number, number][] = historicalValues.map((v, i) => [lToX(i, total), lToY(v)])
    const fwdStart: [number, number] = [lToX(histEnd, total), lToY(historicalValues[histEnd])]
    const p10Pts: [number, number][] = [fwdStart, ...p10.map((v, i) => [lToX(histEnd + 1 + i, total), lToY(v)] as [number, number])]
    const p50Pts: [number, number][] = [fwdStart, ...p50.map((v, i) => [lToX(histEnd + 1 + i, total), lToY(v)] as [number, number])]
    const p90Pts: [number, number][] = [fwdStart, ...p90.map((v, i) => [lToX(histEnd + 1 + i, total), lToY(v)] as [number, number])]

    return (
        <div>
            <div className="flex items-center gap-6 mb-4">
                {[
                    { label: 'Historical Data', color: '#2563eb', dash: '' },
                    { label: 'P10 Forecast', color: '#dc2626', dash: '6,3' },
                    { label: 'P50 Forecast', color: '#f97316', dash: '6,3' },
                    { label: 'P90 Forecast', color: '#eab308', dash: '2,3' },
                ].map(({ label, color, dash }) => (
                    <div key={label} className="flex items-center gap-2">
                        <svg width="24" height="10">
                            <line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dash || undefined} />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-tighter" style={{ color: '#64748b' }}>{label}</span>
                    </div>
                ))}
            </div>

            <svg viewBox={`0 0 ${L_VW} ${L_VH}`} className="w-full h-auto" style={{ maxHeight: 300 }}>
                {L_YTICKS.map((tick) => {
                    const y = lToY(tick)
                    return (
                        <g key={tick}>
                            <line x1={L_PAD.left} y1={y} x2={L_VW - L_PAD.right} y2={y} stroke="rgba(134,133,133,0.3)" strokeWidth="1" />
                            <text x={L_PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fontFamily="Inter" fill="#868585">{tick} MWh</text>
                        </g>
                    )
                })}
                <path d={areaPath(histPts)} fill="rgba(37,99,235,0.10)" />
                <path d={linePath(histPts)} fill="none" stroke="#2563eb" strokeWidth="2.5" />
                <line x1={sepX} y1={L_PAD.top} x2={sepX} y2={L_PAD.top + L_CH} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" />
                <path d={linePath(p10Pts)} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="6,3" />
                <path d={linePath(p50Pts)} fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="6,3" />
                <path d={linePath(p90Pts)} fill="none" stroke="#eab308" strokeWidth="2" strokeDasharray="2,3" />
                {allYears.map((yr, i) => (
                    <text key={yr} x={lToX(i, total)} y={L_VH - 8} textAnchor="middle" fontSize="11" fontFamily="Inter" fill="#868585">{yr}</text>
                ))}
            </svg>
        </div>
    )
}

export function LoadForecastChart() {
    type Mode = 'default' | '5y' | '10y'
    const [mode, setMode] = useState<Mode>('default')
    const [PPA, setPpa] = useState('Shade a PPA')

    const MODES: { key: Mode; label: string }[] = [
        { key: 'default', label: 'Default' },
        { key: '5y', label: '+5Y Fwd' },
        { key: '10y', label: '+10Y Fwd' },
    ]

    return (
        <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 style={{ fontWeight: 600, fontSize: '20px', lineHeight: '24px', color: '#000' }}>
                    Load Forecast &amp; Procurement
                </h2>

                {mode === 'default' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        {OVERLAP_SERIES.map(({ label, color }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontFamily: 'Inter', color: '#64748b' }}>{label}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <div className="flex rounded-lg overflow-hidden border border-slate-200">
                        {MODES.map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setMode(key)}
                                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                                style={{
                                    background: mode === key ? '#0D0630' : '#fff',
                                    color: mode === key ? '#fff' : '#64748b',
                                    borderRight: key !== '10y' ? '1px solid #e2e8f0' : undefined,
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <select
                        value={PPA}
                        onChange={(e) => setPpa(e.target.value)}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-200 bg-white"
                        style={{ color: '#0D0630', outline: 'none' }}
                    >
                        <option>Shade a PPA</option>
                        <option>Solar PPA</option>
                        <option>Wind PPA</option>
                        <option>Baseload PPA</option>
                    </select>
                </div>
            </div>

            {mode === 'default' && <BarChart showLegend={false} />}
            {mode === '5y' && <ForecastChart years={HIST_YEARS} fwdYears={FWD5_YEARS} p10={p10_5y} p50={p50_5y} p90={p90_5y} />}
            {mode === '10y' && <ForecastChart years={HIST_YEARS} fwdYears={FWD10_YEARS} p10={p10_10y} p50={p50_10y} p90={p90_10y} />}
        </div>
    )
}

// ─── Procurement Schedule ─────────────────────────────────────────────────────
const schedule = [
    { time: 'Today 08:00', action: 'Day-ahead bid (off-peak)', mw: 42.0, total: 62.0 },
    { time: 'Tmmr 09:00', action: 'Solar PPA delivery beings', mw: 18.5, total: 73.5 },
    { time: 'Tmmr 10:00', action: 'Peak Saving', mw: 35.0, total: 103.0 },
    { time: 'Tmmr 11:00', action: 'Spot hedge', mw: 22.0, total: 97.0 },
    { time: 'Tmmr 12:00', action: 'Base RES', mw: 45.0, total: 125.0 },
    { time: 'Tmmr 13:00', action: 'Contract', mw: 30.0, total: 110.0 },
    { time: 'Tmmr 14:00', action: 'Spot', mw: 15.0, total: 95.0 },
    { time: 'Tmmr 15:00', action: 'Base RES', mw: 38.0, total: 88.0 },
]

export function ProcurementSchedule() {
    const actionColors: Record<string, string> = {
        'Base RES': '#3b82f6',
        Spot: '#f59e0b',
        Contract: '#22c55e',
    }

    return (
        <div className="flex flex-col h-full font-inter">
            <h2 className="text-xl font-black text-slate-900 mb-6">Procurement Schedule</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-slate-400">Time</th>
                            <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-slate-400">Action</th>
                            <th className="text-right py-3 px-4 font-black uppercase tracking-widest text-slate-400">Total MW</th>
                        </tr>
                    </thead>
                    <tbody>
                        {schedule.map((row, i) => (
                            <tr key={i} className="border-b last:border-0 border-slate-100 transition-colors hover:bg-slate-50/50">
                                <td className="py-3 px-4 font-bold text-slate-500">{row.time}</td>
                                <td className="py-3 px-4">
                                    <span
                                        className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm border"
                                        style={{
                                            background: `${actionColors[row.action]}15`,
                                            color: actionColors[row.action],
                                            borderColor: `${actionColors[row.action]}30`,
                                        }}
                                    >
                                        {row.action}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right font-black text-slate-900 bg-slate-50/30">
                                    {row.total.toFixed(1)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ─── Risk & Alerts ────────────────────────────────────────────────────────────
const alerts = [
    {
        priority: 'High',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)',
        text: 'Peak demand threshold exceeded — 105.3 MW at 12:00. Activate demand response protocol DR-3.',
    },
    {
        priority: 'Medium',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        text: 'Spot market price spike detected. Current rate $214/MWh exceeds 15-min average by 28%.',
    },
    {
        priority: 'Low',
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.12)',
        text: 'Solar generation underperforming by 8% vs forecast. Cloud cover event in grid zone B.',
    },
    {
        priority: 'Medium',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        text: 'Grid frequency deviation at 49.82 Hz. Frequency response reserve activated.',
    },
    {
        priority: 'Low',
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.12)',
        text: 'Procurement schedule updated. New contract slot confirmed for 14:00–16:00 window.',
    },
]

export function RiskAlerts() {
    return (
        <div className="flex flex-col h-full font-inter">
            <div
                className="flex items-center justify-between pb-5 mb-4"
                style={{ borderBottom: '1px solid rgba(134, 133, 133, 0.33)' }}
            >
                <h2 style={{ fontWeight: 600, fontSize: '20px', lineHeight: '24px', color: '#000000' }}>Risk &amp; Alerts</h2>
                <span className="text-xs px-3 py-1 rounded-full font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100 shadow-sm">
                    {alerts.length} active
                </span>
            </div>

            <div className="flex flex-col flex-1">
                {alerts.map((alert, i) => (
                    <div key={i} className="relative">
                        <div
                            className="py-6 transition-all hover:translate-x-1"
                            style={{ borderLeft: `4px solid ${alert.color}`, paddingLeft: '16px' }}
                        >
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: alert.color }} />
                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: alert.color }}>
                                    {alert.priority}
                                </span>
                            </div>
                            <p className="text-xs font-bold leading-relaxed" style={{ color: '#64748b' }}>{alert.text}</p>
                        </div>
                        {i < alerts.length - 1 && (
                            <div className="w-full" style={{ border: '1px solid rgba(134, 133, 133, 0.15)' }} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function Forecast() {
    return (
        <>
            <div className="max-w-full flex flex-col gap-6">

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICards />
                </div>

                {/* Load Forecast — full width */}
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
                    <LoadForecastChart />
                </div>

                {/* Cost vs Time | Energy Source Mix */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[400px]">
                        <CostTimeChart />
                    </div>
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[400px]">
                        <EnergyMixChart />
                    </div>
                </div>

                {/* Procurement Schedule | Risk & Alerts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[380px]">
                        <ProcurementSchedule />
                    </div>
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[380px]">
                        <RiskAlerts />
                    </div>
                </div>

            </div>
        </>
    )
}
