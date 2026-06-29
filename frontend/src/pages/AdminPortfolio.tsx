import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../services/api'

interface CompanySlice { company: string; capacity_mw: number; energy_mwh: number }
interface ProjectRow {
  id: string
  name: string
  generation_type: string
  visibility: string
  status: string
  total_capacity_mw: number
  total_energy_mwh: number
  contracted_capacity_mw: number
  contracted_energy_mwh: number
  available_capacity_mw: number
  available_energy_mwh: number
  by_company: CompanySlice[]
}
interface Totals {
  total_capacity_mw: number
  total_energy_mwh: number
  contracted_capacity_mw: number
  contracted_energy_mwh: number
  available_capacity_mw: number
  available_energy_mwh: number
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function AdminPortfolio() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    const token = localStorage.getItem('pd_access_token')
    fetch(`${API_BASE_URL}/admin/portfolio`, { headers: { ...(token && { Authorization: `Bearer ${token}` }) } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`)
        return r.json()
      })
      .then((d) => { setTotals(d.totals); setProjects(d.projects ?? []) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load portfolio'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading portfolio…</div>
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>

  const Stat = ({ label, mw, mwh, accent }: { label: string; mw: number; mwh: number; accent: string }) => (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{fmt(mw)} <span className="text-sm font-medium text-slate-400">MW</span></p>
      <p className="text-xs text-slate-500 mt-0.5">{fmt(mwh)} MWh/yr</p>
    </div>
  )

  return (
    <div className="max-w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">PowerDime Portfolio</h1>
        <p className="text-sm text-slate-500">Generation pool across all companies — total, contracted, and available to contract.</p>
      </div>

      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Total" mw={totals.total_capacity_mw} mwh={totals.total_energy_mwh} accent="text-slate-900" />
          <Stat label="Contracted" mw={totals.contracted_capacity_mw} mwh={totals.contracted_energy_mwh} accent="text-indigo-600" />
          <Stat label="Available to contract" mw={totals.available_capacity_mw} mwh={totals.available_energy_mwh} accent="text-teal-600" />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Projects</h2>
          <p className="text-xs text-slate-500 mt-0.5">Click a project to see contracted volume by company.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">Project</th>
                <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider">Type</th>
                <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider">Visibility</th>
                <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider">Total MW</th>
                <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider">Contracted MW</th>
                <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider">Available MW</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={6} className="py-4 px-4 text-slate-400 italic">No projects.</td></tr>
              )}
              {projects.map((p) => (
                <>
                  <tr
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      {p.by_company.length > 0 && <span className="text-slate-400 mr-1">{expanded.has(p.id) ? '▾' : '▸'}</span>}
                      {p.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{p.generation_type}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.visibility === 'marketplace' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
                        {p.visibility}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{fmt(p.total_capacity_mw)}</td>
                    <td className="py-2.5 px-3 text-right text-indigo-600">{fmt(p.contracted_capacity_mw)}</td>
                    <td className="py-2.5 px-3 text-right text-teal-600">{fmt(p.available_capacity_mw)}</td>
                  </tr>
                  {expanded.has(p.id) && p.by_company.map((c) => (
                    <tr key={`${p.id}-${c.company}`} className="bg-slate-50/60 border-b border-slate-100">
                      <td className="py-1.5 px-4 pl-10 text-slate-600" colSpan={3}>{c.company}</td>
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 text-right text-indigo-600">{fmt(c.capacity_mw)} MW</td>
                      <td className="py-1.5 px-3 text-right text-slate-400">{fmt(c.energy_mwh)} MWh</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
