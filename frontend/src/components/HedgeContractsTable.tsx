import type { LinkedContract } from '../data/linkedContracts'

const GEN_COLORS: Record<string, string> = {
  Solar: '#f59e0b',
  Wind: '#0ea5e9',
  Nuclear: '#8b5cf6',
  Battery: '#10b981',
  Hybrid: '#06b6d4',
  'Combined Cycle': '#64748b',
  Peaker: '#ef4444',
  Hydro: '#06b6d4',
  Virtual: '#db2777',
}

const TIER_STYLES: Record<string, string> = {
  baseload: 'bg-teal-50 text-teal-700 border-teal-200',
  peak:     'bg-amber-50 text-amber-700 border-amber-200',
}

// Charted contract portfolio (positions linked to the company's sites), shown as
// the portfolio lens on the Contracts page.
export default function HedgeContractsTable({
  contracts,
  onExamineFit,
  emptyMessage = 'No contracts linked.',
}: {
  contracts: LinkedContract[]
  onExamineFit?: (contract: LinkedContract) => void
  emptyMessage?: string
}) {
  if (contracts.length === 0) {
    return <p className="text-sm text-slate-400 italic px-2">{emptyMessage}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider text-slate-500">Project</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Type</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Tier</th>
            <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">MW</th>
            <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">$/MWh</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Pricing LMP</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Shape</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Term Start</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Term End</th>
            {onExamineFit && (
              <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Action</th>
            )}
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="py-2.5 px-4 font-medium text-slate-800">{c.projectName}</td>
              <td className="py-2.5 px-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                  style={{
                    background: `${GEN_COLORS[c.generationType] ?? '#64748b'}18`,
                    color: GEN_COLORS[c.generationType] ?? '#64748b',
                    borderColor: `${GEN_COLORS[c.generationType] ?? '#64748b'}40`,
                  }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: GEN_COLORS[c.generationType] ?? '#64748b' }}
                  />
                  {c.generationType}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${TIER_STYLES[c.tier] ?? ''}`}>
                  {c.tier}
                </span>
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{c.mwCovered.toFixed(1)}</td>
              <td className="py-2.5 px-3 text-right text-slate-700">${c.pricePerMwh.toFixed(2)}</td>
              <td className={`py-2.5 px-3 whitespace-nowrap ${c.lmpNode ? 'text-slate-600' : 'text-slate-300'}`}>{c.lmpNode || '—'}</td>
              <td className="py-2.5 px-3 text-slate-500 capitalize">{c.shape}</td>
              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                {new Date(c.startYear, c.startMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </td>
              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                {new Date(c.endYear, c.endMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </td>
              {onExamineFit && (
                <td className="py-2.5 px-3">
                  {c.generationType === 'Battery' && (
                    <button
                      onClick={() => onExamineFit(c)}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold rounded transition-colors"
                    >
                      ▶ Examine Fit
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={9} className="px-4 py-2.5 border-t border-slate-100 text-[10px] text-slate-400 italic">
              {contracts.length} contract{contracts.length !== 1 ? 's' : ''} · {contracts.reduce((s, c) => s + c.mwCovered, 0).toFixed(1)} MW total contracted
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
