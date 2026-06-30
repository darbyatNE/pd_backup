import { useState, useMemo, useEffect, useCallback } from 'react';
import { useScopeContext } from '../contexts/ScopeContext';
import { API_BASE_URL } from '../services/api';
import { siteContractsForSites, type SiteContractRow } from '../data/siteContractsApi';
import { defaultShapeForGenType } from '../data/linkedContracts';
import { fetchProductSet, type ProductSet } from '../data/projectProductsApi';
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
import { SITE_NAMES } from './tryon/types';

export default function TryOnOverlay({ project, onClose, scopeSite, initialYear, onSaved, allSiteContracts = [], startMinimized = true }: TryOnOverlayProps & { scopeSite?: string; initialYear?: number; onSaved?: () => void; allSiteContracts?: SiteContractRow[]; startMinimized?: boolean }) {
  const { selectedSites, startYear, endYear, startMonth, endMonth } = useScopeContext();

  // ── Save-contract form (persists to RDS public.site_contracts → load chart) ──
  // Amounts are NOT typed in — they come from the "Contracted volume" slider and
  // the per-site allocation (see saveBreakdown below).
  const MONTH_OPTS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [saveStartYear, setSaveStartYear] = useState<number>(startYear);
  const [saveStartMonth, setSaveStartMonth] = useState<number>(startMonth);
  const [saveEndYear, setSaveEndYear] = useState<number>(endYear);
  const [saveEndMonth, setSaveEndMonth] = useState<number>(endMonth);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Already-saved contracts for THIS project (across all data centers). Drives the
  // "Contracted" section and reduces the project volume still available to commit.
  const [projectContracts, setProjectContracts] = useState<SiteContractRow[]>([]);
  const refetchProjectContracts = useCallback(async () => {
    try {
      const token = localStorage.getItem('pd_access_token');
      const res = await fetch(`${API_BASE_URL}/site-contracts`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) { setProjectContracts([]); return; }
      const { contracts } = (await res.json()) as { contracts: SiteContractRow[] };
      setProjectContracts((contracts ?? []).filter((c) => c.project_name === project.name));
    } catch {
      setProjectContracts([]);
    }
  }, [project.name]);
  useEffect(() => { refetchProjectContracts(); }, [refetchProjectContracts]);

  const committedCapacityMw = projectContracts.reduce((s, c) => s + (c.capacity_mw == null ? 0 : Number(c.capacity_mw)), 0);
  const committedEnergyMwh = projectContracts.reduce((s, c) => s + (c.energy_mwh == null ? 0 : Number(c.energy_mwh)), 0);
  // MW-equivalent already committed (energy converted at flat annual MW) → remaining nameplate.
  const committedMwEquivalent = committedCapacityMw + committedEnergyMwh / 8760;
  const availableCapacityMw = Math.max(0, (project.capacity_mw || 0) - committedMwEquivalent);

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
  // Start minimized (default): opens as a compact docked bar so the dashboard
  // stays usable. Deep links from the Projects "Examine" action open expanded.
  const [minimized, setMinimized] = useState(startMinimized);

  // Unbundled components this project OFFERS (from planning.project_products).
  // null while loading; if a project has no product metadata we treat all three
  // as offered so contracting still works. Drives the check/uncheck selectors.
  const [productSet, setProductSet] = useState<ProductSet | null>(null);
  useEffect(() => {
    let alive = true;
    fetchProductSet(project.id).then((s) => { if (alive) setProductSet(s); });
    return () => { alive = false; };
  }, [project.id]);
  const hasAnyProduct = !!productSet && (!!productSet.capacity || !!productSet.energy || !!productSet.rec);
  // A Virtual deal is a financial contract-for-differences: energy only, no
  // capacity or RECs, priced off its LMP node (which is also its location).
  const isVirtual = project.generation_type === 'Virtual';
  const offered = {
    capacity: !isVirtual && (!hasAnyProduct || !!productSet?.capacity),
    energy: isVirtual || !hasAnyProduct || !!productSet?.energy,
    rec: !isVirtual && (!hasAnyProduct || !!productSet?.rec),
  };
  // Which components the user will save/commit. Initialised to whatever's offered.
  const [selectedComponents, setSelectedComponents] = useState({ capacity: false, energy: true, rec: false });
  useEffect(() => {
    setSelectedComponents({ capacity: offered.capacity, energy: offered.energy, rec: offered.rec });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSet, isVirtual]);
  const toggleComponent = (k: 'capacity' | 'energy' | 'rec') =>
    setSelectedComponents((prev) => ({ ...prev, [k]: !prev[k] }));

  // LMP pricing node the deal settles at — entered at creation, shown as the
  // "Pricing LMP" column in the Contracts ledger/portfolio.
  const [lmpNode, setLmpNode] = useState('');

  // BESS configuration state
  const [bessDischargeHours, setBessDischargeHours] = useState<number[]>([15, 16, 17, 18]);
  const [bessChargeHours, setBessChargeHours] = useState<number[]>([0, 1, 2, 3, 4, 5, 24]);
  const [bessEfficiency, setBessEfficiency] = useState(85); // round-trip efficiency %
  const [bessMinimized, setBessMinimized] = useState(true);

  const { splits, updateSplit } = useSiteSplits();

  // For BTM assets in capacity view: limit to one site.
  // Energy view always shows all sites regardless of BTM status.
  const effectiveSites = useMemo(() => {
    if (isBTM && viewMode === 'capacity') {
      // If scopeSite provided (from Capacity tab), use that; otherwise use first selected site
      if (scopeSite) return [scopeSite];
      if (selectedSites.length > 0) return [selectedSites[0]];
    }
    // Follow the checked data centers in the breakout, so toggling a site adds or
    // removes its load from the charted amount.
    return previewSites;
  }, [isBTM, scopeSite, selectedSites, viewMode, previewSites]);

  // Per-data-center volume written to the DB (one row per data center).
  // BTM assets sit at a single site and use the capacity-commitment %. For
  // multi-site deals each checked site carries its OWN absolute allocation
  // (`splits[facId]` = % of the project's available volume) — independent and
  // persistent per site. Commitments draw from the volume still available
  // (nameplate − already committed).
  const effectiveCapacityMw = availableCapacityMw * (capacityPct / 100);
  const saveBreakdown = useMemo(() => {
    if (isBTM) {
      const facId = effectiveSites[0];
      return facId ? [{ facId, mw: effectiveCapacityMw }] : [];
    }
    return previewSites
      .map((facId) => ({ facId, mw: availableCapacityMw * ((splits[facId] || 0) / 100) }))
      .filter((s) => s.mw > 0);
  }, [isBTM, effectiveSites, previewSites, splits, effectiveCapacityMw, availableCapacityMw]);

  const saveContract = async () => {
    if (saveBreakdown.length === 0) {
      setSaveMsg({ kind: 'err', text: 'No volume to save — set the slider and site allocation above.' });
      return;
    }
    if (!selectedComponents.capacity && !selectedComponents.energy && !selectedComponents.rec) {
      setSaveMsg({ kind: 'err', text: 'Select at least one component (Capacity, Energy, or RECs) to contract.' });
      return;
    }
    // REC attributes come from the project's offering; only attachable when fully defined.
    const recFields = selectedComponents.rec && productSet?.rec?.retiring_agency && productSet?.rec?.matching_format
      ? {
          rec_pct: productSet.rec.rec_pct === '' ? null : productSet.rec.rec_pct,
          retiring_agency: productSet.rec.retiring_agency,
          matching_format: productSet.rec.matching_format,
        }
      : {};
    setSaving(true);
    setSaveMsg(null);
    try {
      const token = localStorage.getItem('pd_access_token');
      const headers = { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) };
      const results = await Promise.all(
        saveBreakdown.map(({ facId, mw }) => {
          // One row per data center carrying every selected component:
          // Capacity → MW-year baseload; Energy → annual MWh (flat MW × 8760); RECs → attrs.
          const capacity_mw = selectedComponents.capacity ? Math.round(mw * 100) / 100 : null;
          const energy_mwh = selectedComponents.energy ? Math.round(mw * 8760 * 100) / 100 : null;
          return fetch(`${API_BASE_URL}/site-contracts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              fac_id: facId,
              // Link to the real generation project when contracting one; synthetic
              // (BTM/try-on) projects use non-UUID ids, so store null for those.
              project_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project.id) ? project.id : null,
              project_name: project.name,
              generation_type: project.generation_type,
              capacity_mw,
              energy_mwh,
              lmp_node: lmpNode.trim() || null,
              ...recFields,
              // Charge the deal with its real hourly shape (e.g. a Peaker
              // delivers on the evening peak, not flat across all hours).
              shape: defaultShapeForGenType(project.generation_type),
              start_year: saveStartYear,
              start_month: saveStartMonth,
              end_year: saveEndYear,
              end_month: saveEndMonth,
            }),
          });
        })
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) throw new Error(`${failed} of ${results.length} contract(s) failed to save`);
      setSaveMsg({ kind: 'ok', text: `Saved ${results.length} contract${results.length > 1 ? 's' : ''} — now in the load chart.` });
      await refetchProjectContracts();
      onSaved?.();
    } catch (err) {
      setSaveMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  // Draft (uncommitted) contracts for this project — the only ones Remove/Commit act on.
  const draftContracts = projectContracts.filter((c) => !c.committed);

  const removeDrafts = async () => {
    if (draftContracts.length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const token = localStorage.getItem('pd_access_token');
      const results = await Promise.all(
        draftContracts.map((c) =>
          fetch(`${API_BASE_URL}/site-contracts/${c.id}`, {
            method: 'DELETE',
            headers: { ...(token && { Authorization: `Bearer ${token}` }) },
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) throw new Error(`${failed} of ${results.length} could not be removed`);
      setSaveMsg({ kind: 'ok', text: `Removed ${results.length} draft contract${results.length > 1 ? 's' : ''}.` });
      await refetchProjectContracts();
      onSaved?.();
    } catch (err) {
      setSaveMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Remove failed' });
    } finally {
      setSaving(false);
    }
  };

  const commitDrafts = async () => {
    if (draftContracts.length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const token = localStorage.getItem('pd_access_token');
      const results = await Promise.all(
        draftContracts.map((c) =>
          fetch(`${API_BASE_URL}/site-contracts/${c.id}/commit`, {
            method: 'PUT',
            headers: { ...(token && { Authorization: `Bearer ${token}` }) },
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) throw new Error(`${failed} of ${results.length} could not be committed`);
      setSaveMsg({ kind: 'ok', text: `Committed ${results.length} contract${results.length > 1 ? 's' : ''} — now permanent.` });
      await refetchProjectContracts();
      onSaved?.();
    } catch (err) {
      setSaveMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Commit failed' });
    } finally {
      setSaving(false);
    }
  };

  // Already-saved/committed contracts at the checked data centers — plotted in the
  // try-on chart as the existing position (per data center, via fac_id).
  const existingForSites = useMemo(
    () => siteContractsForSites(allSiteContracts, effectiveSites),
    [allSiteContracts, effectiveSites],
  );

  // First get tryOnData with base project to determine uncontracted capacity
  const baseTryOnData = useTryOnData({
    project,
    previewSites: effectiveSites,
    existingContracts: existingForSites,
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

  // Contract term years span a fixed 2000–2040 range, independent of the scope
  // window, so a contract can be backdated or extended past the current scope.
  const contractYearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = 2000; y <= 2040; y++) out.push(y);
    return out;
  }, []);

  const chartKey = `tryon-${project.id}-${xAxis}-${activeYear}-${previewSites.join(',')}-${Object.values(splits).join(',')}-${capacityPct}`;

  // Minimized: a compact docked bar (no backdrop) so the dashboard stays usable.
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-2xl max-w-[90vw]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">Try On: {project.name}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {project.generation_type} · {project.capacity_mw} MW · minimized
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex-shrink-0 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          Expand
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 text-lg px-1"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 pt-[calc(1rem+50px)]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg overflow-hidden shadow-2xl w-full max-w-5xl max-h-[calc(100vh-80px)] flex flex-col">
        {/* Header */}
        <div className="flex-none flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Try On: {project.name}</h2>
            <p className="text-sm text-slate-500">
              {project.generation_type} · {project.capacity_mw} MW · {project.zone || project.location}
              {capacityPct !== 100 && (
                <span className="text-slate-400"> · Commitment: {r1(availableCapacityMw * (capacityPct / 100))} MW</span>
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
              onClick={() => setMinimized(true)}
              title="Minimize"
              className="text-slate-400 hover:text-slate-600 text-xl font-light px-2 leading-none"
            >
              –
            </button>
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
          {/* Contracted — what's already been committed from this project */}
          {projectContracts.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold text-slate-900">Contracted</h3>
                <span className="text-[11px] text-slate-500">
                  {r1(committedCapacityMw)} MW{committedEnergyMwh > 0 ? ` · ${r1(committedEnergyMwh).toLocaleString()} MWh/yr` : ''} committed · {r1(availableCapacityMw)} MW available
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="text-left py-1 px-2 font-semibold">Data center</th>
                      <th className="text-right py-1 px-2 font-semibold">Capacity</th>
                      <th className="text-right py-1 px-2 font-semibold">Energy</th>
                      <th className="text-left py-1 px-2 font-semibold">Term</th>
                      <th className="text-left py-1 px-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectContracts.map((c) => {
                      const cap = c.capacity_mw == null ? 0 : Number(c.capacity_mw);
                      const energy = c.energy_mwh == null ? 0 : Number(c.energy_mwh);
                      const term = `${MONTH_OPTS[c.start_month - 1]} '${String(c.start_year).slice(-2)} – ${MONTH_OPTS[c.end_month - 1]} '${String(c.end_year).slice(-2)}`;
                      return (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="py-1 px-2 text-slate-700">{SITE_NAMES[c.fac_id] ?? c.fac_id}</td>
                          <td className="py-1 px-2 text-right text-slate-700">{cap > 0 ? `${r1(cap)} MW` : '—'}</td>
                          <td className="py-1 px-2 text-right text-slate-700">{energy > 0 ? `${r1(energy).toLocaleString()} MWh/yr` : '—'}</td>
                          <td className="py-1 px-2 text-slate-500">{term}</td>
                          <td className="py-1 px-2">
                            {c.committed ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">🔒 Committed</span>
                            ) : (
                              <span className="text-slate-400">Draft</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Save Contract — amounts come from the volume slider + site allocation below */}
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Save Contract to Load Chart</h3>
                <p className="text-[11px] text-slate-500">
                  {project.generation_type} · one contract per data center — choose which unbundled components to contract below
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Save / Remove act on this project's SAVED (contract-pending) rows */}
                <button
                  type="button"
                  onClick={saveContract}
                  disabled={saving || saveBreakdown.length === 0}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                >
                  {saving ? 'Saving…' : `Save ${saveBreakdown.length || ''} Contract${saveBreakdown.length === 1 ? '' : 's'}`}
                </button>
                <button
                  type="button"
                  onClick={removeDrafts}
                  disabled={saving || draftContracts.length === 0}
                  title="Delete this project's saved (contract-pending) contracts"
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-semibold rounded transition-colors"
                >
                  Remove Saved Contracts
                </button>

                {/* Divider separates the Commit action — it acts on the saved
                    contracts but is a distinct, irreversible step. */}
                <span className="w-px h-6 bg-slate-300 mx-1.5" aria-hidden="true" />

                <button
                  type="button"
                  onClick={commitDrafts}
                  disabled={saving || draftContracts.length === 0}
                  title="Commit to contracting — moves the saved contracts forward for decision. Saved-but-uncommitted contracts chart as Exploring (white pattern); committed ones chart as Contract-pending (brown); accepted ones chart as Contracted (solid black)."
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
                >
                  Commit to Contracting
                </button>
              </div>
            </div>

            {/* Unbundled components to contract — check/uncheck before save/commit.
                Components the project doesn't offer are disabled and flagged. */}
            <div className="bg-white border border-slate-200 rounded p-2 mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Components to contract</span>
                {productSet && !hasAnyProduct && (
                  <span className="text-[10px] text-slate-400 italic">no product profile — all available</span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {([
                  { key: 'capacity' as const, label: 'Capacity (MW)' },
                  { key: 'energy' as const, label: 'Energy (MWh)' },
                  { key: 'rec' as const, label: 'RECs' },
                ]).map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-1.5 text-xs ${offered[key] ? 'text-slate-700 cursor-pointer' : 'text-slate-400'}`}
                    title={offered[key] ? `Contract the ${label} component` : 'Not offered by this project'}
                  >
                    <input
                      type="checkbox"
                      disabled={!offered[key]}
                      checked={offered[key] && selectedComponents[key]}
                      onChange={() => toggleComponent(key)}
                      className="w-3.5 h-3.5 accent-teal-600 disabled:opacity-50"
                    />
                    <span className={offered[key] ? '' : 'line-through'}>{label}</span>
                    {!offered[key] && <span className="text-[10px] italic">not offered</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* Pricing LMP node — settlement point the deal prices at. For a
                Virtual (CfD) deal this node is also the deal's location. */}
            <div className="bg-white border border-slate-200 rounded p-2 mb-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <span className="font-semibold uppercase tracking-wide text-[11px] text-slate-600 whitespace-nowrap">Pricing LMP node</span>
                <input
                  type="text"
                  value={lmpNode}
                  onChange={(e) => setLmpNode(e.target.value)}
                  placeholder="e.g. DOM, WESTERN HUB, or a specific pnode"
                  className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-xs focus:border-teal-400 focus:outline-none"
                />
              </label>
              {isVirtual && (
                <p className="text-[10px] text-slate-400 mt-1">Virtual deal — energy-only CfD priced and located at this LMP node.</p>
              )}
            </div>

            {/* How committing affects the chart */}
            <p className="text-[11px] text-slate-500 mb-2 leading-snug">
              <span className="font-semibold text-slate-700">Commit to Contracting</span> moves the saved
              contracts forward for decision. Saved-but-uncommitted contracts chart as{' '}
              <span className="font-semibold">Exploring</span> (white pattern); once committed they chart as{' '}
              <span className="font-semibold">Contract-pending</span> (brown), and as{' '}
              <span className="font-semibold">Contracted</span> (solid black) once accepted.
            </p>

            {/* Per-data-center amounts (from the slider × allocation) */}
            <div className="bg-white border border-slate-200 rounded p-2 mb-2">
              {saveBreakdown.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Set the volume slider and site allocation below to populate amounts.</p>
              ) : (
                <div className="space-y-0.5 text-[11px]">
                  {saveBreakdown.map(({ facId, mw }) => (
                    <div key={facId} className="flex items-center justify-between">
                      <span className="text-slate-600">{SITE_NAMES[facId] ?? facId}</span>
                      <span className="font-medium text-slate-800">
                        {viewMode === 'capacity'
                          ? `${r1(mw)} MW`
                          : `${r1(mw * 8760).toLocaleString()} MWh/yr`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500">Term start</span>
                <div className="flex gap-1">
                  <select value={saveStartMonth} onChange={(e) => setSaveStartMonth(Number(e.target.value))} className="bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-700">
                    {MONTH_OPTS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={saveStartYear} onChange={(e) => setSaveStartYear(Number(e.target.value))} className="bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-700">
                    {contractYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500">Term end</span>
                <div className="flex gap-1">
                  <select value={saveEndMonth} onChange={(e) => setSaveEndMonth(Number(e.target.value))} className="bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-700">
                    {MONTH_OPTS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={saveEndYear} onChange={(e) => setSaveEndYear(Number(e.target.value))} className="bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-700">
                    {contractYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </label>
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-500">Generation type</span>
                <span className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700">{project.generation_type}</span>
              </div>
            </div>
            {saveMsg && (
              <p className={`mt-2 text-[11px] font-medium ${saveMsg.kind === 'ok' ? 'text-teal-700' : 'text-red-600'}`}>{saveMsg.text}</p>
            )}
          </div>

          {viewMode === 'energy' && (
            <TryOnControls
              isBTM={isBTM}
              projectCapacity={availableCapacityMw}
              capacityPct={capacityPct}
              setCapacityPct={setCapacityPct}
              selectedSites={selectedSites}
              previewSites={previewSites}
              setPreviewSites={setPreviewSites}
              splits={splits}
              updateSplit={updateSplit}
              xAxis={xAxis}
              setXAxis={setXAxis}
              activeYear={activeYear}
              setActiveYear={setActiveYear}
              yearOptions={yearOptions}
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
                    {Math.round(capacityPct)}%
                  </span>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Effective Capacity: {r1(availableCapacityMw * (capacityPct / 100))} MW
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
                effectiveCapacity={availableCapacityMw * (capacityPct / 100)}
                sites={effectiveSites}
                startYear={startYear}
                endYear={endYear}
                projectName={project.name}
                existingContracts={existingContracts}
                termStartYear={saveStartYear}
                termStartMonth={saveStartMonth}
                termEndYear={saveEndYear}
                termEndMonth={saveEndMonth}
              />

              <TryOnCapacityChart
                effectiveCapacity={availableCapacityMw * (capacityPct / 100)}
                sites={effectiveSites}
                startYear={startYear}
                endYear={endYear}
                projectName={project.name}
                existingContracts={existingContracts}
                termStartYear={saveStartYear}
                termStartMonth={saveStartMonth}
                termEndYear={saveEndYear}
                termEndMonth={saveEndMonth}
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
              <p><span className="text-slate-500">Capacity:</span> <span className="font-medium">{r1(availableCapacityMw * (capacityPct / 100))} MW</span></p>
              <p><span className="text-slate-500">Sites:</span> <span className="font-medium">{viewMode === 'energy' ? previewSites.length : effectiveSites.length}</span></p>
            </div>
          }
        />
      )}
    </div>
  );
}
