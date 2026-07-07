import { useMemo, useState } from 'react';
import { useScopeContext } from '../contexts/ScopeContext';
import { useDashboardView } from '../contexts/DashboardViewContext';
import { LOAD_PROFILES } from '../data/loadProfile';
import {
  SCOPE_DIMENSIONS,
  resolveFilter,
  type FilterCriteria,
  type SiteAttrs,
} from '../data/scopeDimensions';

const SHORT_NAMES: Record<string, string> = {
  'ashburn-dc':          'Ashburn DC',
  'manassas-industrial': 'Manassas Ind.',
  'sterling-hyperscale': 'Sterling HC',
};

// Helper to format site key into readable name
function formatSiteName(siteKey: string): string {
  if (SHORT_NAMES[siteKey]) return SHORT_NAMES[siteKey];
  return siteKey
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS = Array.from({ length: 2050 - 2026 + 1 }, (_, i) => 2026 + i);

interface ScopeBarProps {
  fullWidth?: boolean;
}

type EditorTab = 'sites' | 'dimension' | 'groups';

export default function ScopeBar({ fullWidth = false }: ScopeBarProps) {
  const {
    selectedSites, availableSites, siteAttributes, selection, customGroups,
    startYear, startMonth, endYear, endMonth,
    loading, toggleSite, addSite, setStartDate, setEndDate,
    applyFilter, applyGroup, saveGroup, deleteGroup,
  } = useScopeContext();

  const siteInfoList = availableSites.map(siteKey => {
    const profile = LOAD_PROFILES.find(p => p.siteKey === siteKey);
    return {
      siteKey,
      name: profile?.name || formatSiteName(siteKey),
      shortName: SHORT_NAMES[siteKey] || formatSiteName(siteKey),
    };
  });

  const { view } = useDashboardView();
  const isProfileView = view === 'profile';

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<EditorTab>('sites');
  const [newSiteName, setNewSiteName] = useState('');
  const [draftCriteria, setDraftCriteria] = useState<FilterCriteria>({});
  const [newGroupName, setNewGroupName] = useState('');

  const dateRangeLabel = `${MONTH_NAMES[startMonth - 1]} ${startYear} – ${MONTH_NAMES[endMonth - 1]} ${endYear}`;

  // Attributes restricted to the sites the user can actually scope/render.
  const availableAttrs = useMemo<Record<string, SiteAttrs>>(() => {
    const out: Record<string, SiteAttrs> = {};
    for (const k of availableSites) if (siteAttributes[k]) out[k] = siteAttributes[k];
    return out;
  }, [availableSites, siteAttributes]);
  const attrList = useMemo(() => Object.values(availableAttrs), [availableAttrs]);

  // Dimensions that actually have selectable values for the current sites.
  const activeDimensions = useMemo(
    () => SCOPE_DIMENSIONS.map((d) => ({ dim: d, options: d.optionsFrom(attrList) }))
      .filter((x) => x.options.length > 0),
    [attrList],
  );

  const previewCount = useMemo(
    () => resolveFilter(draftCriteria, availableAttrs).filter((k) => availableSites.includes(k)).length,
    [draftCriteria, availableAttrs, availableSites],
  );

  const toggleDraft = (dimKey: string, value: string) => {
    setDraftCriteria((prev) => {
      const cur = prev[dimKey] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [dimKey]: next };
    });
  };

  const selectionChip = () => {
    if (selection.mode === 'filter') return `Filter: ${selection.label || 'custom'} · ${selectedSites.length} sites`;
    if (selection.mode === 'group') return `Group: ${selection.name} · ${selectedSites.length} sites`;
    return null;
  };
  const chip = selectionChip();

  return (
    <div className="relative border-t border-slate-100 bg-slate-50/60">
      <div className={`mx-auto flex min-h-10 items-center gap-3 px-4 sm:px-6 lg:px-8 py-1.5 ${fullWidth ? 'max-w-full' : 'max-w-7xl'}`}>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex-shrink-0">
          Scope
        </span>

        <div className="flex items-center gap-1.5 flex-wrap">
          {loading ? (
            <span className="text-xs text-slate-400">Loading sites...</span>
          ) : chip ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              <span aria-hidden>◆</span> {chip}
            </span>
          ) : siteInfoList.length === 0 ? (
            <span className="text-xs text-slate-400">No sites available</span>
          ) : (
            siteInfoList.map((site) => {
              const checked = selectedSites.includes(site.siteKey);
              return (
                <span
                  key={site.siteKey}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                    checked
                      ? 'bg-teal-50 border-teal-200 text-teal-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
                  }`}
                  title={checked ? `${site.shortName} — in scope` : `${site.shortName} — out of scope`}
                >
                  <span aria-hidden className={checked ? 'text-teal-600' : 'text-slate-300'}>
                    {checked ? '✓' : '○'}
                  </span>
                  {site.shortName}
                </span>
              );
            })
          )}
        </div>

        {!isProfileView && (
          <>
            <span className="w-px h-4 bg-slate-200 flex-shrink-0" />
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
              <span aria-hidden className="text-slate-400">📅</span>
              {dateRangeLabel}
            </span>
          </>
        )}

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <span aria-hidden>⚙</span> Edit scope
        </button>
      </div>

      {/* ── Editor popover ────────────────────────────────────────────────── */}
      {editing && (
        <div className="absolute right-4 sm:right-6 lg:right-8 top-full z-30 mt-1 w-[560px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-100 px-3 pt-2">
            {([['sites', 'By site'], ['dimension', 'By dimension'], ['groups', 'Saved groups']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                  tab === k ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ml-auto text-slate-400 hover:text-slate-700 text-sm px-2"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {/* ── By site ── */}
            {tab === 'sites' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {siteInfoList.length === 0 ? (
                    <span className="text-xs text-slate-400">No sites available</span>
                  ) : (
                    siteInfoList.map((site) => {
                      const checked = selectedSites.includes(site.siteKey);
                      return (
                        <label key={site.siteKey} className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSite(site.siteKey)}
                            className="w-3.5 h-3.5 rounded accent-teal-600 cursor-pointer"
                          />
                          <span className={`text-xs font-medium transition-colors ${checked ? 'text-slate-700' : 'text-slate-400'}`}>
                            {site.shortName}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {isProfileView && (
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Add site</span>
                    <input
                      type="text"
                      value={newSiteName}
                      onChange={(e) => setNewSiteName(e.target.value)}
                      placeholder="Site name..."
                      className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 text-xs outline-none w-40"
                    />
                    <button
                      onClick={() => {
                        if (newSiteName.trim()) {
                          addSite(newSiteName.toLowerCase().replace(/\s+/g, '-'));
                          setNewSiteName('');
                        }
                      }}
                      disabled={!newSiteName.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      + Add
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── By dimension ── */}
            {tab === 'dimension' && (
              <div className="space-y-3">
                {attrList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    No grouping attributes available for these sites yet. Attributes are populated from the
                    facility profile — scope by site or saved group in the meantime.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {activeDimensions.map(({ dim, options }) => (
                        <div key={dim.key}>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{dim.label}</div>
                          <div className="flex flex-col gap-0.5">
                            {options.map((opt) => {
                              const on = (draftCriteria[dim.key] ?? []).includes(opt.value);
                              return (
                                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none text-xs">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => toggleDraft(dim.key, opt.value)}
                                    className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                                  />
                                  <span className={on ? 'text-slate-800 font-medium' : 'text-slate-600'}>{opt.label}</span>
                                  <span className="text-slate-300">({opt.count})</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">
                        <span className="font-semibold text-slate-800">{previewCount}</span> site{previewCount !== 1 ? 's' : ''} in scope
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDraftCriteria({})}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          disabled={previewCount === 0}
                          onClick={() => { applyFilter(draftCriteria); setEditing(false); }}
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Saved groups ── */}
            {tab === 'groups' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  {customGroups.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No saved groups yet.</p>
                  ) : (
                    customGroups.map((g) => (
                      <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{g.name}</div>
                          <div className="text-[10px] text-slate-400">{g.members.length} site{g.members.length !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => { applyGroup(g); setEditing(false); }}
                            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteGroup(g.id)}
                            className="text-slate-400 hover:text-red-600 text-xs px-1"
                            title="Delete group"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Save current</span>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 text-xs outline-none flex-1"
                  />
                  <button
                    type="button"
                    disabled={!newGroupName.trim()}
                    onClick={async () => {
                      if (!newGroupName.trim()) return;
                      await saveGroup(newGroupName.trim(), selectedSites);
                      setNewGroupName('');
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  Saves the {selectedSites.length} currently-scoped site{selectedSites.length !== 1 ? 's' : ''} as a reusable group.
                </p>
              </div>
            )}

            {/* Date range — always available (non-profile) */}
            {!isProfileView && (
              <div className="flex items-center gap-2 text-xs flex-wrap border-t border-slate-100 mt-3 pt-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Range</span>
                <select value={startMonth} onChange={(e) => setStartDate(startYear, Number(e.target.value))}
                  className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300">
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={startYear} onChange={(e) => setStartDate(Number(e.target.value), startMonth)}
                  className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300">
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-slate-400 font-medium">→</span>
                <select value={endMonth} onChange={(e) => setEndDate(endYear, Number(e.target.value))}
                  className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300">
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={endYear} onChange={(e) => setEndDate(Number(e.target.value), endMonth)}
                  className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300">
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
