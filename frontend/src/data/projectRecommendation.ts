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
    const score = distComp * 3 + priceComp + sizeComp * 0.5

    ranked.push({ project: p, summary, distanceMiles, score })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return Number(b.project.capacity_mw || 0) - Number(a.project.capacity_mw || 0)
  })
  return ranked
}
