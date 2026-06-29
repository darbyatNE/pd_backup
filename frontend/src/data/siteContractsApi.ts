import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../services/api'
import type { LinkedContract, ContractShape } from './linkedContracts'
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
  price_per_mw_year: string | number | null
  lda: string | null
  shape: string
  start_year: number
  start_month: number
  end_year: number
  end_month: number
  committed: boolean
}

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
  // project name when a contract predates project linkage.
  const groups = new Map<string, SiteContractRow[]>()
  for (const r of rows) {
    const key = [
      r.project_id ?? r.project_name,
      r.generation_type,
      r.start_year, r.start_month, r.end_year, r.end_month,
      r.shape,
      r.price_per_mwh ?? '',
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
    const common = {
      generationType: gen,
      pricePerMwh: num(r0.price_per_mwh),
      pattern: 'diagonal' as const,
      lda: r0.lda ?? undefined,
      startYear: r0.start_year,
      startMonth: r0.start_month,
      endYear: r0.end_year,
      endMonth: r0.end_month,
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
            pricePerMwYear: num(r0.price_per_mw_year),
            lda: capLda,
          },
        ],
        perSiteMw: gr
          .filter((r) => num(r.capacity_mw) > 0)
          .map((r) => ({ siteKey: r.fac_id, mwCovered: r2(num(r.capacity_mw)) })),
      })
    }

    if (energy > 0) {
      out.push({
        ...common,
        projectName: `${baseName}${both ? ' · Energy' : ''}`,
        mwCovered: r2(energy / 8760),
        shape: ((r0.shape as ContractShape) || 'flat'),
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
