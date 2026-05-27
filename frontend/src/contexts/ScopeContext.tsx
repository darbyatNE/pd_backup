import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../services/supabase';
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
  setStartDate: (year: number, month: number) => void;
  setEndDate: (year: number, month: number) => void;
  refreshSites: () => Promise<void>;  // manual refresh from DB
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

// Fallback sites if DB fetch fails or returns empty
const FALLBACK_SITE_KEYS = ['ashburn-dc', 'manassas-industrial', 'sterling-hyperscale'];

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [startYear,  setStartYear]  = useState(2026);
  const [startMonth, setStartMonth] = useState(1);
  const [endYear,    setEndYear]    = useState(2028);
  const [endMonth,   setEndMonth]   = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch sites from Supabase data_centers table for logged-in user
  const fetchSites = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // No user logged in - use fallback sites
        setAvailableSites(FALLBACK_SITE_KEYS);
        setSelectedSites(FALLBACK_SITE_KEYS);
        setLoading(false);
        return;
      }

      // Fetch sites from data_centers table using Satya's query pattern
      const { data, error: dbError } = await supabase
        .from('data_centers')
        .select('FAC_ID')
        .eq('buyer_id', user.id);

      if (dbError) {
        console.error('Error fetching sites from DB:', dbError);
        setError(dbError.message);
        // Fall back to hardcoded sites on error
        setAvailableSites(FALLBACK_SITE_KEYS);
        setSelectedSites(FALLBACK_SITE_KEYS);
      } else if (data && data.length > 0) {
        // Only use DB keys that have a known load profile; fall back if none match
        const dbKeys = data.map((row: { FAC_ID: string }) => row.FAC_ID as string);
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

  // Fetch sites on mount
  useEffect(() => {
    fetchSites();
  }, []);

  // Also refetch when auth state changes (login/logout)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchSites();
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

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
      toggleSite, addSite, removeSite, setStartDate, setEndDate,
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
