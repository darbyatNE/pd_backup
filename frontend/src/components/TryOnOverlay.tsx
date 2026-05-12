import { useState, useMemo } from 'react';
import { useScopeContext } from '../contexts/ScopeContext';
import { TryOnControls } from './tryon/TryOnControls';
import { TryOnSummaryCards } from './tryon/TryOnSummaryCards';
import { TryOnChart } from './tryon/TryOnChart';
import { TryOnPatternDefs } from './tryon/TryOnPatternDefs';
import { useSiteSplits } from './tryon/hooks/useSiteSplits';
import { useTryOnData } from './tryon/hooks/useTryOnData';
import { useHedgeStats } from './tryon/hooks/useHedgeStats';
import { r1 } from './tryon/utils';
import type { TryOnOverlayProps, XAxisMode } from './tryon/types';

export default function TryOnOverlay({ project, onClose }: TryOnOverlayProps) {
  const { selectedSites, startYear, endYear } = useScopeContext();

  const [previewSites, setPreviewSites] = useState<string[]>(selectedSites);
  const [xAxis, setXAxis] = useState<XAxisMode>('hours');
  const [activeYear, setActiveYear] = useState(startYear);
  const [capacityPct, setCapacityPct] = useState(100);

  const { splits, splitSum, splitValid, updateSplit, normalizeSplits } = useSiteSplits();

  const tryOnData = useTryOnData(project, previewSites, splits, capacityPct, activeYear, startYear, xAxis);
  const { aggregateProfile, existingContracts, hourlyData, monthRows, data, yLabel } = tryOnData;

  const summaryStats = useHedgeStats(hourlyData, monthRows, xAxis, existingContracts);

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = startYear; y <= endYear; y++) out.push(y);
    return out;
  }, [startYear, endYear]);

  const chartKey = `tryon-${project.id}-${xAxis}-${activeYear}-${previewSites.join(',')}-${Object.values(splits).join(',')}-${capacityPct}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Try On: {project.name}</h2>
            <p className="text-sm text-slate-500">
              {project.generation_type} · {project.capacity_mw} MW · {project.zone || project.location}
              {capacityPct !== 100 && (
                <span className="text-slate-400"> · Commitment: {r1((project.capacity_mw || 0) * (capacityPct / 100))} MW</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-light px-2"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <TryOnControls
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
          />

          <TryOnSummaryCards stats={summaryStats} />

          <TryOnChart
            data={data}
            xAxis={xAxis}
            yLabel={yLabel}
            activeYear={activeYear}
            aggregateProfile={aggregateProfile}
            existingContracts={existingContracts}
            projectName={project.name}
            chartKey={chartKey}
          />

          <TryOnPatternDefs existingContracts={existingContracts} />
        </div>
      </div>
    </div>
  );
}
