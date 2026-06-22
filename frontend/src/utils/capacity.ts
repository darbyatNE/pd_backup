import { 
  getCapacitySourcesForSites, 
  getContractsForSites, 
  getQualifiedCapacityMwCovered,
  type CapacitySource
} from '../data/linkedContracts';
import { getForecastCapacityForYear, type SiteLoadProfile } from '../data/loadProfile';

/**
 * Calculate the minimum unhedged capacity for a single site across scope years.
 * This is used for BESS "Examine Fit" sizing recommendations.
 * 
 * Formula: For each year, unhedged = siteCapacity - capacityContracts
 * Returns the minimum unhedged value across all years.
 * 
 * Energy hedges are NOT counted against capacity needs.
 * Only actual capacity contracts (CapacitySource + capacity components) are counted.
 */
export function getMinUnhedgedCapacityMw(
  profile: SiteLoadProfile,
  startYear: number,
  endYear: number
): number {
  // Get all contracts for this site
  const contracts = getContractsForSites([profile.siteKey]);
  const capacitySources = getCapacitySourcesForSites([profile.siteKey]);
  
  let minUncovered = 190; // Default max
  
  for (let year = startYear; year <= endYear; year++) {
    // Get site capacity for this year
    const siteCapacity = getForecastCapacityForYear(profile, year);
    
    // Calculate total hedged capacity for this year
    // 1. From CapacitySource (utility BRA, competitive fixed, etc.)
    const capacitySourceMw = capacitySources
      .reduce((sum: number, source: CapacitySource) => sum + (source.mwCovered || 0), 0);
    
    // 2. From LDA-qualified LinkedContract capacity components
    const loadLda = profile.lda || 'DOM'; // Default to DOM for Northern Virginia
    const contractCapacityMw = getQualifiedCapacityMwCovered(contracts, loadLda, year);
    
    const totalHedgedMw = capacitySourceMw + contractCapacityMw;
    
    const uncovered = Math.max(0, siteCapacity - totalHedgedMw);
    
    if (uncovered < minUncovered) {
      minUncovered = uncovered;
    }
  }
  
  return Math.max(Math.round(minUncovered), 10); // Minimum 10MW
}

/**
 * Get suggested BESS size for a site based on minimum unhedged capacity.
 */
export function getSuggestedBessMw(
  profile: SiteLoadProfile,
  startYear: number,
  endYear: number
): number {
  return getMinUnhedgedCapacityMw(profile, startYear, endYear);
}
