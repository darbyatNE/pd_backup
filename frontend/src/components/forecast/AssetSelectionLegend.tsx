import {
  LOAD_COLORS,
  COMMITMENT_LEVELS,
  COMMITMENT_LABELS,
  getGenerationTypeOrder,
  genTypePatternId,
} from '../../data/linkedContracts'
import type { LinkedContract, CommitmentLevel } from '../../data/linkedContracts'
import { GenTypePatternDefs } from './GenPatternDefs'

// Map icon markup for generation types (shared by the legend and the 2D tooltip).
export function getMapIconSvg(generationType: string): string {
  switch (generationType) {
    case 'Wind':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="1.5" fill="#0ea5e9"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(45)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(135)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(225)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(315)"/></g></svg>`;
    case 'Hydro':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-8,4 L-3,4 L-3,-2 L3,-2 L3,4 L8,4 L8,8 L-8,8 Z" fill="#06b6d4"/><path d="M-6,10 Q-3,12 0,10 Q3,12 6,10" fill="none" stroke="#06b6d4" stroke-width="1.5"/><path d="M-6,12 Q-3,14 0,12 Q3,14 6,12" fill="none" stroke="#06b6d4" stroke-width="1.5"/></g></svg>`;
    case 'Nuclear':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="2" fill="#8b5cf6"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(0)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(60)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(120)"/></g></svg>`;
    case 'Solar':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="4" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><line x1="0" y1="-8" x2="0" y2="-6"/><line x1="5.66" y1="-5.66" x2="4.24" y2="-4.24"/><line x1="8" y1="0" x2="6" y2="0"/><line x1="5.66" y1="5.66" x2="4.24" y2="4.24"/><line x1="0" y1="8" x2="0" y2="6"/><line x1="-5.66" y1="5.66" x2="-4.24" y2="4.24"/><line x1="-8" y1="0" x2="-6" y2="0"/><line x1="-5.66" y1="-5.66" x2="-4.24" y2="-4.24"/></g></g></svg>`;
    case 'Combined Cycle':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-2" y="-8" width="4" height="12" rx="1" fill="#64748b"/><rect x="-6" y="2" width="12" height="4" rx="1" fill="#64748b"/><path d="M-2,-8 L-6,2 M2,-8 L6,2 M-2,4 L-6,2 M2,4 L6,2" stroke="#64748b" stroke-width="1" fill="none"/></g></svg>`;
    case 'Battery':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-8" y="-4" width="16" height="8" rx="1" fill="#10b981"/><rect x="8" y="-2" width="2" height="4" fill="#10b981"/><rect x="-6" y="-2" width="3" height="4" fill="white"/><rect x="-1.5" y="-2" width="3" height="4" fill="white"/><rect x="3" y="-2" width="2" height="4" fill="white"/></g></svg>`;
    case 'Hybrid':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M0,-8 L3,-2 L8,-3 L2,2 L4,8 L-2,2 L-8,3 L-3,-2 Z" fill="#06b6d4"/><circle r="2" fill="white"/></g></svg>`;
    case 'Peaker':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-6,6 L0,-8 L6,6 Z" fill="#ef4444"/><rect x="-2" y="2" width="4" height="4" fill="#dc2626"/></g></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><circle cx="12" cy="12" r="8" fill="#64748b"/></svg>`;
  }
}

interface AssetSelectionLegendProps {
  contracts: LinkedContract[]
  selected: Set<string>
  onToggle: (projectName: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  year: number
  fullScopeYears?: number[]
}

/**
 * Selectable legend for the load-shape charts (2D + 3D). Lists BTM Assets,
 * Baseload Projects and Peaking Projects; each item is a checkbox that toggles
 * whether that asset is charted. Selection state is owned by the parent so it
 * stays in sync across the 2D/3D views.
 */
export function AssetSelectionLegend({
  contracts,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  year,
  fullScopeYears,
}: AssetSelectionLegendProps) {
  const baseContracts = contracts.filter((c) => c.tier === 'base')
  const peakContracts = contracts.filter((c) => c.tier === 'peak')
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const ContractLegendItem = ({ color, name, projectName, sites, mw, term, isInactive = false, title, generationType, commitment }: { color: string; name: string; projectName: string; sites: string; mw: number; term: string; isInactive?: boolean; title?: string; generationType?: string; commitment?: CommitmentLevel }) => {
    const checked = selected.has(projectName)
    return (
      <label className={`flex items-start gap-2 py-1 cursor-pointer select-none ${isInactive || !checked ? 'opacity-40' : ''}`} title={title}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(projectName)}
          className="mt-0.5 flex-shrink-0 accent-teal-600 cursor-pointer"
        />
        <svg width="16" height="16" className="flex-shrink-0 mt-0.5">
          {generationType ? (
            <>
              {/* Load color behind the pattern (matches the chart bar) so the
                  pattern reads at any commitment color, incl. white. */}
              <rect width="16" height="16" fill={color} stroke="#e2e8f0" strokeWidth="0.5" />
              <rect width="16" height="16" fill={`url(#${genTypePatternId(generationType, commitment)})`} />
            </>
          ) : (
            <rect width="16" height="16" fill={color} />
          )}
        </svg>
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1">
            {generationType && (
              <svg width="12" height="12" className="flex-shrink-0">
                <g dangerouslySetInnerHTML={{ __html: getMapIconSvg(generationType).replace('width="16" height="16"', 'width="12" height="12"') }} />
              </svg>
            )}
            <span
              className={`text-slate-700 font-medium ${!checked ? 'line-through' : ''}`}
              title={sites ? `Serving: ${sites}` : ''}
            >
              {name}
            </span>
          </div>
          <span className="text-slate-500 text-[10px]">{mw} MW · {term}</span>
        </div>
      </label>
    )
  }

  const LegendGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-col min-w-[140px] max-w-[180px]">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">{title}</h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  )

  const renderContract = (c: LinkedContract, color: string, tierLabel: string) => {
    const startLabel = `${monthShort[c.startMonth - 1]} '${String(c.startYear).slice(-2)}`
    const endLabel = `${monthShort[c.endMonth - 1]} '${String(c.endYear).slice(-2)}`
    const visibleYears = fullScopeYears ?? [year]
    const isAnyYearActive = visibleYears.some((y) => y >= c.startYear && y <= c.endYear)
    const match = c.projectName.match(/^(.*?)\s*\(([^)]+)\)$/)
    const baseName = match ? match[1] : c.projectName
    const sites = match ? match[2] : (c.perSiteMw?.map((s) => s.siteKey).join(', ') ?? '')
    return (
      <ContractLegendItem
        key={c.projectName}
        projectName={c.projectName}
        color={color}
        name={baseName}
        sites={sites}
        mw={c.mwCovered}
        term={`${startLabel}–${endLabel}`}
        isInactive={!isAnyYearActive}
        title={`${c.generationType} · ${COMMITMENT_LABELS[c.commitment ?? 'contracted']} · covers ${tierLabel} · term ${startLabel} – ${endLabel}${isAnyYearActive ? '' : ' · out of view'}`}
        generationType={c.generationType}
        commitment={c.commitment}
      />
    )
  }

  const sortByTypeThenMw = (a: LinkedContract, b: LinkedContract) => {
    const orderA = getGenerationTypeOrder(a.generationType)
    const orderB = getGenerationTypeOrder(b.generationType)
    if (orderA !== orderB) return orderA - orderB
    return b.mwCovered - a.mwCovered
  }

  return (
    <div className="flex-shrink-0 text-xs border-r border-slate-200 pr-4">
      <GenTypePatternDefs />
      {/* Select all / none — toggles every charted asset across the groups below */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Charted Assets</span>
        <div className="flex items-center gap-1.5 text-[10px] font-medium">
          <button type="button" onClick={onSelectAll} className="text-teal-600 hover:text-teal-700">All</button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={onDeselectAll} className="text-slate-500 hover:text-slate-700">None</button>
        </div>
      </div>
      <div className="flex gap-6">
        <LegendGroup title="BTM ASSETS">
          <div className="text-[11px] text-slate-400 italic py-1">None configured</div>
        </LegendGroup>

        {baseContracts.length > 0 && (
          <LegendGroup title="Baseload Projects">
            {baseContracts.sort(sortByTypeThenMw).map((c) => renderContract(c, LOAD_COLORS.base, 'baseload'))}
          </LegendGroup>
        )}

        {peakContracts.length > 0 && (
          <LegendGroup title="Peaking Projects">
            {peakContracts.sort(sortByTypeThenMw).map((c) => renderContract(c, LOAD_COLORS.peak, 'peak'))}
          </LegendGroup>
        )}
      </div>

      {/* Commitment-level key — same gen-type pattern, pattern color darkens as
          commitment firms up (light = exploring → near-black = contracted). */}
      <div className="mt-3 pt-2 border-t border-slate-200">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Commitment level</h4>
        <div className="flex flex-col gap-1">
          {COMMITMENT_LEVELS.map((level) => (
            <div key={level} className="flex items-center gap-2" title={`${COMMITMENT_LABELS[level]} — pattern shown in the Solar (dots) example`}>
              <svg width="16" height="16" className="flex-shrink-0">
                <rect width="16" height="16" fill={LOAD_COLORS.base} stroke="#e2e8f0" strokeWidth="0.5" />
                <rect width="16" height="16" fill={`url(#${genTypePatternId('Solar', level)})`} />
              </svg>
              <span className="text-slate-600 text-[11px]">{COMMITMENT_LABELS[level]}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 italic mt-1 max-w-[180px] leading-snug">
          Same pattern per generation type; only the pattern color changes with commitment.
        </p>
      </div>
    </div>
  )
}
