import type { LinkedContract, CommitmentLevel } from '../../data/linkedContracts'
import { COMMITMENT_LABELS } from '../../data/linkedContracts'

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

const COMMITMENT_STYLES: Record<CommitmentLevel, string> = {
  exploring:  'bg-slate-50 text-slate-600 border-slate-200',
  pending:    'bg-amber-50 text-amber-700 border-amber-200',
  contracted: 'bg-teal-50 text-teal-700 border-teal-200',
}

// Strip the "· Capacity" / "· Energy" band suffix — the component is implied by
// which tab's portfolio the row is shown in.
function displayName(projectName: string): string {
  return projectName.replace(/\s*·\s*(Capacity|Energy)\s*$/, '')
}

function GenTypeBadge({ gen }: { gen: string }) {
  const color = GEN_COLORS[gen] ?? '#64748b'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ background: `${color}18`, color, borderColor: `${color}40` }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {gen}
    </span>
  )
}

function CommitmentBadge({ commitment }: { commitment?: CommitmentLevel }) {
  const c = commitment ?? 'contracted'
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${COMMITMENT_STYLES[c]}`}>
      {COMMITMENT_LABELS[c]}
    </span>
  )
}

function termLabel(y: number, m: number): string {
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * Standardized contract-portfolio summary, rendered with columns custom to the
 * contract component being shown:
 *  - `component="energy"`  → energy delivery view ($/MWh, shape, pricing point)
 *  - `component="capacity"`→ capacity view ($/MW-day, LDA)
 * Rows are the scope-filtered LinkedContract bands already split by component in
 * the Plan tab, so an energy portfolio lists energy bands and a capacity
 * portfolio lists capacity bands.
 */
export default function ContractPortfolioTable({
  contracts,
  component,
  emptyMessage,
}: {
  contracts: LinkedContract[]
  component: 'energy' | 'capacity'
  emptyMessage?: string
}) {
  const fallbackEmpty =
    component === 'capacity'
      ? 'No capacity contracts linked to in-scope sites.'
      : 'No energy contracts linked to in-scope sites.'
  if (contracts.length === 0) {
    return <p className="text-sm text-slate-400 italic px-2 py-3">{emptyMessage ?? fallbackEmpty}</p>
  }

  const totalMw = contracts.reduce((s, c) => s + c.mwCovered, 0)
  const th = 'py-3 px-3 font-semibold uppercase tracking-wider text-slate-500'
  const capComp = (c: LinkedContract) => c.components?.find((x) => x.type === 'capacity')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className={`text-left ${th} pl-4`}>Project</th>
            <th className={`text-left ${th}`}>Type</th>
            <th className={`text-right ${th}`}>MW</th>
            {component === 'energy' ? (
              <>
                <th className={`text-right ${th}`}>$/MWh</th>
                <th className={`text-left ${th}`}>Shape</th>
                <th className={`text-left ${th}`}>Pricing Pt</th>
              </>
            ) : (
              <>
                <th className={`text-right ${th}`}>$/MW-day</th>
                <th className={`text-left ${th}`}>LDA</th>
              </>
            )}
            <th className={`text-left ${th}`}>Term Start</th>
            <th className={`text-left ${th}`}>Term End</th>
            <th className={`text-left ${th}`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => {
            const sites = c.perSiteMw?.map((s) => s.siteKey).join(', ') ?? ''
            const cap = capComp(c)
            const mwDay = cap?.pricePerMwDay
            const lda = cap?.lda ?? c.lda
            return (
              <tr key={`${c.projectName}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="py-2.5 px-3 pl-4">
                  <div className="font-medium text-slate-800">{displayName(c.projectName)}</div>
                  {sites && <div className="text-[10px] text-slate-400">{sites}</div>}
                </td>
                <td className="py-2.5 px-3"><GenTypeBadge gen={c.generationType} /></td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{c.mwCovered.toFixed(1)}</td>
                {component === 'energy' ? (
                  <>
                    <td className="py-2.5 px-3 text-right text-slate-700">${c.pricePerMwh.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-slate-500 capitalize">{c.shape}</td>
                    <td className={`py-2.5 px-3 whitespace-nowrap ${c.lmpNode ? 'text-slate-600' : 'text-slate-300'}`}>{c.lmpNode || '—'}</td>
                  </>
                ) : (
                  <>
                    <td className={`py-2.5 px-3 text-right ${mwDay ? 'text-slate-700' : 'text-slate-300'}`}>{mwDay ? `$${mwDay.toFixed(2)}` : '—'}</td>
                    <td className={`py-2.5 px-3 whitespace-nowrap ${lda ? 'text-slate-600' : 'text-slate-300'}`}>{lda || '—'}</td>
                  </>
                )}
                <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{termLabel(c.startYear, c.startMonth)}</td>
                <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{termLabel(c.endYear, c.endMonth)}</td>
                <td className="py-2.5 px-3"><CommitmentBadge commitment={c.commitment} /></td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={component === 'energy' ? 9 : 8} className="px-4 py-2.5 border-t border-slate-100 text-[10px] text-slate-400 italic">
              {contracts.length} contract{contracts.length !== 1 ? 's' : ''} · {totalMw.toFixed(1)} MW total
              {component === 'capacity' ? ' capacity' : ' (avg MW)'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
