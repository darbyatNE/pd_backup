import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import type { PriceCurrency, EACScheme, SettlementType } from '../types/ppa';
import { API_BASE_URL } from '../services/api';
import { LOAD_PROFILES } from '../data/loadProfile';
import { fetchProductSet, RETIRING_AGENCIES, MATCHING_FORMATS, MATCHING_FORMAT_LABELS } from '../data/projectProductsApi';

// Facility options for assigning an existing contract — these are the data-center
// site keys that public.site_contracts uses, so the flow-through charts correctly.
const FACILITY_OPTIONS = LOAD_PROFILES.map((p) => ({ facId: p.siteKey, name: p.name }));

// Draft storage keys
const LEGACY_DRAFT_STORAGE_KEY = 'powerdime_project_draft';
const CREATE_DRAFT_STORAGE_KEY = 'powerdime_project_draft_create_v2';
const DRAFT_AUTOSAVE_DELAY = 1000; // 1 second debounce

interface DraftData {
    projectType: string;
    formData: Record<string, unknown>;
    savedAt: string;
    mode?: 'create';
    version?: 2;
}

interface EditableProject {
    id: string;
    name: string;
    project_type: 'brownfield' | 'greenfield' | 'generation';
    location: string;
    metadata: Record<string, unknown>;
    // RFP fields (buyer)
    target_capacity_mw?: number;
    target_annual_quantity_mwh?: number;
    preferred_term_years?: number;
    target_cod?: string;
    max_fixed_price_per_mwh?: number;
    price_currency?: PriceCurrency;
    preferred_settlement_type?: SettlementType;
    settlement_zone?: string;
    preferred_generation_types?: string[];
    required_eac_scheme?: EACScheme;
    renewable_percentage_target?: number;
    net_neutral_target_year?: number;
    // Generation/seller fields
    generation_type?: string;
    capacity_mw?: number;
    status?: string;
    fixed_price_per_mwh?: number;
    eac_price_per_mwh?: number;
    capacity_price_per_mw_day?: number;
    annual_escalator_percent?: number;
    expected_cod?: string;
    guaranteed_cod?: string;
    delivery_term_years?: number;
    term_start_date?: string;
    term_end_date?: string;
    guaranteed_availability_year1_percent?: number;
    guaranteed_availability_ongoing_percent?: number;
    eac_scheme?: EACScheme | '';
    settlement_point?: string;
    connection_point?: string;
    iso?: string;
    zone?: string;
    latitude?: number | null;
    longitude?: number | null;
}

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (info?: { projectType?: 'brownfield' | 'greenfield' | 'generation' }) => void;
    editProject?: EditableProject | null;
    // 'existing' = a customer's already-held generation contract: saved as a
    // private project (origin='existing') and flowed through to site_contracts
    // for the selected facilities so it charts against load.
    mode?: 'offer' | 'existing';
}

// Buyer Brownfield Form Data (Enhanced with RFP fields)
interface BrownfieldFormData {
    // Basic Info
    name: string;
    location: string;
    facility_type: string;
    approximate_power_kw: string;
    notes: string;

    // Site Onboarding (from intake sheet)
    site_id: string;
    iso_rto: string;
    state: string;
    county_metro: string;
    longitude: string;
    latitude: string;
    utility_lse: string;
    load_zone: string;
    pnode_id: string;
    voltage_kv: string;
    peak_load_mw: string;
    avg_load_mw: string;
    load_shape: string;
    operating_hours: string;
    criticality: string;
    backup_gen_type: string;
    backup_gen_capacity_mw: string;
    backup_gen_duration_hours: string;
    primary_supply_type: string;
    preferred_clean_gen_type: string;
    preferred_gen_shape: string;
    rec_coverage_target_pct: string;
    growth_ramp: string;

    // RFP Requirements
    target_capacity_mw: string;
    target_annual_quantity_mwh: string;
    preferred_term_years: string;

    // RFP Timeline
    target_cod: string;

    // RFP Pricing Preferences
    max_fixed_price_per_mwh: string;
    price_currency: PriceCurrency;

    // RFP Settlement
    preferred_settlement_type: SettlementType | '';
    settlement_zone: string;

    // RFP Technology Preferences
    preferred_generation_types: string[];

    // RFP Environmental
    required_eac_scheme: EACScheme | '';
    renewable_percentage_target: string;
    net_neutral_target_year: string;
}

// Buyer Greenfield Form Data (Enhanced with RFP fields)
interface GreenfieldFormData {
    // Basic Facility Info
    name: string;
    planned_location: string;
    equipment_types: string[];
    total_power_rating_kw: string;
    floor_area_sqft: string;
    cooling_system: string;
    it_device_ratings_va: string;
    non_calculator_equipment_va: string;
    future_loads_va: string;
    power_density_w_sqft: string;
    it_load_kw: string;
    ups_capacity_kw: string;
    redundancy_level: string;
    ac_voltage: string;
    delivery_date: string;
    net_neutral_target: boolean;
    generation_preference: string;

    // RFP Requirements
    target_capacity_mw: string;
    target_annual_quantity_mwh: string;
    preferred_term_years: string;

    // RFP Timeline
    target_cod: string;

    // RFP Pricing Preferences
    max_fixed_price_per_mwh: string;
    price_currency: PriceCurrency;

    // RFP Settlement
    preferred_settlement_type: SettlementType | '';
    settlement_zone: string;

    // RFP Technology Preferences
    preferred_generation_types: string[];

    // RFP Environmental
    required_eac_scheme: EACScheme | '';
    renewable_percentage_target: string;
    net_neutral_target_year: string;
}

// Seller Generation Project Form Data (Enhanced with VPPA fields)
interface GenerationProjectFormData {
    // Basic Info
    name: string;
    technology_type: string;
    capacity_mw: string;
    location: string;
    expected_cod: string;
    description: string;
    status: 'draft' | 'published';

    // VPPA Pricing
    fixed_price_per_mwh: string;
    eac_price_per_mwh: string;
    capacity_price_per_mw_day: string;
    price_currency: PriceCurrency;
    annual_escalator_percent: string;

    // VPPA Timeline
    guaranteed_cod: string;
    delivery_term_years: string;
    term_start_date: string;
    term_end_date: string;

    // VPPA Availability
    guaranteed_availability_year1_percent: string;
    guaranteed_availability_ongoing_percent: string;

    // VPPA Environmental
    eac_scheme: EACScheme | '';

    // VPPA Settlement
    settlement_point: string;
    connection_point: string;
    // ISO / zone
    iso: string;
    zone: string;
    // Optional explicit map coordinates (else the map falls back to the
    // name-based lookup on Location).
    latitude: string;
    longitude: string;

    // Unbundled product detail, blended into the form. A component is saved when
    // its required field is present: capacity⇔EDA, energy⇔zone, RECs⇔agency+format.
    eda: string;                 // capacity Effective Deliverability Area
    energy_mwh_min: string;
    energy_mwh_max: string;
    rec_pct: string;
    retiring_agency: string;
    matching_format: string;
}

const FACILITY_TYPES = [
    'Hyperscale data center',
    'Colocation',
    'Enterprise data center',
    'AI cluster',
    'Edge compute',
    'Industrial load',
];

// Onboarding sheet dropdowns
const ISO_RTOS = ['PJM', 'MISO', 'ERCOT', 'SPP', 'NYISO', 'ISO-NE', 'CAISO', 'WECC'];

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
    'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
    'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const LOAD_ZONES = ['AEP', 'DOM', 'COMED', 'ATSI', 'APS', 'DUQ', 'DUKE', 'DAYTON'];

const PJM_ZONES = ['AEP', 'APS', 'ATSI', 'BGE', 'COMED', 'DAY', 'DEOK', 'DPL', 'DOM', 'DUQ', 'EKPC', 'JCPL', 'LGE', 'METED', 'PENELEC', 'PECO', 'PEPCO', 'PPL', 'PSEG', 'RECO', 'UGI'];

const VOLTAGE_KV_OPTIONS = ['34.5', '69', '115', '138', '230'];

const LOAD_SHAPES = [
    'Baseload',
    'Baseload with overnight dip',
    'Daytime-peaking',
    'Evening-ramping',
    'Weekday-peaking',
    'Highly variable',
];

const OPERATING_HOURS_OPTIONS = [
    '24x7',
    '24x7x365',
    'Weekday business hours',
    'Extended weekday hours',
    'Weekday peaks',
    'Mission critical',
    'Seasonal operation',
];

const CRITICALITY_TIERS = ['Tier II', 'Tier III', 'Tier III+', 'Tier IV', 'Mission critical'];

const BACKUP_GEN_TYPES = [
    'Diesel',
    'Natural Gas',
    'Diesel + Battery',
    'Natural Gas + Battery',
    'Diesel + Flywheel',
    'Battery only',
];

const PRIMARY_SUPPLY_TYPES = [
    'Grid Retail',
    'Utility Tariff',
    'Wholesale Pass-Through',
    'Retail + Hedge',
    'Sleeved Supply',
    'Market-Based Supply',
    'Hybrid Renewable Portfolio',
];

const PREFERRED_CLEAN_GEN_TYPES = [
    'Solar',
    'Wind',
    'Solar + Firming',
    'Wind + Firming',
    'Solar + Storage',
    'Wind + Solar Hybrid',
    'Wind-Weighted',
];

const PREFERRED_GEN_SHAPES = ['Daytime', 'Evening', 'Overnight', 'Flat', 'Load-Following', 'Solar-Heavy'];

const GROWTH_RAMPS = ['Flat growth', 'Stepped expansion', 'Rapid growth', 'Unknown growth'];

const EQUIPMENT_TYPES = [
    'Servers',
    'Storage Systems',
    'Network Equipment',
    'Cooling Systems',
    'UPS Systems',
    'Lighting',
    'HVAC',
    'Other'
];

const COOLING_SYSTEMS = [
    'Chiller',
    'DX (Direct Expansion)',
    'Hybrid',
    'Free Cooling',
    'Other'
];

// Matches the canonical GenerationType union (types/index.ts) so every type shown
// in the marketplace can be created/edited here.
const TECHNOLOGY_TYPES = [
    { value: 'Solar', label: 'Solar' },
    { value: 'Wind', label: 'Wind' },
    { value: 'Nuclear', label: 'Nuclear' },
    { value: 'Battery', label: 'Battery Storage' },
    { value: 'Hydro', label: 'Hydro' },
    { value: 'Hybrid', label: 'Hybrid (Solar + Storage)' },
    { value: 'Combined Cycle', label: 'Combined Cycle' },
    { value: 'Peaker', label: 'Peaker' },
    { value: 'Virtual', label: 'Virtual (energy-only CfD)' }
];

const PRICE_CURRENCIES: { value: PriceCurrency; label: string; symbol: string }[] = [
    { value: 'USD', label: 'US Dollar', symbol: '$' },
    { value: 'GBP', label: 'British Pound', symbol: '£' },
    { value: 'EUR', label: 'Euro', symbol: '€' }
];

const EAC_SCHEMES: { value: EACScheme; label: string; region: string }[] = [
    { value: 'REGO', label: 'REGO', region: 'UK' },
    { value: 'GO', label: 'Guarantee of Origin', region: 'EU' },
    { value: 'REC', label: 'Renewable Energy Certificate', region: 'US' },
    { value: 'AEPS', label: 'AEPS Credits', region: 'US (PA)' },
    { value: 'other', label: 'Other', region: '' }
];

const DELIVERY_TERMS = [
    { value: '10', label: '10 Years' },
    { value: '15', label: '15 Years' },
    { value: '20', label: '20 Years' },
    { value: '25', label: '25 Years' }
];

// Settlement types for RFP
const SETTLEMENT_TYPES: { value: SettlementType; label: string; description: string }[] = [
    { value: 'physical', label: 'Physical PPA', description: 'Direct delivery of power' },
    { value: 'financial', label: 'Virtual/Financial PPA', description: 'Contract for difference' },
    { value: 'contract_for_difference', label: 'CfD', description: 'Fixed price guarantee' }
];

// Common settlement zones
const SETTLEMENT_ZONES = [
    'PJM - PECO',
    'PJM - AEP',
    'PJM - ComEd',
    'ERCOT - North',
    'ERCOT - South',
    'CAISO - SP15',
    'CAISO - NP15',
    'NYISO - Zone J',
    'ISO-NE',
    'MISO',
    'SPP',
    'UK Grid',
    'Other'
];

export default function CreateProjectModal({ isOpen, onClose, onSuccess, editProject, mode = 'offer' }: CreateProjectModalProps) {
    const { user } = useAuth();
    const isExistingContract = mode === 'existing';
    // Facilities an existing contract serves — drives the site_contracts flow-through.
    const [selectedFacilities, setSelectedFacilities] = useState<Set<string>>(new Set());
    const isEditMode = Boolean(editProject);
    const [projectType, setProjectType] = useState<'brownfield' | 'greenfield' | 'generation'>('brownfield');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [brownfieldForm, setBrownfieldForm] = useState<BrownfieldFormData>({
        // Basic Info
        name: '',
        location: '',
        facility_type: 'Hyperscale data center',
        approximate_power_kw: '',
        notes: '',
        // Site Onboarding
        site_id: '',
        iso_rto: 'PJM',
        state: '',
        county_metro: '',
        longitude: '',
        latitude: '',
        utility_lse: '',
        load_zone: '',
        pnode_id: '',
        voltage_kv: '',
        peak_load_mw: '',
        avg_load_mw: '',
        load_shape: '',
        operating_hours: '',
        criticality: '',
        backup_gen_type: '',
        backup_gen_capacity_mw: '',
        backup_gen_duration_hours: '',
        primary_supply_type: '',
        preferred_clean_gen_type: '',
        preferred_gen_shape: '',
        rec_coverage_target_pct: '',
        growth_ramp: '',
        // RFP Requirements
        target_capacity_mw: '',
        target_annual_quantity_mwh: '',
        preferred_term_years: '15',
        // RFP Timeline
        target_cod: '',
        // RFP Pricing
        max_fixed_price_per_mwh: '',
        price_currency: 'USD',
        // RFP Settlement
        preferred_settlement_type: '',
        settlement_zone: '',
        // RFP Technology
        preferred_generation_types: [],
        // RFP Environmental
        required_eac_scheme: '',
        renewable_percentage_target: '',
        net_neutral_target_year: ''
    });

    // Collapsible sections state for buyer forms
    const [showSiteProfile, setShowSiteProfile] = useState(true);
    const [showBuyerRFP, setShowBuyerRFP] = useState(false);
    const [showBuyerEnvironmental, setShowBuyerEnvironmental] = useState(false);

    const [greenfieldForm, setGreenfieldForm] = useState<GreenfieldFormData>({
        // Basic Facility Info
        name: '',
        planned_location: '',
        equipment_types: [],
        total_power_rating_kw: '',
        floor_area_sqft: '',
        cooling_system: 'Chiller',
        it_device_ratings_va: '',
        non_calculator_equipment_va: '',
        future_loads_va: '',
        power_density_w_sqft: '',
        it_load_kw: '',
        ups_capacity_kw: '',
        redundancy_level: '',
        ac_voltage: '',
        delivery_date: '',
        net_neutral_target: false,
        generation_preference: '',
        // RFP Requirements
        target_capacity_mw: '',
        target_annual_quantity_mwh: '',
        preferred_term_years: '15',
        // RFP Timeline
        target_cod: '',
        // RFP Pricing
        max_fixed_price_per_mwh: '',
        price_currency: 'USD',
        // RFP Settlement
        preferred_settlement_type: '',
        settlement_zone: '',
        // RFP Technology
        preferred_generation_types: [],
        // RFP Environmental
        required_eac_scheme: '',
        renewable_percentage_target: '',
        net_neutral_target_year: ''
    });

    const [generationForm, setGenerationForm] = useState<GenerationProjectFormData>({
        name: '',
        technology_type: 'Solar',
        capacity_mw: '',
        location: '',
        expected_cod: '',
        description: '',
        status: 'draft',
        iso: 'PJM',
        zone: '',
        latitude: '',
        longitude: '',
        // VPPA Pricing
        fixed_price_per_mwh: '',
        eac_price_per_mwh: '',
        capacity_price_per_mw_day: '',
        price_currency: 'USD',
        annual_escalator_percent: '',
        // VPPA Timeline
        guaranteed_cod: '',
        delivery_term_years: '15',
        term_start_date: '',
        term_end_date: '',
        // VPPA Availability
        guaranteed_availability_year1_percent: '',
        guaranteed_availability_ongoing_percent: '',
        // VPPA Environmental
        eac_scheme: '',
        // VPPA Settlement
        settlement_point: '',
        connection_point: '',
        // Unbundled product detail
        eda: '',
        energy_mwh_min: '',
        energy_mwh_max: '',
        rec_pct: '',
        retiring_agency: '',
        matching_format: '',
    });

    // Collapsible sections state for generation form
    const [showVPPAPricing, setShowVPPAPricing] = useState(false);
    const [showVPPATimeline, setShowVPPATimeline] = useState(false);
    const [showVPPADetails, setShowVPPADetails] = useState(false);

    // Draft management state
    const [hasDraft, setHasDraft] = useState(false);
    const [showDraftPrompt, setShowDraftPrompt] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [saveMode, setSaveMode] = useState<'draft' | 'published'>('published');
    // Marketplace (available to contract by anyone) vs private (owned by this company).
    // Only admins/sellers may publish to the marketplace; others are forced private server-side.
    const canPublishMarketplace = user?.role === 'admin' || user?.role === 'seller';
    const [genVisibility, setGenVisibility] = useState<'marketplace' | 'private'>('marketplace');
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const getMetadataString = (metadata: Record<string, unknown>, key: string, fallback = ''): string => {
        const value = metadata[key];
        return typeof value === 'string' && value !== '' ? value : fallback;
    };

    const getMetadataStringArray = (metadata: Record<string, unknown>, key: string): string[] => {
        const value = metadata[key];
        if (!Array.isArray(value)) return [];
        return value.filter((item): item is string => typeof item === 'string');
    };

    const getMetadataBoolean = (metadata: Record<string, unknown>, key: string, fallback = false): boolean => {
        const value = metadata[key];
        return typeof value === 'boolean' ? value : fallback;
    };

    const getMetadataToString = (metadata: Record<string, unknown>, key: string): string => {
        const value = metadata[key];
        if (value == null || value === '') return '';
        return String(value);
    };

    // Get current form data based on project type
    const getCurrentFormData = useCallback(() => {
        switch (projectType) {
            case 'brownfield':
                return brownfieldForm;
            case 'greenfield':
                return greenfieldForm;
            case 'generation':
                return generationForm;
            default:
                return null;
        }
    }, [projectType, brownfieldForm, greenfieldForm, generationForm]);

    // Save draft to localStorage
    const saveDraft = useCallback(() => {
        if (isEditMode) return;

        const formData = getCurrentFormData();
        if (!formData) return;

        const draft: DraftData = {
            projectType,
            formData: formData as unknown as Record<string, unknown>,
            savedAt: new Date().toISOString(),
            mode: 'create',
            version: 2
        };

        try {
            localStorage.setItem(CREATE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
            setLastSaved(new Date().toLocaleTimeString());
            setHasDraft(true);
        } catch (err) {
            console.error('Failed to save draft:', err);
        }
    }, [isEditMode, projectType, getCurrentFormData]);

    // Load draft from localStorage
    const loadDraft = useCallback(() => {
        try {
            const saved = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
            if (!saved) return null;
            return JSON.parse(saved) as DraftData;
        } catch {
            return null;
        }
    }, []);

    // Clear draft from localStorage
    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
            setHasDraft(false);
            setLastSaved(null);
        } catch (err) {
            console.error('Failed to clear draft:', err);
        }
    }, []);

    // Restore draft data to form
    const restoreDraft = useCallback(() => {
        const draft = loadDraft();
        if (!draft) return;

        setProjectType(draft.projectType as 'brownfield' | 'greenfield' | 'generation');

        if (draft.projectType === 'brownfield') {
            setBrownfieldForm(draft.formData as unknown as BrownfieldFormData);
        } else if (draft.projectType === 'greenfield') {
            setGreenfieldForm(draft.formData as unknown as GreenfieldFormData);
        } else if (draft.projectType === 'generation') {
            setGenerationForm(draft.formData as unknown as GenerationProjectFormData);
        }

        setShowDraftPrompt(false);
        setHasDraft(true);
        setLastSaved(new Date(draft.savedAt).toLocaleTimeString());
    }, [loadDraft]);

    // Discard draft and start fresh
    const discardDraft = useCallback(() => {
        clearDraft();
        setShowDraftPrompt(false);
    }, [clearDraft]);

    // Auto-save on form changes (debounced)
    useEffect(() => {
        if (!isOpen || isEditMode) return;

        // Clear any existing timer
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Set new timer for auto-save
        autoSaveTimerRef.current = setTimeout(() => {
            const formData = getCurrentFormData();
            // Only auto-save if there's meaningful data
            if (formData && (
                (projectType === 'brownfield' && brownfieldForm.name) ||
                (projectType === 'greenfield' && greenfieldForm.name) ||
                (projectType === 'generation' && generationForm.name)
            )) {
                saveDraft();
            }
        }, DRAFT_AUTOSAVE_DELAY);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [isOpen, isEditMode, projectType, brownfieldForm, greenfieldForm, generationForm, getCurrentFormData, saveDraft]);

    // Check for existing draft when modal opens
    useEffect(() => {
        if (!isOpen) return;

        if (isEditMode) {
            setShowDraftPrompt(false);
            setHasDraft(false);
            setLastSaved(null);
            return;
        }

        try {
            localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
        } catch (err) {
            console.error('Failed to clear legacy draft:', err);
        }

        const draft = loadDraft();
        if (draft) {
            setShowDraftPrompt(true);
        }
    }, [isOpen, isEditMode, loadDraft]);

    // Reset forms when modal closes
    useEffect(() => {
        if (!isOpen) {
            setError(null);
            setSubmitting(false);
            setShowDraftPrompt(false);
        }
    }, [isOpen]);

    // Set default project type based on user role (existing contracts are always
    // generation assets).
    useEffect(() => {
        if (isExistingContract) {
            setProjectType('generation');
        } else if (user?.role === 'seller') {
            setProjectType('generation');
        } else {
            setProjectType('brownfield');
        }
    }, [user, isExistingContract]);

    // Populate form for edit mode
    useEffect(() => {
        if (isOpen && editProject) {
            setProjectType(editProject.project_type);

            if (editProject.project_type === 'brownfield') {
                const metadata = editProject.metadata;
                setBrownfieldForm({
                    name: editProject.name,
                    location: editProject.location,
                    facility_type: getMetadataString(metadata, 'facility_type', 'Hyperscale data center'),
                    approximate_power_kw: getMetadataToString(metadata, 'approximate_power_kw'),
                    notes: getMetadataString(metadata, 'notes'),
                    // Site Onboarding
                    site_id: getMetadataString(metadata, 'site_id'),
                    iso_rto: getMetadataString(metadata, 'iso_rto', 'PJM'),
                    state: getMetadataString(metadata, 'state'),
                    county_metro: getMetadataString(metadata, 'county_metro'),
                    longitude: getMetadataToString(metadata, 'longitude'),
                    latitude: getMetadataToString(metadata, 'latitude'),
                    utility_lse: getMetadataString(metadata, 'utility_lse'),
                    load_zone: getMetadataString(metadata, 'load_zone'),
                    pnode_id: getMetadataString(metadata, 'pnode_id'),
                    voltage_kv: getMetadataToString(metadata, 'voltage_kv'),
                    peak_load_mw: getMetadataToString(metadata, 'peak_load_mw'),
                    avg_load_mw: getMetadataToString(metadata, 'avg_load_mw'),
                    load_shape: getMetadataString(metadata, 'load_shape'),
                    operating_hours: getMetadataString(metadata, 'operating_hours'),
                    criticality: getMetadataString(metadata, 'criticality'),
                    backup_gen_type: getMetadataString(metadata, 'backup_gen_type'),
                    backup_gen_capacity_mw: getMetadataToString(metadata, 'backup_gen_capacity_mw'),
                    backup_gen_duration_hours: getMetadataToString(metadata, 'backup_gen_duration_hours'),
                    primary_supply_type: getMetadataString(metadata, 'primary_supply_type'),
                    preferred_clean_gen_type: getMetadataString(metadata, 'preferred_clean_gen_type'),
                    preferred_gen_shape: getMetadataString(metadata, 'preferred_gen_shape'),
                    rec_coverage_target_pct: getMetadataToString(metadata, 'rec_coverage_target_pct'),
                    growth_ramp: getMetadataString(metadata, 'growth_ramp'),
                    // RFP Requirements
                    target_capacity_mw: editProject.target_capacity_mw?.toString() || '',
                    target_annual_quantity_mwh: editProject.target_annual_quantity_mwh?.toString() || '',
                    preferred_term_years: editProject.preferred_term_years?.toString() || '15',
                    // RFP Timeline
                    target_cod: editProject.target_cod || '',
                    // RFP Pricing
                    max_fixed_price_per_mwh: editProject.max_fixed_price_per_mwh?.toString() || '',
                    price_currency: editProject.price_currency || 'USD',
                    // RFP Settlement
                    preferred_settlement_type: editProject.preferred_settlement_type || '',
                    settlement_zone: editProject.settlement_zone || '',
                    // RFP Technology
                    preferred_generation_types: editProject.preferred_generation_types || [],
                    // RFP Environmental
                    required_eac_scheme: editProject.required_eac_scheme || '',
                    renewable_percentage_target: editProject.renewable_percentage_target?.toString() || '',
                    net_neutral_target_year: editProject.net_neutral_target_year?.toString() || ''
                });
            } else if (editProject.project_type === 'greenfield') {
                const metadata = editProject.metadata;
                setGreenfieldForm({
                    name: editProject.name,
                    planned_location: editProject.location,
                    equipment_types: getMetadataStringArray(metadata, 'equipment_types'),
                    total_power_rating_kw: getMetadataToString(metadata, 'total_power_rating_kw'),
                    floor_area_sqft: getMetadataToString(metadata, 'floor_area_sqft'),
                    cooling_system: getMetadataString(metadata, 'cooling_system', 'Chiller'),
                    it_device_ratings_va: getMetadataToString(metadata, 'it_device_ratings_va'),
                    non_calculator_equipment_va: getMetadataToString(metadata, 'non_calculator_equipment_va'),
                    future_loads_va: getMetadataToString(metadata, 'future_loads_va'),
                    power_density_w_sqft: getMetadataToString(metadata, 'power_density_w_sqft'),
                    it_load_kw: getMetadataToString(metadata, 'it_load_kw'),
                    ups_capacity_kw: getMetadataToString(metadata, 'ups_capacity_kw'),
                    redundancy_level: getMetadataString(metadata, 'redundancy_level'),
                    ac_voltage: getMetadataString(metadata, 'ac_voltage'),
                    delivery_date: getMetadataString(metadata, 'delivery_date'),
                    net_neutral_target: getMetadataBoolean(metadata, 'net_neutral_target', false),
                    generation_preference: getMetadataString(metadata, 'generation_preference'),
                    // RFP Requirements
                    target_capacity_mw: editProject.target_capacity_mw?.toString() || '',
                    target_annual_quantity_mwh: editProject.target_annual_quantity_mwh?.toString() || '',
                    preferred_term_years: editProject.preferred_term_years?.toString() || '15',
                    // RFP Timeline
                    target_cod: editProject.target_cod || '',
                    // RFP Pricing
                    max_fixed_price_per_mwh: editProject.max_fixed_price_per_mwh?.toString() || '',
                    price_currency: editProject.price_currency || 'USD',
                    // RFP Settlement
                    preferred_settlement_type: editProject.preferred_settlement_type || '',
                    settlement_zone: editProject.settlement_zone || '',
                    // RFP Technology
                    preferred_generation_types: editProject.preferred_generation_types || [],
                    // RFP Environmental
                    required_eac_scheme: editProject.required_eac_scheme || '',
                    renewable_percentage_target: editProject.renewable_percentage_target?.toString() || '',
                    net_neutral_target_year: editProject.net_neutral_target_year?.toString() || ''
                });
            } else if (editProject.project_type === 'generation') {
                const metadata = editProject.metadata;
                setGenerationForm({
                    name: editProject.name,
                    technology_type: editProject.generation_type || 'Solar',
                    capacity_mw: editProject.capacity_mw?.toString() || '',
                    location: editProject.location,
                    expected_cod: editProject.expected_cod || '',
                    description: getMetadataString(metadata, 'description'),
                    status: (editProject.status as 'draft' | 'published') || 'draft',
                    // VPPA Pricing
                    fixed_price_per_mwh: editProject.fixed_price_per_mwh?.toString() || '',
                    eac_price_per_mwh: editProject.eac_price_per_mwh?.toString() || '',
                    capacity_price_per_mw_day: editProject.capacity_price_per_mw_day?.toString() || '',
                    price_currency: (editProject.price_currency as PriceCurrency) || 'USD',
                    annual_escalator_percent: editProject.annual_escalator_percent?.toString() || '',
                    // VPPA Timeline
                    guaranteed_cod: editProject.guaranteed_cod || '',
                    delivery_term_years: editProject.delivery_term_years?.toString() || '',
                    term_start_date: (editProject.term_start_date || '').slice(0, 10),
                    term_end_date: (editProject.term_end_date || '').slice(0, 10),
                    // VPPA Availability
                    guaranteed_availability_year1_percent: editProject.guaranteed_availability_year1_percent?.toString() || '',
                    guaranteed_availability_ongoing_percent: editProject.guaranteed_availability_ongoing_percent?.toString() || '',
                    // VPPA Environmental
                    eac_scheme: (editProject.eac_scheme as EACScheme) || '',
                    // VPPA Settlement
                    settlement_point: editProject.settlement_point || '',
                    connection_point: editProject.connection_point || '',
                    // ISO / zone
                    iso: editProject.iso || 'PJM',
                    zone: editProject.zone || '',
                    latitude: editProject.latitude != null ? String(editProject.latitude) : '',
                    longitude: editProject.longitude != null ? String(editProject.longitude) : '',
                    // Unbundled product detail is loaded separately (see effect below).
                    eda: '',
                    energy_mwh_min: '',
                    energy_mwh_max: '',
                    rec_pct: '',
                    retiring_agency: '',
                    matching_format: '',
                });
            }
        }
    }, [isOpen, editProject]);

    // Load the project's unbundled products in edit mode and patch the form so
    // the Edit view is the single source of truth for Capacity/Energy/RECs.
    useEffect(() => {
        if (!isOpen || !editProject || editProject.project_type !== 'generation') return;
        let alive = true;
        const str = (v: unknown) => (v == null || v === '' ? '' : String(v));
        fetchProductSet(editProject.id).then((set) => {
            if (!alive) return;
            setGenerationForm((f) => ({
                ...f,
                eda: str(set.capacity?.eda),
                capacity_mw: set.capacity?.capacity_mw != null && set.capacity.capacity_mw !== '' ? str(set.capacity.capacity_mw) : f.capacity_mw,
                capacity_price_per_mw_day: set.capacity?.price_per_mw_day != null && set.capacity.price_per_mw_day !== '' ? str(set.capacity.price_per_mw_day) : f.capacity_price_per_mw_day,
                energy_mwh_min: str(set.energy?.energy_mwh_min),
                energy_mwh_max: str(set.energy?.energy_mwh_max),
                zone: set.energy?.zone ? String(set.energy.zone) : f.zone,
                fixed_price_per_mwh: set.energy?.price_per_mwh != null && set.energy.price_per_mwh !== '' ? str(set.energy.price_per_mwh) : f.fixed_price_per_mwh,
                rec_pct: str(set.rec?.rec_pct),
                retiring_agency: str(set.rec?.retiring_agency),
                matching_format: str(set.rec?.matching_format),
                eac_price_per_mwh: set.rec?.price_per_mwh != null && set.rec.price_per_mwh !== '' ? str(set.rec.price_per_mwh) : f.eac_price_per_mwh,
            }));
        });
        return () => { alive = false; };
    }, [isOpen, editProject]);

    const handleBrownfieldSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            // Build request with RFP fields
            const requestBody = {
                name: brownfieldForm.name,
                location: brownfieldForm.location,
                status: saveMode, // 'draft' or 'published'
                // RFP Requirements
                target_capacity_mw: brownfieldForm.target_capacity_mw ? Number(brownfieldForm.target_capacity_mw) : null,
                target_annual_quantity_mwh: brownfieldForm.target_annual_quantity_mwh ? Number(brownfieldForm.target_annual_quantity_mwh) : null,
                preferred_term_years: brownfieldForm.preferred_term_years ? Number(brownfieldForm.preferred_term_years) : null,
                // RFP Timeline
                target_cod: brownfieldForm.target_cod || null,
                // RFP Pricing
                max_fixed_price_per_mwh: brownfieldForm.max_fixed_price_per_mwh ? Number(brownfieldForm.max_fixed_price_per_mwh) : null,
                price_currency: brownfieldForm.price_currency,
                // RFP Settlement
                preferred_settlement_type: brownfieldForm.preferred_settlement_type || null,
                settlement_zone: brownfieldForm.settlement_zone || null,
                // RFP Technology
                preferred_generation_types: brownfieldForm.preferred_generation_types.length > 0 ? brownfieldForm.preferred_generation_types : null,
                // RFP Environmental
                required_eac_scheme: brownfieldForm.required_eac_scheme || null,
                renewable_percentage_target: brownfieldForm.renewable_percentage_target ? Number(brownfieldForm.renewable_percentage_target) : null,
                net_neutral_target_year: brownfieldForm.net_neutral_target_year ? Number(brownfieldForm.net_neutral_target_year) : null,
                // Metadata for facility info + onboarding profile
                metadata: {
                    facility_type: brownfieldForm.facility_type,
                    approximate_power_kw: brownfieldForm.approximate_power_kw ? Number(brownfieldForm.approximate_power_kw) : null,
                    notes: brownfieldForm.notes,
                    // Site Onboarding
                    site_id: brownfieldForm.site_id || null,
                    iso_rto: brownfieldForm.iso_rto || null,
                    state: brownfieldForm.state || null,
                    county_metro: brownfieldForm.county_metro || null,
                    longitude: brownfieldForm.longitude ? Number(brownfieldForm.longitude) : null,
                    latitude: brownfieldForm.latitude ? Number(brownfieldForm.latitude) : null,
                    utility_lse: brownfieldForm.utility_lse || null,
                    load_zone: brownfieldForm.load_zone || null,
                    pnode_id: brownfieldForm.pnode_id || null,
                    voltage_kv: brownfieldForm.voltage_kv ? Number(brownfieldForm.voltage_kv) : null,
                    peak_load_mw: brownfieldForm.peak_load_mw ? Number(brownfieldForm.peak_load_mw) : null,
                    avg_load_mw: brownfieldForm.avg_load_mw ? Number(brownfieldForm.avg_load_mw) : null,
                    load_shape: brownfieldForm.load_shape || null,
                    operating_hours: brownfieldForm.operating_hours || null,
                    criticality: brownfieldForm.criticality || null,
                    backup_gen_type: brownfieldForm.backup_gen_type || null,
                    backup_gen_capacity_mw: brownfieldForm.backup_gen_capacity_mw ? Number(brownfieldForm.backup_gen_capacity_mw) : null,
                    backup_gen_duration_hours: brownfieldForm.backup_gen_duration_hours ? Number(brownfieldForm.backup_gen_duration_hours) : null,
                    primary_supply_type: brownfieldForm.primary_supply_type || null,
                    preferred_clean_gen_type: brownfieldForm.preferred_clean_gen_type || null,
                    preferred_gen_shape: brownfieldForm.preferred_gen_shape || null,
                    rec_coverage_target_pct: brownfieldForm.rec_coverage_target_pct ? Number(brownfieldForm.rec_coverage_target_pct) : null,
                    growth_ramp: brownfieldForm.growth_ramp || null,
                }
            };

            const url = editProject
                ? `${API_BASE_URL}/projects/buyer/${editProject.id}`
                : `${API_BASE_URL}/projects/buyer/brownfield`;

            const method = editProject ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('pd_access_token') ?? ''}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save project');
            }

            if (!editProject) {
                clearDraft(); // Clear draft on successful submission only for new projects
            }
            onSuccess({ projectType });
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save project';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleGreenfieldSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            // Build request with RFP fields
            const requestBody = {
                name: greenfieldForm.name,
                location: greenfieldForm.planned_location,
                status: saveMode, // 'draft' or 'published'
                // RFP Requirements
                target_capacity_mw: greenfieldForm.target_capacity_mw ? Number(greenfieldForm.target_capacity_mw) : null,
                target_annual_quantity_mwh: greenfieldForm.target_annual_quantity_mwh ? Number(greenfieldForm.target_annual_quantity_mwh) : null,
                preferred_term_years: greenfieldForm.preferred_term_years ? Number(greenfieldForm.preferred_term_years) : null,
                // RFP Timeline
                target_cod: greenfieldForm.target_cod || null,
                // RFP Pricing
                max_fixed_price_per_mwh: greenfieldForm.max_fixed_price_per_mwh ? Number(greenfieldForm.max_fixed_price_per_mwh) : null,
                price_currency: greenfieldForm.price_currency,
                // RFP Settlement
                preferred_settlement_type: greenfieldForm.preferred_settlement_type || null,
                settlement_zone: greenfieldForm.settlement_zone || null,
                // RFP Technology
                preferred_generation_types: greenfieldForm.preferred_generation_types.length > 0 ? greenfieldForm.preferred_generation_types : null,
                // RFP Environmental
                required_eac_scheme: greenfieldForm.required_eac_scheme || null,
                renewable_percentage_target: greenfieldForm.renewable_percentage_target ? Number(greenfieldForm.renewable_percentage_target) : null,
                net_neutral_target_year: greenfieldForm.net_neutral_target_year ? Number(greenfieldForm.net_neutral_target_year) : null,
                // Metadata for facility info
                metadata: {
                    equipment_types: greenfieldForm.equipment_types,
                    total_power_rating_kw: greenfieldForm.total_power_rating_kw ? Number(greenfieldForm.total_power_rating_kw) : null,
                    floor_area_sqft: greenfieldForm.floor_area_sqft ? Number(greenfieldForm.floor_area_sqft) : null,
                    cooling_system: greenfieldForm.cooling_system,
                    it_device_ratings_va: greenfieldForm.it_device_ratings_va ? Number(greenfieldForm.it_device_ratings_va) : null,
                    non_calculator_equipment_va: greenfieldForm.non_calculator_equipment_va ? Number(greenfieldForm.non_calculator_equipment_va) : null,
                    future_loads_va: greenfieldForm.future_loads_va ? Number(greenfieldForm.future_loads_va) : null,
                    power_density_w_sqft: greenfieldForm.power_density_w_sqft ? Number(greenfieldForm.power_density_w_sqft) : null,
                    it_load_kw: greenfieldForm.it_load_kw ? Number(greenfieldForm.it_load_kw) : null,
                    ups_capacity_kw: greenfieldForm.ups_capacity_kw ? Number(greenfieldForm.ups_capacity_kw) : null,
                    redundancy_level: greenfieldForm.redundancy_level || null,
                    ac_voltage: greenfieldForm.ac_voltage || null,
                    delivery_date: greenfieldForm.delivery_date || null,
                    net_neutral_target: greenfieldForm.net_neutral_target,
                    generation_preference: greenfieldForm.generation_preference || null
                }
            };

            const url = editProject
                ? `${API_BASE_URL}/projects/buyer/${editProject.id}`
                : `${API_BASE_URL}/projects/buyer/greenfield`;

            const method = editProject ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('pd_access_token') ?? ''}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save project');
            }

            if (!editProject) {
                clearDraft(); // Clear draft on successful submission only for new projects
            }
            onSuccess({ projectType });
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save project';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleGenerationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            // Build the request body with VPPA fields
            const requestBody: Record<string, unknown> = {
                name: generationForm.name,
                generation_type: generationForm.technology_type,
                capacity_mw: Number(generationForm.capacity_mw),
                location: generationForm.location,
                status: saveMode, // 'draft' or 'published'
                // marketplace = available to contract; private = owned by this company.
                // Server enforces: only admin/seller may publish to marketplace.
                // An existing contract is always a private, company-owned record.
                visibility: isExistingContract ? 'private' : (canPublishMarketplace ? genVisibility : 'private'),
                origin: isExistingContract ? 'existing' : 'marketplace',
                // VPPA Timeline
                expected_cod: generationForm.expected_cod || null,
                guaranteed_cod: generationForm.guaranteed_cod || null,
                delivery_term_years: generationForm.delivery_term_years ? Number(generationForm.delivery_term_years) : null,
                term_start_date: generationForm.term_start_date || null,
                term_end_date: generationForm.term_end_date || null,
                // VPPA Pricing
                fixed_price_per_mwh: generationForm.fixed_price_per_mwh ? Number(generationForm.fixed_price_per_mwh) : null,
                eac_price_per_mwh: generationForm.eac_price_per_mwh ? Number(generationForm.eac_price_per_mwh) : null,
                capacity_price_per_mw_day: generationForm.capacity_price_per_mw_day ? Number(generationForm.capacity_price_per_mw_day) : null,
                price_currency: generationForm.price_currency,
                annual_escalator_percent: generationForm.annual_escalator_percent ? Number(generationForm.annual_escalator_percent) : null,
                // VPPA Availability
                guaranteed_availability_year1_percent: generationForm.guaranteed_availability_year1_percent ? Number(generationForm.guaranteed_availability_year1_percent) : null,
                guaranteed_availability_ongoing_percent: generationForm.guaranteed_availability_ongoing_percent ? Number(generationForm.guaranteed_availability_ongoing_percent) : null,
                // VPPA Environmental
                eac_scheme: generationForm.eac_scheme || null,
                // VPPA Settlement
                settlement_point: generationForm.settlement_point || null,
                connection_point: generationForm.connection_point || null,
                // ISO / zone
                iso: generationForm.iso || null,
                zone: generationForm.zone || null,
                latitude: generationForm.latitude === '' ? null : Number(generationForm.latitude),
                longitude: generationForm.longitude === '' ? null : Number(generationForm.longitude),
                // Metadata for description
                metadata: {
                    description: generationForm.description
                },
                // Unbundled products, persisted server-side. A component is saved
                // when its required field is present (capacity⇔EDA, energy⇔zone,
                // RECs⇔agency+format); an absent one is null → deleted.
                products: {
                    capacity: generationForm.eda ? {
                        capacity_mw: generationForm.capacity_mw === '' ? null : Number(generationForm.capacity_mw),
                        eda: generationForm.eda,
                        price_per_mw_day: generationForm.capacity_price_per_mw_day === '' ? null : Number(generationForm.capacity_price_per_mw_day),
                    } : null,
                    energy: generationForm.zone ? {
                        energy_mwh_min: generationForm.energy_mwh_min === '' ? null : Number(generationForm.energy_mwh_min),
                        energy_mwh_max: generationForm.energy_mwh_max === '' ? null : Number(generationForm.energy_mwh_max),
                        zone: generationForm.zone,
                        price_per_mwh: generationForm.fixed_price_per_mwh === '' ? null : Number(generationForm.fixed_price_per_mwh),
                    } : null,
                    rec: (generationForm.retiring_agency && generationForm.matching_format) ? {
                        rec_pct: generationForm.rec_pct === '' ? null : Number(generationForm.rec_pct),
                        retiring_agency: generationForm.retiring_agency,
                        matching_format: generationForm.matching_format,
                        price_per_mwh: generationForm.eac_price_per_mwh === '' ? null : Number(generationForm.eac_price_per_mwh),
                    } : null,
                }
            };

            // Existing-contract facility assignment → backend flow-through to
            // site_contracts. Sent only when facilities are chosen so a plain
            // edit doesn't wipe the prior assignment (server preserves it).
            if (isExistingContract && selectedFacilities.size > 0) {
                requestBody.facilities = [...selectedFacilities].map((fac_id) => ({ fac_id }));
            }

            const url = editProject
                ? `${API_BASE_URL}/projects/${editProject.id}`
                : `${API_BASE_URL}/projects`;

            const method = editProject ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('pd_access_token') ?? ''}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save project');
            }

            if (!editProject) {
                clearDraft(); // Clear draft on successful submission only for new projects
            }
            onSuccess({ projectType });
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save project';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEquipmentTypeToggle = (type: string) => {
        setGreenfieldForm(prev => ({
            ...prev,
            equipment_types: prev.equipment_types.includes(type)
                ? prev.equipment_types.filter(t => t !== type)
                : [...prev.equipment_types, type]
        }));
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={() => {}}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <div className="flex justify-between items-center mb-4">
                                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                                        {editProject ? 'Edit Project' : `Create ${user?.role === 'seller' ? 'Generation Project' : 'Data Center Site'}`}
                                    </Dialog.Title>
                                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                                        <XMarkIcon className="h-6 w-6" />
                                    </button>
                                </div>

                                {/* Project Type Tabs (Buyer Only) */}
                                {user?.role === 'buyer' && (
                                    <div className="flex gap-2 mb-6">
                                        <button
                                            type="button"
                                            onClick={() => setProjectType('brownfield')}
                                            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${projectType === 'brownfield'
                                                ? 'bg-slate-900 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                        >
                                            Brownfield (Existing)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProjectType('greenfield')}
                                            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${projectType === 'greenfield'
                                                ? 'bg-slate-900 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                        >
                                            Greenfield (New)
                                        </button>
                                    </div>
                                )}

                                {error && (
                                    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                                        {error}
                                    </div>
                                )}

                                {/* Draft Recovery Prompt */}
                                {!isEditMode && showDraftPrompt && (
                                    <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-gray-600">
                                                You have an unsaved draft
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={restoreDraft}
                                                    className="px-3 py-1 text-sm font-medium text-slate-700 hover:text-slate-900"
                                                >
                                                    Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={discardDraft}
                                                    className="text-gray-400 hover:text-gray-500"
                                                    aria-label="Dismiss"
                                                >
                                                    <XMarkIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Auto-save Status Indicator */}
                                {!isEditMode && hasDraft && lastSaved && !showDraftPrompt && (
                                    <div className="mb-4 flex items-center justify-end text-xs text-gray-500">
                                        <span>Draft auto-saved at {lastSaved}</span>
                                    </div>
                                )}

                                {/* Brownfield Form (Enhanced with RFP fields) */}
                                {projectType === 'brownfield' && (
                                    <form onSubmit={handleBrownfieldSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-4">
                                        {/* Basic Facility Info */}
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">Facility Information</h4>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Project Name *
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={brownfieldForm.name}
                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, name: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    placeholder="e.g., Austin Data Center"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Facility Location *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={brownfieldForm.location}
                                                        onChange={(e) => setBrownfieldForm({ ...brownfieldForm, location: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="e.g., Austin, TX"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Facility Type *
                                                    </label>
                                                    <select
                                                        required
                                                        value={brownfieldForm.facility_type}
                                                        onChange={(e) => setBrownfieldForm({ ...brownfieldForm, facility_type: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    >
                                                        {FACILITY_TYPES.map(type => (
                                                            <option key={type} value={type}>{type}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Approximate Power Consumption (kW)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={brownfieldForm.approximate_power_kw}
                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, approximate_power_kw: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    placeholder="Current facility power consumption"
                                                />
                                            </div>
                                        </div>

                                        {/* Site Onboarding Profile - Collapsible */}
                                        <div className="border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setShowSiteProfile(!showSiteProfile)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-gray-900">Site Onboarding Profile</span>
                                                {showSiteProfile ? (
                                                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                            {showSiteProfile && (
                                                <div className="p-4 space-y-5 border-t">
                                                    {/* Site Identification */}
                                                    <div>
                                                        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Site Identification</h5>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Site ID</label>
                                                                <input
                                                                    type="text"
                                                                    value={brownfieldForm.site_id}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, site_id: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="Internal site identifier"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">ISO/RTO</label>
                                                                <select
                                                                    value={brownfieldForm.iso_rto}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, iso_rto: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select ISO/RTO...</option>
                                                                    {ISO_RTOS.map((iso) => <option key={iso} value={iso}>{iso}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                                                                <select
                                                                    value={brownfieldForm.state}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, state: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select state...</option>
                                                                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">County / Metro</label>
                                                                <input
                                                                    type="text"
                                                                    value={brownfieldForm.county_metro}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, county_metro: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="e.g., Loudoun County"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">X (Lon)</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.0001"
                                                                    value={brownfieldForm.longitude}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, longitude: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="e.g., -77.5636"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Y (Lat)</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.0001"
                                                                    value={brownfieldForm.latitude}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, latitude: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="e.g., 39.0438"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Utility / LSE</label>
                                                                <input
                                                                    type="text"
                                                                    value={brownfieldForm.utility_lse}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, utility_lse: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="e.g., Dominion Energy VA"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Load Zone</label>
                                                                <select
                                                                    value={brownfieldForm.load_zone}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, load_zone: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select zone...</option>
                                                                    {LOAD_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Pnode ID</label>
                                                                <input
                                                                    type="text"
                                                                    value={brownfieldForm.pnode_id}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, pnode_id: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="PJM/ISO pricing node"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Voltage (kV)</label>
                                                                <input
                                                                    type="number"
                                                                    list="voltage-kv-options"
                                                                    step="0.1"
                                                                    value={brownfieldForm.voltage_kv}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, voltage_kv: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="34.5 / 69 / 115 / 138 / 230"
                                                                />
                                                                <datalist id="voltage-kv-options">
                                                                    {VOLTAGE_KV_OPTIONS.map((v) => <option key={v} value={v} />)}
                                                                </datalist>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Load Profile */}
                                                    <div>
                                                        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Load Profile</h5>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Peak Load (MW)</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={brownfieldForm.peak_load_mw}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, peak_load_mw: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Average Load (MW)</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={brownfieldForm.avg_load_mw}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, avg_load_mw: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Load Shape</label>
                                                                <select
                                                                    value={brownfieldForm.load_shape}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, load_shape: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select shape...</option>
                                                                    {LOAD_SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Operating Hours</label>
                                                                <select
                                                                    value={brownfieldForm.operating_hours}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, operating_hours: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select...</option>
                                                                    {OPERATING_HOURS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
                                                                <select
                                                                    value={brownfieldForm.criticality}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, criticality: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select tier...</option>
                                                                    {CRITICALITY_TIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Backup Generation */}
                                                    <div>
                                                        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Backup Generation</h5>
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Backup Gen Type</label>
                                                                <select
                                                                    value={brownfieldForm.backup_gen_type}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, backup_gen_type: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">None / Select...</option>
                                                                    {BACKUP_GEN_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (MW)</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={brownfieldForm.backup_gen_capacity_mw}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, backup_gen_capacity_mw: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Hours)</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.1"
                                                                    value={brownfieldForm.backup_gen_duration_hours}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, backup_gen_duration_hours: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Procurement Preferences */}
                                                    <div>
                                                        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Procurement Preferences</h5>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Supply Type</label>
                                                                <select
                                                                    value={brownfieldForm.primary_supply_type}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, primary_supply_type: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select...</option>
                                                                    {PRIMARY_SUPPLY_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Clean Gen Type</label>
                                                                <select
                                                                    value={brownfieldForm.preferred_clean_gen_type}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, preferred_clean_gen_type: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select...</option>
                                                                    {PREFERRED_CLEAN_GEN_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Gen Shape</label>
                                                                <select
                                                                    value={brownfieldForm.preferred_gen_shape}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, preferred_gen_shape: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select...</option>
                                                                    {PREFERRED_GEN_SHAPES.map((p) => <option key={p} value={p}>{p}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">REC Coverage Target (%)</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    step="1"
                                                                    value={brownfieldForm.rec_coverage_target_pct}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, rec_coverage_target_pct: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                    placeholder="e.g., 100"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Growth Ramp</label>
                                                                <select
                                                                    value={brownfieldForm.growth_ramp}
                                                                    onChange={(e) => setBrownfieldForm({ ...brownfieldForm, growth_ramp: e.target.value })}
                                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                >
                                                                    <option value="">Select...</option>
                                                                    {GROWTH_RAMPS.map((g) => <option key={g} value={g}>{g}</option>)}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* RFP Requirements Section - Collapsible */}
                                        <div className="border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setShowBuyerRFP(!showBuyerRFP)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-gray-900">PPA/RFP Requirements</span>
                                                {showBuyerRFP ? (
                                                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                            {showBuyerRFP && (
                                                <div className="p-4 space-y-4 border-t">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Target Capacity (MW)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.1"
                                                                value={brownfieldForm.target_capacity_mw}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, target_capacity_mw: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 100"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Contract Term
                                                            </label>
                                                            <select
                                                                value={brownfieldForm.preferred_term_years?.toString() ?? ''}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, preferred_term_years: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Select term...</option>
                                                                {DELIVERY_TERMS.map(term => (
                                                                    <option key={term.value} value={term.value}>{term.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Target COD
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={brownfieldForm.target_cod}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, target_cod: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            />
                                                            <p className="mt-1 text-xs text-gray-500">Desired start date</p>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Max Price ($/MWh)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={brownfieldForm.max_fixed_price_per_mwh}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, max_fixed_price_per_mwh: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="Budget ceiling"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Settlement Type
                                                            </label>
                                                            <select
                                                                value={brownfieldForm.preferred_settlement_type}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, preferred_settlement_type: e.target.value as SettlementType | '' })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Select type...</option>
                                                                {SETTLEMENT_TYPES.map(type => (
                                                                    <option key={type.value} value={type.value}>{type.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Settlement Zone
                                                            </label>
                                                            <select
                                                                value={brownfieldForm.settlement_zone}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, settlement_zone: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Select zone...</option>
                                                                {SETTLEMENT_ZONES.map(zone => (
                                                                    <option key={zone} value={zone}>{zone}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Preferred Generation Types
                                                        </label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {TECHNOLOGY_TYPES.map(tech => (
                                                                <label key={tech.value} className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={brownfieldForm.preferred_generation_types.includes(tech.value)}
                                                                        onChange={(e) => {
                                                                            const types = e.target.checked
                                                                                ? [...brownfieldForm.preferred_generation_types, tech.value]
                                                                                : brownfieldForm.preferred_generation_types.filter(t => t !== tech.value);
                                                                            setBrownfieldForm({ ...brownfieldForm, preferred_generation_types: types });
                                                                        }}
                                                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                                    />
                                                                    <span className="text-sm text-gray-700">{tech.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Environmental Goals - Collapsible */}
                                        <div className="border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setShowBuyerEnvironmental(!showBuyerEnvironmental)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-gray-900">Environmental Goals</span>
                                                {showBuyerEnvironmental ? (
                                                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                            {showBuyerEnvironmental && (
                                                <div className="p-4 space-y-4 border-t">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Required EAC Scheme
                                                            </label>
                                                            <select
                                                                value={brownfieldForm.required_eac_scheme}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, required_eac_scheme: e.target.value as EACScheme | '' })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Any scheme</option>
                                                                {EAC_SCHEMES.map(scheme => (
                                                                    <option key={scheme.value} value={scheme.value}>
                                                                        {scheme.label} {scheme.region && `(${scheme.region})`}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Renewable Target (%)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                value={brownfieldForm.renewable_percentage_target}
                                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, renewable_percentage_target: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 100"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Net-Zero Target Year
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="2024"
                                                            max="2100"
                                                            value={brownfieldForm.net_neutral_target_year}
                                                            onChange={(e) => setBrownfieldForm({ ...brownfieldForm, net_neutral_target_year: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            placeholder="e.g., 2030"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">Corporate sustainability goal year</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Notes */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Additional Notes
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={brownfieldForm.notes}
                                                onChange={(e) => setBrownfieldForm({ ...brownfieldForm, notes: e.target.value })}
                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                placeholder="Optional: Add any additional requirements or preferences"
                                            />
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-white border-t mt-4">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                onClick={() => setSaveMode('draft')}
                                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                {submitting && saveMode === 'draft' ? 'Saving...' : 'Save as Draft'}
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                onClick={() => setSaveMode('published')}
                                                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                            >
                                                {submitting && saveMode === 'published' ? 'Publishing...' : 'Publish'}
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* Greenfield Form */}
                                {projectType === 'greenfield' && (
                                    <form onSubmit={handleGreenfieldSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Project Name *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={greenfieldForm.name}
                                                onChange={(e) => setGreenfieldForm({ ...greenfieldForm, name: e.target.value })}
                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                placeholder="e.g., New Phoenix Data Center"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Planned Location *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={greenfieldForm.planned_location}
                                                onChange={(e) => setGreenfieldForm({ ...greenfieldForm, planned_location: e.target.value })}
                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                placeholder="e.g., Phoenix, AZ"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Equipment Types *
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {EQUIPMENT_TYPES.map(type => (
                                                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={greenfieldForm.equipment_types.includes(type)}
                                                            onChange={() => handleEquipmentTypeToggle(type)}
                                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="text-sm text-gray-700">{type}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Total Power Rating (kW) *
                                                </label>
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step="0.01"
                                                    value={greenfieldForm.total_power_rating_kw}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, total_power_rating_kw: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Floor Area (sq ft) *
                                                </label>
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step="0.01"
                                                    value={greenfieldForm.floor_area_sqft}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, floor_area_sqft: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Cooling System Type *
                                            </label>
                                            <select
                                                required
                                                value={greenfieldForm.cooling_system}
                                                onChange={(e) => setGreenfieldForm({ ...greenfieldForm, cooling_system: e.target.value })}
                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                            >
                                                {COOLING_SYSTEMS.map(system => (
                                                    <option key={system} value={system}>{system}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    IT Device Ratings (VA)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={greenfieldForm.it_device_ratings_va}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, it_device_ratings_va: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    IT Load (kW)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={greenfieldForm.it_load_kw}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, it_load_kw: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    UPS Capacity (kW)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={greenfieldForm.ups_capacity_kw}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, ups_capacity_kw: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Redundancy Level
                                                </label>
                                                <select
                                                    value={greenfieldForm.redundancy_level}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, redundancy_level: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                >
                                                    <option value="">Select...</option>
                                                    <option value="N">N</option>
                                                    <option value="N+1">N+1</option>
                                                    <option value="2N">2N</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    AC Voltage
                                                </label>
                                                <input
                                                    type="text"
                                                    value={greenfieldForm.ac_voltage}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, ac_voltage: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    placeholder="e.g., 480V"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Delivery Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={greenfieldForm.delivery_date}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, delivery_date: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={greenfieldForm.net_neutral_target}
                                                    onChange={(e) => setGreenfieldForm({ ...greenfieldForm, net_neutral_target: e.target.checked })}
                                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-medium text-gray-700">Net Neutral Target</span>
                                            </label>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Generation Preference
                                            </label>
                                            <input
                                                type="text"
                                                value={greenfieldForm.generation_preference}
                                                onChange={(e) => setGreenfieldForm({ ...greenfieldForm, generation_preference: e.target.value })}
                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                placeholder="e.g., Solar, Wind, etc."
                                            />
                                        </div>

                                        <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-white">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                onClick={() => setSaveMode('draft')}
                                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                {submitting && saveMode === 'draft' ? 'Saving...' : 'Save as Draft'}
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                onClick={() => setSaveMode('published')}
                                                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                            >
                                                {submitting && saveMode === 'published' ? 'Publishing...' : 'Publish'}
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* Generation Project Form (Enhanced with VPPA fields) */}
                                {projectType === 'generation' && (
                                    <form onSubmit={handleGenerationSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                                        {/* Existing-contract facility assignment — which data centers this
                                            already-held contract serves (charts against their load). */}
                                        {isExistingContract && (
                                            <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/40 p-3">
                                                <h4 className="text-sm font-semibold text-gray-900">Existing contract — assign to facilities</h4>
                                                <p className="text-xs text-gray-500">The contract's volume is split evenly across the selected data centers and charted against their load.</p>
                                                <div className="flex flex-wrap gap-3 pt-1">
                                                    {FACILITY_OPTIONS.map((f) => (
                                                        <label key={f.facId} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedFacilities.has(f.facId)}
                                                                onChange={() => setSelectedFacilities((prev) => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(f.facId)) next.delete(f.facId); else next.add(f.facId);
                                                                    return next;
                                                                })}
                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                                            />
                                                            {f.name}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Basic Project Info */}
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">Basic Project Information</h4>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Project Name *
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={generationForm.name}
                                                    onChange={(e) => setGenerationForm({ ...generationForm, name: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    placeholder="e.g., Desert Sun Solar Farm"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Technology Type *
                                                    </label>
                                                    <select
                                                        required
                                                        value={generationForm.technology_type}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, technology_type: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    >
                                                        {TECHNOLOGY_TYPES.map(tech => (
                                                            <option key={tech.value} value={tech.value}>{tech.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Capacity (MW) *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="0"
                                                        step="0.01"
                                                        value={generationForm.capacity_mw}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, capacity_mw: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Location
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={generationForm.location}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, location: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="e.g., Nevada, USA"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        EDA
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={generationForm.eda}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, eda: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="Effective Deliverability Area"
                                                        title="Effective Deliverability Area — required to offer the Capacity product"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Energy MWh min
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={generationForm.energy_mwh_min}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, energy_mwh_min: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Energy MWh max
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={generationForm.energy_mwh_max}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, energy_mwh_max: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="e.g., 400"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Latitude
                                                    </label>
                                                    <input
                                                        type="number"
                                                        step="0.000001"
                                                        min="-90"
                                                        max="90"
                                                        value={generationForm.latitude}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, latitude: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="e.g., 35.2220"
                                                    />
                                                    <p className="mt-1 text-xs text-gray-500">Optional — overrides the name-based map position</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Longitude
                                                    </label>
                                                    <input
                                                        type="number"
                                                        step="0.000001"
                                                        min="-180"
                                                        max="180"
                                                        value={generationForm.longitude}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, longitude: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="e.g., -101.8313"
                                                    />
                                                    <p className="mt-1 text-xs text-gray-500">Optional</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        ISO
                                                    </label>
                                                    <select
                                                        value={generationForm.iso}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, iso: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    >
                                                        {ISO_RTOS.map(iso => (
                                                            <option key={iso} value={iso}>{iso}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Zone
                                                    </label>
                                                    <select
                                                        value={generationForm.zone}
                                                        onChange={(e) => setGenerationForm({ ...generationForm, zone: e.target.value })}
                                                        className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    >
                                                        <option value="">Select zone</option>
                                                        {PJM_ZONES.map(z => (
                                                            <option key={z} value={z}>{z}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Project Description
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    value={generationForm.description}
                                                    onChange={(e) => setGenerationForm({ ...generationForm, description: e.target.value })}
                                                    className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    placeholder="Brief description of your project..."
                                                />
                                            </div>
                                        </div>

                                        {/* VPPA Pricing Section - Collapsible */}
                                        <div className="border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setShowVPPAPricing(!showVPPAPricing)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-gray-900">Pricing Terms</span>
                                                {showVPPAPricing ? (
                                                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                            {showVPPAPricing && (
                                                <div className="p-4 space-y-4 border-t">
                                                    <div className="grid grid-cols-3 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Currency
                                                            </label>
                                                            <select
                                                                value={generationForm.price_currency}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, price_currency: e.target.value as PriceCurrency })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                {PRICE_CURRENCIES.map(curr => (
                                                                    <option key={curr.value} value={curr.value}>{curr.symbol} {curr.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Fixed Price (per MWh)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={generationForm.fixed_price_per_mwh}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, fixed_price_per_mwh: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 45.00"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                EAC Price (per MWh)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={generationForm.eac_price_per_mwh}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, eac_price_per_mwh: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 5.00"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Capacity Cost (per MW-day)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={generationForm.capacity_price_per_mw_day}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, capacity_price_per_mw_day: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 269.92"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Annual Price Escalator (%)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="10"
                                                            step="0.1"
                                                            value={generationForm.annual_escalator_percent}
                                                            onChange={(e) => setGenerationForm({ ...generationForm, annual_escalator_percent: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            placeholder="e.g., 2.0"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">Annual percentage increase in fixed price</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* VPPA Timeline Section - Collapsible */}
                                        <div className="border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setShowVPPATimeline(!showVPPATimeline)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-gray-900">Timeline & Contract Term</span>
                                                {showVPPATimeline ? (
                                                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                            {showVPPATimeline && (
                                                <div className="p-4 space-y-4 border-t">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Expected COD
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={generationForm.expected_cod}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, expected_cod: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            />
                                                            <p className="mt-1 text-xs text-gray-500">Expected Commercial Operation Date</p>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Guaranteed COD
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={generationForm.guaranteed_cod}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, guaranteed_cod: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            />
                                                            <p className="mt-1 text-xs text-gray-500">Damages apply if missed</p>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Delivery Term
                                                        </label>
                                                        <select
                                                            value={generationForm.delivery_term_years?.toString() ?? ''}
                                                            onChange={(e) => setGenerationForm({ ...generationForm, delivery_term_years: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        >
                                                            <option value="">Select term...</option>
                                                            {DELIVERY_TERMS.map(term => (
                                                                <option key={term.value} value={term.value}>{term.label}</option>
                                                            ))}
                                                        </select>
                                                        <p className="mt-1 text-xs text-gray-500">Contract duration from COD</p>
                                                    </div>

                                                    {/* Delivery term window shown in the marketplace (Term Start/Stop). */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Term Start
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={generationForm.term_start_date}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, term_start_date: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            />
                                                            <p className="mt-1 text-xs text-gray-500">Delivery start (marketplace Term)</p>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Term Stop
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={generationForm.term_end_date}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, term_end_date: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            />
                                                            <p className="mt-1 text-xs text-gray-500">Delivery end (marketplace Term)</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* VPPA Additional Details - Collapsible */}
                                        <div className="border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setShowVPPADetails(!showVPPADetails)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-gray-900">Environmental & Technical Details</span>
                                                {showVPPADetails ? (
                                                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                            {showVPPADetails && (
                                                <div className="p-4 space-y-4 border-t">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                EAC Scheme
                                                            </label>
                                                            <select
                                                                value={generationForm.eac_scheme}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, eac_scheme: e.target.value as EACScheme | '' })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Select scheme...</option>
                                                                {EAC_SCHEMES.map(scheme => (
                                                                    <option key={scheme.value} value={scheme.value}>
                                                                        {scheme.label} {scheme.region && `(${scheme.region})`}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <p className="mt-1 text-xs text-gray-500">Environmental attribute certificate type</p>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Settlement Point
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={generationForm.settlement_point}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, settlement_point: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., PECO Zone, PJM Hub"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Year 1 Availability Guarantee (%)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="0.1"
                                                                value={generationForm.guaranteed_availability_year1_percent}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, guaranteed_availability_year1_percent: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 85"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Ongoing Availability Guarantee (%)
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="0.1"
                                                                value={generationForm.guaranteed_availability_ongoing_percent}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, guaranteed_availability_ongoing_percent: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 90"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Grid Connection Point
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={generationForm.connection_point}
                                                            onChange={(e) => setGenerationForm({ ...generationForm, connection_point: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            placeholder="e.g., 230kV Substation Name"
                                                        />
                                                    </div>

                                                    {/* RECs — set Retiring Agency + Matching Format to offer the REC product
                                                        (REC price comes from the EAC price field). */}
                                                    <div className="grid grid-cols-3 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">REC %</label>
                                                            <input
                                                                type="number" min="0" max="100" step="0.1"
                                                                value={generationForm.rec_pct}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, rec_pct: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                                placeholder="e.g., 100"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Retiring Agency</label>
                                                            <select
                                                                value={generationForm.retiring_agency}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, retiring_agency: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Select…</option>
                                                                {RETIRING_AGENCIES.map((a) => <option key={a} value={a}>{a}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Matching Format</label>
                                                            <select
                                                                value={generationForm.matching_format}
                                                                onChange={(e) => setGenerationForm({ ...generationForm, matching_format: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                            >
                                                                <option value="">Select…</option>
                                                                {MATCHING_FORMATS.map((m) => <option key={m} value={m}>{MATCHING_FORMAT_LABELS[m]}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Availability: marketplace (contractable) vs private (company-owned) */}
                                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 mt-2">
                                            <span className="text-xs font-semibold text-slate-600">Availability</span>
                                            {canPublishMarketplace ? (
                                                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                                    {(['marketplace', 'private'] as const).map((v) => (
                                                        <button
                                                            key={v}
                                                            type="button"
                                                            onClick={() => setGenVisibility(v)}
                                                            className={`px-3 py-1 rounded-md font-medium border transition-colors ${
                                                                genVisibility === v
                                                                    ? 'bg-teal-600 text-white border-teal-600'
                                                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {v === 'marketplace' ? 'Marketplace (available to contract)' : 'Private (my company)'}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="mt-1 text-xs text-slate-500">Private — owned by and visible only to your company.</p>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-white border-t mt-4">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                onClick={() => setSaveMode('draft')}
                                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                {submitting && saveMode === 'draft' ? 'Saving...' : 'Save as Draft'}
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                onClick={() => setSaveMode('published')}
                                                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                            >
                                                {submitting && saveMode === 'published' ? 'Publishing...' : 'Publish'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
