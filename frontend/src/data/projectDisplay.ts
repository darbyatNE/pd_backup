// Shared presentation helpers for marketplace project rows (Projects page +
// the dashboard "Examine Fit" table), so both render the same way.
import type { Project } from '../types/index'
import type { ProjectProductSummary } from './projectProductsApi'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const pnum = (v: string | number | null | undefined): number | null =>
  v == null || v === '' ? null : Number(v)

// "Sep '26" from a YYYY-MM(-DD) string (parsed directly to avoid TZ shifts).
export const moYrFromIso = (s?: string | null): string => {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})/.exec(s)
  return m ? `${MONTHS[Number(m[2]) - 1]} '${m[1].slice(2)}` : '—'
}

// Status: "Available" if operational/no future COD, else "Est <Mon Year>".
export function projectStatus(p: Project): { label: string; available: boolean } {
  const cod = p.expected_cod ? new Date(p.expected_cod) : null
  if (!cod || Number.isNaN(cod.getTime()) || cod <= new Date()) return { label: 'Available', available: true }
  return { label: `Est ${cod.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, available: false }
}

// Offered delivery term (Mo/Yr) from the explicit term_start/end dates.
export function projectTerm(p: Project): { start: string; stop: string } {
  return { start: moYrFromIso(p.term_start_date), stop: moYrFromIso(p.term_end_date) }
}

// Energy MWh from the product summary, e.g. "0–400" or "87.5" (or "—").
export function energyRange(s?: ProjectProductSummary): string {
  if (!s?.has_energy) return '—'
  const lo = pnum(s.energy_mwh_min)
  const hi = pnum(s.energy_mwh_max)
  if (lo != null && hi != null) return `${lo}–${hi}`
  return `${hi ?? lo ?? ''}`
}
