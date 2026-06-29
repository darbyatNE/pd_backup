import { useEffect, useState } from 'react'
import {
  RETIRING_AGENCIES,
  MATCHING_FORMATS,
  MATCHING_FORMAT_LABELS,
  fetchProductSet,
  saveProductSet,
  type ProductSet,
  type RetiringAgency,
  type MatchingFormat,
} from '../data/projectProductsApi'

interface Props {
  isoId: string
  projectName: string
  onClose: () => void
  onSaved?: () => void
}

const EMPTY: ProductSet = { capacity: null, energy: null, rec: null }

export default function ProjectProductsEditor({ isoId, projectName, onClose, onSaved }: Props) {
  const [set, setSet] = useState<ProductSet>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchProductSet(isoId).then((s) => { if (alive) { setSet(s); setLoading(false) } })
    return () => { alive = false }
  }, [isoId])

  const toggle = (key: keyof ProductSet, on: boolean) => {
    setSet((prev) => ({
      ...prev,
      [key]: on
        ? key === 'capacity'
          ? { capacity_mw: '', eda: '', price_per_mw_day: '' }
          : key === 'energy'
          ? { energy_mwh_min: '', energy_mwh_max: '', zone: '', price_per_mwh: '' }
          : { rec_pct: '', retiring_agency: '', matching_format: '', price_per_mwh: '' }
        : null,
    }))
  }

  const save = async () => {
    // Client-side guard mirroring the server's required fields.
    if (set.capacity && (set.capacity.capacity_mw === '' || !set.capacity.eda)) {
      setMsg('Capacity needs a MW value and an EDA.'); return
    }
    if (set.energy && !set.energy.zone) { setMsg('Energy needs a zone.'); return }
    if (set.rec && (!set.rec.retiring_agency || !set.rec.matching_format)) {
      setMsg('RECs need a retiring agency and a matching format.'); return
    }
    setSaving(true); setMsg(null)
    const ok = await saveProductSet(isoId, set)
    setSaving(false)
    if (ok) { onSaved?.(); onClose() }
    else setMsg('Save failed.')
  }

  const inputCls = 'w-full text-sm border border-slate-300 rounded-md px-2 py-1'
  const Section = ({ title, on, onToggle, children }: { title: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) => (
    <div className={`rounded-lg border p-3 ${on ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50'}`}>
      <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-teal-600" />
        <span className="text-sm font-semibold text-slate-900">{title}</span>
      </label>
      {on && <div className="space-y-2 pl-6">{children}</div>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-20">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[calc(100vh-120px)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Project products — {projectName}</h2>
            <p className="text-xs text-slate-500">Unbundled: track Capacity, Energy and RECs independently.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              {/* Capacity */}
              <Section title="Capacity (MW)" on={!!set.capacity} onToggle={(v) => toggle('capacity', v)}>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-slate-600">
                    Capacity (MW)
                    <input type="number" min={0} className={inputCls} value={set.capacity?.capacity_mw ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, capacity: { ...p.capacity!, capacity_mw: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    EDA
                    <input type="text" className={inputCls} placeholder="e.g. Penelec" value={set.capacity?.eda ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, capacity: { ...p.capacity!, eda: e.target.value } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Price ($/MW-day)
                    <input type="number" min={0} step="0.01" className={inputCls} placeholder="e.g. 410" value={set.capacity?.price_per_mw_day ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, capacity: { ...p.capacity!, price_per_mw_day: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                </div>
              </Section>

              {/* Energy */}
              <Section title="Energy (MWh)" on={!!set.energy} onToggle={(v) => toggle('energy', v)}>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-600">
                    Min MWh
                    <input type="number" className={inputCls} value={set.energy?.energy_mwh_min ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, energy: { ...p.energy!, energy_mwh_min: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Max MWh
                    <input type="number" className={inputCls} value={set.energy?.energy_mwh_max ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, energy: { ...p.energy!, energy_mwh_max: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Zone
                    <input type="text" className={inputCls} placeholder="e.g. Penelec" value={set.energy?.zone ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, energy: { ...p.energy!, zone: e.target.value } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Price ($/MWh)
                    <input type="number" min={0} step="0.01" className={inputCls} placeholder="e.g. 45" value={set.energy?.price_per_mwh ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, energy: { ...p.energy!, price_per_mwh: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                </div>
              </Section>

              {/* RECs */}
              <Section title="RECs" on={!!set.rec} onToggle={(v) => toggle('rec', v)}>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-600">
                    Matched %
                    <input type="number" min={0} max={100} className={inputCls} value={set.rec?.rec_pct ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, rec: { ...p.rec!, rec_pct: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Price ($/MWh)
                    <input type="number" min={0} step="0.01" className={inputCls} placeholder="e.g. 5" value={set.rec?.price_per_mwh ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, rec: { ...p.rec!, price_per_mwh: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Retiring agency
                    <select className={inputCls} value={set.rec?.retiring_agency ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, rec: { ...p.rec!, retiring_agency: e.target.value as RetiringAgency } }))}>
                      <option value="">Select…</option>
                      {RETIRING_AGENCIES.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Matching
                    <select className={inputCls} value={set.rec?.matching_format ?? ''}
                      onChange={(e) => setSet((p) => ({ ...p, rec: { ...p.rec!, matching_format: e.target.value as MatchingFormat } }))}>
                      <option value="">Select…</option>
                      {MATCHING_FORMATS.map((f) => <option key={f} value={f}>{MATCHING_FORMAT_LABELS[f]}</option>)}
                    </select>
                  </label>
                </div>
              </Section>

              {msg && <p className="text-xs font-medium text-rose-600">{msg}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving || loading} className="px-3 py-1.5 text-sm font-semibold rounded-md bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white">
            {saving ? 'Saving…' : 'Save products'}
          </button>
        </div>
      </div>
    </div>
  )
}
