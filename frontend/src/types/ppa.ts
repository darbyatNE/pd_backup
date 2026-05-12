// Power Dime PPA/VPPA TypeScript Types
// Based on VPPA Template (Great Britain) and RFP Term Sheet

// ============================================================================
// ENUMS (matching database enums)
// ============================================================================

export type PriceCurrency = 'GBP' | 'USD' | 'EUR';

export type FloatingPriceSource = 'N2EX' | 'EPEX' | 'PJM' | 'other';

export type EACScheme = 'REGO' | 'AEPS' | 'REC' | 'GO' | 'other';

export type GenerationModuleType = 'solar_pv' | 'wind_turbine' | 'battery' | 'hybrid' | 'nuclear' | 'hydrogen';

export type ProcessingStatus = 'pending' | 'processing' | 'processed' | 'needs_review' | 'verified';

export type SettlementType = 'physical' | 'financial' | 'contract_for_difference';

export type GenerationTypeExtended = 'Solar' | 'Wind' | 'Nuclear' | 'Battery' | 'Hydrogen' | 'Hybrid' | 'Combined Cycle' | 'Peaker';

// ============================================================================
// SELLER PROJECT (VPPA) INTERFACES
// ============================================================================

/**
 * VPPA Pricing Terms
 * Based on VPPA Template Part A - Key Terms
 */
export interface VPPAPricing {
  fixed_price_per_mwh: number | null;
  eac_price_per_mwh: number | null;
  price_currency: PriceCurrency;
  annual_escalator_percent: number | null;
  floating_price_source: FloatingPriceSource | null;
}

/**
 * VPPA Capacity Terms
 */
export interface VPPACapacity {
  expected_nameplate_capacity_mw: number | null;
  buyer_share_percent: number | null;
  capacity_mw: number; // Existing field - actual/installed capacity
}

/**
 * VPPA Timeline Terms
 * COD = Commercial Operation Date
 */
export interface VPPATimeline {
  expected_cod: string | null;         // Expected Commercial Operation Date
  guaranteed_cod: string | null;       // Guaranteed COD (damages trigger)
  earliest_cod_date: string | null;    // Earliest acceptable COD
  delivery_term_years: number | null;  // Contract term (typically 15 or 20)
}

/**
 * VPPA Security & Credit Terms
 * Based on VPPA Template Article 5
 */
export interface VPPASecurity {
  development_security_per_mw: number | null;
  operational_security_per_mw: number | null;
  credit_rating_required: string | null;  // e.g., "Baa3/BBB-"
}

/**
 * VPPA Damages Terms
 * Based on VPPA Template Clauses 2.5-2.7
 */
export interface VPPADamages {
  delay_damages_per_mw_day: number | null;      // Daily damages for missed COD
  delay_damages_cap: number | null;              // Maximum total delay damages
  early_termination_fee: number | null;          // Fee if terminated early
  capacity_shortfall_rate_per_kw: number | null; // Damages per kW shortfall
}

/**
 * VPPA Availability Terms
 * Based on VPPA Template Exhibit 3
 */
export interface VPPAAvailability {
  guaranteed_availability_year1_percent: number | null;    // e.g., 85%
  guaranteed_availability_ongoing_percent: number | null;  // e.g., 90%
  availability_damages_rate: number | null;                // £/$ per 0.1% shortfall
}

/**
 * VPPA Environmental Terms
 * EAC = Environmental Attribute Certificate
 */
export interface VPPAEnvironmental {
  eac_scheme: EACScheme | null;           // REGO, AEPS, REC, etc.
  eac_transfer_deadline_days: number | null;
}

/**
 * VPPA Settlement Terms
 */
export interface VPPASettlement {
  settlement_point: string | null;     // e.g., "PECO Zone", "Project Bus Bar"
  payment_period_days: number | null;  // Days to pay invoice
}

/**
 * VPPA Project Details
 */
export interface VPPAProjectDetails {
  generation_modules: GenerationModuleType | null;
  connection_point: string | null;
  major_equipment_description: string | null;
}

/**
 * Price Schedule Year Entry (Schedule 1)
 * 20-year price and quantity projection
 */
export interface PriceScheduleYear {
  contract_year: number;                    // 1-20
  fixed_settlement_price_per_mwh: number;   // Fixed price for this year
  eac_credits_price_per_mwh: number;        // EAC/AEPS credits price
  annual_quantity_mwh: number;              // Expected annual generation
}

export type PriceSchedule = PriceScheduleYear[];

/**
 * Additional VPPA Terms (stored in vppa_terms JSONB)
 * For complex/optional terms not in dedicated columns
 */
export interface VPPAAdditionalTerms {
  conditions_precedent?: string[];
  force_majeure_max_days?: number;
  grid_delay_max_days?: number;
  reporting_party?: 'seller' | 'buyer';
  governing_law?: string;
  buyer_liability_cap?: number;
  seller_liability_cap?: number;
  zero_price_floor?: boolean;
  balancing_mechanism_participation?: boolean;
  assignment_restrictions?: string;
  change_in_law_provisions?: string;
  market_disruption_provisions?: string;
}

/**
 * Complete Seller Project with VPPA Terms
 * Extends base Project interface
 */
export interface SellerProjectVPPA {
  // Base fields
  id: string;
  seller_id: string;
  name: string;
  generation_type: GenerationTypeExtended;
  capacity_mw: number;
  location: string;
  price_range_min?: number;
  price_range_max?: number;
  status: 'draft' | 'published' | 'unpublished';
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;

  // VPPA Pricing
  fixed_price_per_mwh?: number;
  eac_price_per_mwh?: number;
  price_currency?: PriceCurrency;
  annual_escalator_percent?: number;
  floating_price_source?: FloatingPriceSource;

  // VPPA Capacity
  expected_nameplate_capacity_mw?: number;
  buyer_share_percent?: number;

  // VPPA Timeline
  expected_cod?: string;
  guaranteed_cod?: string;
  earliest_cod_date?: string;
  delivery_term_years?: number;

  // VPPA Security
  development_security_per_mw?: number;
  operational_security_per_mw?: number;
  credit_rating_required?: string;

  // VPPA Damages
  delay_damages_per_mw_day?: number;
  delay_damages_cap?: number;
  early_termination_fee?: number;
  capacity_shortfall_rate_per_kw?: number;

  // VPPA Availability
  guaranteed_availability_year1_percent?: number;
  guaranteed_availability_ongoing_percent?: number;
  availability_damages_rate?: number;

  // VPPA Environmental
  eac_scheme?: EACScheme;
  eac_transfer_deadline_days?: number;

  // VPPA Settlement
  settlement_point?: string;
  payment_period_days?: number;

  // VPPA Project Details
  generation_modules?: GenerationModuleType;
  connection_point?: string;
  major_equipment_description?: string;

  // JSONB fields
  vppa_terms?: VPPAAdditionalTerms;
  price_schedule?: PriceSchedule;
}

// ============================================================================
// BUYER PROJECT (RFP) INTERFACES
// ============================================================================

/**
 * Buyer RFP Procurement Requirements
 */
export interface RFPRequirements {
  target_capacity_mw: number | null;
  target_annual_quantity_mwh: number | null;
  preferred_term_years: number | null;  // 15 or 20
  equity_share_percent: number | null;
}

/**
 * Buyer RFP Timeline Requirements
 */
export interface RFPTimeline {
  target_cod: string | null;           // Target Commercial Operation Date
  no_earlier_than_date: string | null; // Earliest acceptable COD
  outside_cod_date: string | null;     // Latest acceptable COD (termination trigger)
}

/**
 * Buyer RFP Pricing Preferences
 */
export interface RFPPricing {
  max_fixed_price_per_mwh: number | null;
  max_eac_price_per_mwh: number | null;
  preferred_escalator_percent: number | null;
  price_currency: PriceCurrency;
}

/**
 * Buyer RFP Settlement Preferences
 */
export interface RFPSettlement {
  preferred_settlement_type: SettlementType | null;
  preferred_settlement_point: string | null;
  settlement_zone: string | null;  // e.g., "PJM PECO"
}

/**
 * Buyer RFP Environmental/Sustainability Requirements
 */
export interface RFPEnvironmental {
  required_eac_scheme: EACScheme | null;
  scope2_emissions_target_mt: number | null;  // Metric tons reduction target
  net_neutral_target_year: number | null;     // e.g., 2030
  renewable_percentage_target: number | null; // e.g., 100%
}

/**
 * Buyer RFP Credit Terms
 */
export interface RFPCredit {
  buyer_credit_rating: string | null;
  buyer_security_per_mw: number | null;
  min_guaranteed_availability_percent: number | null;
}

/**
 * Document Processing Workflow
 */
export interface ProcessingWorkflow {
  processing_status: ProcessingStatus;
  extracted_data: ExtractedBuyerData;
  processing_notes: string | null;
  processed_at: string | null;
  processed_by: string | null;
}

/**
 * Extracted Data from Buyer Documents
 * Data extracted from uploaded invoices, contracts, etc.
 */
export interface ExtractedBuyerData {
  // Consumption data
  historical_consumption_kwh?: number[];    // Monthly/yearly consumption
  peak_demand_kw?: number;
  load_factor?: number;
  
  // Utility information
  utility_provider?: string;
  current_rate_per_kwh?: number;
  contract_expiration?: string;
  
  // Emissions
  scope2_emissions_baseline_mt?: number;
  emissions_intensity_kg_per_kwh?: number;
  
  // Load profile
  hourly_load_profile?: number[];  // 24-hour typical profile
  seasonal_variation?: {
    winter: number;
    spring: number;
    summer: number;
    fall: number;
  };
  
  // Site information
  site_count?: number;
  locations?: string[];
  
  // Additional extracted fields
  [key: string]: unknown;
}

/**
 * Additional RFP Requirements (stored in rfp_requirements JSONB)
 */
export interface RFPAdditionalRequirements {
  invoicing_requirements?: string;
  reporting_requirements?: string[];
  insurance_requirements?: string;
  performance_guarantees?: string[];
  local_content_requirements?: string;
  labor_requirements?: string;
  environmental_compliance?: string[];
  grid_connection_requirements?: string;
  curtailment_provisions?: string;
  change_in_law_allocation?: string;
}

/**
 * Complete Buyer Project with RFP Terms
 */
export interface BuyerProjectRFP {
  // Base fields
  id: string;
  buyer_id: string;
  project_type: 'brownfield' | 'greenfield';
  name: string;
  location?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;

  // RFP Requirements
  target_capacity_mw?: number;
  target_annual_quantity_mwh?: number;
  preferred_term_years?: number;
  equity_share_percent?: number;

  // RFP Timeline
  target_cod?: string;
  no_earlier_than_date?: string;
  outside_cod_date?: string;

  // RFP Pricing
  max_fixed_price_per_mwh?: number;
  max_eac_price_per_mwh?: number;
  preferred_escalator_percent?: number;
  price_currency?: PriceCurrency;

  // RFP Settlement
  preferred_settlement_type?: SettlementType;
  preferred_settlement_point?: string;
  settlement_zone?: string;

  // Technology Preferences
  preferred_generation_types?: GenerationTypeExtended[];

  // RFP Environmental
  required_eac_scheme?: EACScheme;
  scope2_emissions_target_mt?: number;
  net_neutral_target_year?: number;
  renewable_percentage_target?: number;

  // RFP Credit
  buyer_credit_rating?: string;
  buyer_security_per_mw?: number;
  min_guaranteed_availability_percent?: number;

  // Processing Workflow
  processing_status?: ProcessingStatus;
  extracted_data?: ExtractedBuyerData;
  processing_notes?: string;
  processed_at?: string;
  processed_by?: string;

  // JSONB fields
  rfp_requirements?: RFPAdditionalRequirements;
  requested_price_schedule?: PriceSchedule;
}

// ============================================================================
// FORM DATA INTERFACES (for UI components)
// ============================================================================

/**
 * Seller Project Creation Form Data
 */
export interface SellerProjectFormData {
  // Basic Info
  name: string;
  generation_type: GenerationTypeExtended;
  capacity_mw: string;
  location: string;
  status: 'draft' | 'published';

  // Pricing (optional for draft)
  fixed_price_per_mwh: string;
  eac_price_per_mwh: string;
  price_currency: PriceCurrency;
  annual_escalator_percent: string;

  // Timeline
  expected_cod: string;
  guaranteed_cod: string;
  delivery_term_years: string;

  // Availability
  guaranteed_availability_year1_percent: string;
  guaranteed_availability_ongoing_percent: string;

  // Environmental
  eac_scheme: EACScheme | '';

  // Optional details
  settlement_point: string;
  connection_point: string;
  description: string;
}

/**
 * Buyer Project Creation Form Data
 */
export interface BuyerProjectFormData {
  // Basic Info
  name: string;
  project_type: 'brownfield' | 'greenfield';
  location: string;

  // Requirements
  target_capacity_mw: string;
  target_annual_quantity_mwh: string;
  preferred_term_years: '15' | '20' | '';

  // Timeline
  target_cod: string;

  // Pricing Preferences
  max_fixed_price_per_mwh: string;
  price_currency: PriceCurrency;

  // Technology
  preferred_generation_types: GenerationTypeExtended[];

  // Environmental
  required_eac_scheme: EACScheme | '';
  renewable_percentage_target: string;
  net_neutral_target_year: string;

  // Settlement
  preferred_settlement_type: SettlementType | '';
  settlement_zone: string;
}

/**
 * Price Schedule Form Entry
 */
export interface PriceScheduleFormEntry {
  contract_year: number;
  fixed_settlement_price_per_mwh: string;
  eac_credits_price_per_mwh: string;
  annual_quantity_mwh: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Helper to generate empty price schedule for 20 years
 */
export function createEmptyPriceSchedule(): PriceScheduleFormEntry[] {
  return Array.from({ length: 20 }, (_, i) => ({
    contract_year: i + 1,
    fixed_settlement_price_per_mwh: '',
    eac_credits_price_per_mwh: '',
    annual_quantity_mwh: '',
  }));
}

/**
 * Helper to calculate escalated prices
 */
export function calculateEscalatedPrices(
  basePrice: number,
  baseQuantity: number,
  escalatorPercent: number,
  years: number = 20
): PriceScheduleYear[] {
  return Array.from({ length: years }, (_, i) => {
    const yearMultiplier = Math.pow(1 + escalatorPercent / 100, i);
    return {
      contract_year: i + 1,
      fixed_settlement_price_per_mwh: Math.round(basePrice * yearMultiplier * 100) / 100,
      eac_credits_price_per_mwh: 0, // EAC price typically separate
      annual_quantity_mwh: Math.round(baseQuantity * 100) / 100,
    };
  });
}
