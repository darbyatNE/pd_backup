/**
 * Site Data Service
 * 
 * Fetches load sites from Supabase data_centers table
 * as provided by Profile tab developer.
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

import { supabase } from './supabase';

export interface DataCenterSite {
  siteKey: string;           // FAC_ID from data_centers
  name: string;              // Display name
  location: string;          // Location string
  buyerId: string;           // Owner buyer_id
  capacityByYear: Record<string, number>;  // Year -> Capacity MW
  baseloadMwhByMonth: Record<string, number>;  // Month (1-12) -> Baseload MWh
  isoZone: string;           // ISO zone code
}

/**
 * Fetch all data center sites for a buyer
 * Uses the query pattern provided by Profile tab developer:
 * 
 * const { data, error } = await supabase
 *   .from('data_centers')
 *   .select('FAC_ID')
 *   .eq('buyer_id', 'your-buyer-id-here');
 */
export async function fetchDataCenterSites(buyerId: string): Promise<DataCenterSite[]> {
  const { data, error } = await supabase
    .from('data_centers')
    .select('*')
    .eq('buyer_id', buyerId);

  if (error) {
    console.error('Error fetching data centers:', error);
    throw new Error(`Failed to fetch data centers: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Transform Supabase data to DataCenterSite format
  return data.map((row: any) => ({
    siteKey: row.FAC_ID,
    name: row.name || row.FAC_ID,
    location: row.location || '',
    buyerId: row.buyer_id,
    capacityByYear: row.capacity_by_year || {},
    baseloadMwhByMonth: row.baseload_mwh_by_month || {},
    isoZone: row.iso_zone || 'DOM',
  }));
}

/**
 * Get current user's data center sites
 * Automatically fetches the current authenticated user's buyer_id
 */
export async function fetchMyDataCenterSites(): Promise<DataCenterSite[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('No authenticated user');
  }

  // Get buyer_id from user metadata or separate query
  const buyerId = user.id; // Assuming buyer_id matches auth user id
  
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
