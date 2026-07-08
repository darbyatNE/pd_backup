// Left-edge jump nav for the Plan tab. Collapsed to a thin handle at the left
// edge; hovering it slides out a panel of links that scroll to each section.
// Sits just below the persistent scope header (which is sticky at ~104px).

const SECTIONS = [
  { id: 'plan-chart', label: 'Chart' },
  { id: 'plan-portfolio', label: 'Portfolio' },
  { id: 'plan-recommended', label: 'Recommended' },
  { id: 'plan-overview', label: 'Overview' },
]

export function PlanSectionNav() {
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="group fixed left-0 top-[116px] z-40 hidden lg:flex items-start">
      {/* Slide-out panel — width animates from 0 on hover of the whole group. */}
      <nav className="w-0 overflow-hidden rounded-r-xl border border-l-0 border-slate-200 bg-white/95 shadow-lg backdrop-blur transition-[width] duration-200 group-hover:w-44">
        <div className="w-44 py-2">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Jump to</p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className="block w-full px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 transition-colors hover:bg-teal-50 hover:text-teal-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>
      {/* Always-visible handle at the very edge — the hover target. */}
      <div className="mt-1 flex h-24 w-5 cursor-pointer items-center justify-center rounded-r-lg border border-l-0 border-slate-200 bg-white text-slate-400 shadow-sm transition-colors group-hover:text-teal-600">
        <span aria-hidden className="text-sm leading-none">›</span>
      </div>
    </div>
  )
}
