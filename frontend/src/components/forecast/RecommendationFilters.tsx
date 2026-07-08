// Guided finder for the "Recommended for <Company>" table. A button expands an
// inline panel with an AI free-text box (plain-language → preferences) and an
// array of qualitative sliders. Both map to the same RecPreferences the engine
// consumes, so the table + map update live.
import { useState } from 'react'
import type { GenerationType } from '../../types/index'
import type { RecPreferences, ScopeWindow, QualitativeDials } from '../../data/projectRecommendation'
import {
  DEFAULT_DIALS,
  qualitativeToPreferences,
  preferencesToQualitative,
} from '../../data/projectRecommendation'
import { API_BASE_URL } from '../../services/api'

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

type DialKey = keyof QualitativeDials

// Each slider: label + the plain-language phrase for its current position.
const DIAL_META: Array<{ key: DialKey; label: string; readout: (v: number) => string }> = [
  { key: 'priority', label: 'What matters most', readout: (v) => (v < 35 ? 'Best price' : v < 65 ? 'Balanced' : 'Best fit') },
  { key: 'locality', label: 'Locational fit', readout: (v) => (v < 30 ? 'Anywhere' : v < 70 ? 'Same ISO/market' : 'Same pricing/capacity zone') },
  { key: 'priceAppetite', label: 'Price appetite', readout: (v) => (v < 20 ? 'Bargain only' : v < 45 ? 'Cost-conscious' : v < 70 ? 'Balanced' : v < 95 ? 'Flexible' : 'Any price') },
  { key: 'cleanEnergy', label: 'Clean energy', readout: (v) => (v < 34 ? 'Any source' : v < 67 ? 'Low-carbon' : 'Green only') },
  { key: 'termCommitment', label: 'Term coverage', readout: (v) => (v <= 50 ? 'Any overlap' : 'Full term') },
  { key: 'dealSize', label: 'Deal size', readout: (v) => (v < 20 ? 'Any size' : v < 50 ? 'Small–mid' : v < 80 ? 'Larger' : 'Anchor deals') },
  { key: 'readiness', label: 'Readiness', readout: (v) => (v < 50 ? 'Available now' : 'Future builds OK') },
]

const NEED_META: Array<{ key: DialKey; label: string }> = [
  { key: 'needEnergy', label: 'Energy' },
  { key: 'needCapacity', label: 'Capacity' },
  { key: 'needRec', label: 'RECs' },
]

export default function RecommendationFilters({
  prefs, onChange, availableIsos, availableGenTypes,
  matchedCount, totalCount, companyName, onReset,
}: Props) {
  const [open, setOpen] = useState(false)
  const [dials, setDials] = useState<QualitativeDials>(() => preferencesToQualitative(prefs))
  const [aiText, setAiText] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Explicit generation-type selection. Empty ⇒ fall back to the Clean-energy
  // dial's bucket. When set, it pins the exact types (overriding the bucket).
  const [genSel, setGenSel] = useState<GenerationType[]>([])

  const isos = availableIsos.length ? availableIsos : prefs.isos
  // Push the current dials + gen-type selection to the engine as one prefs object.
  const push = (nextDials: QualitativeDials, nextGen: GenerationType[]) => {
    setDials(nextDials)
    setGenSel(nextGen)
    onChange(qualitativeToPreferences(nextDials, isos, nextGen))
  }
  const setDial = (key: DialKey, value: number) => push({ ...dials, [key]: value }, genSel)
  const toggleGen = (g: GenerationType) =>
    push(dials, genSel.includes(g) ? genSel.filter((x) => x !== g) : [...genSel, g])

  const interpret = async () => {
    const text = aiText.trim()
    if (!text) return
    setLoading(true); setAiError(null); setNote(null)
    try {
      const token = localStorage.getItem('pd_access_token')
      const res = await fetch(`${API_BASE_URL}/planning/recommend-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ text, facets: { isos: availableIsos, genTypes: availableGenTypes } }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not interpret')
      const { dials: aiDials, note: aiNote, generationTypes } = (await res.json()) as {
        dials: Partial<QualitativeDials>; note?: string; generationTypes?: string[]
      }
      const aiGen = (generationTypes ?? []).filter((g): g is GenerationType =>
        (availableGenTypes as string[]).includes(g))
      push({ ...DEFAULT_DIALS, ...dials, ...aiDials }, aiGen)
      setNote(aiNote || null)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Could not interpret — adjust the sliders below instead.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    onReset()
    setDials(DEFAULT_DIALS)
    setGenSel([])
    setNote(null); setAiError(null); setAiText('')
  }

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Recommended for {companyName}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {matchedCount} of {totalCount} project{totalCount !== 1 ? 's' : ''} match your preferences ·
            try one on against your in-scope load, then save it as a contract
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 whitespace-nowrap"
          >
            ✨ Guided finder
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-2.5 py-1 text-[11px] font-semibold text-teal-700 border border-teal-200 rounded hover:bg-teal-50 whitespace-nowrap"
          >
            Reset to scope
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {/* AI intent box */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
            <label className="block text-[11px] font-semibold text-indigo-700 mb-1.5">
              Describe what you're looking for
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') interpret() }}
                placeholder="e.g. affordable solar close to my sites that covers my whole term"
                className="flex-1 border border-indigo-200 rounded px-2.5 py-1.5 text-xs text-slate-700 bg-white outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                type="button"
                onClick={interpret}
                disabled={loading || !aiText.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loading ? 'Interpreting…' : 'Interpret'}
              </button>
            </div>
            {note && <p className="text-[11px] text-indigo-700 mt-1.5">Interpreted as: {note}</p>}
            {aiError && <p className="text-[11px] text-amber-700 mt-1.5">{aiError}</p>}
          </div>

          {/* Generation type — explicit selection pins exact types (overrides the
              Clean-energy dial). Empty = follow Clean energy. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Generation type</span>
              {genSel.length > 0 && (
                <button type="button" onClick={() => push(dials, [])} className="text-[10px] font-medium text-teal-600 hover:text-teal-700">
                  Clear (use Clean energy)
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableGenTypes.map((g) => {
                const active = genSel.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGen(g)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                      active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
            {genSel.length === 0 && (
              <p className="text-[10px] text-slate-400 italic mt-1">No specific type selected — following the Clean-energy dial.</p>
            )}
          </div>

          {/* Qualitative sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {DIAL_META.map(({ key, label, readout }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                  <span className="text-[11px] font-medium text-slate-700">{readout(dials[key])}</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5} value={dials[key]}
                  onChange={(e) => setDial(key, Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            ))}
          </div>

          {/* Product needs */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Product needs</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2">
              {NEED_META.map(({ key, label }) => (
                <div key={key}>
                  <div className="text-[11px] font-medium text-slate-600 text-center mb-1">{label}</div>
                  <input
                    type="range" min={0} max={100} step={5} value={dials[key]}
                    onChange={(e) => setDial(key, Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>Exclude</span>
                    <span>Indifferent</span>
                    <span>Requirement</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
