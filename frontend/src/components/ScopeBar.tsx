import { useState } from 'react';
import { useScopeContext } from '../contexts/ScopeContext';
import { useDashboardView } from '../contexts/DashboardViewContext';
import { LOAD_PROFILES } from '../data/loadProfile';

const SHORT_NAMES: Record<string, string> = {
  'ashburn-dc':          'Ashburn DC',
  'manassas-industrial': 'Manassas Ind.',
  'sterling-hyperscale': 'Sterling HC',
};

// Helper to format site key into readable name
function formatSiteName(siteKey: string): string {
  // If we have a short name defined, use it
  if (SHORT_NAMES[siteKey]) return SHORT_NAMES[siteKey];
  
  // Otherwise, format the key: 'my-new-site' -> 'My New Site'
  return siteKey
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS = [2026, 2027, 2028, 2029, 2030];

interface ScopeBarProps {
  fullWidth?: boolean;
}

export default function ScopeBar({ fullWidth = false }: ScopeBarProps) {
  const {
    selectedSites, availableSites, startYear, startMonth, endYear, endMonth,
    loading, toggleSite, addSite, setStartDate, setEndDate,
  } = useScopeContext();
  
  // Get display info for each available site
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

  // Filter elements (checkboxes + date dropdowns) collapse to a tag-style
  // summary by default; click "Edit scope" to reveal the editor.
  const [editing, setEditing] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');

  const dateRangeLabel = `${MONTH_NAMES[startMonth - 1]} ${startYear} – ${MONTH_NAMES[endMonth - 1]} ${endYear}`;

  return (
    <div className="border-t border-slate-100 bg-slate-50/60">
      <div className={`mx-auto flex min-h-10 items-center gap-3 px-4 sm:px-6 lg:px-8 py-1.5 ${fullWidth ? 'max-w-full' : 'max-w-7xl'}`}>

        {!editing ? (
          /* ── Compact summary: site tags + date range (non-profile) / add site (profile) ── */
          <>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex-shrink-0">
              Scope
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {loading ? (
                <span className="text-xs text-slate-400">Loading sites...</span>
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
              onClick={() => setEditing(true)}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <span aria-hidden>⚙</span> Edit scope
            </button>
          </>
        ) : (
          /* ── Editor: site checkboxes + date range OR add site ── */
          <>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex-shrink-0">
              Sites
            </span>
            <div className="flex items-center gap-4 flex-wrap">
              {loading ? (
                <span className="text-xs text-slate-400">Loading...</span>
              ) : siteInfoList.length === 0 ? (
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

            <span className="w-px h-4 bg-slate-200 flex-shrink-0" />

            {isProfileView ? (
              /* Profile: Add Site functionality */
              <>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex-shrink-0">
                  Add Site
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    placeholder="Site name..."
                    className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 text-xs outline-none w-32"
                  />
                  <button
                    onClick={() => {
                      if (newSiteName.trim()) {
                        const siteKey = newSiteName.toLowerCase().replace(/\s+/g, '-');
                        addSite(siteKey);
                        setNewSiteName('');
                      }
                    }}
                    disabled={!newSiteName.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    <span>+</span> Add
                  </button>
                </div>
              </>
            ) : (
              /* Non-Profile: Date range selectors */
              <>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex-shrink-0">
                  Range
                </span>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <select
                    value={startMonth}
                    onChange={(e) => setStartDate(startYear, Number(e.target.value))}
                    className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={startYear}
                    onChange={(e) => setStartDate(Number(e.target.value), startMonth)}
                    className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300"
                  >
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>

                  <span className="text-slate-400 font-medium">→</span>

                  <select
                    value={endMonth}
                    onChange={(e) => setEndDate(endYear, Number(e.target.value))}
                    className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={endYear}
                    onChange={(e) => setEndDate(Number(e.target.value), endMonth)}
                    className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 text-xs outline-none cursor-pointer hover:border-slate-300"
                  >
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
