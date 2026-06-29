import {
  getCapacitySourcesForSites,
  getQualifiedCapacityMwCovered,
  monthsCoveredInYear
} from '../../data/linkedContracts';
import type { LinkedContract } from '../../data/linkedContracts';
import { getForecastCapacityForYear, type SiteLoadProfile, LOAD_PROFILES } from '../../data/loadProfile';
import { r1 } from './utils';

interface TryOnCapacitySummaryProps {
  capacityPct: number;
  effectiveCapacity: number;
  sites: string[];
  startYear: number;
  endYear: number;
  projectName: string;
  existingContracts?: LinkedContract[];
  // Proposed-deal term (save-form selectors) — prorates the proposed capacity by
  // its in-delivery share so partial-year bilateral deals aren't overstated.
  termStartYear?: number;
  termStartMonth?: number;
  termEndYear?: number;
  termEndMonth?: number;
}

export function TryOnCapacitySummary({
  capacityPct,
  effectiveCapacity,
  sites,
  startYear,
  endYear,
  projectName,
  existingContracts = [],
  termStartYear,
  termStartMonth = 1,
  termEndYear,
  termEndMonth = 12,
}: TryOnCapacitySummaryProps) {
  const tStartY = termStartYear ?? startYear;
  const tEndY = termEndYear ?? endYear;
  // Calculate capacity metrics - using averages instead of totals
  let totalSiteCapacity = 0;
  let totalExistingCapacity = 0;
  let totalUncoveredBefore = 0;
  let totalUncoveredAfter = 0;
  let worstCoverageYear = startYear;
  let worstCoveragePercent = 100;
  const yearCount = endYear - startYear + 1;

  // Debug input values
  console.log(`[CapacitySummary] Input: effectiveCapacity=${effectiveCapacity}, sites=${JSON.stringify(sites)}, startYear=${startYear}, endYear=${endYear}, yearCount=${yearCount}`);

  for (let year = startYear; year <= endYear; year++) {
    // Get total site capacity for this year
    let yearSiteCapacity = 0;
    for (const siteKey of sites) {
      const profile = LOAD_PROFILES.find(p => p.siteKey === siteKey);
      if (profile) {
        const siteCapacity = getForecastCapacityForYear(profile, year);
        yearSiteCapacity += isNaN(siteCapacity) ? 0 : siteCapacity;
      }
    }

    // Get existing capacity from both CapacitySource and LDA-qualified LinkedContract capacity components
    const capacitySources = getCapacitySourcesForSites(sites);
    const contracts = existingContracts;
    
    const capacitySourceMw = capacitySources.reduce((sum, source) => sum + source.mwCovered, 0);
    
    // Get LDA for the first site (all sites in a try-on should be in the same LDA for capacity)
    const firstSiteProfile = { siteKey: sites[0] } as SiteLoadProfile;
    const loadLda = firstSiteProfile.lda || 'DOM'; // Default to DOM for Northern Virginia
    
    const contractCapacityMw = getQualifiedCapacityMwCovered(contracts, loadLda, year);
    const existingCapacity = capacitySourceMw + contractCapacityMw;

    // Prorate the proposed deal by the share of this year it actually delivers.
    const proposedFrac = monthsCoveredInYear(year, tStartY, termStartMonth, tEndY, termEndMonth) / 12;
    const proposedCapacity = effectiveCapacity * proposedFrac;

    // Calculate coverage before and after project - fix overfit logic
    const uncoveredBefore = Math.max(0, yearSiteCapacity - existingCapacity);
    const actualProjectCapacity = Math.min(proposedCapacity, Math.max(0, yearSiteCapacity - existingCapacity));
    const uncoveredAfter = Math.max(0, yearSiteCapacity - existingCapacity - actualProjectCapacity);
    const coveragePercent = yearSiteCapacity > 0 ? ((existingCapacity + actualProjectCapacity) / yearSiteCapacity) * 100 : 0;

    // Debug logging for Sterling
    if (sites.includes('sterling-hyperscale')) {
      console.log(`[CapacitySummary] Year ${year}: Site=${yearSiteCapacity}MW, Existing=${existingCapacity}MW, Project=${actualProjectCapacity}MW, UncoveredAfter=${uncoveredAfter}MW, Coverage=${coveragePercent.toFixed(1)}%`);
    }

    // Add validated values to totals
    totalSiteCapacity += yearSiteCapacity || 0;
    totalExistingCapacity += existingCapacity || 0;
    totalUncoveredBefore += uncoveredBefore || 0;
    totalUncoveredAfter += uncoveredAfter || 0;

    if (coveragePercent < worstCoveragePercent) {
      worstCoveragePercent = coveragePercent;
      worstCoverageYear = year;
    }
  }

  // Calculate averages instead of using totals
  const avgSiteCapacity = totalSiteCapacity / yearCount;
  const avgExistingCapacity = totalExistingCapacity / yearCount;
  const avgUncoveredBefore = totalUncoveredBefore / yearCount;
  const avgUncoveredAfter = totalUncoveredAfter / yearCount;

  // Validate averages before display
  const validAvgSiteCapacity = isNaN(avgSiteCapacity) ? 0 : avgSiteCapacity;
  const validAvgExistingCapacity = isNaN(avgExistingCapacity) ? 0 : avgExistingCapacity;
  const validAvgUncoveredBefore = isNaN(avgUncoveredBefore) ? 0 : avgUncoveredBefore;
  const validAvgUncoveredAfter = isNaN(avgUncoveredAfter) ? 0 : avgUncoveredAfter;

  console.log(`[CapacitySummary] Final averages: Site=${validAvgSiteCapacity}, Existing=${validAvgExistingCapacity}, UncoveredBefore=${validAvgUncoveredBefore}, UncoveredAfter=${validAvgUncoveredAfter}`);

  const averageCoverageBefore = validAvgSiteCapacity > 0 ? ((validAvgSiteCapacity - validAvgUncoveredBefore) / validAvgSiteCapacity) * 100 : 0;
  const averageCoverageAfter = validAvgSiteCapacity > 0 ? ((validAvgSiteCapacity - validAvgUncoveredAfter) / validAvgSiteCapacity) * 100 : 0;
  const coverageImprovement = averageCoverageAfter - averageCoverageBefore;

  // Final validation of all display values
  const validAverageCoverageBefore = isNaN(averageCoverageBefore) ? 0 : averageCoverageBefore;
  const validAverageCoverageAfter = isNaN(averageCoverageAfter) ? 0 : averageCoverageAfter;

  return (
    <div className="grid grid-cols-4 gap-3">
      {/* Total Site Capacity */}
      <div className="bg-indigo-100 border border-indigo-300 rounded-lg p-3">
        <div className="text-[10px] text-indigo-700 uppercase tracking-wide font-medium">Total Site Capacity</div>
        <div className="text-lg font-semibold text-indigo-900 mt-1">
          {r1(validAvgSiteCapacity)} MW
        </div>
        <div className="text-xs text-indigo-600 mt-1">
          {startYear}–{endYear} average
        </div>
      </div>

      {/* Existing Capacity */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="text-[10px] text-blue-600 uppercase tracking-wide font-medium">Existing Capacity</div>
        <div className="text-lg font-semibold text-blue-900 mt-1">
          {r1(validAvgExistingCapacity)} MW
        </div>
        <div className="text-xs text-blue-600 mt-1">
          {r1(validAverageCoverageBefore)}% coverage
        </div>
      </div>

      {/* Project Capacity */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <div className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">{projectName}</div>
        <div className="text-lg font-semibold text-emerald-900 mt-1">
          {r1(effectiveCapacity)} MW
        </div>
        <div className="text-xs text-emerald-600 mt-1">
          {capacityPct}% commitment
        </div>
      </div>

      {/* Coverage Improvement */}
      <div className={`${coverageImprovement > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} border rounded-lg p-3`}>
        <div className={`text-[10px] ${coverageImprovement > 0 ? 'text-green-600' : 'text-slate-500'} uppercase tracking-wide font-medium`}>
          Coverage Result
        </div>
        <div className={`text-lg font-semibold ${coverageImprovement > 0 ? 'text-green-900' : 'text-slate-900'} mt-1`}>
          {r1(validAverageCoverageAfter)}%
        </div>
        <div className={`text-xs ${coverageImprovement > 0 ? 'text-green-600' : 'text-slate-500'} mt-1`}>
          {coverageImprovement > 0 ? `+${r1(coverageImprovement)}%` : 'No change'}
          {worstCoveragePercent < 100 && ` · Lowest: ${worstCoverageYear} (${r1(worstCoveragePercent)}%)`}
        </div>
      </div>
    </div>
  );
}
