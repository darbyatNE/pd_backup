'use client'

import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LOAD_PROFILES,
  LOAD_PROFILE_MAP,
  aggregateProfiles,
} from '../data/loadProfile'
import type { SiteLoadProfile } from '../data/loadProfile'
import { useSiteContracts, siteContractsForSites } from '../data/siteContractsApi'
import { pnum, projectStatus, projectTerm, energyRange } from '../data/projectDisplay'
import { useRecommendation } from '../contexts/RecommendationContext'
import RecommendationFilters from '../components/forecast/RecommendationFilters'
import { getSuggestedBessMw } from '../utils/capacity'
import { useScopeContext } from '../contexts/ScopeContext'
import { useDashboardView } from '../contexts/DashboardViewContext'
import { SiteCapacityCard, CapacityRollup } from '../components/CapacitySettlement'
import CapacityCoverageChart from '../components/CapacityCoverageChart'
import ModuleHandoffDialog from '../components/ModuleHandoffDialog'
import TryOnOverlay from '../components/TryOnOverlay'
import PageNav from '../components/PageNav'
import type { Project } from '../types'
import {
  CapacityBox,
  LoadForecastChart,
  CostTimeChart,
  EnergyMixChart,
} from '../components/forecast'

const GEN_COLORS: Record<string, string> = {
  Solar: '#f59e0b',
  Wind: '#0ea5e9',
  Nuclear: '#8b5cf6',
  Battery: '#10b981',
  Hybrid: '#06b6d4',
  'Combined Cycle': '#64748b',
  Peaker: '#ef4444',
  Hydro: '#06b6d4', // Same as Hybrid for now
  Virtual: '#db2777', // financial CfD
}

type XAxisMode = 'hours' | 'months'

export default function Forecast() {
  const { selectedSites, startYear, endYear, peekActive, endPeek } = useScopeContext()
  const { subTab: activeTab, setView } = useDashboardView()
  const navigate = useNavigate()

  const returnToMap = () => {
    endPeek()            // restore the persistent multi-site scope
    setView('map')
    navigate('/dashboard')
  }
  const [recsDialogOpen, setRecsDialogOpen] = useState(false)
  const [transmissionDialogOpen, setTransmissionDialogOpen] = useState(false)
  const [loadXAxis, setLoadXAxis] = useState<XAxisMode>('hours')
  const [chartYearMode, setChartYearMode] = useState<'single' | 'all'>('all')
  const [chartActiveYear, setChartActiveYear] = useState<number>(startYear)
  const [tryOnProject, setTryOnProject] = useState<Project | null>(null)
  const [tryOnSite, setTryOnSite] = useState<string | undefined>(undefined)
  // Whether the Try-On opens expanded (Examine deep link) or minimized (default).
  const [tryOnExpanded, setTryOnExpanded] = useState(false)

  // Shared "Recommended for <Company>" preferences + computed set (synced with
  // the Map page via RecommendationContext).
  const {
    prefs, setPrefs, reset: resetPrefs,
    recommended, marketProjects, productSummaries,
    availableIsos, availableGenTypes, companyName, scopeWindow,
    refetch: refetchRecommendation,
  } = useRecommendation()
  // The provider fetches projects once at app start; refresh when the Plan tab
  // opens so projects created elsewhere (e.g. marketplace "Add Project") appear.
  useEffect(() => { refetchRecommendation() }, [refetchRecommendation])

  // Optional column sort for the recommended table. null = keep the engine's
  // fit ranking; clicking a header cycles asc → desc → back to fit.
  type RecSortKey = 'status' | 'name' | 'type' | 'mw' | 'mwh' | 'rec' | 'start' | 'dist'
  const [recSort, setRecSort] = useState<{ key: RecSortKey; dir: 'asc' | 'desc' } | null>(null)
  const toggleRecSort = (key: RecSortKey) =>
    setRecSort((prev) => (prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null))
  const recArrow = (key: RecSortKey) => (recSort?.key === key ? (recSort.dir === 'asc' ? ' ▲' : ' ▼') : '')
  const displayedRecommended = useMemo(() => {
    if (!recSort) return recommended
    const val = (item: (typeof recommended)[number]): number | string => {
      const p = item.project
      const s = productSummaries[p.id]
      switch (recSort.key) {
        case 'status': return projectStatus(p).available ? 0 : 1
        case 'name': return p.name.toLowerCase()
        case 'type': return p.generation_type.toLowerCase()
        case 'mw': return Number(p.capacity_mw || 0)
        case 'mwh': return pnum(s?.energy_mwh_max ?? null) ?? pnum(s?.energy_mwh_min ?? null) ?? -1
        case 'rec': return s?.has_rec ? (pnum(s.rec_pct) ?? -1) : -1
        case 'start': return p.term_start_date ?? ''
        case 'dist': return item.distanceMiles == null ? Infinity : item.distanceMiles
      }
    }
    return [...recommended].sort((a, b) => {
      const av = val(a); const bv = val(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return recSort.dir === 'asc' ? cmp : -cmp
    })
  }, [recommended, recSort, productSummaries])

  const profiles = selectedSites
    .map((k) => LOAD_PROFILE_MAP[k])
    .filter(Boolean) as SiteLoadProfile[]

  const profile = profiles.length === 0
    ? LOAD_PROFILES[0]
    : profiles.length === 1
    ? profiles[0]
    : aggregateProfiles(profiles)

  // Saved contracts come from RDS (public.site_contracts), filtered to the
  // data centers in scope. refetch after a new contract is saved in "Examine Fit".
  const { rows: siteContractRows, refetch: refetchSiteContracts } = useSiteContracts()
  const contracts = useMemo(
    () => siteContractsForSites(siteContractRows, selectedSites),
    [siteContractRows, selectedSites],
  )

  const openExamineFit = (p: Project) => {
    setTryOnProject(p)
    setTryOnSite(selectedSites[0])
  }

  // Deep link from the Projects list: /dashboard?examine=<projectId> opens the
  // Try-On for that project once the marketplace list has loaded.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const examineId = searchParams.get('examine')
    if (!examineId || marketProjects.length === 0) return
    const match = marketProjects.find((p) => p.id === examineId)
    if (match) { setTryOnExpanded(true); openExamineFit(match) }
    // consume the param so it doesn't re-trigger on re-render
    const next = new URLSearchParams(searchParams)
    next.delete('examine')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketProjects, searchParams])

  return (
    <div className="max-w-full flex flex-col gap-6">
      {peekActive && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2">
          <span className="text-sm text-teal-800">
            Viewing load for a single data center (temporary) — your scope selection is preserved.
          </span>
          <button
            type="button"
            onClick={returnToMap}
            className="flex-shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded transition-colors"
          >
            ← Return to map
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" title="Central hub for energy procurement strategy: Analyze capacity needs, forecast energy demand, optimize contract timing, manage renewable energy credits, and monitor procurement risks across your portfolio.">
          Procurement Planning
        </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Capacity settlement · Energy forecast &amp; offers · REC procurement
          </p>
        </div>
        <PageNav />
      </div>

      {activeTab === 'capacity' && (
        <div className="space-y-6">
          <CapacityRollup selectedSites={selectedSites} endYear={endYear} />
          {profiles.length > 0 && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <CapacityCoverageChart profile={profile} />
            </div>
          )}
          {profiles.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              Select at least one site in the scope bar to review capacity settlement.
            </div>
          ) : (
            profiles.map((p) => (
              <SiteCapacityCard 
                key={p.siteKey} 
                profile={p} 
                endYear={endYear} 
                onExamineFit={() => {
                  // Use shared utility to calculate suggested BESS size
                  const suggestedMw = getSuggestedBessMw(p, startYear, endYear);
                  console.log(`[ExamineFit] Site: ${p.siteKey}, Years: ${startYear}-${endYear}, Suggested BESS: ${suggestedMw}MW`);
                  
                  // Create synthetic BESS project for this site's profile
                  const bessProject: Project = {
                    id: `bess-capacity-${p.siteKey}`,
                    seller_id: 'capacity-tab',
                    name: `BESS - ${p.siteKey}`,
                    generation_type: 'Battery',
                    capacity_mw: suggestedMw,
                    location: '',
                    status: 'published',
                    expected_cod: new Date(startYear + 1, 0).toISOString(),
                    delivery_term_years: 15,
                    metadata: {
                      isBTMOption: true,
                      btmAssetType: 'BESS',
                    }
                  };
                  setTryOnProject(bessProject);
                  setTryOnSite(p.siteKey); // Set the specific site for scope
                }}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'energy' && (<>
        <CapacityBox
          profile={profile}
          startYear={startYear}
          endYear={endYear}
          selectedSites={selectedSites}
          contracts={contracts}
          chartYearMode={chartYearMode}
          chartActiveYear={chartActiveYear}
        />
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
          <LoadForecastChart
            profile={profile}
            contracts={contracts}
            xAxis={loadXAxis}
            onXAxisChange={setLoadXAxis}
            activeYear={chartActiveYear}
            onYearChange={setChartActiveYear}
            yearMode={chartYearMode}
            onYearModeChange={setChartYearMode}
          />
        </div>
        {/* Recommended projects — sits directly under the load chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <RecommendationFilters
            prefs={prefs}
            onChange={setPrefs}
            scope={scopeWindow}
            availableIsos={availableIsos}
            availableGenTypes={availableGenTypes}
            matchedCount={recommended.length}
            totalCount={marketProjects.length}
            companyName={companyName}
            onReset={resetPrefs}
          />
          <div className="p-4">
            {marketProjects.length === 0 ? (
              <p className="text-sm text-slate-400 italic px-2">No published projects available.</p>
            ) : recommended.length === 0 ? (
              <p className="text-sm text-slate-400 italic px-2">
                No projects match your preferences. Try widening the distance, clearing a generation-type or
                component filter, or turning off “fully covers” to see partial-term deals.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-[11px] leading-tight border-collapse">
                  <colgroup>
                    <col style={{ width: '8%' }} />{/* Status */}
                    <col style={{ width: '10%' }} />{/* Project */}
                    <col style={{ width: '6%' }} />{/* Start */}
                    <col style={{ width: '6%' }} />{/* Stop */}
                    <col style={{ width: '6%' }} />{/* Cap MW */}
                    <col style={{ width: '7%' }} />{/* LDA */}
                    <col style={{ width: '6%' }} />{/* MWh */}
                    <col style={{ width: '7%' }} />{/* Zone */}
                    <col style={{ width: '7%' }} />{/* Pricing Pt */}
                    <col style={{ width: '5%' }} />{/* REC % */}
                    <col style={{ width: '7%' }} />{/* Tracking */}
                    <col style={{ width: '7%' }} />{/* Type */}
                    <col style={{ width: '7%' }} />{/* Distance */}
                    <col style={{ width: '11%' }} />{/* Action */}
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                      <th rowSpan={2} onClick={() => toggleRecSort('status')} className="py-2 px-2 align-bottom font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-slate-700">Status{recArrow('status')}</th>
                      <th rowSpan={2} onClick={() => toggleRecSort('name')} className="py-2 px-2 align-bottom font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-slate-700">Project{recArrow('name')}</th>
                      <th colSpan={2} className="py-1 px-2 text-center font-semibold border-l border-slate-200">Term</th>
                      <th colSpan={2} className="py-1 px-2 text-center font-semibold text-teal-700 border-l border-slate-200 bg-teal-50/40">Capacity</th>
                      <th colSpan={3} className="py-1 px-2 text-center font-semibold text-amber-700 border-l border-slate-200 bg-amber-50/40">Energy</th>
                      <th colSpan={2} className="py-1 px-2 text-center font-semibold text-indigo-700 border-l border-slate-200 bg-indigo-50/40">RECs</th>
                      <th rowSpan={2} onClick={() => toggleRecSort('type')} className="py-2 px-2 align-bottom font-semibold uppercase tracking-wider border-l border-slate-200 cursor-pointer select-none hover:text-slate-700">Type{recArrow('type')}</th>
                      <th rowSpan={2} onClick={() => toggleRecSort('dist')} className="py-2 px-2 align-bottom font-semibold uppercase tracking-wider border-l border-slate-200 cursor-pointer select-none hover:text-slate-700">Dist (mi){recArrow('dist')}</th>
                      <th rowSpan={2} className="py-2 px-2 align-bottom font-semibold uppercase tracking-wider border-l border-slate-200">Action</th>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th onClick={() => toggleRecSort('start')} className="py-1 px-2 border-l border-slate-200 font-medium cursor-pointer select-none hover:text-slate-600">Start{recArrow('start')}</th>
                      <th className="py-1 px-2 font-medium">Stop</th>
                      <th onClick={() => toggleRecSort('mw')} className="py-1 px-2 border-l border-slate-200 font-medium cursor-pointer select-none hover:text-slate-600">MW{recArrow('mw')}</th>
                      <th className="py-1 px-2 font-medium">LDA</th>
                      <th onClick={() => toggleRecSort('mwh')} className="py-1 px-2 border-l border-slate-200 font-medium cursor-pointer select-none hover:text-slate-600">MWh{recArrow('mwh')}</th>
                      <th className="py-1 px-2 font-medium">Zone</th>
                      <th className="py-1 px-2 font-medium">Pricing Pt</th>
                      <th onClick={() => toggleRecSort('rec')} className="py-1 px-2 border-l border-slate-200 font-medium cursor-pointer select-none hover:text-slate-600">%{recArrow('rec')}</th>
                      <th className="py-1 px-2 font-medium">Tracking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRecommended.map(({ project: p, distanceMiles }) => {
                      const s = productSummaries[p.id];
                      const st = projectStatus(p);
                      const tm = projectTerm(p);
                      const lda = s?.eda || p.zone || '—';
                      const zone = s?.zone || p.zone || '—';
                      const recPct = s?.has_rec && pnum(s.rec_pct) != null ? `${pnum(s.rec_pct)}%` : '—';
                      const tracking = s?.has_rec && s.retiring_agency ? s.retiring_agency : '—';
                      const egy = energyRange(s);
                      const dim = (v: string) => (v === '—' ? 'text-slate-300' : '');
                      return (
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="py-2 px-2">
                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${st.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{st.label}</span>
                          </td>
                          <td className="py-2 px-2 font-medium text-slate-800 truncate" title={p.name}>{p.name}</td>
                          {/* Term */}
                          <td className={`py-2 px-2 border-l border-slate-100 whitespace-nowrap ${dim(tm.start)}`}>{tm.start}</td>
                          <td className={`py-2 px-2 whitespace-nowrap ${dim(tm.stop)}`}>{tm.stop}</td>
                          {/* Capacity */}
                          <td className="py-2 px-2 border-l border-slate-100 text-slate-900 whitespace-nowrap">{Number(p.capacity_mw || 0).toFixed(0)}</td>
                          <td className={`py-2 px-2 truncate ${dim(lda)}`} title={lda}>{lda}</td>
                          {/* Energy */}
                          <td className={`py-2 px-2 border-l border-slate-100 whitespace-nowrap ${dim(egy)}`}>{egy}</td>
                          <td className={`py-2 px-2 truncate ${dim(zone)}`} title={zone}>{zone}</td>
                          {(() => { const pt = p.settlement_point || p.zone || '—'; return (
                            <td className={`py-2 px-2 truncate ${dim(pt)}`} title={pt}>{pt}</td>
                          ); })()}
                          {/* RECs */}
                          <td className={`py-2 px-2 border-l border-slate-100 whitespace-nowrap ${dim(recPct)}`}>{recPct}</td>
                          <td className={`py-2 px-2 truncate ${dim(tracking)}`} title={tracking}>{tracking}</td>
                          {/* Type */}
                          <td className="py-2 px-2 border-l border-slate-100">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border truncate" style={{ background: `${GEN_COLORS[p.generation_type] ?? '#64748b'}18`, color: GEN_COLORS[p.generation_type] ?? '#64748b', borderColor: `${GEN_COLORS[p.generation_type] ?? '#64748b'}40` }}>{p.generation_type}</span>
                          </td>
                          {/* Distance */}
                          <td className={`py-2 px-2 border-l border-slate-100 whitespace-nowrap ${distanceMiles == null ? 'text-slate-300' : 'text-slate-700'}`} title={distanceMiles == null ? 'Location not mapped' : `${Math.round(distanceMiles)} mi from nearest in-scope site`}>
                            {distanceMiles == null ? '—' : Math.round(distanceMiles)}
                          </td>
                          <td className="py-2 px-2 border-l border-slate-100">
                            <button
                              onClick={() => openExamineFit(p)}
                              disabled={selectedSites.length === 0}
                              title={selectedSites.length === 0 ? 'Select a site in the scope bar first' : 'Examine fit and save a contract'}
                              className="px-2 py-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-[10px] font-semibold rounded transition-colors whitespace-nowrap"
                            >
                              ▶ Examine
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[400px]">
            <CostTimeChart
              contracts={contracts}
              profile={profile}
              startYear={startYear}
              endYear={endYear}
              granularity={loadXAxis}
            />
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[400px]">
            <EnergyMixChart
              contracts={contracts}
              profile={profile}
              startYear={startYear}
              endYear={endYear}
            />
          </div>
        </div>
      </>)}

      {activeTab === 'recs' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          {recsDialogOpen && (
            <ModuleHandoffDialog
              kind="recs"
              onClose={() => setRecsDialogOpen(false)}
              payload={
                <div className="space-y-1">
                  <p><span className="text-slate-500">Sites in scope:</span> <span className="font-medium">{selectedSites.length}</span></p>
                  <p><span className="text-slate-500">Scope years:</span> <span className="font-medium">{startYear}–{endYear}</span></p>
                </div>
              }
            />
          )}
          <p className="text-sm font-semibold text-slate-700 mb-2">REC procurement — coming soon</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            Will derive REC volumes from each site&apos;s <em>REC Coverage Target (%)</em> and
            time-matching requirement, then surface scheme options (REC, AEPS, etc.) and
            short / long matching strategies.
          </p>
          <button
            type="button"
            onClick={() => setRecsDialogOpen(true)}
            className="text-xs font-semibold px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            Preview REC procurement module
          </button>
        </div>
      )}

      {activeTab === 'transmission' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          {transmissionDialogOpen && (
            <ModuleHandoffDialog
              kind="transmission"
              onClose={() => setTransmissionDialogOpen(false)}
              payload={
                <div className="space-y-1">
                  <p><span className="text-slate-500">Sites in scope:</span> <span className="font-medium">{selectedSites.length}</span></p>
                  <p><span className="text-slate-500">Scope years:</span> <span className="font-medium">{startYear}–{endYear}</span></p>
                </div>
              }
            />
          )}
          <p className="text-sm font-semibold text-slate-700 mb-2">Transmission &amp; Basis Risk — coming soon</p>
          <p className="text-xs text-slate-500 max-w-lg mx-auto mb-4">
            Will surface congestion and basis exposure for each site&apos;s settlement node, and model
            hedging strategies via <em>Auction Revenue Rights (ARRs)</em>, <em>Financial Transmission
            Rights (FTRs)</em>, and <em>Network Integration Transmission Service (NITS)</em> in PJM.
            Includes historical basis spreads by zone, FTR auction cost vs. hedge value, and
            annual NITS cost allocation by load ratio share.
          </p>
          <button
            type="button"
            onClick={() => setTransmissionDialogOpen(true)}
            className="text-xs font-semibold px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            Preview transmission risk module
          </button>
        </div>
      )}
      
      {tryOnProject && (
        <TryOnOverlay
          project={tryOnProject}
          onClose={() => {
            setTryOnProject(null);
            setTryOnSite(undefined);
            setTryOnExpanded(false);
          }}
          scopeSite={tryOnSite}
          initialYear={chartActiveYear}
          onSaved={refetchSiteContracts}
          allSiteContracts={siteContractRows}
          startMinimized={!tryOnExpanded}
        />
      )}
    </div>
  )
}
