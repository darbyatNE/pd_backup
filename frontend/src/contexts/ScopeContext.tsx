import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../services/api';
import { LOAD_PROFILE_MAP } from '../data/loadProfile';
import {
  resolveFilter,
  labelForCriteria,
  type SiteAttrs,
  type FilterCriteria,
} from '../data/scopeDimensions';
import type { PeakMode } from '../data/peakCalendar';

// How the current scope was defined — drives only the summary label. The set of
// site keys always lives in selectedSites (filters snapshot to a fixed set).
export type ScopeSelection =
  | { mode: 'sites' }
  | { mode: 'filter'; label: string; criteria: FilterCriteria }
  | { mode: 'group'; groupId: string; name: string };

export interface CustomGroup {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  members: string[];
}

export interface ScopeState {
  selectedSites: string[];         // site keys currently checked
  availableSites: string[];        // all sites user has access to (from DB)
  siteAttributes: Record<string, SiteAttrs>; // grouping attributes per FAC_ID
  selection: ScopeSelection;       // how the scope was defined (label only)
  customGroups: CustomGroup[];     // saved company/user groups
  startYear: number;
  startMonth: number;              // 1–12
  endYear: number;
  endMonth: number;                // 1–12
  peakMode: PeakMode;              // all | onpeak (5×16) | offpeak | custom HE range
  startHE: number;                 // hour-ending 1–24 (custom range start)
  endHE: number;                   // hour-ending 1–24 (custom range end)
  loading: boolean;                // loading sites from DB
  error: string | null;            // error fetching sites
}

interface ScopeContextValue extends ScopeState {
  toggleSite: (key: string) => void;
  addSite: (key: string) => void;
  removeSite: (key: string) => void;
  selectOnlySite: (key: string) => void;  // scope to a single data center
  peekActive: boolean;                     // true while temporarily scoped to one DC
  peekSite: (key: string) => void;         // temporarily scope to one DC (snapshots current scope)
  endPeek: () => void;                     // restore the snapshotted scope
  setStartDate: (year: number, month: number) => void;
  setEndDate: (year: number, month: number) => void;
  setPeakMode: (mode: PeakMode) => void;                 // all | onpeak | offpeak
  setHERange: (startHE: number, endHE: number) => void;  // sets a custom HE range
  refreshSites: () => Promise<void>;  // manual refresh from DB
  applyFilter: (criteria: FilterCriteria) => void;   // snapshot dimension filter → scope
  applyGroup: (group: CustomGroup) => void;          // snapshot saved group → scope
  fetchGroups: () => Promise<void>;
  saveGroup: (name: string, members: string[], color?: string, description?: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

// Fallback sites if DB fetch fails or returns empty
const FALLBACK_SITE_KEYS = ['ashburn-dc', 'manassas-industrial', 'sterling-hyperscale'];

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [siteAttributes, setSiteAttributes] = useState<Record<string, SiteAttrs>>({});
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);
  const [selection, setSelection] = useState<ScopeSelection>({ mode: 'sites' });
  const [startYear,  setStartYear]  = useState(2026);
  const [startMonth, setStartMonth] = useState(1);
  const [endYear,    setEndYear]    = useState(2028);
  const [endMonth,   setEndMonth]   = useState(12);
  const [peakMode,   setPeakMode]   = useState<PeakMode>('all');
  const [startHE,    setStartHE]    = useState(1);
  const [endHE,      setEndHE]      = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch sites from the RDS data_centers table for the logged-in user (via the backend API)
  const fetchSites = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!user) {
        // No user logged in - use fallback sites
        setAvailableSites(FALLBACK_SITE_KEYS);
        setSelectedSites(FALLBACK_SITE_KEYS);
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('pd_access_token');
      const res = await fetch(
        `${API_BASE_URL}/datacenters?buyer_id=${encodeURIComponent(user.id)}`,
        { headers: { ...(token && { Authorization: `Bearer ${token}` }) } }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to fetch sites' }));
        throw new Error(err.error || `Failed to fetch sites (${res.status})`);
      }

      const { data } = (await res.json()) as { data: Array<{ FAC_ID: string }> };

      if (data && data.length > 0) {
        // Only use DB keys that have a known load profile; fall back if none match
        const dbKeys = data.map((row) => row.FAC_ID as string);
        const knownKeys = dbKeys.filter((k) => k in LOAD_PROFILE_MAP);
        const siteKeys = knownKeys.length > 0 ? knownKeys : FALLBACK_SITE_KEYS;
        setAvailableSites(siteKeys);
        setSelectedSites(siteKeys);
      } else {
        // No sites in DB for this user - use fallback
        console.warn('No sites found in DB for user', user.id, '- using fallback sites');
        setAvailableSites(FALLBACK_SITE_KEYS);
        setSelectedSites(FALLBACK_SITE_KEYS);
      }
    } catch (err) {
      console.error('Unexpected error fetching sites:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sites');
      // Fall back to hardcoded sites
      setAvailableSites(FALLBACK_SITE_KEYS);
      setSelectedSites(FALLBACK_SITE_KEYS);
    } finally {
      setLoading(false);
    }
  };

  // Fetch sites on mount and whenever auth state changes (login/logout).
  useEffect(() => {
    fetchSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const authHeaders = () => {
    const token = localStorage.getItem('pd_access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Per-site grouping attributes (drives the dimension-based scope editor).
  const fetchAttributes = async () => {
    if (!user) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/planning/site-attributes?buyer_id=${encodeURIComponent(user.id)}`,
        { headers: { ...authHeaders() } },
      );
      if (!res.ok) return;
      const { attributes } = (await res.json()) as { attributes: Record<string, SiteAttrs> };
      setSiteAttributes(attributes ?? {});
    } catch {
      /* attributes are best-effort; the by-site editor still works without them */
    }
  };

  const fetchGroups = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/planning/groups`, { headers: { ...authHeaders() } });
      if (!res.ok) return;
      const { groups } = (await res.json()) as { groups: CustomGroup[] };
      setCustomGroups(groups ?? []);
    } catch {
      /* groups are best-effort */
    }
  };

  useEffect(() => {
    fetchAttributes();
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveGroup = async (name: string, members: string[], color?: string, description?: string) => {
    if (!user) return;
    const res = await fetch(`${API_BASE_URL}/planning/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name, members, color, description }),
    });
    if (res.ok) await fetchGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!user) return;
    const res = await fetch(`${API_BASE_URL}/planning/groups/${id}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    if (res.ok) {
      setCustomGroups((prev) => prev.filter((g) => g.id !== id));
    }
  };

  // Snapshot a dimension filter to a fixed scope set. Only sites we can render
  // (in availableSites) are scoped; a filter that matches nothing is a no-op so
  // the scope is never emptied (downstream consumers expect ≥1 site).
  const applyFilter = (criteria: FilterCriteria) => {
    const resolved = resolveFilter(criteria, siteAttributes);
    const inScope = resolved.filter((k) => availableSites.includes(k));
    const finalSites = inScope.length > 0 ? inScope : resolved;
    if (finalSites.length === 0) return;
    setSelectedSites(finalSites);
    setSelection({ mode: 'filter', label: labelForCriteria(criteria), criteria });
  };

  const applyGroup = (group: CustomGroup) => {
    const members = group.members ?? [];
    if (members.length === 0) return;
    // Group members are real saved site keys; make sure they're renderable.
    setAvailableSites((prev) => Array.from(new Set([...prev, ...members])));
    setSelectedSites(members);
    setSelection({ mode: 'group', groupId: group.id, name: group.name });
  };

  const toggleSite = (key: string) => {
    setSelection({ mode: 'sites' });
    setSelectedSites((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      // Only allow toggling to available sites
      if (availableSites.includes(key)) {
        return [...prev, key];
      }
      return prev;
    });
  };

  const addSite = (key: string) => {
    setSelection({ mode: 'sites' });
    setSelectedSites((prev) => {
      if (prev.includes(key)) return prev;
      // Only allow adding available sites
      if (availableSites.includes(key)) {
        return [...prev, key];
      }
      return prev;
    });
  };

  const removeSite = (key: string) => {
    setSelection({ mode: 'sites' });
    setSelectedSites((prev) => {
      return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
    });
  };

  // Scope to a single data center. If the key isn't a known site, also make it
  // available so the chart can render it.
  const selectOnlySite = (key: string) => {
    setSelection({ mode: 'sites' });
    setAvailableSites((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setSelectedSites([key]);
  };

  // Temporary single-DC "peek" (from the map's View Load). Snapshots the current
  // scope so endPeek() can restore it — the multi-site scope stays the persistent view.
  const [peekSnapshot, setPeekSnapshot] = useState<string[] | null>(null);
  const peekSite = (key: string) => {
    setPeekSnapshot((prev) => (prev === null ? selectedSites : prev));
    setAvailableSites((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setSelectedSites([key]);
  };
  const endPeek = () => {
    if (peekSnapshot !== null) setSelectedSites(peekSnapshot);
    setPeekSnapshot(null);
  };

  // Persist the scope across reloads. Restore once after sites load, then save
  // on change. The restoredRef gate prevents the load-time "select all" render
  // from overwriting the saved scope before we've restored it.
  const restoredRef = useRef(false);
  const SCOPE_STORE_KEY = 'pd_scope_v1';
  useEffect(() => {
    if (restoredRef.current || loading || availableSites.length === 0) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(SCOPE_STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { selectedSites?: string[]; selection?: ScopeSelection; startHE?: number; endHE?: number; peakMode?: PeakMode };
      const valid = (saved.selectedSites ?? []).filter((k) => availableSites.includes(k));
      if (valid.length > 0) {
        setSelectedSites(valid);
        if (saved.selection) setSelection(saved.selection);
      }
      if (saved.startHE != null) setStartHE(Math.max(1, Math.min(24, saved.startHE)));
      if (saved.endHE != null) setEndHE(Math.max(1, Math.min(24, saved.endHE)));
      if (saved.peakMode) setPeakMode(saved.peakMode);
    } catch { /* ignore malformed storage */ }
  }, [loading, availableSites]);
  useEffect(() => {
    if (!restoredRef.current || peekSnapshot !== null || selectedSites.length === 0) return;
    try {
      localStorage.setItem(SCOPE_STORE_KEY, JSON.stringify({ selectedSites, selection, startHE, endHE, peakMode }));
    } catch { /* ignore quota errors */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSites, selection, startHE, endHE, peakMode]);

  const setStartDate = (year: number, month: number) => {
    setStartYear(year);
    setStartMonth(month);
    // clamp end to stay >= start
    if (year > endYear || (year === endYear && month > endMonth)) {
      setEndYear(year);
      setEndMonth(month);
    }
  };

  const MAX_SCOPE_YEAR = 2050;

  const setEndDate = (year: number, month: number) => {
    const clampedYear = Math.min(year, MAX_SCOPE_YEAR);
    setEndYear(clampedYear);
    setEndMonth(clampedYear === MAX_SCOPE_YEAR ? 12 : month);
    // clamp start to stay <= end
    if (clampedYear < startYear || (clampedYear === startYear && month < startMonth)) {
      setStartYear(clampedYear);
      setStartMonth(month);
    }
  };

  // Custom hour-ending range (1–24). Endpoints are independent: startHE > endHE
  // wraps past midnight. Choosing a custom range switches peakMode to 'custom'.
  const setHERange = (s: number, e: number) => {
    setStartHE(Math.max(1, Math.min(24, Math.round(s))));
    setEndHE(Math.max(1, Math.min(24, Math.round(e))));
    setPeakMode('custom');
  };

  return (
    <ScopeContext.Provider value={{
      selectedSites, availableSites, siteAttributes, selection, customGroups,
      startYear, startMonth, endYear, endMonth, peakMode, startHE, endHE,
      loading, error,
      toggleSite, addSite, removeSite, selectOnlySite,
      peekActive: peekSnapshot !== null, peekSite, endPeek,
      setStartDate, setEndDate, setPeakMode, setHERange,
      refreshSites: fetchSites,
      applyFilter, applyGroup, fetchGroups, saveGroup, deleteGroup,
    }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScopeContext(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScopeContext must be used inside <ScopeProvider>');
  return ctx;
}
