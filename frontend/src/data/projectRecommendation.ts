// Recommendation filtering + ranking for the dashboard "Examine Fit" table.
// Pure logic so it's easy to test and, later, to seed from onboarding answers
// (risk / price / location / segment preferences feed the same RecPreferences).
import type { GenerationType, Project } from '../types/index'
import type { ProjectProductSummary } from './projectProductsApi'
import { LOAD_PROFILE_MAP } from './loadProfile'
import { getZoneCoords } from '../utils/pjmZones'
import { haversineMiles } from '../utils/geo'
import { pnum } from './projectDisplay'

export const ALL_GEN_TYPES: GenerationType[] = [
  'Solar', 'Wind', 'Nuclear', 'Battery', 'Hydro', 'Hybrid', 'Combined Cycle', 'Peaker', 'Virtual',
]

// Default distance ceiling (miles) for the range slider.
export const DEFAULT_MAX_MILES = 150
// Upper bound of the distance slider; also the "Any distance" sentinel handling.
export const MAX_MILES_LIMIT = 1000

export type CoverageMode = 'overlap' | 'full'

export interface RecPreferences {
  isos: string[]                 // empty = any ISO
  onlyAvailable: boolean         // status === Available
  coverage: CoverageMode         // 'overlap' = term touches the window; 'full' = term spans it
  maxMiles: number | null        // null = any distance
  genTypes: GenerationType[]     // empty = none allowed; defaults to all
  requireCapacity: boolean
  requireEnergy: boolean
  requireRec: boolean
  maxEnergyPricePerMwh: number | null      // null = uncapped
  maxCapacityPricePerMwDay: number | null  // null = uncapped
  // Optional tuning from the qualitative "guided finder" (absent ⇒ legacy scoring):
  priority?: number                        // 0 = best price … 1 = best fit (proximity)
  minCapacityMw?: number | null            // floor on project size (null = none)
}

export interface ScopeWindow {
  startYear: number
  startMonth: number
  endYear: number
  endMonth: number
}

// PJM settlement-zone codes — every current data-center site lives in one of these.
const PJM_ZONES = new Set([
  'dom', 'pepco', 'bge', 'ppl', 'pseg', 'jcpl', 'aeco', 'dpl', 'meted', 'penelec',
  'comed', 'aep', 'aps', 'atsi', 'fe-atsi', 'deok', 'duq', 'day', 'ekpc', 'lge',
  'reco', 'ugi', 'peco',
])

/** Map a site's settlement zone / LDA code to its ISO. Defaults to PJM. */
export function settlementZoneToIso(zone: string | undefined | null): string {
  const z = (zone ?? '').toLowerCase().trim()
  if (PJM_ZONES.has(z)) return 'PJM'
  return 'PJM'
}

/** Distinct ISOs covering the selected sites (used as the default ISO filter). */
export function siteIsosInScope(selectedSites: string[]): string[] {
  const set = new Set<string>()
  for (const key of selectedSites) {
    const p = LOAD_PROFILE_MAP[key]
    if (p) set.add(settlementZoneToIso(p.lda ?? p.settlementZone))
  }
  return Array.from(set)
}

/** [lng, lat] for each selected site that resolves to known coords. */
export function siteCoordsInScope(selectedSites: string[]): [number, number][] {
  const out: [number, number][] = []
  for (const key of selectedSites) {
    const p = LOAD_PROFILE_MAP[key]
    if (!p) continue
    const c = getZoneCoords(p.location) ?? getZoneCoords(p.settlementZone)
    if (c) out.push(c)
  }
  return out
}

/** Preference defaults derived from the in-scope ISOs. */
export function defaultPreferences(scopeIsos: string[]): RecPreferences {
  return {
    isos: scopeIsos,
    onlyAvailable: true,
    coverage: 'overlap',
    maxMiles: DEFAULT_MAX_MILES,
    genTypes: [...ALL_GEN_TYPES],
    requireCapacity: false,
    requireEnergy: false,
    requireRec: false,
    maxEnergyPricePerMwh: null,
    maxCapacityPricePerMwDay: null,
  }
}

// YYYY-MM(-DD) → comparable year*12+month (1-based month). null if unparseable.
function monthIndexFromIso(s?: string | null): number | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})/.exec(s)
  if (!m) return null
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}

const monthIndex = (year: number, month: number): number => year * 12 + (month - 1)

/** True when the project's delivery term fully spans the in-scope window. */
export function termFullyCovers(p: Project, scope: ScopeWindow): boolean {
  const start = monthIndexFromIso(p.term_start_date)
  const end = monthIndexFromIso(p.term_end_date)
  if (start == null || end == null) return false
  return start <= monthIndex(scope.startYear, scope.startMonth) &&
    end >= monthIndex(scope.endYear, scope.endMonth)
}

/** True when the project's delivery term overlaps any part of the in-scope
 *  window. Missing term dates are treated leniently (no term info → don't hide). */
export function termOverlaps(p: Project, scope: ScopeWindow): boolean {
  const start = monthIndexFromIso(p.term_start_date) ?? -Infinity
  const end = monthIndexFromIso(p.term_end_date) ?? Infinity
  if (start === -Infinity && end === Infinity) return true
  return start <= monthIndex(scope.endYear, scope.endMonth) &&
    end >= monthIndex(scope.startYear, scope.startMonth)
}

/** Min miles from any selected site to the project; null when coords are unknown. */
export function projectDistanceMiles(p: Project, siteCoords: [number, number][]): number | null {
  if (siteCoords.length === 0) return null
  // Prefer explicit coordinates; else fall back to the name-based lookup.
  const projCoords: [number, number] | null =
    p.latitude != null && p.longitude != null
      ? [Number(p.longitude), Number(p.latitude)]
      : getZoneCoords(p.location ?? '') ?? (p.zone ? getZoneCoords(p.zone) : null)
  if (!projCoords) return null
  let best = Infinity
  for (const c of siteCoords) best = Math.min(best, haversineMiles(c, projCoords))
  return best
}

function isProjectAvailable(p: Project): boolean {
  const cod = p.expected_cod ? new Date(p.expected_cod) : null
  return !cod || Number.isNaN(cod.getTime()) || cod <= new Date()
}

export interface RankedProject {
  project: Project
  summary?: ProjectProductSummary
  distanceMiles: number | null
  score: number
}

/**
 * Filter projects to those matching every active preference, then sort by fit
 * (closest first; unknown-distance projects pass but sort last; cheaper and
 * larger projects break ties).
 */
export function evaluateProjects(
  projects: Project[],
  productSummaries: Record<string, ProjectProductSummary>,
  prefs: RecPreferences,
  scope: ScopeWindow,
  selectedSites: string[],
): RankedProject[] {
  const siteCoords = siteCoordsInScope(selectedSites)
  const ranked: RankedProject[] = []

  for (const p of projects) {
    const summary = productSummaries[p.id]

    // ISO
    if (prefs.isos.length > 0 && !prefs.isos.includes(p.iso ?? '')) continue
    // Availability
    if (prefs.onlyAvailable && !isProjectAvailable(p)) continue
    // Service-period coverage
    if (prefs.coverage === 'full' && !termFullyCovers(p, scope)) continue
    if (prefs.coverage === 'overlap' && !termOverlaps(p, scope)) continue
    // Gen-type preference
    if (!prefs.genTypes.includes(p.generation_type)) continue
    // Required components
    if (prefs.requireCapacity && !summary?.has_capacity) continue
    if (prefs.requireEnergy && !summary?.has_energy) continue
    if (prefs.requireRec && !summary?.has_rec) continue
    // Price ceilings
    const energyPrice = pnum(summary?.energy_price_per_mwh ?? null)
    if (prefs.maxEnergyPricePerMwh != null && summary?.has_energy &&
      energyPrice != null && energyPrice > prefs.maxEnergyPricePerMwh) continue
    const capPrice = pnum(summary?.capacity_price_per_mw_day ?? p.capacity_price_per_mw_day ?? null)
    if (prefs.maxCapacityPricePerMwDay != null &&
      capPrice != null && capPrice > prefs.maxCapacityPricePerMwDay) continue

    // Minimum deal size (from the qualitative "deal size" dial).
    if (prefs.minCapacityMw != null && Number(p.capacity_mw || 0) < prefs.minCapacityMw) continue

    // Distance — unknown coords PASS the range filter (don't silently hide
    // SPP/WECC projects whose zones have no coords) but sort last.
    const distanceMiles = projectDistanceMiles(p, siteCoords)
    if (prefs.maxMiles != null && distanceMiles != null && distanceMiles > prefs.maxMiles) continue

    // Composite fit score (higher = better). Distance dominates; price headroom
    // and capacity size break ties.
    const ceiling = prefs.maxMiles ?? MAX_MILES_LIMIT
    const distComp = distanceMiles == null
      ? 0.35 // neutral: ranks below near projects, above far ones
      : Math.max(0, 1 - distanceMiles / ceiling)
    let priceComp = 0.5
    if (prefs.maxEnergyPricePerMwh != null && energyPrice != null) {
      priceComp = Math.max(0, 1 - energyPrice / prefs.maxEnergyPricePerMwh)
    }
    const sizeComp = Math.min(1, Number(p.capacity_mw || 0) / 500)
    // When the guided finder sets a price↔fit priority, weight distance vs price
    // accordingly; otherwise fall back to the legacy fixed weighting.
    const score = prefs.priority == null
      ? distComp * 3 + priceComp + sizeComp * 0.5
      : distComp * (1 + prefs.priority * 3) + priceComp * (1 + (1 - prefs.priority) * 3) + sizeComp * 0.5

    ranked.push({ project: p, summary, distanceMiles, score })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return Number(b.project.capacity_mw || 0) - Number(a.project.capacity_mw || 0)
  })
  return ranked
}

// ─── Qualitative "guided finder" dials ───────────────────────────────────────
// Customers describe preferences in plain terms; the AI (or the sliders) set
// these 0–100 dials, which map to the quantitative RecPreferences the engine
// above consumes. This keeps the filter/scoring logic unchanged.

export interface QualitativeDials {
  locality: number        // 0 = anywhere → 100 = must be right next door
  priceAppetite: number   // 0 = bargain only → 100 = premium OK
  termCommitment: number  // 0 = any overlap → 100 = must cover whole window
  dealSize: number        // 0 = small & flexible → 100 = large anchor deal
  cleanEnergy: number     // 0 = cost-first (any source) → 100 = green-first
  readiness: number       // 0 = ready now only → 100 = future builds OK
  priority: number        // 0 = best price → 100 = best fit (proximity/quality)
  needEnergy: number      // 0 = don't care → 100 = must-have
  needCapacity: number
  needRec: number
}

export const DEFAULT_DIALS: QualitativeDials = {
  locality: 50,        // ≈ 150 mi
  priceAppetite: 100,  // any price
  termCommitment: 25,  // overlaps
  dealSize: 20,        // no size floor
  cleanEnergy: 20,     // all sources
  readiness: 20,       // available now
  priority: 60,        // fit-leaning (matches legacy distance-dominant scoring)
  needEnergy: 20,
  needCapacity: 20,
  needRec: 20,
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
// Geometric interpolation from `lo` to `hi` across a 0–100 dial (feels linear to
// the eye for quantities like miles and $ that span an order of magnitude).
const geo = (dial: number, lo: number, hi: number) => Math.round(lo * Math.pow(hi / lo, clamp(dial, 0, 100) / 100))
const invGeo = (value: number, lo: number, hi: number) => Math.round(100 * Math.log(value / lo) / Math.log(hi / lo))

const GREEN: GenerationType[] = ['Solar', 'Wind', 'Hydro']
const LOW_CARBON: GenerationType[] = ['Solar', 'Wind', 'Hydro', 'Nuclear', 'Hybrid', 'Battery', 'Virtual']

/** Map the qualitative dials to the engine's RecPreferences. */
export function qualitativeToPreferences(d: QualitativeDials, scopeIsos: string[]): RecPreferences {
  const genTypes =
    d.cleanEnergy >= 67 ? [...GREEN]
    : d.cleanEnergy >= 34 ? [...LOW_CARBON]
    : [...ALL_GEN_TYPES]
  return {
    isos: scopeIsos,
    onlyAvailable: d.readiness < 50,
    coverage: d.termCommitment > 50 ? 'full' : 'overlap',
    // High locality ⇒ tight radius; 0 ⇒ anywhere.
    maxMiles: d.locality <= 5 ? null : geo(100 - d.locality, 25, MAX_MILES_LIMIT),
    genTypes,
    requireCapacity: d.needCapacity >= 60,
    requireEnergy: d.needEnergy >= 60,
    requireRec: d.needRec >= 60,
    maxEnergyPricePerMwh: d.priceAppetite >= 95 ? null : geo(d.priceAppetite, 20, 120),
    maxCapacityPricePerMwDay: d.priceAppetite >= 95 ? null : geo(d.priceAppetite, 100, 1000),
    priority: clamp(d.priority, 0, 100) / 100,
    // Only the top of the dial imposes a size floor, so it never nukes results.
    minCapacityMw: d.dealSize >= 80 ? Math.round(((d.dealSize - 80) / 20) * 200) : null,
  }
}

/** Approximate inverse — seed the sliders from the current preferences. */
export function preferencesToQualitative(p: RecPreferences): QualitativeDials {
  const greenOnly = p.genTypes.length > 0 && p.genTypes.every((g) => GREEN.includes(g))
  const lowCarbon = !greenOnly && p.genTypes.length > 0 && p.genTypes.every((g) => LOW_CARBON.includes(g))
  return {
    locality: p.maxMiles == null ? 0 : clamp(100 - invGeo(p.maxMiles, 25, MAX_MILES_LIMIT), 0, 100),
    priceAppetite: p.maxEnergyPricePerMwh == null ? 100 : clamp(invGeo(p.maxEnergyPricePerMwh, 20, 120), 0, 100),
    termCommitment: p.coverage === 'full' ? 75 : 25,
    dealSize: p.minCapacityMw == null ? DEFAULT_DIALS.dealSize : clamp(80 + Math.round((p.minCapacityMw / 200) * 20), 0, 100),
    cleanEnergy: greenOnly ? 85 : lowCarbon ? 50 : 15,
    readiness: p.onlyAvailable ? 20 : 75,
    priority: p.priority == null ? DEFAULT_DIALS.priority : Math.round(p.priority * 100),
    needEnergy: p.requireEnergy ? 80 : 20,
    needCapacity: p.requireCapacity ? 80 : 20,
    needRec: p.requireRec ? 80 : 20,
  }
}
