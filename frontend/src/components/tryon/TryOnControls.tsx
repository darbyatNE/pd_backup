import { useEffect } from 'react';
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
  xAxis: 'hours' | 'months';
  setXAxis: (v: 'hours' | 'months') => void;
  activeYear: number;
  setActiveYear: (v: number) => void;
  yearOptions: number[];
  isBTM?: boolean;
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
  xAxis,
  setXAxis,
  activeYear,
  setActiveYear,
  yearOptions,
  isBTM,
}: TryOnControlsProps) {
  // splits[k] is each data center's OWN allocation, as an absolute % of the
  // project's max offering. It is independent and persistent per site: setting one
  // site never touches another, and unchecking a site leaves its value intact —
  // the checkbox only controls whether the site is included in the try-on chart
  // and the save. The "Contracted volume" is just the sum over the checked sites.
  const committedSiteKeys = ALL_SITE_KEYS.filter((k) => previewSites.includes(k));
  const maxOfferingMw = projectCapacity || 0;
  const siteMw = (k: string) => (maxOfferingMw * (splits[k] || 0)) / 100;
  const totalContractedPct = committedSiteKeys.reduce((s, k) => s + (splits[k] || 0), 0);
  const totalAllocatedMw = r1(committedSiteKeys.reduce((sum, k) => sum + siteMw(k), 0));
  const atOfferingCap = totalContractedPct >= 100;

  // Drag one site. Checked sites are clamped to the remaining offering headroom
  // (only checked sites count toward the cap); unchecked sites can be pre-set
  // freely. Either way, only this site's value changes.
  const handleSplitChange = (key: string, requestedPct: number) => {
    let v = Math.max(0, Math.min(100, requestedPct));
    if (previewSites.includes(key)) {
      const others = committedSiteKeys.filter((k) => k !== key).reduce((s, k) => s + (splits[k] || 0), 0);
      v = Math.min(v, Math.max(0, 100 - others));
    }
    updateSplit(key, v);
  };

  // "Contracted volume" master scaler: scales the CHECKED sites proportionally to
  // the target total; unchecked sites are left as-is so their values persist.
  const handleContractedChange = (requestedPct: number) => {
    const target = Math.max(0, Math.min(100, requestedPct));
    if (committedSiteKeys.length === 0) return;
    const curr = committedSiteKeys.reduce((s, k) => s + (splits[k] || 0), 0);
    if (curr > 0) {
      const factor = target / curr;
      committedSiteKeys.forEach((k) => updateSplit(k, (splits[k] || 0) * factor));
    } else {
      const per = target / committedSiteKeys.length;
      committedSiteKeys.forEach((k) => updateSplit(k, per));
    }
  };

  // Checking/unchecking only toggles chart/save inclusion — it never mutates the
  // per-site allocations, so a site's volume persists across toggles.
  const handleCheckSite = (key: string) =>
    setPreviewSites((prev) => (prev.includes(key) ? prev : [...prev, key]));
  const handleUncheckSite = (key: string) =>
    setPreviewSites((prev) => prev.filter((s) => s !== key));

  // Mirror the contracted total into capacityPct (consumed by the header and the
  // capacity-view charts) without ever changing the per-site allocations. Skipped
  // for BTM assets, which use their own single capacity-commitment slider.
  useEffect(() => {
    if (!isBTM) setCapacityPct(Math.min(100, totalContractedPct));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalContractedPct, isBTM]);
  return (
    <>
      {/* Contracted volume scaler */}
      <div className="border border-slate-200 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-semibold text-slate-900">Contracted volume</h3>
          <span className="text-xs text-slate-500">
            {totalAllocatedMw} MW committed ({Math.round(totalContractedPct)}% of {projectCapacity || 0} MW capacity)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(totalContractedPct)}
            onChange={(e) => handleContractedChange(Number(e.target.value))}
            className="flex-1 accent-indigo-600"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(totalContractedPct)}
            onChange={(e) => handleContractedChange(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-16 text-right text-sm border border-slate-300 rounded-md px-2 py-1"
          />
          <span className="text-sm text-slate-500 w-12">{Math.round(totalContractedPct)}%</span>
        </div>
      </div>

      {/* Site split controls - Hidden for BTM assets (single site only) */}
      {!isBTM && (
        <div className="border border-slate-200 rounded-lg p-2">
          <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Allocate project across sites</h3>
        <div className="space-y-1.5">
          {ALL_SITE_KEYS.map((key) => {
            const isInScope = selectedSites.includes(key);
            const isPreview = previewSites.includes(key);
            // Always show the site's own persisted allocation, even when unchecked
            // (unchecking only removes it from the chart/save, not its value).
            const pct = Math.round(splits[key] || 0);
            const allocatedMw = r1(siteMw(key));
            return (
              <div key={key} className={`flex items-center gap-3 ${!isInScope ? 'opacity-50' : !isPreview ? 'opacity-60' : ''}`}>
                {isInScope ? (
                  <input
                    type="checkbox"
                    checked={isPreview}
                    onChange={(e) => {
                      if (e.target.checked) handleCheckSite(key);
                      else handleUncheckSite(key);
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
                  onChange={(e) => handleSplitChange(key, Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => handleSplitChange(key, Number(e.target.value))}
                  className="w-16 text-right text-sm border border-slate-300 rounded-md px-2 py-1"
                />
                <span className="text-sm text-slate-500 w-16">{allocatedMw} MW</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 border-t border-slate-100 pt-2">
          <span className="text-xs text-slate-500">
            Total contracted across {committedSiteKeys.length} site{committedSiteKeys.length === 1 ? '' : 's'}
            {totalContractedPct > 100
              ? <span className="text-rose-600 font-medium"> · exceeds max offering</span>
              : atOfferingCap && <span className="text-amber-600 font-medium"> · at max offering</span>}
          </span>
          <span className="text-sm font-semibold text-indigo-600">
            {totalAllocatedMw} <span className="text-slate-400 font-normal">/ {r1(maxOfferingMw)} MW</span>
          </span>
        </div>
      </div>
      )}

      {/* Chart controls */}
      <div className="flex items-center justify-between">
        {/* Year tabs - now on left to match plan page */}
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


        {/* View tabs - now on right to match plan page */}
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
      </div>
    </>
  );
}
