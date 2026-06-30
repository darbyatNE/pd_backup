// Preference header above the "Examine Fit" table. Dropdowns + sliders decide
// which projects are "Recommended for <Company>". Defaults come from the in-scope
// ISO / availability / service period; later, onboarding answers will preset them.
import type { ReactNode } from 'react'
import type { GenerationType } from '../../types/index'
import type { RecPreferences, ScopeWindow } from '../../data/projectRecommendation'
import { MAX_MILES_LIMIT } from '../../data/projectRecommendation'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const moYr = (y: number, m: number) => `${MONTHS[m - 1]} '${String(y).slice(2)}`

interface Props {
  prefs: RecPreferences
  onChange: (next: RecPreferences) => void
  scope: ScopeWindow
  availableIsos: string[]
  availableGenTypes: GenerationType[]
  matchedCount: number
  totalCount: number
  companyName: string
  onReset: () => void
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? 'bg-teal-600 border-teal-600 text-white'
          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
      />
      <span className="text-[11px] text-slate-600">{label}</span>
    </label>
  )
}

export default function RecommendationFilters({
  prefs, onChange, scope, availableIsos, availableGenTypes,
  matchedCount, totalCount, companyName, onReset,
}: Props) {
  const set = (patch: Partial<RecPreferences>) => onChange({ ...prefs, ...patch })

  const toggleIso = (iso: string) =>
    set({ isos: prefs.isos.includes(iso) ? prefs.isos.filter((i) => i !== iso) : [...prefs.isos, iso] })
  const toggleGen = (g: GenerationType) =>
    set({ genTypes: prefs.genTypes.includes(g) ? prefs.genTypes.filter((t) => t !== g) : [...prefs.genTypes, g] })

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Recommended for {companyName}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {matchedCount} of {totalCount} project{totalCount !== 1 ? 's' : ''} match your preferences ·
            try one on against your in-scope load, then save it as a contract
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="px-2.5 py-1 text-[11px] font-semibold text-teal-700 border border-teal-200 rounded hover:bg-teal-50 whitespace-nowrap"
        >
          Reset to scope
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
        {/* ISO */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">ISO</div>
          <div className="flex flex-wrap gap-1.5">
            {availableIsos.map((iso) => (
              <Chip key={iso} active={prefs.isos.includes(iso)} onClick={() => toggleIso(iso)}>{iso}</Chip>
            ))}
            {availableIsos.length === 0 && <span className="text-[11px] text-slate-400 italic">No ISOs</span>}
          </div>
        </div>

        {/* Generation type */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Generation type</div>
          <div className="flex flex-wrap gap-1.5">
            {availableGenTypes.map((g) => (
              <Chip key={g} active={prefs.genTypes.includes(g)} onClick={() => toggleGen(g)}>{g}</Chip>
            ))}
          </div>
        </div>

        {/* Distance */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Max distance</span>
            <span className="text-[11px] font-medium text-slate-700">
              {prefs.maxMiles == null ? 'Any' : `${prefs.maxMiles} mi`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={25}
              max={MAX_MILES_LIMIT}
              step={25}
              value={prefs.maxMiles ?? MAX_MILES_LIMIT}
              onChange={(e) => set({ maxMiles: Number(e.target.value) })}
              className="flex-1 accent-teal-600"
            />
            <Toggle
              checked={prefs.maxMiles == null}
              onChange={(v) => set({ maxMiles: v ? null : MAX_MILES_LIMIT })}
              label="Any"
            />
          </div>
        </div>

        {/* Availability + service period */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Availability &amp; term</div>
          <Toggle checked={prefs.onlyAvailable} onChange={(v) => set({ onlyAvailable: v })} label="Currently available only" />
          <Toggle
            checked={prefs.coverage === 'full'}
            onChange={(v) => set({ coverage: v ? 'full' : 'overlap' })}
            label={`Fully covers ${moYr(scope.startYear, scope.startMonth)} – ${moYr(scope.endYear, scope.endMonth)} (else overlaps)`}
          />
        </div>

        {/* Required components */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Must offer</div>
          <div className="flex flex-wrap gap-3">
            <Toggle checked={prefs.requireCapacity} onChange={(v) => set({ requireCapacity: v })} label="Capacity" />
            <Toggle checked={prefs.requireEnergy} onChange={(v) => set({ requireEnergy: v })} label="Energy" />
            <Toggle checked={prefs.requireRec} onChange={(v) => set({ requireRec: v })} label="RECs" />
          </div>
        </div>

        {/* Price ceilings */}
        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Energy ≤</span>
              <span className="text-[11px] font-medium text-slate-700">
                {prefs.maxEnergyPricePerMwh == null ? 'Any' : `$${prefs.maxEnergyPricePerMwh}/MWh`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={120}
                step={5}
                value={prefs.maxEnergyPricePerMwh ?? 120}
                onChange={(e) => set({ maxEnergyPricePerMwh: Number(e.target.value) })}
                className="flex-1 accent-amber-600"
              />
              <Toggle
                checked={prefs.maxEnergyPricePerMwh == null}
                onChange={(v) => set({ maxEnergyPricePerMwh: v ? null : 120 })}
                label="Any"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Capacity ≤</span>
              <span className="text-[11px] font-medium text-slate-700">
                {prefs.maxCapacityPricePerMwDay == null ? 'Any' : `$${prefs.maxCapacityPricePerMwDay}/MW-day`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={50}
                max={1000}
                step={25}
                value={prefs.maxCapacityPricePerMwDay ?? 1000}
                onChange={(e) => set({ maxCapacityPricePerMwDay: Number(e.target.value) })}
                className="flex-1 accent-teal-600"
              />
              <Toggle
                checked={prefs.maxCapacityPricePerMwDay == null}
                onChange={(v) => set({ maxCapacityPricePerMwDay: v ? null : 1000 })}
                label="Any"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
