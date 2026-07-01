import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../services/api'

// Unbundled project products (Capacity / Energy / RECs), one per project, served
// by /api/project-products and stored in planning.project_products.

export const RETIRING_AGENCIES = [
  'PJM-EIS GATS',
  'M-RETS',
  'NYGATS',
  'NC-RETS',
  'NEPOOL GIS',
  'NAR',
  'ERCOT',
  'MIRECS',
] as const
export type RetiringAgency = (typeof RETIRING_AGENCIES)[number]

export const MATCHING_FORMATS = ['yearly', 'monthly', '24x7'] as const
export type MatchingFormat = (typeof MATCHING_FORMATS)[number]

export const MATCHING_FORMAT_LABELS: Record<MatchingFormat, string> = {
  yearly: 'Yearly',
  monthly: 'Monthly',
  '24x7': '24/7',
}

// Short label for the retiring agency (e.g. "PJM-EIS GATS" → "GATS").
const AGENCY_SHORT: Record<string, string> = {
  'PJM-EIS GATS': 'GATS',
  'M-RETS': 'M-RETS',
  NYGATS: 'NYGATS',
  'NC-RETS': 'NC-RETS',
  'NEPOOL GIS': 'NEPOOL GIS',
  NAR: 'NAR',
  ERCOT: 'ERCOT',
  MIRECS: 'MIRECS',
}

// One row of planning.project_product_summary (per-project pivot).
export interface ProjectProductSummary {
  iso_id: string
  has_capacity: boolean
  capacity_mw: string | number | null
  eda: string | null
  capacity_price_per_mw_day: string | number | null
  has_energy: boolean
  energy_mwh_min: string | number | null
  energy_mwh_max: string | number | null
  zone: string | null
  energy_price_per_mwh: string | number | null
  has_rec: boolean
  rec_pct: string | number | null
  retiring_agency: string | null
  matching_format: MatchingFormat | null
  rec_price_per_mwh: string | number | null
}

// Editable shape used by the products editor. Capacity is priced $/MW-day;
// energy and RECs are priced $/MWh.
export interface ProductSet {
  capacity: { capacity_mw: number | ''; eda: string; price_per_mw_day: number | '' } | null
  energy: { energy_mwh_min: number | ''; energy_mwh_max: number | ''; zone: string; price_per_mwh: number | '' } | null
  rec: { rec_pct: number | ''; retiring_agency: RetiringAgency | ''; matching_format: MatchingFormat | ''; price_per_mwh: number | '' } | null
}

const n = (v: string | number | null): number | null => (v == null || v === '' ? null : Number(v))

/** Build the one-line product summary, e.g.
 *  "CAP: 275MW @ $410/MW-day · ENERGY: 0-400MWh @ $45/MWh · RECs: 100%, Monthly-GATS @ $5/MWh" */
export function formatProductSummary(s: ProjectProductSummary | undefined | null): string {
  if (!s) return ''
  const parts: string[] = []
  if (s.has_capacity && n(s.capacity_mw) != null) {
    const price = n(s.capacity_price_per_mw_day)
    parts.push(`CAP: ${n(s.capacity_mw)}MW${price != null ? ` @ $${price}/MW-day` : ''}`)
  }
  if (s.has_energy) {
    const min = n(s.energy_mwh_min)
    const max = n(s.energy_mwh_max)
    const range = min != null && max != null ? `${min}-${max}` : (max ?? min ?? '')
    const price = n(s.energy_price_per_mwh)
    parts.push(`ENERGY: ${range}MWh${price != null ? ` @ $${price}/MWh` : ''}`)
  }
  if (s.has_rec) {
    const pct = n(s.rec_pct)
    const fmt = s.matching_format ? MATCHING_FORMAT_LABELS[s.matching_format] : ''
    const agency = s.retiring_agency ? AGENCY_SHORT[s.retiring_agency] ?? s.retiring_agency : ''
    const tag = [fmt, agency].filter(Boolean).join('-')
    const price = n(s.rec_price_per_mwh)
    parts.push(`RECs: ${pct != null ? `${pct}%` : ''}${tag ? `, ${tag}` : ''}${price != null ? ` @ $${price}/MWh` : ''}`.trim())
  }
  return parts.join(' · ')
}

/** EDA + Zone line, e.g. "EDA: Penelec · Zone: Penelec". */
export function formatProductLocale(s: ProjectProductSummary | undefined | null): string {
  if (!s) return ''
  const parts: string[] = []
  if (s.eda) parts.push(`EDA: ${s.eda}`)
  if (s.zone) parts.push(`Zone: ${s.zone}`)
  return parts.join(' · ')
}

const authHeaders = () => {
  const token = localStorage.getItem('pd_access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Fetch every project's product summary, keyed by iso_id, with a refetch. */
export function useProjectProductSummaries() {
  const [byIso, setByIso] = useState<Record<string, ProjectProductSummary>>({})

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/project-products/summary`, { headers: { ...authHeaders() } })
      if (!res.ok) { setByIso({}); return }
      const { summaries } = (await res.json()) as { summaries: ProjectProductSummary[] }
      const map: Record<string, ProjectProductSummary> = {}
      for (const s of summaries ?? []) map[s.iso_id] = s
      setByIso(map)
    } catch {
      setByIso({})
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])
  return { byIso, refetch }
}

/** Load one project's three product rows as an editable ProductSet. */
export async function fetchProductSet(isoId: string): Promise<ProductSet> {
  const empty: ProductSet = { capacity: null, energy: null, rec: null }
  try {
    const res = await fetch(`${API_BASE_URL}/project-products/${isoId}`, { headers: { ...authHeaders() } })
    if (!res.ok) return empty
    const { products } = (await res.json()) as { products: Array<Record<string, unknown>> }
    const out: ProductSet = { ...empty }
    for (const p of products ?? []) {
      if (p.product_type === 'capacity') out.capacity = { capacity_mw: n(p.capacity_mw as never) ?? '', eda: (p.eda as string) ?? '', price_per_mw_day: n(p.price_per_mw_day as never) ?? '' }
      if (p.product_type === 'energy') out.energy = { energy_mwh_min: n(p.energy_mwh_min as never) ?? '', energy_mwh_max: n(p.energy_mwh_max as never) ?? '', zone: (p.zone as string) ?? '', price_per_mwh: n(p.price_per_mwh as never) ?? '' }
      if (p.product_type === 'rec') out.rec = { rec_pct: n(p.rec_pct as never) ?? '', retiring_agency: (p.retiring_agency as RetiringAgency) ?? '', matching_format: (p.matching_format as MatchingFormat) ?? '', price_per_mwh: n(p.price_per_mwh as never) ?? '' }
    }
    return out
  } catch {
    return empty
  }
}

/** Upsert (or clear, via null) a project's products. */
export async function saveProductSet(isoId: string, set: ProductSet): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/project-products/${isoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(set),
    })
    return res.ok
  } catch {
    return false
  }
}
