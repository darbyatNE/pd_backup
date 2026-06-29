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
  onCommit?: () => void;
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
  onCommit,
  isBTM,
}: TryOnControlsProps) {
  // Each data-center slider shows an ABSOLUTE allocation as a % of the project's
  // max offering. The "Contracted volume" (capacityPct) is the SUM of those
  // allocations, so it changes whenever a site slider moves. Internally we still
  // store normalized shares (`splits`, summing to 100 across the checked sites)
  // plus the magnitude (`capacityPct`), which is what the save/chart math expects
  // — but the UI is driven by, and reports, the absolute per-site amounts.
  const committedSiteKeys = ALL_SITE_KEYS.filter((k) => previewSites.includes(k));
  const maxOfferingMw = projectCapacity || 0;
  // Absolute allocation for a site, as a % of the offering (0–100).
  const siteAbsPct = (k: string) => (capacityPct * (splits[k] || 0)) / 100;
  const siteMw = (k: string) => (maxOfferingMw * siteAbsPct(k)) / 100;
  const totalAllocatedMw = r1(committedSiteKeys.reduce((sum, k) => sum + siteMw(k), 0));
  const atOfferingCap = capacityPct >= 100;

  // Re-derive capacityPct (the summed magnitude) and the normalized shares from a
  // target set of absolute per-site %s, over the given checked-site list.
  // Kept at full precision (NOT rounded) so moving one site's slider reconstructs
  // every other site's absolute allocation exactly — zero cross-talk. Rounding is
  // applied only for display.
  const applyAbsolute = (keys: string[], absByKey: Record<string, number>) => {
    const abs = (k: string) => absByKey[k] ?? siteAbsPct(k);
    const total = Math.min(100, keys.reduce((s, k) => s + abs(k), 0));
    setCapacityPct(total);
    keys.forEach((k) => updateSplit(k, total > 0 ? (abs(k) / total) * 100 : 0));
  };

  // Drag a single site: clamp it to the remaining headroom so the offering total
  // never exceeds 100%, then re-derive the contracted volume + shares.
  const handleSplitChange = (key: string, requestedAbsPct: number) => {
    if (!previewSites.includes(key)) return;
    const others = committedSiteKeys.filter((k) => k !== key).reduce((s, k) => s + siteAbsPct(k), 0);
    const v = Math.max(0, Math.min(requestedAbsPct, 100 - others));
    applyAbsolute(committedSiteKeys, { [key]: v });
  };

  // Check/uncheck a site. The resync effect below recomputes the contracted
  // volume + shares once previewSites changes, so the handlers just toggle.
  const handleCheckSite = (key: string) =>
    setPreviewSites((prev) => (prev.includes(key) ? prev : [...prev, key]));
  const handleUncheckSite = (key: string) =>
    setPreviewSites((prev) => prev.filter((s) => s !== key));

  // Keep capacityPct (the magnitude consumed by the save/chart math) and the
  // normalized shares consistent with the actual per-site allocations — on mount
  // and whenever the set of checked sites changes (e.g. a partial scope where the
  // default shares don't sum to 100 over the checked sites).
  useEffect(() => {
    applyAbsolute(committedSiteKeys, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSites.join(',')]);
  return (
    <>
      {/* Contracted volume scaler */}
      <div className="border border-slate-200 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-semibold text-slate-900">Contracted volume</h3>
          <span className="text-xs text-slate-500">
            {r1((projectCapacity || 0) * (capacityPct / 100))} MW committed ({Math.round(capacityPct)}% of {projectCapacity || 0} MW capacity)
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
            value={Math.round(capacityPct)}
            onChange={(e) => setCapacityPct(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-16 text-right text-sm border border-slate-300 rounded-md px-2 py-1"
          />
          <span className="text-sm text-slate-500 w-12">{Math.round(capacityPct)}%</span>
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
            const pct = isPreview ? Math.round(siteAbsPct(key)) : 0;
            const allocatedMw = r1(isPreview ? siteMw(key) : 0);
            return (
              <div key={key} className={`flex items-center gap-3 ${!isInScope ? 'opacity-50' : ''}`}>
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
            {atOfferingCap && <span className="text-amber-600 font-medium"> · at max offering</span>}
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

        {/* Commit button - appears in middle when shape has been adjusted */}
        {totalAllocatedMw > 0 && onCommit && (
          <button
            type="button"
            onClick={onCommit}
            className="text-xs font-semibold px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
          >
            Commit to Contracting
          </button>
        )}

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
