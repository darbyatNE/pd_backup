/**
 * useDataCenterSites Hook
 * 
 * React hook to fetch and manage data center sites from Supabase.
 * Integrates with the Profile tab's data_centers table.
 * 
 * Usage:
 * ```tsx
 * const { sites, loading, error, refresh } = useDataCenterSites();
 * 
 * // Sites available for hedging
 * sites.map(site => ({
 *   siteKey: site.siteKey,      // FAC_ID
 *   capacityByYear: site.capacityByYear,
 *   baseloadMwhByMonth: site.baseloadMwhByMonth,
 * }))
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchMyDataCenterSites, convertToLoadProfile, type DataCenterSite } from '../services/siteDataService';

interface UseDataCenterSitesResult {
  sites: DataCenterSite[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  // Helper to get a single site by FAC_ID
  getSiteById: (facId: string) => DataCenterSite | undefined;
  // Convert to load profile format for hedge calculations
  getLoadProfiles: () => ReturnType<typeof convertToLoadProfile>[];
}

export function useDataCenterSites(): UseDataCenterSitesResult {
  const [sites, setSites] = useState<DataCenterSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchMyDataCenterSites();
      setSites(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch sites'));
      console.error('useDataCenterSites error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const getSiteById = useCallback((facId: string) => {
    return sites.find(s => s.siteKey === facId);
  }, [sites]);

  const getLoadProfiles = useCallback(() => {
    return sites.map(convertToLoadProfile);
  }, [sites]);

  return {
    sites,
    loading,
    error,
    refresh: fetchSites,
    getSiteById,
    getLoadProfiles,
  };
}

/**
 * Hook for a single site with detailed capacity/baseload data
 */
export function useDataCenterSite(facId: string) {
  const { sites, loading, error, refresh, getSiteById } = useDataCenterSites();
  
  return {
    site: getSiteById(facId),
    loading,
    error,
    refresh,
    // Get capacity for a specific year
    getCapacityForYear: (year: number) => {
      const site = getSiteById(facId);
      return site?.capacityByYear[year.toString()] || 0;
    },
    // Get baseload MWh for a specific month (1-12)
    getBaseloadForMonth: (month: number) => {
      const site = getSiteById(facId);
      return site?.baseloadMwhByMonth[month.toString()] || 0;
    },
  };
}
