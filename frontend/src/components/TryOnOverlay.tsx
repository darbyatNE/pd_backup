import { useState, useMemo } from 'react';
import { useScopeContext } from '../contexts/ScopeContext';
import { TryOnControls } from './tryon/TryOnControls';
import { TryOnSummaryCards } from './tryon/TryOnSummaryCards';
import { TryOnChart } from './tryon/TryOnChart';
import { TryOnPatternDefs } from './tryon/TryOnPatternDefs';
import { TryOnCapacitySummary } from './tryon/TryOnCapacitySummary';
import { TryOnCapacityChart } from './tryon/TryOnCapacityChart';
import { useSiteSplits } from './tryon/hooks/useSiteSplits';
import { useTryOnData } from './tryon/hooks/useTryOnData';
import { useHedgeStats } from './tryon/hooks/useHedgeStats';
import { r1 } from './tryon/utils';
import ModuleHandoffDialog from './ModuleHandoffDialog';
import type { TryOnOverlayProps, XAxisMode } from './tryon/types';

export default function TryOnOverlay({ project, onClose, scopeSite, initialYear }: TryOnOverlayProps & { scopeSite?: string; initialYear?: number }) {
  const { selectedSites, startYear, endYear, startMonth, endMonth } = useScopeContext();

  // BTM asset detection (Behind The Meter assets can only be at a single site)
  const isBTM = project.metadata?.btmAssetType === 'BESS' ||
                project.metadata?.btmAssetType === 'NG Peaker' ||
                project.metadata?.btmAssetType === 'NG Combined Cycle' ||
                project.generation_type === 'Battery';

  // BESS detection for defaulting to capacity view
  const isBESS = project.generation_type === 'Battery' ||
                (project.metadata?.btmAssetType === 'BESS');

  const [previewSites, setPreviewSites] = useState<string[]>(selectedSites);
  const [xAxis, setXAxis] = useState<XAxisMode>('hours');
  const [activeYear, setActiveYear] = useState(initialYear ?? startYear);
  // For BTM assets: auto-set to 100% capacity
  const [capacityPct, setCapacityPct] = useState(isBTM ? 100 : 100);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'energy' | 'capacity'>(
    isBESS ? 'capacity' : 'energy'
  );
  
  // BESS configuration state
  const [bessDischargeHours, setBessDischargeHours] = useState<number[]>([15, 16, 17, 18]);
  const [bessChargeHours, setBessChargeHours] = useState<number[]>([0, 1, 2, 3, 4, 5, 24]);
  const [bessEfficiency, setBessEfficiency] = useState(85); // round-trip efficiency %
  const [bessMinimized, setBessMinimized] = useState(true);

  const { splits, splitSum, splitValid, updateSplit, normalizeSplits } = useSiteSplits();

  // For BTM assets in capacity view: limit to one site.
  // Energy view always shows all sites regardless of BTM status.
  const effectiveSites = useMemo(() => {
    if (isBTM && viewMode === 'capacity') {
      // If scopeSite provided (from Capacity tab), use that; otherwise use first selected site
      if (scopeSite) return [scopeSite];
      if (selectedSites.length > 0) return [selectedSites[0]];
    }
    return selectedSites;
  }, [isBTM, scopeSite, selectedSites, viewMode]);

  // First get tryOnData with base project to determine uncontracted capacity
  const baseTryOnData = useTryOnData({
    project,
    previewSites: effectiveSites,
    splits,
    capacityPct,
    activeYear,
    startYear,
    xAxis,
    startMonth,
    endMonth,
    bessDischargeHours: isBESS ? bessDischargeHours : undefined,
    bessChargeHours: isBESS ? bessChargeHours : undefined,
    bessEfficiency: isBESS ? bessEfficiency : undefined,
  });
  const { aggregateProfile, existingContracts, tryOnContract, hourlyData, monthRows, data, yLabel } = baseTryOnData;

  const summaryStats = useHedgeStats(hourlyData, monthRows, xAxis, existingContracts);

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = startYear; y <= endYear; y++) out.push(y);
    return out;
  }, [startYear, endYear]);

  const chartKey = `tryon-${project.id}-${xAxis}-${activeYear}-${previewSites.join(',')}-${Object.values(splits).join(',')}-${capacityPct}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 pt-[calc(1rem+80px)]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[calc(100vh-60px)] flex flex-col">
        {/* Header */}
        <div className="flex-none flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Try On: {project.name}</h2>
            <p className="text-sm text-slate-500">
              {project.generation_type} · {project.capacity_mw} MW · {project.zone || project.location}
              {capacityPct !== 100 && (
                <span className="text-slate-400"> · Commitment: {r1((project.capacity_mw || 0) * (capacityPct / 100))} MW</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('energy')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'energy' 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Energy
              </button>
              <button
                onClick={() => setViewMode('capacity')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'capacity' 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Capacity
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl font-light px-2"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1 min-h-0">
          {viewMode === 'energy' && (
            <TryOnControls
              isBTM={isBTM}
              projectCapacity={project.capacity_mw || 0}
              capacityPct={capacityPct}
              setCapacityPct={setCapacityPct}
              selectedSites={selectedSites}
              previewSites={previewSites}
              setPreviewSites={setPreviewSites}
              splits={splits}
              updateSplit={updateSplit}
              splitSum={splitSum}
              splitValid={splitValid}
              normalizeSplits={normalizeSplits}
              xAxis={xAxis}
              setXAxis={setXAxis}
              activeYear={activeYear}
              setActiveYear={setActiveYear}
              yearOptions={yearOptions}
              onCommit={() => setDialogOpen(true)}
            />
          )}

          {/* BESS Configuration Panel - Collapsible - Only show in energy mode */}
          {isBESS && viewMode === 'energy' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg overflow-hidden">
              {/* Header - Always visible */}
              <button
                onClick={() => setBessMinimized(prev => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-emerald-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-emerald-800 font-medium text-sm">
                  <span>🔋</span>
                  <span>BESS Configuration</span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                    {bessDischargeHours.length}h discharge • {bessChargeHours.length}h charge
                  </span>
                </div>
                <span className="text-emerald-600 text-xs">
                  {bessMinimized ? '▶ Expand' : '▼ Minimize'}
                </span>
              </button>
              
              {/* Collapsible Content */}
              {!bessMinimized && (
                <div className="px-3 pb-3 space-y-3 border-t border-emerald-100">
                  {/* Discharge Hours */}
                  <div className="space-y-1 pt-2">
                    <label className="text-xs text-emerald-700 font-medium">Discharge Hours (190MW output)</label>
                    <div className="flex flex-wrap gap-1">
                      {[...Array(24)].map((_, i) => {
                        const hour = i === 0 ? 24 : i;
                        const isSelected = bessDischargeHours.includes(hour);
                        return (
                          <button
                            key={hour}
                            onClick={() => {
                              setBessDischargeHours(prev => 
                                isSelected 
                                  ? prev.filter(h => h !== hour)
                                  : [...prev, hour].sort((a, b) => (a === 24 ? 0 : a) - (b === 24 ? 0 : b))
                              );
                            }}
                            className={`w-7 h-6 text-[10px] rounded ${
                              isSelected 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-white text-emerald-600 border border-emerald-200'
                            }`}
                          >
                            HE{hour}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Charge Hours */}
                  <div className="space-y-1">
                    <label className="text-xs text-amber-700 font-medium">Charge Hours (additional load)</label>
                    <div className="flex flex-wrap gap-1">
                      {[...Array(24)].map((_, i) => {
                        const hour = i === 0 ? 24 : i;
                        const isSelected = bessChargeHours.includes(hour);
                        return (
                          <button
                            key={hour}
                            onClick={() => {
                              setBessChargeHours(prev => 
                                isSelected 
                                  ? prev.filter(h => h !== hour)
                                  : [...prev, hour].sort((a, b) => (a === 24 ? 0 : a) - (b === 24 ? 0 : b))
                              );
                            }}
                            className={`w-7 h-6 text-[10px] rounded ${
                              isSelected 
                                ? 'bg-amber-500 text-white' 
                                : 'bg-white text-amber-600 border border-amber-200'
                            }`}
                          >
                            HE{hour}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Efficiency Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <label className="text-emerald-700 font-medium">Round-trip Efficiency</label>
                      <span className="text-emerald-800 font-medium">{bessEfficiency}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={bessEfficiency}
                      onChange={(e) => setBessEfficiency(Number(e.target.value))}
                      className="w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <p className="text-[10px] text-emerald-600">
                      Loss: {100 - bessEfficiency}% • Charge MW: {Math.round(190 * 100 / bessEfficiency)}MW
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Simple Capacity Control for Capacity View */}
          {viewMode === 'capacity' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-900">Capacity Commitment</label>
                  <p className="text-xs text-slate-500">Adjust the percentage of project capacity to commit</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={capacityPct}
                    onChange={(e) => setCapacityPct(Number(e.target.value))}
                    className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                  <span className="text-sm font-medium text-slate-900 w-12 text-right">
                    {capacityPct}%
                  </span>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Effective Capacity: {r1((project.capacity_mw || 0) * (capacityPct / 100))} MW
              </div>
              <div className="mt-2">
                <button
                  onClick={() => setDialogOpen(true)}
                  className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium rounded transition-colors"
                >
                  Commit Capacity
                </button>
              </div>
            </div>
          )}

          {viewMode === 'energy' ? (
            <>
              <TryOnSummaryCards stats={summaryStats} />

              <TryOnChart
                data={data}
                xAxis={xAxis}
                yLabel={yLabel}
                activeYear={activeYear}
                aggregateProfile={aggregateProfile}
                projectName={project.name}
                chartKey={chartKey}
                projectTier={tryOnContract?.tier}
              />

              <TryOnPatternDefs />
            </>
          ) : (
            <>
              <TryOnCapacitySummary
                capacityPct={capacityPct}
                effectiveCapacity={(project.capacity_mw || 0) * (capacityPct / 100)}
                sites={effectiveSites}
                startYear={startYear}
                endYear={endYear}
                projectName={project.name}
              />

              <TryOnCapacityChart
                effectiveCapacity={(() => {
                  const effective = (project.capacity_mw || 0) * (capacityPct / 100);
                  console.log(`[TryOnOverlay] Capacity calc: project.capacity_mw=${project.capacity_mw}, capacityPct=${capacityPct}, effectiveCapacity=${effective}`);
                  return effective;
                })()}
                sites={effectiveSites}
                startYear={startYear}
                endYear={endYear}
                projectName={project.name}
              />

              <TryOnPatternDefs />
            </>
          )}
        </div>
      </div>

      {dialogOpen && (
        <ModuleHandoffDialog
          kind="try-on-commit"
          onClose={() => setDialogOpen(false)}
          payload={
            <div className="space-y-1">
              <p><span className="text-slate-500">Project:</span> <span className="font-medium">{project.name}</span></p>
              <p><span className="text-slate-500">View:</span> <span className="font-medium capitalize">{viewMode}</span></p>
              <p><span className="text-slate-500">Capacity:</span> <span className="font-medium">{r1((project.capacity_mw || 0) * (capacityPct / 100))} MW</span></p>
              <p><span className="text-slate-500">Sites:</span> <span className="font-medium">{viewMode === 'energy' ? previewSites.length : effectiveSites.length}</span></p>
            </div>
          }
        />
      )}
    </div>
  );
}
