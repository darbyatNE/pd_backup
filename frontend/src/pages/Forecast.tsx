'use client'

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LOAD_PROFILES,
  LOAD_PROFILE_MAP,
  aggregateProfiles,
} from '../data/loadProfile'
import type { SiteLoadProfile } from '../data/loadProfile'
import { getContractsForSites } from '../data/linkedContracts'
import { useScopeContext } from '../contexts/ScopeContext'
import { useDashboardView } from '../contexts/DashboardViewContext'
import { SiteCapacityCard, CapacityRollup } from '../components/CapacitySettlement'
import CapacityCoverageChart from '../components/CapacityCoverageChart'
import ModuleHandoffDialog from '../components/ModuleHandoffDialog'
import {
  CapacityBox,
  LoadForecastChart,
  CostTimeChart,
  EnergyMixChart,
  ProcurementSchedule,
  RiskAlerts,
} from '../components/forecast'

type XAxisMode = 'hours' | 'months'

const PAGE_NAV_LINKS = [
  { label: 'Projects',     path: '/projects' },
  { label: 'Transactions', path: '/transactions' },
  { label: 'Documents',    path: '/documents' },
]

export default function Forecast() {
  const { selectedSites, startYear, endYear } = useScopeContext()
  const { subTab: activeTab } = useDashboardView()
  const navigate = useNavigate()
  const [recsDialogOpen, setRecsDialogOpen] = useState(false)
  const [loadXAxis, setLoadXAxis] = useState<XAxisMode>('hours')
  const [chartYearMode, setChartYearMode] = useState<'single' | 'all'>('single')
  const [chartActiveYear, setChartActiveYear] = useState<number>(startYear)

  const profiles = selectedSites
    .map((k) => LOAD_PROFILE_MAP[k])
    .filter(Boolean) as SiteLoadProfile[]

  const profile = profiles.length === 0
    ? LOAD_PROFILES[0]
    : profiles.length === 1
    ? profiles[0]
    : aggregateProfiles(profiles)

  const contracts = useMemo(() => getContractsForSites(selectedSites), [selectedSites])

  return (
    <div className="max-w-full flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Procurement Planning</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Capacity settlement · Energy forecast &amp; offers · REC procurement
          </p>
        </div>
        <nav className="flex items-center gap-1">
          {PAGE_NAV_LINKS.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-teal-600 hover:bg-slate-50 transition-colors"
            >
              {link.label}
            </button>
          ))}
        </nav>
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
              <SiteCapacityCard key={p.siteKey} profile={p} endYear={endYear} />
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
          chartYearMode={chartYearMode}
          chartActiveYear={chartActiveYear}
        />
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
          <LoadForecastChart
            profile={profile}
            xAxis={loadXAxis}
            onXAxisChange={setLoadXAxis}
            activeYear={chartActiveYear}
            onYearChange={setChartActiveYear}
            yearMode={chartYearMode}
            onYearModeChange={setChartYearMode}
          />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[380px]">
            <ProcurementSchedule />
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 min-h-[380px]">
            <RiskAlerts />
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
    </div>
  )
}
