import { r1 } from './utils';
import { ALL_SITE_KEYS, SITE_NAMES } from './types';

interface TryOnControlsProps {
  projectCapacity: number;
  capacityPct: number;
  setCapacityPct: (v: number) => void;
  selectedSites: string[];
  previewSites: string[];
  setPreviewSites: (sites: string[] | ((prev: string[]) => string[])) => void;
  splits: Record<string, number>;
  updateSplit: (key: string, val: number) => void;
  splitSum: number;
  splitValid: boolean;
  normalizeSplits: () => void;
  xAxis: 'hours' | 'months';
  setXAxis: (v: 'hours' | 'months') => void;
  activeYear: number;
  setActiveYear: (v: number) => void;
  yearOptions: number[];
}

export function TryOnControls({
  projectCapacity,
  capacityPct,
  setCapacityPct,
  selectedSites,
  previewSites,
  setPreviewSites,
  splits,
  updateSplit,
  splitSum,
  splitValid,
  normalizeSplits,
  xAxis,
  setXAxis,
  activeYear,
  setActiveYear,
  yearOptions,
}: TryOnControlsProps) {
  return (
    <>
      {/* Contracted volume scaler */}
      <div className="border border-slate-200 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-semibold text-slate-900">Contracted volume</h3>
          <span className="text-xs text-slate-500">
            {r1((projectCapacity || 0) * (capacityPct / 100))} MW committed ({capacityPct}% of {projectCapacity || 0} MW capacity)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={capacityPct}
            onChange={(e) => setCapacityPct(Number(e.target.value))}
            className="flex-1 accent-indigo-600"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={capacityPct}
            onChange={(e) => setCapacityPct(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-16 text-right text-sm border border-slate-300 rounded-md px-2 py-1"
          />
          <span className="text-sm text-slate-500 w-12">{capacityPct}%</span>
        </div>
      </div>

      {/* Site split controls */}
      <div className="border border-slate-200 rounded-lg p-2">
        <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Allocate project across sites</h3>
        <div className="space-y-1.5">
          {ALL_SITE_KEYS.map((key) => {
            const isInScope = selectedSites.includes(key);
            const isPreview = previewSites.includes(key);
            const pct = splits[key] || 0;
            const allocatedMw = r1(((projectCapacity || 0) * (capacityPct / 100) * pct) / 100);
            return (
              <div key={key} className={`flex items-center gap-3 ${!isInScope ? 'opacity-50' : ''}`}>
                {isInScope ? (
                  <input
                    type="checkbox"
                    checked={isPreview}
                    onChange={(e) => {
                      setPreviewSites((prev) =>
                        e.target.checked
                          ? [...prev, key]
                          : prev.filter((s) => s !== key)
                      );
                    }}
                    className="w-4 h-4 accent-indigo-600"
                  />
                ) : (
                  <span className="w-4 h-4 inline-block" />
                )}
                <div className="w-36 text-sm">
                  <span className="font-medium text-slate-900">{SITE_NAMES[key]}</span>
                  {!isInScope && <span className="text-slate-400 text-xs ml-1">(not in scope)</span>}
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => updateSplit(key, Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => updateSplit(key, Number(e.target.value))}
                  className="w-16 text-right text-sm border border-slate-300 rounded-md px-2 py-1"
                />
                <span className="text-sm text-slate-500 w-16">{allocatedMw} MW</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs">
            {splitValid ? (
              <span className="text-emerald-600 font-medium">Splits sum to 100%</span>
            ) : (
              <span className="text-rose-600 font-medium">Splits sum to {splitSum}% — click Normalize</span>
            )}
          </div>
          <button
            type="button"
            onClick={normalizeSplits}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Normalize
          </button>
        </div>
      </div>

      {/* Chart controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">View</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {(['hours', 'months'] as const).map((k, i) => (
              <button
                key={k}
                onClick={() => setXAxis(k)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: xAxis === k ? '#0f172a' : '#fff',
                  color: xAxis === k ? '#fff' : '#64748b',
                  borderRight: i === 0 ? '1px solid #e2e8f0' : undefined,
                }}
              >
                {k === 'hours' ? 'Hourly' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Year</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {yearOptions.map((yr) => (
              <button
                key={yr}
                onClick={() => setActiveYear(yr)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: activeYear === yr ? '#0f172a' : '#fff',
                  color: activeYear === yr ? '#fff' : '#64748b',
                }}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
