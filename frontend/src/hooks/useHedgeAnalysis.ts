/**
 * React Hook for Hedge Analysis
 * 
 * Provides hedge analysis for sites based on linked contracts and facility type
 */

import { useMemo } from 'react';
import {
  calculateSiteHedgeAnalysis,
  calculatePortfolioSummary,
  analyzePortfolioHedges,
  type SiteHedgeProfile,
  type HedgeAnalysis,
  type FacilityType,
} from '../utils/hedgeCalculations';

// Types matching your existing data structures
export interface LinkedContract {
  id: string;
  contractType: 'firm' | 'conditional' | 'option';
  volume: number; // MWh annual
  peakPercent: number;
  offPeakPercent: number;
  startDate: string;
  endDate: string;
  cancellationRisk: 'low' | 'medium' | 'high';
}

export interface Site {
  id: string;
  name: string;
  facilityType: FacilityType;
  annualConsumptionMWh: number;
  peakConsumptionMWh: number;
  offPeakConsumptionMWh: number;
  targetCOD?: string | null;
  linkedContracts: LinkedContract[];
}

/**
 * Convert site data to hedge profile format
 */
function siteToHedgeProfile(site: Site): SiteHedgeProfile {
  return {
    siteId: site.id,
    facilityType: site.facilityType,
    annualVolumeMWh: site.annualConsumptionMWh,
    peakVolumeMWh: site.peakConsumptionMWh,
    offPeakVolumeMWh: site.offPeakConsumptionMWh,
    targetCOD: site.targetCOD ? new Date(site.targetCOD) : null,
    currentHedges: site.linkedContracts.map(c => ({
      id: c.id,
      volumeMWh: c.volume,
      peakPercent: c.peakPercent,
      offPeakPercent: c.offPeakPercent,
      startDate: new Date(c.startDate),
      endDate: new Date(c.endDate),
      isFirm: c.contractType === 'firm',
      cancellationRisk: c.cancellationRisk,
    })),
  };
}

/**
 * Hook for analyzing a single site's hedge position
 */
export function useSiteHedgeAnalysis(site: Site | null): HedgeAnalysis | null {
  return useMemo(() => {
    if (!site) return null;
    return calculateSiteHedgeAnalysis(siteToHedgeProfile(site));
  }, [site]);
}

/**
 * Hook for analyzing multiple sites (portfolio view)
 */
export function usePortfolioHedgeAnalysis(sites: Site[]) {
  return useMemo(() => {
    if (sites.length === 0) {
      return {
        analyses: [],
        summary: {
          totalSites: 0,
          brownfieldCount: 0,
          greenfieldCount: 0,
          fullyHedgedCount: 0,
          underHedgedCount: 0,
          portfolioHedgeRatio: 0,
          totalVolumeMWh: 0,
          hedgedVolumeMWh: 0,
          unhedgedVolumeMWh: 0,
          atRiskVolumeMWh: 0,
          brownfieldAvgRatio: 0,
          greenfieldAvgRatio: 0,
        },
      };
    }

    const profiles = sites.map(siteToHedgeProfile);
    const analyses = analyzePortfolioHedges(profiles);
    const summary = calculatePortfolioSummary(analyses);

    return { analyses, summary };
  }, [sites]);
}

/**
 * Hook for getting hedge status color/theme
 */
export function useHedgeStatusTheme(status: string) {
  return useMemo(() => {
    switch (status) {
      case 'fully_hedged':
        return { color: 'green', bg: 'bg-green-100', text: 'text-green-800', label: 'Fully Hedged' };
      case 'partially_hedged':
        return { color: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Partially Hedged' };
      case 'under_hedged':
        return { color: 'orange', bg: 'bg-orange-100', text: 'text-orange-800', label: 'Under Hedged' };
      case 'unhedged':
        return { color: 'red', bg: 'bg-red-100', text: 'text-red-800', label: 'Unhedged' };
      default:
        return { color: 'gray', bg: 'bg-gray-100', text: 'text-gray-800', label: 'Unknown' };
    }
  }, [status]);
}

/**
 * Hook for brownfield vs greenfield comparison
 */
export function useFacilityTypeComparison(sites: Site[]) {
  return useMemo(() => {
    const { analyses, summary } = usePortfolioHedgeAnalysis(sites);
    
    const brownfield = analyses.filter(a => a.facilityType === 'brownfield');
    const greenfield = analyses.filter(a => a.facilityType === 'greenfield');
    
    return {
      brownfield: {
        count: brownfield.length,
        avgRatio: summary.brownfieldAvgRatio,
        fullyHedged: brownfield.filter(a => a.overallStatus === 'fully_hedged').length,
        overHedged: brownfield.filter(a => a.offPeakRatio > 1.0).length,
        atRiskVolume: brownfield.reduce((sum, a) => sum + a.atRiskVolumeMWh, 0),
      },
      greenfield: {
        count: greenfield.length,
        avgRatio: summary.greenfieldAvgRatio,
        withDeals: greenfield.filter(a => a.hedgedVolumeMWh > 0).length,
        avgDealCount: greenfield.length > 0 
          ? greenfield.reduce((sum, a) => sum + (a.hedgedVolumeMWh > 0 ? 1 : 0), 0) / greenfield.length 
          : 0,
        atRiskVolume: greenfield.reduce((sum, a) => sum + a.atRiskVolumeMWh, 0),
      },
    };
  }, [sites]);
}
