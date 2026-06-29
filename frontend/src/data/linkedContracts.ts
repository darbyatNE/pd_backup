// Synthetic mapping of which marketplace projects (PPAs / contracts) currently
// cover slices of each in-scope site's load. Until the contracting module ships
// (Aug 2026) this is a placeholder so the Energy chart can demonstrate the
// "filled-in by contract" stack visualization.

import { LOAD_PROFILE_MAP, getLoadMultiplierForYearMonth, type SiteLoadProfile } from './loadProfile';
import { API_BASE_URL } from '../services/api';
import { canDeliverCapacity } from './ldaData';

// Buyer project from database
interface BuyerProject {
  id: string;
  name: string;
  project_type: 'brownfield' | 'greenfield';
  target_capacity_mw?: number;
  target_annual_quantity_mwh?: number;
  target_cod?: string;
  preferred_term_years?: number;
  preferred_generation_types?: string[];
  location?: string;
}

export type ContractShape = 'flat' | 'solar' | 'wind' | 'evening';

// Whether the contract's coverage stacks under the baseload tier (teal) or
// the peak tier (amber). Flat/dispatchable resources cover baseload first;
// shape-following resources cover peak.
export type ContractTier = 'base' | 'peak';

// Facility types for hedge logic
export type FacilityType = 'brownfield' | 'greenfield';

export interface SiteFacilityInfo {
  siteKey: string;
  facilityType: FacilityType;
  annualMWh: number;
  peakMWh: number;
  offPeakMWh: number;
  targetCOD: string | null; // ISO date string
}

// Contract component types - each contract can have one or more components
export type ContractComponentType = 'capacity' | 'energy' | 'rec' | 'ancillary';

export interface ContractComponent {
  type: ContractComponentType;
  mwCovered: number;       // MW covered for this component
  pricePerMwh?: number;    // Component-specific price ($/MWh) - optional for REC
  pricePerMwYear?: number; // Capacity-specific price ($/MW-year) - for capacity component
  shape?: ContractShape;   // Delivery profile - only for energy component
  tier?: ContractTier;     // Load tier - only for energy component
  lda?: string;            // Load Distribution Area - for capacity qualification
}

export interface LinkedContract {
  projectName: string;
  generationType: 'Solar' | 'Wind' | 'Nuclear' | 'Battery' | 'Hybrid' | 'Combined Cycle' | 'Peaker' | 'Hydro';
  
  // Legacy fields for backward compatibility - deprecated in favor of components
  mwCovered: number;       // total contracted MW (legacy)
  pricePerMwh: number;     // blended energy price ($/MWh) (legacy)
  shape: ContractShape;    // energy delivery profile (legacy)
  tier: ContractTier;      // energy load tier (legacy)
  
  // New component-based system (optional for backward compatibility)
  components?: ContractComponent[];
  
  // LDA (Load Distribution Area) for capacity qualification
  lda?: string;            // Load Distribution Area - required for PPAs to qualify for capacity
  
  // Visual styling
  pattern: 'diagonal' | 'dots' | 'crosshatch' | 'vertical' | 'wave' | 'grid' | 'horizontal' | 'zigzag';
  
  // Active term: contract delivers from (startYear, startMonth) through
  // (endYear, endMonth) inclusive. Outside the term it contributes 0 MW.
  startYear: number;
  startMonth: number;      // 1–12
  endYear: number;
  endMonth: number;        // 1–12
  
  // Set on merged contracts coming out of `getContractsForSites`. Records
  // each hedged site and its MW share, so year/month load multipliers can be
  // applied per-site (a +25% bump on Manassas grows only the share that
  // hedges Manassas, not the whole contract). Absent on raw fixture entries.
  perSiteMw?: Array<{ siteKey: string; mwCovered: number; components?: ContractComponent[] }>;
  
  // BESS-specific configuration (only used for Battery generation type)
  bessDischargeHours?: number[];
  bessChargeHours?: number[];
  bessEfficiency?: number; // round-trip efficiency percentage (0-100)
}

/** True if a contract is in delivery for the given calendar year + month. */
export function isContractActiveAt(c: LinkedContract, year: number, month: number): boolean {
  const before =
    year < c.startYear || (year === c.startYear && month < c.startMonth);
  const after =
    year > c.endYear || (year === c.endYear && month > c.endMonth);
  return !before && !after;
}

// ─── Component-based contract utilities ─────────────────────────────────────

/** Get the total MW covered for a specific component type across multiple contracts */
export function getComponentMwCovered(
  contracts: LinkedContract[], 
  componentType: ContractComponentType,
  year?: number
): number {
  return contracts.reduce((total, contract) => {
    // Filter by year if specified
    if (year && !isContractActiveAt(contract, year, 6)) return total;
    
    // Ensure contract has components
    const normalizedContract = ensureContractComponents(contract);
    
    // Find the component (components is guaranteed to exist after ensureContractComponents)
    const component = normalizedContract.components!.find(c => c.type === componentType);
    return total + (component?.mwCovered || 0);
  }, 0);
}

/** Get the total MW covered for capacity components that are LDA-qualified */
export function getQualifiedCapacityMwCovered(
  contracts: LinkedContract[], 
  loadLda: string,
  year?: number
): number {
  console.log(`[getQualifiedCapacityMwCovered] loadLda=${loadLda}, year=${year}, total contracts=${contracts.length}`);
  
  return contracts.reduce((total, contract) => {
    // Filter by year if specified
    if (year && !isContractActiveAt(contract, year, 6)) {
      console.log(`[getQualifiedCapacityMwCovered] Contract ${contract.projectName} - not active in year ${year}`);
      return total;
    }
    
    // Ensure contract has components
    const normalizedContract = ensureContractComponents(contract);
    
    // Find capacity components
    const capacityComponents = normalizedContract.components!.filter(c => c.type === 'capacity');
    
    console.log(`[getQualifiedCapacityMwCovered] Contract ${contract.projectName} - capacity components=${capacityComponents.length}`);
    
    for (const component of capacityComponents) {
      // Check LDA qualification - use contract LDA if component LDA not specified
      const genLda = component.lda || contract.lda;
      
      console.log(`[getQualifiedCapacityMwCovered] Component: genLda=${genLda}, loadLda=${loadLda}, mwCovered=${component.mwCovered}`);
      
      if (genLda && canDeliverCapacity(genLda, loadLda)) {
        console.log(`[getQualifiedCapacityMwCovered] ✓ LDA qualified - adding ${component.mwCovered}MW`);
        total += component.mwCovered;
      } else {
        console.log(`[getQualifiedCapacityMwCovered] ✗ LDA not qualified - genLda=${genLda}, loadLda=${loadLda}`);
      }
    }
    
    return total;
  }, 0);
}

/** Get all contracts that have a specific component type */
export function getContractsWithComponent(
  contracts: LinkedContract[], 
  componentType: ContractComponentType,
  year?: number
): LinkedContract[] {
  return contracts.filter(contract => {
    if (year && !isContractActiveAt(contract, year, 6)) return false;
    return contract.components?.some(c => c.type === componentType) || false;
  });
}

/** Ensure contract has components (backward compatibility) */
export function ensureContractComponents(contract: LinkedContract): LinkedContract {
  if (contract.components && contract.components.length > 0) {
    return contract; // Already has components
  }
  
  // Create default energy component from legacy fields
  return {
    ...contract,
    components: [
      {
        type: 'energy',
        mwCovered: contract.mwCovered,
        pricePerMwh: contract.pricePerMwh,
        shape: contract.shape,
        tier: contract.tier
      }
    ]
  };
}

/** Get capacity component MW for a contract (backward compatibility) */
export function getContractCapacityMw(contract: LinkedContract): number {
  // Ensure contract has components
  const normalizedContract = ensureContractComponents(contract);
  
  // Try new component system first (components is guaranteed to exist after ensureContractComponents)
  const capacityComponent = normalizedContract.components!.find(c => c.type === 'capacity');
  if (capacityComponent) return capacityComponent.mwCovered;
  
  // Fall back to legacy field (for energy-only contracts, capacity = 0)
  return 0;
}

/** Get energy component MW for a contract (backward compatibility) */
export function getContractEnergyMw(contract: LinkedContract): number {
  // Ensure contract has components
  const normalizedContract = ensureContractComponents(contract);
  
  // Try new component system first (components is guaranteed to exist after ensureContractComponents)
  const energyComponent = normalizedContract.components!.find(c => c.type === 'energy');
  if (energyComponent) return energyComponent.mwCovered;
  
  // Fall back to legacy field
  return contract.mwCovered;
}

/** Get energy shape for a contract (backward compatibility) */
export function getContractEnergyShape(contract: LinkedContract): ContractShape {
  // Ensure contract has components
  const normalizedContract = ensureContractComponents(contract);
  
  // Try new component system first (components is guaranteed to exist after ensureContractComponents)
  const energyComponent = normalizedContract.components!.find(c => c.type === 'energy');
  if (energyComponent?.shape) return energyComponent.shape;
  
  // Fall back to legacy field
  return contract.shape;
}

/** Get energy tier for a contract (backward compatibility) */
export function getContractEnergyTier(contract: LinkedContract): ContractTier {
  // Ensure contract has components
  const normalizedContract = ensureContractComponents(contract);
  
  // Try new component system first (components is guaranteed to exist after ensureContractComponents)
  const energyComponent = normalizedContract.components!.find(c => c.type === 'energy');
  if (energyComponent?.tier) return energyComponent.tier;
  
  // Fall back to legacy field
  return contract.tier;
}

// Standard load-tier colors used by the chart backgrounds.
export const LOAD_COLORS = {
  base: '#0d9488', // teal-600 — baseload (uncovered load)
  peak: '#f59e0b', // amber-500 — peak (uncovered load)
} as const;

// All contract patterns share the same dark foreground — patterns differentiate
// contracts, not color.
export const PATTERN_FG = '#1e293b'; // slate-800

// Pattern mapping for each generation type - consistent across all contracts
export const GENERATION_TYPE_PATTERNS: Record<string, 'diagonal' | 'dots' | 'crosshatch' | 'vertical' | 'wave' | 'grid' | 'horizontal' | 'zigzag'> = {
  'Solar': 'dots',
  'Wind': 'diagonal',
  'Nuclear': 'wave',
  'Hybrid': 'crosshatch',
  'Combined Cycle': 'vertical',
  'Peaker': 'grid',
  'Battery': 'horizontal',
  'Hydro': 'zigzag',
};

// Stacking order for generation types (bottom to top in stack)
export const GENERATION_TYPE_ORDER: string[] = [
  'Solar',
  'Wind', 
  'Hydro',
  'Nuclear',
  'Hybrid',
  'Combined Cycle',
  'Peaker',
  'Battery',
];

/** Get pattern for a generation type */
export function getPatternForGenerationType(generationType: string): 'diagonal' | 'dots' | 'crosshatch' | 'vertical' | 'wave' | 'grid' | 'horizontal' | 'zigzag' {
  return GENERATION_TYPE_PATTERNS[generationType] || 'grid';
}

/** Stable SVG pattern ID by gen type — shared by chart bars and legend swatches */
export function genTypePatternId(generationType: string): string {
  return `pat-gentype-${generationType.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

/** Get sort order for a generation type */
export function getGenerationTypeOrder(generationType: string): number {
  const index = GENERATION_TYPE_ORDER.indexOf(generationType);
  return index === -1 ? 999 : index; // Unknown types go to the end
}

// Site facility definitions with type, volume, and target COD
export const SITE_FACILITIES: Record<string, SiteFacilityInfo> = {
  'ashburn-dc': {
    siteKey: 'ashburn-dc',
    facilityType: 'brownfield', // Operational data center
    annualMWh: 175200, // 20 MW * 8760 hours
    peakMWh: 39420,   // ~22.5% peak
    offPeakMWh: 13140, // ~7.5% off-peak
    targetCOD: '2024-01-01', // Already operational
  },
  'manassas-industrial': {
    siteKey: 'manassas-industrial',
    facilityType: 'brownfield', // Operational industrial
    annualMWh: 262800, // 30 MW * 8760 hours
    peakMWh: 26280,
    offPeakMWh: 8760,
    targetCOD: '2023-06-01', // Already operational
  },
  'sterling-hyperscale': {
    siteKey: 'sterling-hyperscale',
    facilityType: 'greenfield', // Under construction
    annualMWh: 657000, // 75 MW * 8760 hours
    peakMWh: 328500, // ~50% peak
    offPeakMWh: 109500, // ~16.7% off-peak
    targetCOD: '2027-03-01', // Future COD
  },
  'richmond-edge': {
    siteKey: 'richmond-edge',
    facilityType: 'greenfield', // Planned
    annualMWh: 17520, // 2 MW * 8760 hours
    peakMWh: 13140,
    offPeakMWh: 4380,
    targetCOD: '2028-01-01', // Future COD
  },
};

// Helper to calculate months until COD
function monthsUntilCOD(codString: string | null): number {
  if (!codString) return 0;
  const cod = new Date(codString);
  const now = new Date();
  return Math.max(0, (cod.getFullYear() - now.getFullYear()) * 12 + (cod.getMonth() - now.getMonth()));
}

// Generate brownfield hedges with year-based degradation
// 2026: ~100%, 2027: ~80%, 2028: 50-60% with staggered contracts
function generateBrownfieldHedges(site: SiteFacilityInfo): LinkedContract[] {
  // Brownfield: High hedge % with year-based degradation
  // Baseload = flat load, Peak = variable load above baseload
  const baseloadMw = site.annualMWh / 8760 * 0.80; // ~80% baseload (typical data center)
  const peakMw = (site.annualMWh / 8760) - baseloadMw; // Remaining is peak
  
  // Target hedge coverage by year (baseload focus with over-hedge for demo)
  const baseload2026 = baseloadMw * 1.05; // 105% - slight over-hedge for demo
  const baseload2027 = baseloadMw * 0.85; // 85% - near full coverage
  
  const peak2027 = peakMw * 0.70; // 70% peak coverage  
  const peak2028 = peakMw * 0.50; // 50% peak coverage
  
  // Contract 1: Core baseload nuclear - runs through 2027
  const baseloadCore = baseload2027;
  
  // Contract 2: Peak solar - runs through 2028 (solar follows peak pattern)
  const solarPeak = peak2028 * 0.70;
  
  // Contract 3: Front-loaded baseload gas - fills 2026 over-hedge gap, ends 2026
  const baseloadFront = baseload2026 - baseloadCore;
  
  // Contract 4: Peak wind - covers remaining peak hours 2026-2027
  const windPeak = peak2027 * 0.60;
  
  return [
    // Core baseload nuclear - flat 24/7, runs 2026-2027
    {
      projectName: 'North Anna Nuclear',
      generationType: 'Nuclear',
      mwCovered: Math.round(baseloadCore * 10) / 10,
      pricePerMwh: 35 + Math.random() * 5,
      shape: 'flat',
      tier: 'base',
      pattern: 'wave',
      startYear: 2026,
      startMonth: 1,
      endYear: 2027,
      endMonth: 12,
    },
    // Solar PPA - follows peak pattern (midday), runs 2026-2028
    {
      projectName: 'Dominion Solar PPA',
      generationType: 'Solar',
      mwCovered: Math.round(solarPeak * 10) / 10,
      pricePerMwh: 28 + Math.random() * 4,
      shape: 'solar',
      tier: 'peak',
      pattern: 'dots',
      startYear: 2026,
      startMonth: 1,
      endYear: 2028,
      endMonth: 12,
    },
    // Gas baseload - fills 2026 over-hedge, ends 2026 (creates 2027 step down)
    {
      projectName: 'Calpine Gas Front',
      generationType: 'Combined Cycle',
      mwCovered: Math.round(baseloadFront * 10) / 10,
      pricePerMwh: 32 + Math.random() * 4,
      shape: 'flat',
      tier: 'base',
      pattern: 'grid',
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 12,
    },
    // Wind - covers morning/evening peak, runs 2026-2027 then drops
    {
      projectName: 'Highlands Wind',
      generationType: 'Wind',
      mwCovered: Math.round(windPeak * 10) / 10,
      pricePerMwh: 30 + Math.random() * 4,
      shape: 'wind',
      tier: 'peak',
      pattern: 'diagonal',
      startYear: 2026,
      startMonth: 1,
      endYear: 2027,
      endMonth: 12,
    },
  ];
}

// Generate greenfield hedges (1-2 deals, high cancellation risk, mostly unhedged)
function generateGreenfieldHedges(site: SiteFacilityInfo): LinkedContract[] {
  const monthsToCOD = monthsUntilCOD(site.targetCOD);
  
  // Greenfields: only 20-40% hedged, 1-2 deals with cancellation risk
  const hedgeRatio = 0.20 + Math.random() * 0.20; // 20-40%
  const totalHedgeMW = (site.annualMWh / 8760) * hedgeRatio;
  
  // Usually just 1 deal (sometimes 2 if near COD)
  const numDeals = monthsToCOD < 12 ? Math.floor(Math.random() * 2) + 1 : 1;
  
  const hedges: LinkedContract[] = [];
  
  if (numDeals >= 1) {
    hedges.push({
      projectName: 'Conditional Solar',
      generationType: 'Solar',
      mwCovered: Math.round(totalHedgeMW * 0.60 * 10) / 10,
      pricePerMwh: 32 + Math.random() * 6,
      shape: 'solar',
      tier: 'peak',
      pattern: 'dots',
      startYear: new Date().getFullYear(),
      startMonth: 1,
      endYear: 2030,
      endMonth: 12,
    });
  }

  if (numDeals >= 2) {
    hedges.push({
      projectName: 'Wind Option',
      generationType: 'Wind',
      mwCovered: Math.round(totalHedgeMW * 0.40 * 10) / 10,
      pricePerMwh: 30 + Math.random() * 5,
      shape: 'wind',
      tier: 'peak',
      pattern: 'diagonal',
      startYear: new Date().getFullYear(),
      startMonth: 6,
      endYear: 2029,
      endMonth: 12,
    });
  }
  
  return hedges;
}

// Generate hedges based on facility type and COD timing
export function generateHedgesForSite(site: SiteFacilityInfo): LinkedContract[] {
  if (site.facilityType === 'brownfield') {
    return generateBrownfieldHedges(site);
  } else {
    return generateGreenfieldHedges(site);
  }
}

// Map real buyer projects from database to LinkedContract format
function mapBuyerProjectToContract(project: BuyerProject, siteKey: string): LinkedContract | null {
  const mw = project.target_capacity_mw ?? (project.target_annual_quantity_mwh ? project.target_annual_quantity_mwh / 8760 : 0);
  if (mw <= 0) return null;
  
  const isBrownfield = project.project_type === 'brownfield';
  const genTypes = project.preferred_generation_types ?? [];
  const hasSolar = genTypes.some(g => g.toLowerCase().includes('solar'));
  const hasWind = genTypes.some(g => g.toLowerCase().includes('wind'));
  const hasNuclear = genTypes.some(g => g.toLowerCase().includes('nuclear'));
  const hasGas = genTypes.some(g => g.toLowerCase().includes('gas') || g.toLowerCase().includes('combined'));
  
  // Default to solar if no type specified
  const generationType: LinkedContract['generationType'] = hasNuclear ? 'Nuclear' : hasSolar ? 'Solar' : hasWind ? 'Wind' : hasGas ? 'Combined Cycle' : 'Solar';
  
  // Shape based on generation type
  const shape: ContractShape = generationType === 'Solar' ? 'solar' : generationType === 'Wind' ? 'wind' : 'flat';
  
  // Tier: baseload for nuclear/gas, peak for solar/wind
  const tier: ContractTier = (generationType === 'Nuclear' || generationType === 'Combined Cycle') ? 'base' : 'peak';
  
  // Pattern based on generation type
  const pattern = getPatternForGenerationType(generationType);
  
  // Term: brownfield gets longer terms, greenfield shorter
  const termYears = isBrownfield ? (5 + Math.floor(Math.random() * 3)) : (2 + Math.floor(Math.random() * 3));
  const startYear = project.target_cod ? new Date(project.target_cod).getFullYear() : 2026;
  const endYear = startYear + termYears;
  
  // Price based on generation type
  const pricePerMwh = generationType === 'Nuclear' ? 35 + Math.random() * 5 : generationType === 'Solar' ? 28 + Math.random() * 4 : 30 + Math.random() * 4;
  
  return {
    projectName: `${project.name} (${siteKey})`,
    generationType,
    mwCovered: Math.round(mw * 10) / 10,
    pricePerMwh,
    shape,
    tier,
    pattern,
    startYear,
    startMonth: 1,
    endYear,
    endMonth: 12,
    components: [
      {
        type: 'energy',
        mwCovered: Math.round(mw * 10) / 10,
        pricePerMwh,
        shape,
        tier
      }
    ]
  };
}

// Fetch real buyer projects from database and convert to hedges
export async function getRealProjectsAsHedges(siteKey: string): Promise<LinkedContract[]> {
  try {
    const token = localStorage.getItem('pd_access_token');
    const targetType = SITE_FACILITIES[siteKey]?.facilityType ?? 'brownfield';
    const response = await fetch(`${API_BASE_URL}/projects/buyer/my-projects`, {
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    });
    const { projects } = (response.ok ? await response.json() : { projects: [] }) as {
      projects: BuyerProject[];
    };

    const filtered = (projects ?? [])
      .filter((p) => p.project_type === targetType)
      .slice(0, 4);

    if (filtered.length === 0) {
      // Fallback to generated hedges if no real projects
      const facility = SITE_FACILITIES[siteKey];
      return facility ? generateHedgesForSite(facility) : [];
    }

    return filtered
      .map((p) => mapBuyerProjectToContract(p, siteKey))
      .filter((c): c is LinkedContract => c !== null);
  } catch {
    // Fallback on error
    const facility = SITE_FACILITIES[siteKey];
    return facility ? generateHedgesForSite(facility) : [];
  }
}

// Per-site contract assignments. Terms are staggered intentionally so the
// chart reveals month/year hedge variation:
//
//   • Tucker Mtn Wind        — legacy hedge, expires Dec 2027 (mid-scope)
//   • Front Royal Hybrid     — short term, expires Dec 2027 (exposes Manassas peak in 2028)
//   • Susquehanna SMR        — forward sale, both Ashburn + Sterling slices come online Jan 2027
//   • Marcus Hook CCGT II    — comes online Apr 2027 (mid-quarter start)
//   • Loudoun Solar Garden   — comes online Jul 2027 (matches Manassas's +25% load bump)
//   • Garrett Ridge Wind     — expires Dec 2028 (last month of scope)
export const LINKED_CONTRACTS: Record<string, LinkedContract[]> = {
  'ashburn-dc': [
    // Big nuclear baseload — comes online with Phase II expansion (Jan 2027)
    { projectName: 'Susquehanna SMR',         generationType: 'Nuclear',        mwCovered: 20, pricePerMwh: 35, shape: 'flat',    tier: 'base', pattern: getPatternForGenerationType('Nuclear'),
      startYear: 2027, startMonth: 1,  endYear: 2033, endMonth: 12 },
    // Long-term solar PPA — covers the full scope and beyond
    { projectName: 'Spotsylvania Solar II',   generationType: 'Solar',          mwCovered: 8,  pricePerMwh: 28, shape: 'solar',   tier: 'peak', pattern: getPatternForGenerationType('Solar'),
      startYear: 2026, startMonth: 1,  endYear: 2032, endMonth: 12 },
    // Legacy wind — expires end of 2027, so 2028 loses 4 MW peak hedge
    { projectName: 'Tucker Mountain Wind',    generationType: 'Wind',           mwCovered: 4,  pricePerMwh: 31, shape: 'wind',    tier: 'peak', pattern: getPatternForGenerationType('Wind'),
      startYear: 2024, startMonth: 1,  endYear: 2027, endMonth: 12 },
  ],
  'manassas-industrial': [
    // Strict-allocation baseload contract — 20 MW exceeds Manassas's 15 MW
    // baseload tier on purpose, so the chart reveals the 5 MW over-hedge.
    { projectName: 'North Anna Allocation',   generationType: 'Nuclear',        mwCovered: 20, pricePerMwh: 38, shape: 'flat',    tier: 'base', pattern: getPatternForGenerationType('Nuclear'),
      startYear: 2026, startMonth: 1,  endYear: 2030, endMonth: 12 },
    // Short hybrid hedge — rolls off Dec 2027, leaving 2028 peak exposed
    { projectName: 'Front Royal Hybrid',      generationType: 'Hybrid',         mwCovered: 10, pricePerMwh: 45, shape: 'evening', tier: 'peak', pattern: getPatternForGenerationType('Hybrid'),
      startYear: 2026, startMonth: 1,  endYear: 2027, endMonth: 12 },
    // Comes online Jul 2027 — coincides with the +25% Manassas load bump
    { projectName: 'Loudoun Solar Garden',    generationType: 'Solar',          mwCovered: 5,  pricePerMwh: 28, shape: 'solar',   tier: 'peak', pattern: getPatternForGenerationType('Solar'),
      startYear: 2027, startMonth: 7,  endYear: 2032, endMonth: 12 },
  ],
  'sterling-hyperscale': [
    // Bigger Susquehanna slice — Jan 2027 online with Sterling's allocation
    { projectName: 'Susquehanna SMR',         generationType: 'Nuclear',        mwCovered: 30, pricePerMwh: 35, shape: 'flat',    tier: 'base', pattern: getPatternForGenerationType('Nuclear'),
      startYear: 2027, startMonth: 1,  endYear: 2033, endMonth: 12,
      components: [
        { type: 'energy', mwCovered: 30, pricePerMwh: 35, shape: 'flat', tier: 'base' }
      ]},
    // Long-term hybrid for evening peaks
    { projectName: 'Hudson Co. Hybrid',       generationType: 'Hybrid',         mwCovered: 8,  pricePerMwh: 45, shape: 'evening', tier: 'peak', pattern: getPatternForGenerationType('Hybrid'),
      startYear: 2026, startMonth: 1,  endYear: 2032, endMonth: 12,
      components: [
        { type: 'energy', mwCovered: 8, pricePerMwh: 45, shape: 'evening', tier: 'peak' }
      ]},
    // Wind expires end of 2028 — last month of scope
    { projectName: 'Garrett Ridge Wind',      generationType: 'Wind',           mwCovered: 12, pricePerMwh: 31, shape: 'wind',    tier: 'peak', pattern: getPatternForGenerationType('Wind'),
      startYear: 2026, startMonth: 1,  endYear: 2028, endMonth: 12,
      components: [
        { type: 'energy', mwCovered: 12, pricePerMwh: 31, shape: 'wind', tier: 'peak' }
      ]},
    // CCGT — comes online Apr 2027 (mid-quarter)
    { projectName: 'Marcus Hook CCGT II',     generationType: 'Combined Cycle', mwCovered: 10, pricePerMwh: 42, shape: 'flat',    tier: 'base', pattern: getPatternForGenerationType('Combined Cycle'),
      startYear: 2027, startMonth: 4,  endYear: 2034, endMonth: 3,
      components: [
        { type: 'energy', mwCovered: 10, pricePerMwh: 42, shape: 'flat', tier: 'base' }
      ]},
    // NEW: Bundled contract example - BESS with both capacity and energy components
    // NOTE: Sterling BESS Bundle is only a try-on, not a signed contract
    // { projectName: 'Sterling BESS Bundle',    generationType: 'Battery',        mwCovered: 75, pricePerMwh: 55, shape: 'flat',    tier: 'base', pattern: getPatternForGenerationType('Battery'),
    //   startYear: 2026, startMonth: 1,  endYear: 2035, endMonth: 12,
    //   lda: 'DOM', // Sterling is in Dominion LDA
    //   components: [
    //     { type: 'capacity', mwCovered: 75, pricePerMwYear: 150000, lda: 'DOM' }, // $150,000 per MW-year for capacity
    //     { type: 'energy',   mwCovered: 75, pricePerMwh: 55, shape: 'flat', tier: 'base' }, // $55/MWh for energy
    //     { type: 'rec',      mwCovered: 75, pricePerMwh: 15 } // $15/MWh for RECs
    //   ]},
  ],
};

// Hour-of-day shape factors (HE 0–23). Returns 0..1 of contracted MW that
// the contract delivers for that hour (assumed monthly-average behavior).
const SHAPE_HOUR: Record<ContractShape, number[]> = {
  // Nuclear / baseload: flat 100% all hours
  flat:    Array(24).fill(1.0),
  // Solar: bell curve centered around HE 12, zero at night
  solar: [
    0, 0, 0, 0, 0, 0, 0.05, 0.20, 0.45, 0.75, 0.92, 1.00,
    0.98, 0.92, 0.82, 0.66, 0.45, 0.22, 0.05, 0, 0, 0, 0, 0,
  ],
  // Wind: variable; average ~0.35, slightly stronger overnight
  wind: [
    0.42, 0.45, 0.48, 0.50, 0.48, 0.42, 0.35, 0.30, 0.28, 0.25, 0.25, 0.28,
    0.32, 0.34, 0.35, 0.37, 0.40, 0.42, 0.45, 0.48, 0.50, 0.48, 0.45, 0.42,
  ],
  // Evening peak / Hybrid + storage: discharges during dispatch window
  evening: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0.10, 0.40, 0.85, 1.00, 1.00, 0.85, 0.55, 0.25, 0.05, 0,
  ],
};

// Month-factor — small seasonal variation so contracts feel realistic
const MONTH_FACTOR: Record<ContractShape, number[]> = {
  // Nuclear: ~constant, tiny refueling outage effect in spring
  flat:    [1.00, 1.00, 0.96, 0.92, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
  // Solar: stronger late spring through early fall
  solar:   [0.78, 0.84, 1.00, 1.10, 1.18, 1.20, 1.18, 1.12, 1.00, 0.88, 0.78, 0.72],
  // Wind: stronger winter / early spring, weaker summer
  wind:    [1.18, 1.15, 1.20, 1.10, 0.92, 0.78, 0.72, 0.78, 0.92, 1.05, 1.15, 1.20],
  // Evening peakers: ~constant
  evening: [0.95, 0.95, 1.00, 1.00, 1.05, 1.10, 1.10, 1.10, 1.05, 1.00, 0.98, 0.95],
};

/** MW delivered by a contract at a given hour-of-day and month. */
export function contractMwAtHour(c: LinkedContract, hour: number, month: number): number {
  // BESS special handling - configurable charge/discharge
  if (c.generationType === 'Battery') {
    const dischargeHours = c.bessDischargeHours || [15, 16, 17, 18];
    const chargeHours = c.bessChargeHours || [0, 1, 2, 3, 4, 5, 24];
    const efficiency = (c.bessEfficiency || 85) / 100;
    
    if (dischargeHours.includes(hour)) {
      return c.mwCovered; // Full discharge capacity during discharge hours
    }
    if (chargeHours.includes(hour)) {
      // Charge requires more input due to efficiency loss
      return -c.mwCovered / efficiency; 
    }
    return 0; // Idle during other hours
  }
  const h = SHAPE_HOUR[c.shape][hour] ?? 0;
  const m = MONTH_FACTOR[c.shape][month - 1] ?? 1;
  return Math.max(0, Math.min(c.mwCovered, c.mwCovered * h * m));
}

/** Average MW delivered by a contract over all hours of a given month. */
export function contractMwForMonth(c: LinkedContract, month: number): number {
  let sum = 0;
  for (let h = 0; h < 24; h++) sum += contractMwAtHour(c, h, month);
  return sum / 24;
}

/** Average MW delivered by a contract for a given hour, averaged across months. */
export function contractMwForHourAvg(c: LinkedContract, hour: number): number {
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += contractMwAtHour(c, hour, m);
  return sum / 12;
}

// ── Year-aware variants — gate by `isContractActiveAt` so out-of-term
// months contribute 0 MW, and scale by `getContractLoadMultAt` so the
// contract's gen shape tracks the forecasted load month-by-month and
// year-by-year.

/** MW delivered for a (hour, month, year) — 0 outside the contract's term;
 *  scaled by the load multiplier of the sites this contract hedges. */
export function contractMwAtHourInYear(
  c: LinkedContract, hour: number, month: number, year: number,
): number {
  if (!isContractActiveAt(c, year, month)) return 0;
  return contractMwAtHour(c, hour, month) * getContractLoadMultAt(c, year, month);
}

/** Average MW for a given (year, month) — 0 if out-of-term; load-tracked. */
export function contractMwForMonthInYear(
  c: LinkedContract, year: number, month: number,
): number {
  if (!isContractActiveAt(c, year, month)) return 0;
  return contractMwForMonth(c, month) * getContractLoadMultAt(c, year, month);
}

/** Year-average MW at a given hour — sums in-term months × per-month load
 *  multiplier, divides by 12. A contract active 6/12 months therefore
 *  contributes ~half of its full rate, weighted by load growth in those
 *  months. */
export function contractMwForHourAvgInYear(
  c: LinkedContract, hour: number, year: number,
): number {
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    if (isContractActiveAt(c, year, m)) {
      sum += contractMwAtHour(c, hour, m) * getContractLoadMultAt(c, year, m);
    }
  }
  return sum / 12;
}

/** Collect contracts for a set of in-scope site keys (deduped by project name,
 *  with MW summed when the same project covers multiple sites). When the same
 *  project has different terms across sites, the merged term is the UNION
 *  (earliest start, latest end) — an approximation that's exact when both
 *  sites share a term and a slight overstatement otherwise.
 *
 *  Sets `perSiteMw` on every returned contract so downstream code can
 *  apply per-site load multipliers (mid-year volume bumps, etc.) without
 *  losing the per-source MW shares the merge collapsed.
 *
 *  Project name includes sites using the contract as hedge in parentheses. */
export function getContractsForSites(siteKeys: string[]): LinkedContract[] {
  const merged = new Map<string, LinkedContract>();
  const earlier = (ay: number, am: number, by: number, bm: number) =>
    ay < by || (ay === by && am < bm);
  for (const key of siteKeys) {
    // Prefer static LINKED_CONTRACTS; fall back to generated hedges only when absent
    const staticContracts = LINKED_CONTRACTS[key];
    const facility = SITE_FACILITIES[key];
    const list = staticContracts ?? (facility ? generateHedgesForSite(facility) : []);
    for (const c of list) {
      const existing = merged.get(c.projectName);
      if (existing) {
        const startEarlier = earlier(c.startYear, c.startMonth, existing.startYear, existing.startMonth);
        const endLater = earlier(existing.endYear, existing.endMonth, c.endYear, c.endMonth);
        merged.set(c.projectName, {
          ...existing,
          mwCovered: Math.round((existing.mwCovered + c.mwCovered) * 10) / 10,
          startYear:  startEarlier ? c.startYear  : existing.startYear,
          startMonth: startEarlier ? c.startMonth : existing.startMonth,
          endYear:    endLater     ? c.endYear    : existing.endYear,
          endMonth:   endLater     ? c.endMonth   : existing.endMonth,
          perSiteMw: [...(existing.perSiteMw ?? []), { siteKey: key, mwCovered: Math.round(c.mwCovered * 10) / 10 }],
        });
      } else {
        merged.set(c.projectName, {
          ...c,
          mwCovered: Math.round(c.mwCovered * 10) / 10,
          perSiteMw: [{ siteKey: key, mwCovered: Math.round(c.mwCovered * 10) / 10 }],
        });
      }
    }
  }

  // Post-process: append site list to project name (e.g., "North Anna Nuclear (ashburn-dc, manassas-industrial)")
  const result: LinkedContract[] = [];
  for (const contract of merged.values()) {
    const sites = contract.perSiteMw?.map(s => s.siteKey) ?? [];
    const uniqueSites = [...new Set(sites)];
    const siteSuffix = uniqueSites.length > 0
      ? ` (${uniqueSites.join(', ')})`
      : '';
    result.push({
      ...contract,
      projectName: `${contract.projectName}${siteSuffix}`,
    });
  }
  return result;
}

/** MW-weighted average load multiplier across the sites this contract hedges,
 *  for a given (year, month). Lets contract delivery track forecasted load:
 *  a contract that hedges a site with a +25% bump in Jul'27 grows by the same
 *  fraction in that month (proportional to its MW share at that site).
 *  Falls back to 1 when the contract has no `perSiteMw` info or none of its
 *  sites have documented load adjustments. */
export function getContractLoadMultAt(
  c: LinkedContract, year: number, month: number,
): number {
  const sources = c.perSiteMw;
  if (!sources || sources.length === 0) return 1;
  let weightedSum = 0;
  let totalMw = 0;
  for (const { siteKey, mwCovered } of sources) {
    const profile = LOAD_PROFILE_MAP[siteKey];
    if (!profile) continue;
    const mult = getLoadMultiplierForYearMonth(profile, year, month);
    weightedSum += mult * mwCovered;
    totalMw += mwCovered;
  }
  return totalMw > 0 ? weightedSum / totalMw : 1;
}

/** SVG pattern id keyed by project + visual tier — a baseload contract
 *  spilling into peak needs the amber-bg variant of the same pattern style. */
export function patternId(c: LinkedContract, tier?: ContractTier): string {
  const t = tier ?? c.tier;
  return `pat-${c.pattern}-${t}-${c.projectName.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

// PJM convention used by the rest of the app: HE 8–23 = on-peak, HE 24 + 1–7 = off-peak.
// In the 0-indexed hour-of-day data, that's hours 7–22 vs hours {0..6, 23}.
const ON_PEAK_HOURS = new Set([7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]);

/** Effective on/off-peak hedge percentages for a site, derived from
 *  the linked contracts vs. the site's load profile. Capped at 100% per hour —
 *  over-hedged hours count as fully hedged (100%) for the percentage calculation.
 *  Formula: average of min(hedge%, 100%) weighted by load. */
export function getDerivedHedgePcts(siteKey: string): { onPeak: number; offPeak: number } {
  const profile: SiteLoadProfile | undefined = LOAD_PROFILE_MAP[siteKey];
  if (!profile) return { onPeak: 0, offPeak: 0 };
  const contracts = LINKED_CONTRACTS[siteKey] ?? [];

  let onLoad = 0, offLoad = 0;
  let onHedgedCapped = 0, offHedgedCapped = 0;

  for (let h = 0; h < 24; h++) {
    const isOnPeak = ON_PEAK_HOURS.has(h);
    const pts = profile.loadShape.filter((p) => p.hour === h);
    const avgLoad = pts.reduce((s, p) => s + p.totalMw, 0) / 12;
    const hedgeMw = contracts.reduce((s, c) => s + contractMwForHourAvg(c, h), 0);
    // Cap hedge at 100% of load for this hour (no over-hedge counting)
    const cappedHedge = Math.min(hedgeMw, avgLoad);
    if (isOnPeak) { onLoad += avgLoad; onHedgedCapped += cappedHedge; }
    else          { offLoad += avgLoad; offHedgedCapped += cappedHedge; }
  }

  return {
    onPeak:  onLoad  > 0 ? Math.round((onHedgedCapped  / onLoad)  * 100) : 0,
    offPeak: offLoad > 0 ? Math.round((offHedgedCapped / offLoad) * 100) : 0,
  };
}

/** Annual MWh contracted by a single contract — derived from its hourly
 *  delivery shape × 365 days. Term-agnostic (full-rate). */
export function getContractAnnualMwh(c: LinkedContract): number {
  let dailyMwh = 0;
  for (let h = 0; h < 24; h++) dailyMwh += contractMwForHourAvg(c, h);
  return dailyMwh * 365;
}

/** Annual MWh contracted by a single contract for a SPECIFIC year — gates by
 *  the contract's term and scales by the per-month load multiplier of the
 *  hedged sites. Days per month follow the actual calendar (28–31). */
export function getContractAnnualMwhForYear(c: LinkedContract, year: number): number {
  let total = 0;
  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m <= 12; m++) {
    if (!isContractActiveAt(c, year, m)) continue;
    const mult = getContractLoadMultAt(c, year, m);
    let dayMwh = 0;
    for (let h = 0; h < 24; h++) dayMwh += contractMwAtHour(c, h, m) * mult;
    total += dayMwh * DAYS_PER_MONTH[m - 1];
  }
  return total;
}

/** Total annual MWh contracted across a list of in-scope contracts.
 *  Term-agnostic (full-rate). */
export function getTotalTransactionMwh(contracts: LinkedContract[]): number {
  return contracts.reduce((s, c) => s + getContractAnnualMwh(c), 0);
}

/** Scope-averaged annual MWh contracted — averages each contract's
 *  year-specific (term-gated) annual MWh across the scope years. Use this
 *  when you need a single hedge figure that respects staggered terms. */
export function getScopeAvgTransactionMwh(
  contracts: LinkedContract[], startYear: number, endYear: number,
): number {
  if (endYear < startYear) return 0;
  const yearCount = endYear - startYear + 1;
  let total = 0;
  for (let y = startYear; y <= endYear; y++) {
    for (const c of contracts) total += getContractAnnualMwhForYear(c, y);
  }
  return total / yearCount;
}

// ─── Capacity sources (parallel to LinkedContract, but for capacity MW) ─────
//
// Capacity is procured by channel — utility BRA pass-through, multi-year
// fixed via competitive supplier, BTM BESS, or BTM Mini-NG. Each source
// covers some MW of the site's capacity. Sterling is greenfield so its list
// is empty until a settlement option is chosen.

export type CapacityChannel =
  | 'utility-bra'
  | 'competitive-fixed'
  | 'btm-bess'
  | 'btm-ng';

export interface CapacitySource {
  sourceName: string;
  channel: CapacityChannel;
  mwCovered: number;
  pattern: 'diagonal' | 'dots' | 'crosshatch' | 'vertical' | 'wave' | 'grid' | 'horizontal' | 'zigzag';
}

// Single solid color for the capacity bar; pattern foreground stays slate.
export const CAPACITY_COLOR = '#6366f1'; // indigo-500

export const LINKED_CAPACITY_SOURCES: Record<string, CapacitySource[]> = {
  'ashburn-dc': [
    { sourceName: 'Dominion BRA Pass-Through', channel: 'utility-bra', mwCovered: 50, pattern: 'wave' },
  ],
  'manassas-industrial': [
    { sourceName: 'Dominion BRA Pass-Through', channel: 'utility-bra', mwCovered: 30, pattern: 'wave' },
  ],
  'sterling-hyperscale': [
    // Greenfield — capacity not yet settled. Bar will show fully uncovered.
  ],
};

export function getCapacitySourcesForSites(siteKeys: string[]): CapacitySource[] {
  const merged = new Map<string, CapacitySource>();
  for (const key of siteKeys) {
    const list = LINKED_CAPACITY_SOURCES[key] ?? [];
    for (const s of list) {
      const existing = merged.get(s.sourceName);
      if (existing) {
        merged.set(s.sourceName, { ...existing, mwCovered: existing.mwCovered + s.mwCovered });
      } else {
        merged.set(s.sourceName, { ...s });
      }
    }
  }
  return Array.from(merged.values());
}

/** Stable SVG pattern id per capacity source. */
export function capacityPatternId(s: CapacitySource): string {
  return `cap-pat-${s.pattern}-${s.sourceName.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

/** Stable dataKey suffix per source — same trick as `contractKey`. */
export function capacitySourceKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_');
}

// Helper to get hedge contracts for any site — static LINKED_CONTRACTS take priority
export function getHedgesForSite(siteKey: string): LinkedContract[] {
  const staticContracts = LINKED_CONTRACTS[siteKey];
  if (staticContracts) return staticContracts;
  const facility = SITE_FACILITIES[siteKey];
  return facility ? generateHedgesForSite(facility) : [];
}
