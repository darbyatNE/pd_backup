import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../services/api';
import { LOAD_PROFILE_MAP } from '../data/loadProfile';

export interface ScopeState {
  selectedSites: string[];         // site keys currently checked
  availableSites: string[];        // all sites user has access to (from DB)
  startYear: number;
  startMonth: number;              // 1–12
  endYear: number;
  endMonth: number;                // 1–12
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
  refreshSites: () => Promise<void>;  // manual refresh from DB
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

// Fallback sites if DB fetch fails or returns empty
const FALLBACK_SITE_KEYS = ['ashburn-dc', 'manassas-industrial', 'sterling-hyperscale'];

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [startYear,  setStartYear]  = useState(2026);
  const [startMonth, setStartMonth] = useState(1);
  const [endYear,    setEndYear]    = useState(2028);
  const [endMonth,   setEndMonth]   = useState(12);
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

  const toggleSite = (key: string) => {
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
    setSelectedSites((prev) => {
      return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
    });
  };

  // Scope to a single data center. If the key isn't a known site, also make it
  // available so the chart can render it.
  const selectOnlySite = (key: string) => {
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

  const setStartDate = (year: number, month: number) => {
    setStartYear(year);
    setStartMonth(month);
    // clamp end to stay >= start
    if (year > endYear || (year === endYear && month > endMonth)) {
      setEndYear(year);
      setEndMonth(month);
    }
  };

  const MAX_SCOPE_YEAR = 2030;

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

  return (
    <ScopeContext.Provider value={{
      selectedSites, availableSites, startYear, startMonth, endYear, endMonth,
      loading, error,
      toggleSite, addSite, removeSite, selectOnlySite,
      peekActive: peekSnapshot !== null, peekSite, endPeek,
      setStartDate, setEndDate,
      refreshSites: fetchSites,
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
