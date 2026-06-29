/**
 * Site Data Service
 * 
 * Fetches load sites from the RDS data_centers table via the backend API
 * (GET /api/datacenters).
 * 
 * Expected data_centers schema:
 * - FAC_ID: unique facility identifier (used as siteKey)
 * - buyer_id: owner of the data center
 * - name: display name
 * - location: location string
 * - capacity_by_year: JSON { "2026": 50, "2027": 60, ... }
 * - baseload_mwh_by_month: JSON { "1": 1000, "2": 950, ... } - monthly baseload MWh
 * - iso_zone: ISO zone code
 */

import { API_BASE_URL } from './api';

export interface DataCenterSite {
  siteKey: string;           // FAC_ID from data_centers
  name: string;              // Display name
  location: string;          // Location string (e.g., "Ashburn, VA")
  buyerId: string;           // Owner buyer_id
  capacityByYear: Record<string, number>;  // Year -> Capacity MW
  baseloadMwhByMonth: Record<string, number>;  // Month (1-12) -> Baseload MWh
  isoZone: string;           // ISO zone code
  // PostGIS geography coordinates (X=Longitude, Y=Latitude)
  longitude?: number;        // X coordinate from facility_location POINT
  latitude?: number;         // Y coordinate from facility_location POINT
}

/**
 * Fetch all data center sites for a buyer via the backend API (RDS-backed):
 *   GET /api/datacenters?buyer_id=<id>
 */
export async function fetchDataCenterSites(buyerId: string): Promise<DataCenterSite[]> {
  const token = localStorage.getItem('pd_access_token');
  const response = await fetch(
    `${API_BASE_URL}/datacenters?buyer_id=${encodeURIComponent(buyerId)}`,
    { headers: { ...(token && { Authorization: `Bearer ${token}` }) } }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to fetch data centers' }));
    console.error('Error fetching data centers:', err);
    throw new Error(`Failed to fetch data centers: ${err.error || response.status}`);
  }

  const { data } = await response.json();

  if (!data || data.length === 0) {
    return [];
  }

  // Transform Supabase data to DataCenterSite format
  // Maps actual data_centers table columns to the interface
  return data.map((row: any) => {
    // Parse facility_location if it contains coordinates
    // Supabase PostGIS returns as { type: 'Point', coordinates: [lng, lat] } in GeoJSON mode
    // Backend returns explicit longitude/latitude (ST_X/ST_Y on facility_location).
    let longitude: number | undefined = typeof row.longitude === 'number' ? row.longitude : undefined;
    let latitude: number | undefined = typeof row.latitude === 'number' ? row.latitude : undefined;

    // Fallback: GeoJSON Point shape, if a caller ever supplies facility_location directly.
    if ((longitude === undefined || latitude === undefined) && row.facility_location &&
        typeof row.facility_location === 'object' &&
        row.facility_location.type === 'Point' &&
        Array.isArray(row.facility_location.coordinates)) {
      longitude = row.facility_location.coordinates[0];
      latitude = row.facility_location.coordinates[1];
    }
    
    // Parse JSON from text columns (HIST_MW = capacity_by_year, DELTA_CAP_y = baseload_mwh_by_month)
    let capacityByYear: Record<string, number> = {};
    let baseloadMwhByMonth: Record<string, number> = {};
    
    try {
      if (row.HIST_MW) {
        capacityByYear = typeof row.HIST_MW === 'string' ? JSON.parse(row.HIST_MW) : row.HIST_MW;
      }
    } catch (e) {
      console.warn('Failed to parse HIST_MW for', row.FAC_ID, e);
    }
    
    try {
      if (row.DELTA_CAP_y) {
        baseloadMwhByMonth = typeof row.DELTA_CAP_y === 'string' ? JSON.parse(row.DELTA_CAP_y) : row.DELTA_CAP_y;
      }
    } catch (e) {
      console.warn('Failed to parse DELTA_CAP_y for', row.FAC_ID, e);
    }
    
    return {
      siteKey: row.FAC_ID,
      name: row.FAC_ID,  // Use FAC_ID as name (no separate name column exists)
      location: row.STATE || '',  // Use STATE as location
      buyerId: row.buyer_id,
      capacityByYear,
      baseloadMwhByMonth,
      isoZone: row.ISO || 'DOM',
      longitude,
      latitude,
    };
  });
}

/**
 * Get current user's data center sites
 * Automatically fetches the current authenticated user's buyer_id
 */
export async function fetchMyDataCenterSites(): Promise<DataCenterSite[]> {
  const token = localStorage.getItem('pd_access_token');
  if (!token) throw new Error('No authenticated user');

  const [, payloadB64] = token.split('.');
  const payload = JSON.parse(atob(payloadB64));
  const buyerId: string = payload.sub;

  return fetchDataCenterSites(buyerId);
}

/**
 * Convert DataCenterSite to SiteLoadProfile format for use with existing code
 * This bridges the Profile tab's Supabase data with the Planning tab's load profile system
 */
export function convertToLoadProfile(site: DataCenterSite) {
  // Calculate annual MWh from monthly baseload values
  const annualMWh = Object.values(site.baseloadMwhByMonth).reduce((sum, val) => sum + val, 0);
  
  // Get first year's capacity as default, or 0 if none defined
  const years = Object.keys(site.capacityByYear).map(Number).sort();
  const defaultCapacity = years.length > 0 ? site.capacityByYear[years[0]] : 0;
  
  return {
    siteKey: site.siteKey,
    name: site.name,
    location: site.location,
    isoZone: site.isoZone,
    capacityMw: defaultCapacity,
    annualMWh: annualMWh,
    capacityByYear: site.capacityByYear,
    // Map coordinates from PostGIS geography POINT
    longitude: site.longitude,
    latitude: site.latitude,
    // Additional metadata for your hedge calculations
    baseloadMwhByMonth: site.baseloadMwhByMonth,
  };
}

/**
 * Hook-compatible function to get all available sites
 * Merges hardcoded sites with user's data_center sites from Supabase
 */
export async function getAllAvailableSites(buyerId?: string): Promise<DataCenterSite[]> {
  const sites: DataCenterSite[] = [];
  
  // If buyerId provided, fetch their data_center sites
  if (buyerId) {
    try {
      const dcSites = await fetchDataCenterSites(buyerId);
      sites.push(...dcSites);
    } catch (err) {
      console.warn('Could not fetch data_center sites:', err);
    }
  }
  
  return sites;
}
