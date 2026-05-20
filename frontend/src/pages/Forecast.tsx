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
import type { LinkedContract } from '../data/linkedContracts'
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
  RiskAlerts,
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
}

const TIER_STYLES: Record<string, string> = {
  baseload: 'bg-teal-50 text-teal-700 border-teal-200',
  peak:     'bg-amber-50 text-amber-700 border-amber-200',
}

function HedgeContractsTable({ contracts }: { contracts: LinkedContract[] }) {
  if (contracts.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic px-2">
        No contracts linked — select sites in the scope bar.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider text-slate-500">Project</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Type</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Tier</th>
            <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">MW</th>
            <th className="text-right py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">$/MWh</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Shape</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Term Start</th>
            <th className="text-left py-3 px-3 font-semibold uppercase tracking-wider text-slate-500">Term End</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="py-2.5 px-4 font-medium text-slate-800">{c.projectName}</td>
              <td className="py-2.5 px-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                  style={{
                    background: `${GEN_COLORS[c.generationType] ?? '#64748b'}18`,
                    color: GEN_COLORS[c.generationType] ?? '#64748b',
                    borderColor: `${GEN_COLORS[c.generationType] ?? '#64748b'}40`,
                  }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: GEN_COLORS[c.generationType] ?? '#64748b' }}
                  />
                  {c.generationType}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${TIER_STYLES[c.tier] ?? ''}`}>
                  {c.tier}
                </span>
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{c.mwCovered.toFixed(1)}</td>
              <td className="py-2.5 px-3 text-right text-slate-700">${c.pricePerMwh.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-slate-500 capitalize">{c.shape}</td>
              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                {new Date(c.startYear, c.startMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </td>
              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                {new Date(c.endYear, c.endMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8} className="px-4 py-2.5 border-t border-slate-100 text-[10px] text-slate-400 italic">
              {contracts.length} contract{contracts.length !== 1 ? 's' : ''} · {contracts.reduce((s, c) => s + c.mwCovered, 0).toFixed(1)} MW total contracted
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

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
          <h1 className="text-2xl font-bold text-slate-900" title="Central hub for energy procurement strategy: Analyze capacity needs, forecast energy demand, optimize contract timing, manage renewable energy credits, and monitor procurement risks across your portfolio.">
          Procurement Planning
        </h1>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900" title="Manage your energy contract portfolio: View all active PPAs, VPPAs, and hedge agreements, track contract terms and pricing, monitor delivery obligations, and ensure adequate coverage for your energy needs across all facilities.">
                Hedge Contracts
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">All contracted positions linked to sites in scope</p>
            </div>
            <HedgeContractsTable contracts={contracts} />
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
