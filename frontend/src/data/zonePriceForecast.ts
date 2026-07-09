// Locational price forecast for the Plan energy chart's price line.
//
// Source: planning.lmp_forecast_forward_nodes_hourly (via /planning/zone-price-
// forecast). For the in-scope sites we fetch each settlement zone's forward LMP
// — an HE1–24 hourly shape and a monthly series — then volume-weight the zones
// together by the in-scope load *at that hour / month* (time-varying weight), so
// a scope spanning two zones prices as its load-weighted blend.
import { useEffect, useMemo, useState } from 'react'
import type { SiteLoadProfile } from './loadProfile'
import { API_BASE_URL } from '../services/api'

export interface ZonePriceSeries {
  hourly: (number | null)[]                                   // 24 values, index h = HE h+1
  monthly: { year: number; month: number; price: number | null }[]
}
export interface ZonePriceResponse { zones: Record<string, ZonePriceSeries>; missing: string[] }
// A year range + optional calendar-month filter (empty months = every month in
// the range) — set to exactly the period the chart is displaying.
export interface PriceWindow { startYear: number; endYear: number; months: number[] }

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().trim()

export async function fetchZonePriceForecast(zones: string[], w: PriceWindow): Promise<ZonePriceResponse> {
  const token = localStorage.getItem('pd_access_token')
  const qs = new URLSearchParams({
    zones: zones.join(','),
    startYear: String(w.startYear), endYear: String(w.endYear),
  })
  if (w.months.length) qs.set('months', w.months.join(','))
  const res = await fetch(`${API_BASE_URL}/planning/zone-price-forecast?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('zone price forecast fetch failed')
  return res.json()
}

// Per-zone in-scope load at each HE (summed over the given months) — the weight
// for blending the hourly price shape. loadShape.hour is 0–23; HE = hour+1, so
// index h aligns with the backend's hourly[h].
function heWeightsByZone(profiles: SiteLoadProfile[], months: number[]): Record<string, number[]> {
  const monthSet = new Set(months)
  const out: Record<string, number[]> = {}
  for (const p of profiles) {
    const z = norm(p.settlementZone)
    if (!z) continue
    const arr = (out[z] ??= Array(24).fill(0))
    for (const pt of p.loadShape) if (monthSet.has(pt.month)) arr[pt.hour] += pt.totalMw
  }
  return out
}

// Per-zone in-scope load per month (index m-1) — the weight for blending the
// monthly price series. Year scaling (uniform growth) cancels in the ratio.
function monthWeightsByZone(profiles: SiteLoadProfile[]): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const p of profiles) {
    const z = norm(p.settlementZone)
    if (!z) continue
    const arr = (out[z] ??= Array(12).fill(0))
    for (const pt of p.loadShape) arr[pt.month - 1] += pt.totalMw
  }
  return out
}

function blendHourly(zones: Record<string, ZonePriceSeries>, weights: Record<string, number[]>): (number | null)[] {
  const res: (number | null)[] = Array(24).fill(null)
  for (let h = 0; h < 24; h++) {
    let num = 0, den = 0
    for (const z of Object.keys(weights)) {
      const price = zones[z]?.hourly?.[h]
      const w = weights[z][h]
      if (price != null && w > 0) { num += price * w; den += w }
    }
    if (den > 0) res[h] = Math.round((num / den) * 100) / 100
  }
  return res
}

function blendMonthly(zones: Record<string, ZonePriceSeries>, weights: Record<string, number[]>): Map<string, number> {
  const acc = new Map<string, { num: number; den: number }>()
  for (const z of Object.keys(zones)) {
    const zw = weights[z]
    if (!zw) continue
    for (const { year, month, price } of zones[z].monthly) {
      const w = zw[month - 1] ?? 0
      if (price == null || w <= 0) continue
      const key = `${year}-${month}`
      const a = acc.get(key) ?? { num: 0, den: 0 }
      a.num += price * w; a.den += w; acc.set(key, a)
    }
  }
  const out = new Map<string, number>()
  for (const [k, { num, den }] of acc) if (den > 0) out.set(k, Math.round((num / den) * 100) / 100)
  return out
}

export interface ZonePriceLine {
  hourly: (number | null)[]      // blended HE1–24 shape (index h = HE h+1)
  monthly: Map<string, number>   // key `${year}-${month}` → blended $/MWh
  hasData: boolean
  missing: string[]              // in-scope zones with no forecast (e.g. non-PJM)
  loading: boolean
}

/** Fetch + volume-weight the locational price line for the in-scope sites.
 *  Refetches whenever the in-scope zones or the displayed window (year range /
 *  month filter) change, so the line always matches the charted time period. */
export function useZonePriceLine(
  profiles: SiteLoadProfile[], window: PriceWindow, enabled = true,
): ZonePriceLine {
  const zones = useMemo(
    () => Array.from(new Set(profiles.map((p) => norm(p.settlementZone)).filter(Boolean))),
    [profiles],
  )
  const [data, setData] = useState<ZonePriceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const monthsKey = window.months.join('.')
  const winKey = `${window.startYear}..${window.endYear}:${monthsKey}`
  const zonesKey = zones.join(',')

  useEffect(() => {
    if (!enabled || zones.length === 0) { setData(null); return }
    let alive = true
    setLoading(true)
    fetchZonePriceForecast(zones, window)
      .then((d) => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) { setData(null); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesKey, winKey, enabled])

  // HE weighting uses the displayed months (all 12 when the filter is empty).
  const weightMonths = window.months.length ? window.months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const hourly = useMemo(
    () => (data ? blendHourly(data.zones, heWeightsByZone(profiles, weightMonths)) : Array(24).fill(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, profiles, monthsKey],
  )
  const monthly = useMemo(
    () => (data ? blendMonthly(data.zones, monthWeightsByZone(profiles)) : new Map<string, number>()),
    [data, profiles],
  )
  const hasData = hourly.some((v) => v != null) || monthly.size > 0
  return { hourly, monthly, hasData, missing: data?.missing ?? [], loading }
}
