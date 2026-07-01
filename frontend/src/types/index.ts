// Power Dime TypeScript Types

// Re-export PPA/VPPA types
export * from './ppa';

export interface AppSession {
  access_token: string;         // Cognito IdToken — sent as Bearer on every request
  cognito_access_token: string; // Cognito AccessToken — needed only for logout
  refresh_token?: string;
  expires_in?: number;
}

export type UserRole = 'buyer' | 'seller' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  company_name?: string;
  contact_person?: string;
  phone?: string;
  title?: string;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Generation types (matches database constraint)
export type GenerationType = 'Solar' | 'Wind' | 'Nuclear' | 'Battery' | 'Hydro' | 'Hybrid' | 'Combined Cycle' | 'Peaker' | 'Virtual';

// BTM (Behind The Meter) Asset types - custom build options for load sites
export type BTMAssetType = 'BESS' | 'NG_Peaker' | 'NG_Combined_Cycle';

export interface BTMAsset {
  id: string;
  site_id: string;
  asset_type: BTMAssetType;
  capacity_mw: number;
  duration_hours?: number; // For BESS
  status: 'option' | 'installed' | 'planned';
  configuration?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}
export type ProjectStatus = 'draft' | 'published' | 'unpublished' | 'active' | 'inactive' | 'sold';

// Generic metadata type to replace 'any'
export type MetadataValue = string | number | boolean | null | undefined | MetadataValue[] | { [key: string]: MetadataValue };
export type Metadata = Record<string, MetadataValue>;

export interface Project {
  id: string;
  seller_id: string;
  name: string;
  generation_type: GenerationType;
  capacity_mw: number;
  location: string;
  iso?: string;
  zone?: string;
  status: ProjectStatus;
  // 'marketplace' = seller offering; 'existing' = a customer's already-held contract.
  origin?: 'marketplace' | 'existing';
  visibility?: 'marketplace' | 'private';
  owner_company_id?: string | null;
  metadata?: Metadata;
  created_at?: string;
  updated_at?: string;
  // Offered contract delivery term (Mo/Yr), independent of COD/status.
  term_start_date?: string | null;
  term_end_date?: string | null;
  // VPPA Pricing — unbundled: energy ($/MWh), EAC ($/MWh), capacity ($/MW-day)
  fixed_price_per_mwh?: number;
  eac_price_per_mwh?: number;
  capacity_price_per_mw_day?: number;
  price_currency?: string;
  annual_escalator_percent?: number;
  // VPPA Timeline
  expected_cod?: string;
  guaranteed_cod?: string;
  delivery_term_years?: number;
  // VPPA Availability
  guaranteed_availability_year1_percent?: number;
  guaranteed_availability_ongoing_percent?: number;
  // VPPA Environmental
  eac_scheme?: string;
  // VPPA Settlement
  settlement_point?: string;
  connection_point?: string;
  // Delivery tier: baseload = constant volume profile, peaking = shaped/premium/short schedule
  delivery_tier?: 'baseload' | 'peaking';
}

export type TransactionStatus = 'submitted' | 'accepted' | 'rejected';

export interface Transaction {
  id: string;
  project_id: string;
  buyer_id: string;
  seller_id: string;
  energy_amount_mwh: number;
  start_date: string;
  contract_duration_years: number;
  delivery_date?: string;
  net_neutral_target: boolean;
  generation_preference?: string;
  status: TransactionStatus;
  created_at?: string;
  updated_at?: string;
  // Expanded relations
  project?: Project;
  buyer?: User;
  seller?: User;
}

export interface TransactionSubmission {
  project_id: string;
  energy_amount_mwh: number;
  start_date: string;
  contract_duration_years: number;
  delivery_date?: string;
  net_neutral_target: boolean;
  generation_preference?: string;
}

export type DocumentType = 'ppa' | 'nda' | 'exclusivity' | 'technical' | 'other';

export interface Document {
  id: string;
  transaction_id: string;
  document_type: DocumentType;
  file_name: string;
  file_path: string;
  file_size?: number;
  uploaded_by: string;
  created_at?: string;
}

export interface AuthContextType {
  user: User | null;
  session: AppSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, metadata?: { firstName: string; lastName: string; role: string; title?: string; company_name?: string }) => Promise<{ userId: string }>;
}

// Technical Documents
export type TechnicalDocFileType = 'pdf' | 'csv' | 'tsv';
export type SellerType = 'carbon_free' | 'utility';
export type TechnologyType = 'solar' | 'wind' | 'nuclear' | 'green_hydrogen' | 'battery' | 'utility_contract';

export interface TechnicalDocument {
  id: string;
  project_id: string;
  seller_type?: SellerType;
  technology_type?: TechnologyType;
  contract_type?: string;
  file_name: string;
  file_path: string;
  file_type: TechnicalDocFileType;
  file_size?: number;
  metadata?: Metadata;
  uploaded_by: string;
  uploaded_at?: string;
}

// Power Plans (Buyer Documents)
export type PowerPlanType = 'historical' | 'forecast' | 'custom';
export type FacilityType = 'brownfield' | 'greenfield';
export type BuyerDocumentCategory =
  | 'historical_invoice'
  | 'utility_contract'
  | 'meter_reading'
  | 'grid_data'
  | 'equipment_config'
  | 'equipment_spec';

// Brownfield metadata
export interface BrownfieldMetadata {
  utility_provider?: string;
  date_range?: {
    start: string;
    end: string;
  };
  meter_number?: string;
  uploaded_at?: string;
  mime_type?: string;
  checksum?: string;
  s3_version_id?: string;
  s3_location?: string;
  [key: string]: MetadataValue;
}

// Greenfield metadata (Schneider Electric framework)
export interface GreenfieldMetadata {
  equipment_types: string[];
  total_power_rating_kw: number;
  floor_area_sqft: number;
  cooling_system: string;
  power_density_w_sqft?: number;
  submitted_at?: string;
  // Additional Schneider framework fields
  it_load_kw?: number;
  cooling_load_kw?: number;
  ups_capacity_kw?: number;
  redundancy_level?: 'N' | 'N+1' | '2N';
  [key: string]: MetadataValue;
}

export interface PowerPlan {
  id: string;
  buyer_id: string;
  plan_type: PowerPlanType;
  facility_type?: FacilityType;
  document_category?: BuyerDocumentCategory;
  file_name?: string | null;
  file_path?: string | null;
  file_size?: number | null;
  metadata?: BrownfieldMetadata | GreenfieldMetadata;
  created_at?: string;
}

// Upload helpers
export interface UploadedFile {
  file: File;
  preview?: string;
  progress?: number;
  error?: string;
}

// Example Documents
export interface ExampleDocument {
  category: string;
  facility_type?: FacilityType;
  seller_type?: SellerType;
  technology_type?: TechnologyType;
  name: string;
  description: string;
  file_types: string[];
  expected_fields: string[];
  example_filename: string;
  guidance: string;
  csv_example?: string;
}

// Form submission types
export interface GreenfieldFormData {
  equipment_types: string[];
  total_power_rating_kw: number;
  floor_area_sqft: number;
  cooling_system: string;
  power_density_w_sqft?: number;
  it_load_kw?: number;
  cooling_load_kw?: number;
  ups_capacity_kw?: number;
  redundancy_level?: 'N' | 'N+1' | '2N';
  additional_metadata?: Metadata;
}

export interface BuyerUploadParams {
  files: File[];
  facility_type: FacilityType;
  document_category: BuyerDocumentCategory;
  plan_type?: PowerPlanType;
  metadata?: BrownfieldMetadata;
}

export interface SellerUploadParams {
  files: File[];
  seller_type: SellerType;
  technology_type?: TechnologyType;
  contract_type?: string;
  project_id?: string;
  metadata?: Metadata;
}

