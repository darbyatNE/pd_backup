import { 
    BoltIcon, 
    CalendarDaysIcon, 
    CurrencyDollarIcon, 
    MapPinIcon,
    BuildingOfficeIcon,
    ShieldCheckIcon,
    DocumentTextIcon,
    SunIcon,
    ClockIcon,
    ChartBarIcon,
    GlobeAmericasIcon
} from '@heroicons/react/24/outline';
import type { PriceCurrency, EACScheme, SettlementType } from '../types/ppa';

// Seller Project (VPPA) Data
interface SellerProjectData {
    // Basic Info
    name: string;
    generation_type: string;
    capacity_mw: number;
    location: string;
    status: string;
    
    // Pricing
    fixed_price_per_mwh?: number;
    eac_price_per_mwh?: number;
    price_currency?: PriceCurrency;
    annual_escalator_percent?: number;
    
    // Timeline
    expected_cod?: string;
    guaranteed_cod?: string;
    delivery_term_years?: number;
    
    // Availability
    guaranteed_availability_year1_percent?: number;
    guaranteed_availability_ongoing_percent?: number;
    
    // Environmental
    eac_scheme?: EACScheme;
    
    // Settlement
    settlement_point?: string;
    connection_point?: string;
}

// Buyer Project (RFP) Data
interface BuyerProjectData {
    // Basic Info
    name: string;
    project_type: 'brownfield' | 'greenfield';
    location: string;
    
    // RFP Requirements
    target_capacity_mw?: number;
    target_annual_quantity_mwh?: number;
    preferred_term_years?: number;
    
    // Timeline
    target_cod?: string;
    
    // Pricing
    max_fixed_price_per_mwh?: number;
    price_currency?: PriceCurrency;
    
    // Settlement
    preferred_settlement_type?: SettlementType;
    settlement_zone?: string;
    
    // Technology
    preferred_generation_types?: string[];
    
    // Environmental
    required_eac_scheme?: EACScheme;
    renewable_percentage_target?: number;
    net_neutral_target_year?: number;
}

interface ProjectTermSheetProps {
    projectType: 'seller' | 'buyer';
    data: SellerProjectData | BuyerProjectData;
    showHeader?: boolean;
    compact?: boolean;
}

const CURRENCY_SYMBOLS: Record<PriceCurrency, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€'
};

const EAC_LABELS: Record<EACScheme, string> = {
    REGO: 'REGO (UK)',
    GO: 'Guarantee of Origin (EU)',
    REC: 'Renewable Energy Certificate (US)',
    AEPS: 'AEPS Credits (PA)',
    other: 'Other'
};

const SETTLEMENT_LABELS: Record<SettlementType, string> = {
    physical: 'Physical PPA',
    financial: 'Virtual/Financial PPA',
    contract_for_difference: 'Contract for Difference'
};

// Generation type labels (no icons for professional enterprise look)
const GENERATION_TYPE_LABELS: Record<string, string> = {
    Solar: 'Solar',
    Wind: 'Wind',
    Nuclear: 'Nuclear',
    Battery: 'Battery',
    Hydrogen: 'Hydrogen',
    Hybrid: 'Hybrid'
};

// Term Section Component
function TermSection({ 
    title, 
    icon: Icon, 
    children 
}: { 
    title: string; 
    icon: typeof BoltIcon; 
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                <Icon className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            </div>
            <div className="space-y-2">
                {children}
            </div>
        </div>
    );
}

// Term Row Component
function TermRow({ 
    label, 
    value, 
    highlight = false 
}: { 
    label: string; 
    value: React.ReactNode; 
    highlight?: boolean;
}) {
    if (value === null || value === undefined || value === '') return null;
    
    return (
        <div className="flex justify-between items-start gap-4">
            <span className="text-sm text-gray-600">{label}</span>
            <span className={`text-sm text-right ${highlight ? 'font-semibold text-indigo-700' : 'font-medium text-gray-900'}`}>
                {value}
            </span>
        </div>
    );
}

export default function ProjectTermSheet({
    projectType,
    data,
    showHeader = true,
    compact = false
}: ProjectTermSheetProps) {
    const currencySymbol = CURRENCY_SYMBOLS[(data as SellerProjectData).price_currency || 'USD'];
    
    // Format date for display
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return null;
        return new Date(dateStr).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    };

    // Format number with commas
    const formatNumber = (num?: number) => {
        if (num === undefined || num === null) return null;
        return num.toLocaleString();
    };

    // Render Seller (VPPA) Term Sheet
    const renderSellerTermSheet = () => {
        const seller = data as SellerProjectData;
        const genLabel = GENERATION_TYPE_LABELS[seller.generation_type] || seller.generation_type;
        
        return (
            <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                {/* Project Overview */}
                <TermSection title="Project Overview" icon={SunIcon}>
                    <TermRow 
                        label="Project Name" 
                        value={seller.name} 
                        highlight 
                    />
                    <TermRow 
                        label="Technology" 
                        value={genLabel} 
                    />
                    <TermRow 
                        label="Capacity" 
                        value={`${formatNumber(seller.capacity_mw)} MW`} 
                        highlight 
                    />
                    <TermRow 
                        label="Location" 
                        value={seller.location} 
                    />
                    <TermRow 
                        label="Status" 
                        value={
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                                seller.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                                {seller.status}
                            </span>
                        } 
                    />
                </TermSection>

                {/* Pricing Terms */}
                <TermSection title="Pricing Terms" icon={CurrencyDollarIcon}>
                    <TermRow 
                        label="Fixed Price" 
                        value={seller.fixed_price_per_mwh ? `${currencySymbol}${seller.fixed_price_per_mwh.toFixed(2)}/MWh` : null}
                        highlight 
                    />
                    <TermRow 
                        label="EAC Price" 
                        value={seller.eac_price_per_mwh ? `${currencySymbol}${seller.eac_price_per_mwh.toFixed(2)}/MWh` : null} 
                    />
                    <TermRow 
                        label="Total Bundled Price" 
                        value={seller.fixed_price_per_mwh && seller.eac_price_per_mwh ? 
                            `${currencySymbol}${(seller.fixed_price_per_mwh + seller.eac_price_per_mwh).toFixed(2)}/MWh` : null}
                        highlight 
                    />
                    <TermRow 
                        label="Annual Escalator" 
                        value={seller.annual_escalator_percent ? `${seller.annual_escalator_percent}%` : null} 
                    />
                    <TermRow 
                        label="Currency" 
                        value={seller.price_currency} 
                    />
                </TermSection>

                {/* Timeline */}
                <TermSection title="Timeline & Term" icon={CalendarDaysIcon}>
                    <TermRow 
                        label="Expected COD" 
                        value={formatDate(seller.expected_cod)} 
                    />
                    <TermRow 
                        label="Guaranteed COD" 
                        value={formatDate(seller.guaranteed_cod)}
                        highlight 
                    />
                    <TermRow 
                        label="Delivery Term" 
                        value={seller.delivery_term_years ? `${seller.delivery_term_years} Years` : null}
                        highlight 
                    />
                </TermSection>

                {/* Availability & Technical */}
                <TermSection title="Availability Guarantees" icon={ShieldCheckIcon}>
                    <TermRow 
                        label="Year 1 Availability" 
                        value={seller.guaranteed_availability_year1_percent ? `${seller.guaranteed_availability_year1_percent}%` : null} 
                    />
                    <TermRow 
                        label="Ongoing Availability" 
                        value={seller.guaranteed_availability_ongoing_percent ? `${seller.guaranteed_availability_ongoing_percent}%` : null} 
                    />
                    <TermRow 
                        label="EAC Scheme" 
                        value={seller.eac_scheme ? EAC_LABELS[seller.eac_scheme] : null} 
                    />
                </TermSection>

                {/* Settlement */}
                <TermSection title="Settlement Details" icon={MapPinIcon}>
                    <TermRow 
                        label="Settlement Point" 
                        value={seller.settlement_point} 
                    />
                    <TermRow 
                        label="Connection Point" 
                        value={seller.connection_point} 
                    />
                </TermSection>
            </div>
        );
    };

    // Render Buyer (RFP) Term Sheet
    const renderBuyerTermSheet = () => {
        const buyer = data as BuyerProjectData;
        const buyerCurrency = CURRENCY_SYMBOLS[buyer.price_currency || 'USD'];
        
        return (
            <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                {/* Facility Overview */}
                <TermSection title="Facility Overview" icon={BuildingOfficeIcon}>
                    <TermRow 
                        label="Project Name" 
                        value={buyer.name} 
                        highlight 
                    />
                    <TermRow 
                        label="Project Type" 
                        value={buyer.project_type === 'brownfield' ? 'Brownfield (Existing)' : 'Greenfield (New)'} 
                    />
                    <TermRow 
                        label="Location" 
                        value={buyer.location} 
                    />
                </TermSection>

                {/* RFP Requirements */}
                <TermSection title="Energy Requirements" icon={BoltIcon}>
                    <TermRow 
                        label="Target Capacity" 
                        value={buyer.target_capacity_mw ? `${formatNumber(buyer.target_capacity_mw)} MW` : null}
                        highlight 
                    />
                    <TermRow 
                        label="Annual Quantity" 
                        value={buyer.target_annual_quantity_mwh ? `${formatNumber(buyer.target_annual_quantity_mwh)} MWh` : null}
                    />
                    <TermRow 
                        label="Contract Term" 
                        value={buyer.preferred_term_years ? `${buyer.preferred_term_years} Years` : null}
                        highlight 
                    />
                </TermSection>

                {/* Timeline */}
                <TermSection title="Timeline" icon={ClockIcon}>
                    <TermRow 
                        label="Target COD" 
                        value={formatDate(buyer.target_cod)}
                        highlight 
                    />
                </TermSection>

                {/* Pricing Preferences */}
                <TermSection title="Pricing Preferences" icon={ChartBarIcon}>
                    <TermRow 
                        label="Max Fixed Price" 
                        value={buyer.max_fixed_price_per_mwh ? `${buyerCurrency}${buyer.max_fixed_price_per_mwh.toFixed(2)}/MWh` : null}
                        highlight 
                    />
                    <TermRow 
                        label="Currency" 
                        value={buyer.price_currency} 
                    />
                </TermSection>

                {/* Settlement Preferences */}
                <TermSection title="Settlement Preferences" icon={MapPinIcon}>
                    <TermRow 
                        label="Settlement Type" 
                        value={buyer.preferred_settlement_type ? SETTLEMENT_LABELS[buyer.preferred_settlement_type] : null} 
                    />
                    <TermRow 
                        label="Settlement Zone" 
                        value={buyer.settlement_zone} 
                    />
                </TermSection>

                {/* Technology Preferences */}
                <TermSection title="Technology Preferences" icon={SunIcon}>
                    <TermRow 
                        label="Preferred Types" 
                        value={buyer.preferred_generation_types?.length ? 
                            buyer.preferred_generation_types.map(t => GENERATION_TYPE_LABELS[t] || t).join(', ') : null} 
                    />
                </TermSection>

                {/* Environmental Goals */}
                <TermSection title="Environmental Goals" icon={GlobeAmericasIcon}>
                    <TermRow 
                        label="Required EAC Scheme" 
                        value={buyer.required_eac_scheme ? EAC_LABELS[buyer.required_eac_scheme] : 'Any'} 
                    />
                    <TermRow 
                        label="Renewable Target" 
                        value={buyer.renewable_percentage_target ? `${buyer.renewable_percentage_target}%` : null}
                        highlight 
                    />
                    <TermRow 
                        label="Net-Zero Target Year" 
                        value={buyer.net_neutral_target_year} 
                    />
                </TermSection>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {showHeader && (
                <div className="flex items-center gap-3 pb-2 border-b">
                    <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">
                            {projectType === 'seller' ? 'VPPA Term Sheet' : 'RFP Requirements Summary'}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {projectType === 'seller' 
                                ? 'Key terms and conditions for this power purchase agreement'
                                : 'Energy procurement requirements and preferences'}
                        </p>
                    </div>
                </div>
            )}
            
            {projectType === 'seller' ? renderSellerTermSheet() : renderBuyerTermSheet()}
        </div>
    );
}
