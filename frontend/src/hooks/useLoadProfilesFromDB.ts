import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../services/api';
import type { SiteLoadProfile, LoadShapePoint } from '../data/loadProfile';
import { 
  HOUR_SHAPE_DC, HOUR_SHAPE_IND, HOUR_SHAPE_HP,
  MONTH_DC, MONTH_IND, MONTH_HP 
} from '../data/loadProfile';

// Default load shapes by facility type
const DEFAULT_HOUR_SHAPES: Record<string, number[]> = {
  'brownfield': HOUR_SHAPE_DC,
  'greenfield': HOUR_SHAPE_HP,
  'industrial': HOUR_SHAPE_IND,
};

const DEFAULT_MONTH_FACTORS: Record<string, number[]> = {
  'brownfield': MONTH_DC,
  'greenfield': MONTH_HP,
  'industrial': MONTH_IND,
};

interface DataCenterRow {
  FAC_ID: string;
  buyer_id: string;
  STATE: string;
  ISO: string;
  FACILITY_STATUS: string;
  facility_location: any;
  HIST_MW: string | null;
  DELTA_CAP_y: string | null;
  C_MAX: number | null;
  IT_LOAD: number | null;
}

/**
 * Fetches data centers from RDS (via the backend API) and transforms them into SiteLoadProfile format
 * This replaces the hardcoded LOAD_PROFILES with real database data
 */
export function useLoadProfilesFromDB() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<SiteLoadProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!user) {
        setError('No authenticated user');
        setLoading(false);
        return;
      }

      // Fetch data centers for this buyer (via the backend API → RDS)
      const token = localStorage.getItem('pd_access_token');
      const res = await fetch(
        `${API_BASE_URL}/datacenters?buyer_id=${encodeURIComponent(user.id)}`,
        { headers: { ...(token && { Authorization: `Bearer ${token}` }) } }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to fetch profiles' }));
        throw new Error(err.error || `Failed to fetch profiles (${res.status})`);
      }

      const { data } = (await res.json()) as { data: DataCenterRow[] };

      if (!data || data.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      // Transform database rows into SiteLoadProfile format
      const loadProfiles: SiteLoadProfile[] = data.map((row: DataCenterRow) => {
        // Parse JSON capacity data
        let capacityByYear: Record<number, number> = {};
        try {
          if (row.HIST_MW) {
            const parsed = JSON.parse(row.HIST_MW);
            // Convert string keys to numbers
            Object.entries(parsed).forEach(([year, capacity]) => {
              capacityByYear[parseInt(year)] = Number(capacity);
            });
          }
        } catch (e) {
          console.warn('Failed to parse HIST_MW for', row.FAC_ID);
        }

        // Parse baseload data if available
        let baseloadMwhByMonth: Record<number, number> = {};
        try {
          if (row.DELTA_CAP_y) {
            const parsed = JSON.parse(row.DELTA_CAP_y);
            Object.entries(parsed).forEach(([month, mwh]) => {
              baseloadMwhByMonth[parseInt(month)] = Number(mwh);
            });
          }
        } catch (e) {
          console.warn('Failed to parse DELTA_CAP_y for', row.FAC_ID);
        }

        // Determine load shape based on facility status
        const facilityType = (row.FACILITY_STATUS || 'brownfield').toLowerCase();
        const hourShape = DEFAULT_HOUR_SHAPES[facilityType] || DEFAULT_HOUR_SHAPES['brownfield'];
        const monthFactors = DEFAULT_MONTH_FACTORS[facilityType] || DEFAULT_MONTH_FACTORS['brownfield'];

        // Calculate capacity and loads
        const defaultCapacity = row.C_MAX || 50;
        const defaultITLoad = row.IT_LOAD || 20;
        
        // Calculate baseload (flat floor) and peak demand
        const baseloadMw = defaultITLoad * 0.8; // 80% of IT load as baseload
        const peakDemandMw = defaultCapacity;
        const averageMw = (baseloadMw + peakDemandMw) / 2;
        const loadFactorPct = (averageMw / peakDemandMw) * 100;

        // Build load shape (24 hours × 12 months = 288 points)
        const loadShape: LoadShapePoint[] = [];
        for (let month = 1; month <= 12; month++) {
          for (let hour = 0; hour < 24; hour++) {
            const monthFactor = monthFactors[month - 1] || 1;
            const hourFactor = hourShape[hour] || 0.5;
            
            // Peak range varies by month
            const peakRange = peakDemandMw - baseloadMw;
            const peakMw = Math.max(0, Math.min(peakRange, hourFactor * peakRange * monthFactor));
            const totalMw = baseloadMw + peakMw;

            loadShape.push({
              hour,
              month,
              totalMw,
              baseloadMw,
              peakMw,
            });
          }
        }

        return {
          siteKey: row.FAC_ID,
          name: row.FAC_ID, // Use FAC_ID as name
          location: row.STATE || 'Unknown',
          settlementZone: row.ISO || 'DOM',
          capacityMw: defaultCapacity,
          baseloadMw,
          peakDemandMw,
          averageMw,
          loadFactorPct,
          loadShape,
          capacityByYear: Object.keys(capacityByYear).length > 0 ? capacityByYear : undefined,
        };
      });

      setProfiles(loadProfiles);
    } catch (err) {
      console.error('Error fetching load profiles from DB:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch profiles');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Create a lookup map for easy access
  const profileMap = profiles.reduce((map, profile) => {
    map[profile.siteKey] = profile;
    return map;
  }, {} as Record<string, SiteLoadProfile>);

  return {
    profiles,
    profileMap,
    loading,
    error,
    refresh: fetchProfiles,
  };
}

export default useLoadProfilesFromDB;
