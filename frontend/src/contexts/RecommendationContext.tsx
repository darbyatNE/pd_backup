import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react'
import { API_BASE_URL } from '../services/api'
import { useAuth } from './AuthContext'
import { useScopeContext } from './ScopeContext'
import { useProjectProductSummaries, type ProjectProductSummary } from '../data/projectProductsApi'
import {
  ALL_GEN_TYPES,
  defaultPreferences,
  evaluateProjects,
  siteIsosInScope,
  type RankedProject,
  type RecPreferences,
  type ScopeWindow,
} from '../data/projectRecommendation'
import type { GenerationType, Project } from '../types/index'

// Shared "Recommended for <Company>" preferences + computed recommendation set,
// so the Plan tab's header and the Map page stay in sync (slider edits on the
// Plan tab live-update the map's recommended markers/list).
interface RecommendationContextValue {
  prefs: RecPreferences
  setPrefs: (next: RecPreferences) => void
  reset: () => void
  recommended: RankedProject[]
  recommendedIds: Set<string>
  marketProjects: Project[]
  productSummaries: Record<string, ProjectProductSummary>
  availableIsos: string[]
  availableGenTypes: GenerationType[]
  companyName: string
  scopeWindow: ScopeWindow
  refetch: () => void
}

const RecommendationContext = createContext<RecommendationContextValue | null>(null)

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { selectedSites, startYear, startMonth, endYear, endMonth } = useScopeContext()
  const { byIso: productSummaries, refetch: refetchSummaries } = useProjectProductSummaries()

  // Published marketplace projects (same source the Plan tab "Examine Fit" used).
  const [marketProjects, setMarketProjects] = useState<Project[]>([])
  const fetchProjects = useCallback(() => {
    const token = localStorage.getItem('pd_access_token')
    fetch(`${API_BASE_URL}/projects`, { headers: { ...(token && { Authorization: `Bearer ${token}` }) } })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then(({ projects }) =>
        setMarketProjects(
          (projects ?? []).map((p: Record<string, unknown>) => ({
            ...p,
            capacity_mw: p.capacity_mw == null ? 0 : Number(p.capacity_mw),
          })) as Project[],
        ),
      )
      .catch(() => setMarketProjects([]))
  }, [])
  useEffect(() => { fetchProjects() }, [fetchProjects])

  const scopeIsos = useMemo(() => siteIsosInScope(selectedSites), [selectedSites])
  const scopeWindow = useMemo<ScopeWindow>(
    () => ({ startYear, startMonth, endYear, endMonth }),
    [startYear, startMonth, endYear, endMonth],
  )

  // ISO default re-syncs with scope until the user overrides it.
  const isoTouchedRef = useRef(false)
  const [prefs, setPrefsState] = useState<RecPreferences>(() => defaultPreferences(scopeIsos))
  useEffect(() => {
    if (!isoTouchedRef.current) setPrefsState((p) => ({ ...p, isos: scopeIsos }))
  }, [scopeIsos])

  const setPrefs = useCallback((next: RecPreferences) => {
    setPrefsState((prev) => {
      if (next.isos.join(',') !== prev.isos.join(',')) isoTouchedRef.current = true
      return next
    })
  }, [])
  const reset = useCallback(() => {
    isoTouchedRef.current = false
    setPrefsState(defaultPreferences(scopeIsos))
  }, [scopeIsos])

  const companyName = user?.company_name?.trim() || 'your portfolio'

  const availableIsos = useMemo(() => {
    const s = new Set<string>(scopeIsos)
    for (const p of marketProjects) if (p.iso) s.add(p.iso)
    return Array.from(s).sort()
  }, [marketProjects, scopeIsos])

  const availableGenTypes = useMemo(() => {
    const present = ALL_GEN_TYPES.filter((g) => marketProjects.some((p) => p.generation_type === g))
    return present.length ? present : ALL_GEN_TYPES
  }, [marketProjects])

  const recommended = useMemo(
    () => evaluateProjects(marketProjects, productSummaries, prefs, scopeWindow, selectedSites),
    [marketProjects, productSummaries, prefs, scopeWindow, selectedSites],
  )
  const recommendedIds = useMemo(
    () => new Set(recommended.map((r) => r.project.id)),
    [recommended],
  )

  const refetch = useCallback(() => {
    fetchProjects()
    refetchSummaries()
  }, [fetchProjects, refetchSummaries])

  const value: RecommendationContextValue = {
    prefs, setPrefs, reset,
    recommended, recommendedIds,
    marketProjects, productSummaries,
    availableIsos, availableGenTypes,
    companyName, scopeWindow, refetch,
  }

  return <RecommendationContext.Provider value={value}>{children}</RecommendationContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRecommendation(): RecommendationContextValue {
  const ctx = useContext(RecommendationContext)
  if (!ctx) throw new Error('useRecommendation must be used inside <RecommendationProvider>')
  return ctx
}
