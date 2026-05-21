/**
 * Hedge Calculation Utilities
 * 
 * Implements logical hedging rules based on site type:
 * - Brownfield sites: Almost fully hedged by volume, some over-hedged in off-peak
 * - Greenfield sites: 1-2 deals (cancellation risk), mostly unhedged
 * - Time-based: Nearer term = more likely brownfield is fully hedged
 */

export type FacilityType = 'brownfield' | 'greenfield';
export type HedgeStatus = 'fully_hedged' | 'partially_hedged' | 'under_hedged' | 'unhedged';

export interface SiteHedgeProfile {
  siteId: string;
  facilityType: FacilityType;
  annualVolumeMWh: number;
  peakVolumeMWh: number;
  offPeakVolumeMWh: number;
  targetCOD: Date | null;
  currentHedges: HedgeContract[];
}

export interface HedgeContract {
  id: string;
  volumeMWh: number;
  peakPercent: number;
  offPeakPercent: number;
  startDate: Date;
  endDate: Date;
  isFirm: boolean;
  cancellationRisk: 'low' | 'medium' | 'high';
}

export interface HedgeAnalysis {
  siteId: string;
  facilityType: FacilityType;
  overallStatus: HedgeStatus;
  peakStatus: HedgeStatus;
  offPeakStatus: HedgeStatus;
  overallRatio: number;
  peakRatio: number;
  offPeakRatio: number;
  hedgedVolumeMWh: number;
  unhedgedVolumeMWh: number;
  atRiskVolumeMWh: number;
  recommendations: string[];
}

/**
 * Calculate months until Commercial Operation Date (COD)
 */
function monthsUntilCOD(targetCOD: Date | null): number {
  if (!targetCOD) return 0;
  const now = new Date();
  const cod = new Date(targetCOD);
  return (cod.getFullYear() - now.getFullYear()) * 12 + (cod.getMonth() - now.getMonth());
}

/**
 * Determine hedge status based on ratio
 */
function getHedgeStatus(ratio: number): HedgeStatus {
  if (ratio >= 0.95) return 'fully_hedged';
  if (ratio >= 0.70) return 'partially_hedged';
  if (ratio >= 0.30) return 'under_hedged';
  return 'unhedged';
}

/**
 * Calculate hedge ratios for brownfield sites
 * Brownfields: Near full hedge, may over-hedge off-peak
 */
function calculateBrownfieldHedges(
  site: SiteHedgeProfile,
  monthsToCOD: number
): Partial<HedgeAnalysis> {
  const totalHedgeVolume = site.currentHedges.reduce((sum, h) => sum + h.volumeMWh, 0);
  const atRiskVolume = site.currentHedges
    .filter(h => h.cancellationRisk === 'high' || !h.isFirm)
    .reduce((sum, h) => sum + h.volumeMWh, 0);
  
  // Brownfields have time-based hedge probability
  // Closer to COD = higher probability of being fully hedged
  const hedgeProbability = Math.min(1.0, 0.7 + (1 / Math.max(1, monthsToCOD)) * 0.3);
  
  // Peak hours: 7am-11pm typically - brownfields hedge these heavily
  const peakHedgeVolume = site.currentHedges.reduce((sum, h) => 
    sum + (h.volumeMWh * (h.peakPercent / 100)), 0);
  
  // Off-peak: 11pm-7am - brownfields may over-hedge these (up to 110%)
  const offPeakHedgeVolume = site.currentHedges.reduce((sum, h) => 
    sum + (h.volumeMWh * (h.offPeakPercent / 100)), 0);
  
  // Apply hedge probability to effective volume
  const effectiveAnnualVolume = site.annualVolumeMWh * hedgeProbability;
  
  const overallRatio = effectiveAnnualVolume > 0 
    ? Math.min(1.2, totalHedgeVolume / effectiveAnnualVolume) 
    : 0;
    
  const peakRatio = site.peakVolumeMWh > 0 
    ? peakHedgeVolume / site.peakVolumeMWh 
    : 0;
    
  const offPeakRatio = site.offPeakVolumeMWh > 0 
    ? Math.min(1.3, offPeakHedgeVolume / site.offPeakVolumeMWh) 
    : 0;

  return {
    overallRatio,
    peakRatio,
    offPeakRatio,
    hedgedVolumeMWh: totalHedgeVolume,
    unhedgedVolumeMWh: Math.max(0, site.annualVolumeMWh - totalHedgeVolume),
    atRiskVolumeMWh: atRiskVolume,
  };
}

/**
 * Calculate hedge ratios for greenfield sites
 * Greenfields: 1-2 deals, high cancellation risk, mostly unhedged
 */
function calculateGreenfieldHedges(
  site: SiteHedgeProfile,
  monthsToCOD: number
): Partial<HedgeAnalysis> {
  // Greenfields only have 1-2 deals typically, with high cancellation risk
  const typicalDealCount = Math.min(site.currentHedges.length, 2);
  const dealVolume = site.currentHedges.slice(0, 2).reduce((sum, h) => sum + h.volumeMWh, 0);
  
  // Greenfields are mostly unhedged - only 20-40% typically hedged
  const typicalHedgeRatio = 0.20 + (Math.random() * 0.20); // 20-40%
  
  // As COD approaches, some additional hedging may occur
  const timeAdjustment = monthsToCOD < 12 ? 0.15 : 0;
  
  const totalHedgeVolume = Math.min(
    site.annualVolumeMWh * (typicalHedgeRatio + timeAdjustment),
    dealVolume
  );
  
  // Most volume is unhedged
  const unhedgedVolume = site.annualVolumeMWh - totalHedgeVolume;
  
  // Greenfield deals are typically subject to cancellation
  const atRiskVolume = totalHedgeVolume * 0.80; // 80% at risk

  return {
    overallRatio: totalHedgeVolume / site.annualVolumeMWh,
    peakRatio: (totalHedgeVolume * 0.6) / site.peakVolumeMWh, // 60% to peak
    offPeakRatio: (totalHedgeVolume * 0.4) / site.offPeakVolumeMWh, // 40% to off-peak
    hedgedVolumeMWh: totalHedgeVolume,
    unhedgedVolumeMWh: unhedgedVolume,
    atRiskVolumeMWh: atRiskVolume,
  };
}

/**
 * Generate recommendations based on hedge analysis
 */
function generateRecommendations(
  site: SiteHedgeProfile,
  analysis: Partial<HedgeAnalysis>,
  monthsToCOD: number
): string[] {
  const recommendations: string[] = [];
  
  if (site.facilityType === 'brownfield') {
    if (analysis.overallRatio! < 0.90) {
      recommendations.push(`Add ${Math.round((0.95 - analysis.overallRatio!) * 100)}% more hedge volume to reach target`);
    }
    if (analysis.offPeakRatio! > 1.1) {
      recommendations.push('Off-peak is over-hedged; consider reallocating to peak hours');
    }
    if (monthsToCOD < 6 && analysis.overallRatio! < 0.95) {
      recommendations.push('URGENT: Near-term brownfield needs immediate hedging');
    }
  } else {
    // Greenfield recommendations
    if (site.currentHedges.length === 0) {
      recommendations.push('No hedges in place - consider initial 20% hedge with cancellation options');
    } else if (site.currentHedges.length === 1) {
      recommendations.push('Only 1 hedge deal - add backup hedge for redundancy');
    }
    if (analysis.unhedgedVolumeMWh! > site.annualVolumeMWh * 0.7) {
      recommendations.push(`Large unhedged exposure: ${Math.round(analysis.unhedgedVolumeMWh! / 1000)} GWh`);
    }
    if (monthsToCOD < 12) {
      recommendations.push('COD approaching - evaluate firm vs. conditional hedging strategy');
    }
  }
  
  return recommendations;
}

/**
 * Main function: Calculate comprehensive hedge analysis for a site
 */
export function calculateSiteHedgeAnalysis(site: SiteHedgeProfile): HedgeAnalysis {
  const monthsToCOD = monthsUntilCOD(site.targetCOD);
  
  let calculations: Partial<HedgeAnalysis>;
  
  if (site.facilityType === 'brownfield') {
    calculations = calculateBrownfieldHedges(site, monthsToCOD);
  } else {
    calculations = calculateGreenfieldHedges(site, monthsToCOD);
  }
  
  const recommendations = generateRecommendations(site, calculations, monthsToCOD);
  
  return {
    siteId: site.siteId,
    facilityType: site.facilityType,
    overallStatus: getHedgeStatus(calculations.overallRatio!),
    peakStatus: getHedgeStatus(calculations.peakRatio!),
    offPeakStatus: getHedgeStatus(calculations.offPeakRatio!),
    overallRatio: calculations.overallRatio!,
    peakRatio: calculations.peakRatio!,
    offPeakRatio: calculations.offPeakRatio!,
    hedgedVolumeMWh: calculations.hedgedVolumeMWh!,
    unhedgedVolumeMWh: calculations.unhedgedVolumeMWh!,
    atRiskVolumeMWh: calculations.atRiskVolumeMWh!,
    recommendations,
  };
}

/**
 * Batch analyze multiple sites
 */
export function analyzePortfolioHedges(sites: SiteHedgeProfile[]): HedgeAnalysis[] {
  return sites.map(site => calculateSiteHedgeAnalysis(site));
}

/**
 * Calculate portfolio-level hedge summary
 */
export function calculatePortfolioSummary(analyses: HedgeAnalysis[]) {
  const totalVolume = analyses.reduce((sum, a) => sum + a.hedgedVolumeMWh + a.unhedgedVolumeMWh, 0);
  const totalHedged = analyses.reduce((sum, a) => sum + a.hedgedVolumeMWh, 0);
  const totalUnhedged = analyses.reduce((sum, a) => sum + a.unhedgedVolumeMWh, 0);
  const totalAtRisk = analyses.reduce((sum, a) => sum + a.atRiskVolumeMWh, 0);
  
  const brownfieldSites = analyses.filter(a => a.facilityType === 'brownfield');
  const greenfieldSites = analyses.filter(a => a.facilityType === 'greenfield');
  
  return {
    totalSites: analyses.length,
    brownfieldCount: brownfieldSites.length,
    greenfieldCount: greenfieldSites.length,
    fullyHedgedCount: analyses.filter(a => a.overallStatus === 'fully_hedged').length,
    underHedgedCount: analyses.filter(a => a.overallStatus === 'under_hedged' || a.overallStatus === 'unhedged').length,
    portfolioHedgeRatio: totalVolume > 0 ? totalHedged / totalVolume : 0,
    totalVolumeMWh: totalVolume,
    hedgedVolumeMWh: totalHedged,
    unhedgedVolumeMWh: totalUnhedged,
    atRiskVolumeMWh: totalAtRisk,
    brownfieldAvgRatio: brownfieldSites.length > 0 
      ? brownfieldSites.reduce((sum, a) => sum + a.overallRatio, 0) / brownfieldSites.length 
      : 0,
    greenfieldAvgRatio: greenfieldSites.length > 0 
      ? greenfieldSites.reduce((sum, a) => sum + a.overallRatio, 0) / greenfieldSites.length 
      : 0,
  };
}
