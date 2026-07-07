import { useState } from 'react'
import type { GenerationType } from '../../types'

export interface BtmOption {
  key: 'BESS' | 'NG'
  btmAssetType: 'BESS' | 'NG Peaker'
  generationType: GenerationType
  path: string
  description: string
  termNote: string
  costBand: string
  status: string
}

// Behind-the-meter capacity resources. These are NOT tied to a particular site
// — the same option is transactable against any in-scope site; the site is
// chosen per-engagement below. (The former Utility Queue / Competitive Supplier
// paths are retired — they are now entered directly as New Projects.)
export const BTM_CAPACITY_OPTIONS: BtmOption[] = [
  {
    key: 'BESS',
    btmAssetType: 'BESS',
    generationType: 'Battery',
    path: 'BTM BESS (4-hr)',
    description: 'Battery system sited at the load — clears capacity through PJM as a self-supply resource',
    termNote: '~15-yr asset life · capex amortized',
    costBand: '$1.2M–1.5M / MW capex · ~$30/kW-yr O&M',
    status: '3 installers in region',
  },
  {
    key: 'NG',
    btmAssetType: 'NG Peaker',
    generationType: 'Peaker',
    path: 'BTM Mini-NG (5–25 MW)',
    description: 'Behind-the-meter NG peaker — capacity self-supply + occasional energy dispatch',
    termNote: '~20-yr asset life',
    costBand: '$0.8M–1.1M / MW capex · 8–12 MMBtu/MWh heat rate',
    status: '2 installers in region',
  },
]

interface SiteChoice {
  siteKey: string
  name: string
}

/**
 * Global Behind-the-Meter capacity options. Each option can be examined against
 * any in-scope site: pick the site, then Examine Fit sizes the resource to that
 * site's capacity requirement and opens the Try-On so it can be added as a
 * capacity contract fulfilling that site's need.
 */
export function BtmCapacityOptions({
  sites,
  onEngage,
}: {
  sites: SiteChoice[]
  onEngage: (option: BtmOption, siteKey: string) => void
}) {
  const [picked, setPicked] = useState<Record<string, string>>({})
  const defaultSite = sites[0]?.siteKey ?? ''

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-indigo-500 text-base">⚙</span>
        <h3 className="text-base font-bold text-slate-900">Behind-the-Meter Capacity Options</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Self-supply resources transactable against any site. Pick a site and Examine Fit to size the
        resource to that site's capacity requirement and add it as a capacity contract.
      </p>

      {sites.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Select at least one site in the scope bar to engage a BTM option.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Option</th>
                <th className="text-left px-3 py-2 font-semibold">Term</th>
                <th className="text-left px-3 py-2 font-semibold">Cost band</th>
                <th className="text-left px-3 py-2 font-semibold">Availability</th>
                <th className="text-left px-3 py-2 font-semibold">Site</th>
                <th className="text-right px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BTM_CAPACITY_OPTIONS.map((opt) => {
                const siteKey = picked[opt.key] ?? defaultSite
                return (
                  <tr key={opt.key}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-slate-800">{opt.path}</p>
                      <p className="text-slate-500 text-[11px] leading-snug">{opt.description}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-700 whitespace-nowrap">{opt.termNote}</td>
                    <td className="px-3 py-3 align-top text-slate-700">{opt.costBand}</td>
                    <td className="px-3 py-3 align-top text-slate-500">{opt.status}</td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={siteKey}
                        onChange={(e) => setPicked((p) => ({ ...p, [opt.key]: e.target.value }))}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 max-w-[160px]"
                      >
                        {sites.map((s) => (
                          <option key={s.siteKey} value={s.siteKey}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <button
                        type="button"
                        onClick={() => onEngage(opt, siteKey)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                      >
                        ▶ Examine Fit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
