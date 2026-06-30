import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../services/api'
import type { LinkedContract, ContractShape, CommitmentLevel } from './linkedContracts'
import { defaultShapeForGenType } from './linkedContracts'
import { LOAD_PROFILE_MAP } from './loadProfile'

// Row shape returned by GET /api/site-contracts (RDS public.site_contracts).
export interface SiteContractRow {
  id: string
  buyer_id: string
  fac_id: string
  project_id: string | null
  project_name: string
  generation_type: string
  capacity_mw: string | number | null
  energy_mwh: string | number | null
  price_per_mwh: string | number | null
  price_per_mw_day: string | number | null
  lda: string | null
  lmp_node?: string | null
  shape: string
  start_year: number
  start_month: number
  end_year: number
  end_month: number
  committed: boolean
  // Unbundled REC component (optional)
  rec_pct?: string | number | null
  retiring_agency?: string | null
  matching_format?: string | null
  // Lifecycle (Transactions tab)
  origin?: ContractOrigin
  status?: ContractStatus
  owner_company_id?: string | null
  decided_at?: string | null
  decided_by?: string | null
}

export type ContractOrigin = 'existing' | 'pursued'
export type ContractStatus = 'pending' | 'committed' | 'accepted' | 'rejected'

const num = (v: string | number | null): number => (v == null ? 0 : Number(v))

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Map saved site_contracts rows to the chart's LinkedContract model.
 *
 * A single contract spread across N data centers is stored as N rows (one per
 * fac_id) sharing the same project + term. Those rows are GROUPED back into one
 * LinkedContract so the contract keeps its integrity in the chart/legend: a
 * project applied to three sites is ONE legend entry, not three. Its `mwCovered`
 * is the sum of only the rows passed in — and since callers filter rows to the
 * in-scope data centers first (see siteContractsForSites), selecting/deselecting
 * a data center changes the charted volume without changing the entry count.
 *
 * - capacity_mw → a flat baseload band (MW-year, same MW each hour), tier 'base'.
 * - energy_mwh  → a peaking band, tier 'peak'. v1 renders it as a flat band at
 *   the average MW (annual MWh ÷ 8760); the exact hour/month/year shape arrives
 *   with the future contract-entry update (carried via the `shape` column).
 *
 * A contract with both capacity and energy yields two entries (· Capacity /
 * · Energy) so each lands in the correct legend group and is independently
 * selectable. `perSiteMw` carries the serving-site breakdown for the legend.
 */
export function mapSiteContractRowsToLinked(rows: SiteContractRow[]): LinkedContract[] {
  // Group rows that belong to the same contract (same project + generation type
  // + term + shape + price). project_id is the strongest key; fall back to the
  // project name when a contract predates project linkage. Rejected (archived)
  // contracts are dropped — they don't chart.
  const groups = new Map<string, SiteContractRow[]>()
  for (const r of rows) {
    if (r.status === 'rejected') continue
    const key = [
      r.project_id ?? r.project_name,
      r.generation_type,
      r.start_year, r.start_month, r.end_year, r.end_month,
      r.shape,
      r.price_per_mwh ?? '',
      // Keep each lifecycle status in its own group so the entry gets a single
      // commitment color (pending = exploring/white, committed = pending/brown,
      // accepted = contracted/black).
      r.status ?? (r.committed ? 'accepted' : 'pending'),
    ].join('|')
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  // Disambiguate distinct contracts that happen to share a project name (e.g. the
  // same project contracted twice on different terms) so legend keys stay unique.
  const nameCounts = new Map<string, number>()
  for (const [, gr] of groups) nameCounts.set(gr[0].project_name, (nameCounts.get(gr[0].project_name) ?? 0) + 1)

  const out: LinkedContract[] = []
  for (const [, gr] of groups) {
    const r0 = gr[0]
    const gen = r0.generation_type as LinkedContract['generationType']
    const cap = gr.reduce((s, r) => s + num(r.capacity_mw), 0)
    const energy = gr.reduce((s, r) => s + num(r.energy_mwh), 0)
    const both = cap > 0 && energy > 0
    const ambiguous = (nameCounts.get(r0.project_name) ?? 0) > 1
    const termTag = ambiguous ? ` ['${String(r0.start_year).slice(-2)}–'${String(r0.end_year).slice(-2)}]` : ''
    const baseName = `${r0.project_name}${termTag}`
    // LDA for capacity deliverability: the row's stored LDA, else the serving
    // site's LDA, else DOM (Northern Virginia). A bilateral capacity deal is
    // contracted at the data center, so it's deliverable to that load by default.
    const capLda =
      r0.lda ??
      gr.map((r) => LOAD_PROFILE_MAP[r.fac_id]?.lda).find(Boolean) ??
      'DOM'
    // Commitment shade follows the lifecycle:
    //   pending (saved, not committed)        ⇒ exploring  (white)
    //   committed (committed, awaiting decision) ⇒ pending  (brown)
    //   accepted (permanent)                  ⇒ contracted (black)
    const effectiveStatus = r0.status ?? (r0.committed ? 'accepted' : 'pending')
    const commitment: CommitmentLevel =
      effectiveStatus === 'accepted' ? 'contracted'
      : effectiveStatus === 'committed' ? 'pending'
      : 'exploring'
    const common = {
      generationType: gen,
      pricePerMwh: num(r0.price_per_mwh),
      pattern: 'diagonal' as const,
      lda: r0.lda ?? undefined,
      lmpNode: r0.lmp_node ?? undefined,
      startYear: r0.start_year,
      startMonth: r0.start_month,
      endYear: r0.end_year,
      endMonth: r0.end_month,
      commitment,
    }

    if (cap > 0) {
      out.push({
        ...common,
        projectName: `${baseName}${both ? ' · Capacity' : ''}`,
        mwCovered: r2(cap),
        shape: 'flat',
        tier: 'base',
        // A 'capacity' component (with a deliverable LDA) so capacity-coverage
        // math counts this deal; without it, ensureContractComponents would
        // default to an 'energy' component and the deal would never qualify.
        lda: capLda,
        components: [
          {
            type: 'capacity',
            mwCovered: r2(cap),
            pricePerMwDay: num(r0.price_per_mw_day),
            lda: capLda,
          },
        ],
        perSiteMw: gr
          .filter((r) => num(r.capacity_mw) > 0)
          .map((r) => ({ siteKey: r.fac_id, mwCovered: r2(num(r.capacity_mw)) })),
      })
    }

    if (energy > 0) {
      // Self-heal legacy rows: contracts saved before the per-gen-type shape fix
      // stored 'flat' for everything. When the stored shape is the legacy 'flat'
      // default, fall back to the gen type's natural shape (e.g. Peaker → evening
      // peak); baseload gen types map back to 'flat', so they're unaffected.
      const storedShape = (r0.shape as ContractShape) || 'flat'
      const energyShape: ContractShape = storedShape === 'flat' ? defaultShapeForGenType(gen) : storedShape
      out.push({
        ...common,
        projectName: `${baseName}${both ? ' · Energy' : ''}`,
        mwCovered: r2(energy / 8760),
        shape: energyShape,
        tier: 'peak',
        perSiteMw: gr
          .filter((r) => num(r.energy_mwh) > 0)
          .map((r) => ({ siteKey: r.fac_id, mwCovered: r2(num(r.energy_mwh) / 8760) })),
      })
    }
  }
  return out
}

/** Filter rows to the in-scope data centers and map them to LinkedContracts. */
export function siteContractsForSites(rows: SiteContractRow[], siteKeys: string[]): LinkedContract[] {
  const set = new Set(siteKeys)
  return mapSiteContractRowsToLinked(rows.filter((r) => set.has(r.fac_id)))
}

/** Fetch the authenticated buyer's saved site contracts (with a refetch handle). */
export function useSiteContracts() {
  const [rows, setRows] = useState<SiteContractRow[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('pd_access_token')
      const res = await fetch(`${API_BASE_URL}/site-contracts`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      })
      if (!res.ok) {
        setRows([])
        return
      }
      const { contracts } = (await res.json()) as { contracts: SiteContractRow[] }
      setRows(contracts ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { rows, loading, refetch }
}

const authHeaders = () => {
  const token = localStorage.getItem('pd_access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Full contract ledger for the Transactions tab — ALL statuses incl. rejected,
 *  scoped to the user's company. */
export function useContractLedger() {
  const [rows, setRows] = useState<SiteContractRow[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/site-contracts?ledger=1`, { headers: { ...authHeaders() } })
      if (!res.ok) { setRows([]); return }
      const { contracts } = (await res.json()) as { contracts: SiteContractRow[] }
      setRows(contracts ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])
  return { rows, loading, refetch }
}

/** Move a contract along its lifecycle:
 *   commit → 'committed' (Proposed → In Progress, awaiting decision)
 *   accept → 'accepted'  (permanent + charted)
 *   reject → 'rejected'  (soft archive)
 *  Returns true on success. */
export async function setContractStatus(id: string, action: 'commit' | 'accept' | 'reject'): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/site-contracts/${id}/${action}`, {
      method: 'PUT',
      headers: { ...authHeaders() },
    })
    return res.ok
  } catch {
    return false
  }
}

/** Hard-delete a proposed (pending) draft contract. Returns true on success. */
export async function removeContract(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/site-contracts/${id}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    })
    return res.ok
  } catch {
    return false
  }
}
