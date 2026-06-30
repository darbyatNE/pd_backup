import { useMemo, useState } from 'react'
import {
  useContractLedger,
  setContractStatus,
  removeContract,
  type SiteContractRow,
  type ContractStatus,
} from '../data/siteContractsApi'
import { LOAD_PROFILE_MAP } from '../data/loadProfile'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const num = (v: string | number | null | undefined) => (v == null || v === '' ? null : Number(v))
const siteName = (facId: string) => LOAD_PROFILE_MAP[facId]?.name ?? facId

const STATUS_STYLE: Record<ContractStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border border-amber-200',     // Proposed (exploring)
  committed: 'bg-orange-50 text-orange-700 border border-orange-200', // In Progress (contract-pending)
  accepted: 'bg-teal-50 text-teal-700 border border-teal-200',
  rejected: 'bg-rose-50 text-rose-600 border border-rose-200',
}
const STATUS_LABEL: Record<ContractStatus, string> = {
  pending: 'Proposed', committed: 'In Progress', accepted: 'Accepted', rejected: 'Rejected',
}

function term(r: SiteContractRow): string {
  return `${MONTHS[r.start_month - 1]} '${String(r.start_year).slice(-2)} – ${MONTHS[r.end_month - 1]} '${String(r.end_year).slice(-2)}`
}

function components(r: SiteContractRow): string {
  const parts: string[] = []
  if (num(r.capacity_mw)) parts.push(`Cap ${num(r.capacity_mw)} MW${num(r.price_per_mw_day) != null ? ` @ $${num(r.price_per_mw_day)}/MW-day` : ''}`)
  if (num(r.energy_mwh)) parts.push(`Energy ${num(r.energy_mwh)} MWh${num(r.price_per_mwh) != null ? ` @ $${num(r.price_per_mwh)}/MWh` : ''}`)
  if (r.retiring_agency) parts.push(`RECs ${num(r.rec_pct) != null ? `${num(r.rec_pct)}% ` : ''}${r.matching_format ?? ''} ${r.retiring_agency}`.replace(/\s+/g, ' ').trim())
  return parts.join(' · ') || '—'
}

// Tab → underlying status. 'proposed' = pending (saved draft), 'committed' =
// In Progress (awaiting decision).
type Filter = 'all' | 'proposed' | 'committed' | 'accepted' | 'rejected'
const FILTER_STATUS: Record<Exclude<Filter, 'all'>, ContractStatus> = {
  proposed: 'pending', committed: 'committed', accepted: 'accepted', rejected: 'rejected',
}

export default function ContractsLedger({ onChanged }: { onChanged?: () => void }) {
  const { rows, loading, refetch } = useContractLedger()
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c = { all: rows.length, proposed: 0, committed: 0, accepted: 0, rejected: 0 }
    for (const r of rows) {
      if (r.status === 'pending') c.proposed++
      else if (r.status === 'committed') c.committed++
      else if (r.status === 'accepted') c.accepted++
      else if (r.status === 'rejected') c.rejected++
    }
    return c
  }, [rows])

  const visible = useMemo(
    () => rows.filter((r) => (filter === 'all' ? true : r.status === FILTER_STATUS[filter])),
    [rows, filter],
  )

  const afterChange = async () => {
    await refetch()
    onChanged?.()
  }
  const act = async (id: string, action: 'commit' | 'accept' | 'reject') => {
    setBusy(id)
    const ok = await setContractStatus(id, action)
    if (ok) await afterChange()
    setBusy(null)
  }
  const remove = async (id: string) => {
    setBusy(id)
    const ok = await removeContract(id)
    if (ok) await afterChange()
    setBusy(null)
  }

  const FilterTab = ({ id, label }: { id: Filter; label: string }) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        filter === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${filter === id ? 'bg-white/20' : 'bg-white text-slate-500'}`}>
        {counts[id]}
      </span>
    </button>
  )

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Contracts</h2>
          <p className="text-xs text-slate-500">Lifecycle for your company's deals. Proposed drafts can be removed or committed; in-progress deals can be accepted (permanent, charted against load) or rejected. Each action updates the deal's commitment level across the platform.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterTab id="all" label="All" />
          <FilterTab id="proposed" label="Proposed" />
          <FilterTab id="committed" label="In Progress" />
          <FilterTab id="accepted" label="Accepted" />
          <FilterTab id="rejected" label="Rejected" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-4">Loading contracts…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-4">No contracts in this view.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Components</th>
                <th className="px-3 py-2 whitespace-nowrap">Pricing LMP</th>
                <th className="px-3 py-2 whitespace-nowrap">Term</th>
                <th className="px-3 py-2">Origin</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => {
                const status = (r.status ?? 'pending') as ContractStatus
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-medium text-slate-800">{r.project_name}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{siteName(r.fac_id)}</td>
                    <td className="px-3 py-2 text-slate-600">{components(r)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${r.lmp_node ? 'text-slate-600' : 'text-slate-300'}`}>{r.lmp_node || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{term(r)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.origin === 'existing' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        {r.origin === 'existing' ? 'Existing' : 'Marketplace'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1.5">
                        {/* Proposed (pending): Remove or Commit */}
                        {status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => remove(r.id)}
                              className="rounded px-2 py-1 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => act(r.id, 'commit')}
                              className="rounded px-2 py-1 text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
                            >
                              Commit
                            </button>
                          </>
                        )}
                        {/* In Progress (committed): Accept or Reject */}
                        {status === 'committed' && (
                          <>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => act(r.id, 'accept')}
                              className="rounded px-2 py-1 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => act(r.id, 'reject')}
                              className="rounded px-2 py-1 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {(status === 'accepted' || status === 'rejected') && (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
