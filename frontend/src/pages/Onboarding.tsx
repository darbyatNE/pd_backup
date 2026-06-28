import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { State, City } from 'country-state-city';
import LocationCascade from './profile/LocationCascade';

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = [
    'Create Account',
    'Facility Profile',
    'IT Load & Capacity',
    'Procurement Status',
    'Sustainability Goals',
    "KPI's & Targets",
    '3rd-Party Market',
    'Review',
];




const ELECTRICITY_CONTRACT_TYPES = [
    'Utility Contract',
    'Physical PPA',
    'Synthetic PPA',
    'Virtual PPA (VPPA)',
    'Tolling Agreement',
    'Other',
];

const PRIMARY_GOALS = [
    'Cost Reduction',
    'Carbon Neutrality / Net Zero',
    'RE100 Commitment',
    'Energy Security',
    'Regulatory Compliance',
    'ESG Reporting',
];

function inferStep(data: Record<string, any>): number {
    return 0;
}

// ─── Small shared components ──────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
    );
}

function InfoIcon() {
    return (
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}

// ─── Step 0 — Create Account ("Who you are") ──────────────────────────────────

function StepCreateAccount({
    data,
    onChange,
    disabled = false
}: {
    data: any;
    onChange: (field: string, value: string) => void;
    disabled?: boolean;
}) {
    const [showPassword, setShowPassword] = useState(false);

    const hasMinLength = data.password.length >= 8;
    const hasNumeric = /\d/.test(data.password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-]/.test(data.password);

    const input =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Who you are</h1>
                {disabled && (
                    <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                        <CheckIcon className="w-4 h-4" />
                        Signed In
                    </div>
                )}
            </div>
            <p className="text-sm text-gray-500 mb-8">
                {disabled ? 'Your account details are confirmed.' : 'We need a few details about you.'}
            </p>

            <div className="space-y-6 max-w-4xl">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">First Name*</label>
                        <input className={`${input} ${disabled ? 'bg-gray-50 cursor-not-allowed opacity-75' : ''}`}
                            type="text" placeholder="Jane" disabled={disabled}
                            value={data.firstName} onChange={e => onChange('firstName', e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Last Name*</label>
                        <input className={`${input} ${disabled ? 'bg-gray-50 cursor-not-allowed opacity-75' : ''}`}
                            type="text" placeholder="Smith" disabled={disabled}
                            value={data.lastName} onChange={e => onChange('lastName', e.target.value)} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Work Email*</label>
                        <input className={`${input} ${disabled ? 'bg-gray-50 cursor-not-allowed opacity-75' : ''}`}
                            type="email" placeholder="janesmith@powerDime.net" disabled={disabled}
                            value={data.email} onChange={e => onChange('email', e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Title*</label>
                        <input className={`${input} ${disabled ? 'bg-gray-50 cursor-not-allowed opacity-75' : ''}`}
                            type="text" placeholder="e.g. Head of Energy Procurement" disabled={disabled}
                            value={data.title} onChange={e => onChange('title', e.target.value)} />
                    </div>
                </div>

                {!disabled && (
                    <>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Password*</label>
                                <div className="relative">
                                    <input className={`${input} pr-11`}
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="PowerDime78#"
                                        value={data.password} onChange={e => onChange('password', e.target.value)} />
                                    <button type="button" tabIndex={-1}
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPassword ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.956 9.956 0 012.223-3.592M6.53 6.53A9.956 9.956 0 0112 5c4.477 0 8.268 2.943 9.542 7a9.973 9.973 0 01-4.07 5.296M3 3l18 18" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Confirm Password*</label>
                                <input className={input}
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="PowerDime78#"
                                    value={data.confirmPassword} onChange={e => onChange('confirmPassword', e.target.value)} />
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-3">Password must contain:</p>
                            <ul className="space-y-2">
                                {[
                                    { label: 'Minimum 8 characters', met: hasMinLength },
                                    { label: 'Must have numeric character', met: hasNumeric },
                                    { label: 'Must have special character', met: hasSpecial },
                                ].map(({ label, met }) => (
                                    <li key={label} className="flex items-center gap-2 text-sm text-gray-700">
                                        <CheckIcon className={`w-4 h-4 flex-shrink-0 ${met ? 'text-teal-500' : 'text-gray-300'}`} />
                                        {label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}


// ─── Step 1 — Facility Profile ───────────────────────────────────────────────

const ISO_RTO_OPTIONS = ['PJM', 'MISO', 'ERCOT', 'CAISO', 'NYISO', 'ISO-NE', 'SPP'];

const ISO_POD_PORTALS: Record<string, { label: string; url: string; hint: string }> = {
    PJM:     { label: 'PJM Pnode List',          url: 'https://www.pjm.com/markets-and-operations/energy/real-time/lmps', hint: 'Find your Pnode ID in your interconnection agreement or on the PJM Markets portal under LMP data.' },
    MISO:    { label: 'MISO Energy Markets',     url: 'https://www.misoenergy.org/markets-and-operations/real-time--market-data/market-reports/', hint: 'Look up your settlement point in the MISO Energy Markets portal under Market Reports.' },
    ERCOT:   { label: 'ERCOT Settlement Points', url: 'https://www.ercot.com/mktinfo/prices',  hint: 'Your settlement point ID is listed in your ERCOT interconnection or retail agreement. Browse current settlement points on the ERCOT market info page.' },
    CAISO:   { label: 'CAISO OASIS',             url: 'https://oasis.caiso.com',               hint: 'Use the CAISO OASIS portal to look up your Pnode or TAC area. Your interconnection agreement will reference the exact node ID.' },
    NYISO:   { label: 'NYISO Markets',           url: 'https://www.nyiso.com/energy-market-operational-data', hint: 'NYISO reference your zone or bus-level pricing node. Find it in your NYISO interconnection agreement or on the NYISO market data portal.' },
    'ISO-NE': { label: 'ISO-NE SMT Portal',      url: 'https://smt.iso-ne.com',                hint: 'Your settlement node appears in your ISO-NE interconnection documents. Use the SMT (Standard Market Design) portal to search nodes.' },
    SPP:     { label: 'SPP Marketplace',         url: 'https://marketplace.spp.org',           hint: 'Look up your settlement location in the SPP Marketplace portal or in your SPP interconnection agreement.' },
};

const ISO_ZONES: Record<string, string[]> = {
    PJM: ['AECO', 'AEP', 'AP', 'ATSI', 'BGE', 'COMED', 'DAYTON', 'DEOK', 'DOM', 'DPL', 'DUQ', 'EKPC', 'JCPL', 'ME', 'PECO', 'PENNA', 'PPL', 'PSEG', 'RECO'],
    MISO: ['Zone 1 (MN/ND/SD)', 'Zone 2 (MN/WI)', 'Zone 3 (MI)', 'Zone 4 (IN)', 'Zone 5 (IL)', 'Zone 6 (MO/IA)', 'Zone 7 (AR/MS)', 'Zone 8 (LA)', 'Zone 9 (TX/LA)', 'Zone 10 (TX)'],
    ERCOT: ['North', 'South', 'Houston', 'West'],
    CAISO: ['NP15 (North)', 'SP15 (South)', 'ZP26 (Central)'],
    NYISO: ['Zone A (West)', 'Zone B (Genesee)', 'Zone C (Central)', 'Zone D (North)', 'Zone E (Mohawk Valley)', 'Zone F (Capital)', 'Zone G (Hudson Valley)', 'Zone H (Millwood)', 'Zone I (Dunwoodie)', 'Zone J (NYC)', 'Zone K (Long Island)'],
    'ISO-NE': ['CT', 'ME', 'NH', 'NE-MA', 'RI', 'VT', 'WCMA', 'SEMA', 'NEMA'],
    SPP: ['North', 'South'],
};

type FacilityOnboardingData = {
    lp_facility_status: string;
    lp_facility_name: string;
    lp_address: string;
    lp_country: string;
    lp_state: string;
    lp_city: string;
    lp_zipcode: string;
    lp_availability_zone: string;
    lp_iso_rto: string;
    lp_grid_voltage_kv: string;
    lp_settlement_node_id: string;
    lp_contracted_capacity_mw: string;
    lp_interconnection_expiry: string;
};

const EMPTY_FACILITY: FacilityOnboardingData = {
    lp_facility_status: '',
    lp_facility_name: '',
    lp_address: '',
    lp_country: '',
    lp_state: '',
    lp_city: '',
    lp_zipcode: '',
    lp_availability_zone: '',
    lp_iso_rto: '',
    lp_grid_voltage_kv: '',
    lp_settlement_node_id: '',
    lp_contracted_capacity_mw: '',
    lp_interconnection_expiry: '',
};

// ─── Address Autocomplete (Nominatim / OpenStreetMap) ────────────────────────

type NominatimResult = {
    display_name: string;
    address: {
        house_number?: string;
        road?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
        country_code?: string;
        postcode?: string;
    };
};

function AddressAutocomplete({
    value,
    onAddressChange,
    onPlacePicked,
    inputClass,
}: {
    value: string;
    onAddressChange: (v: string) => void;
    onPlacePicked: (parts: { country: string; state: string; city: string; zip: string }) => void;
    inputClass: string;
}) {
    const [results, setResults] = useState<NominatimResult[]>([]);
    const [open, setOpen] = useState(false);
    const [fetching, setFetching] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleChange = (v: string) => {
        onAddressChange(v);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (v.length < 3) { setResults([]); setOpen(false); return; }
        timerRef.current = setTimeout(async () => {
            setFetching(true);
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v)}&format=json&addressdetails=1&limit=6`,
                    { headers: { 'Accept-Language': 'en' } },
                );
                const data: NominatimResult[] = await res.json();
                setResults(data);
                setOpen(data.length > 0);
            } catch {
                // silently ignore network errors
            } finally {
                setFetching(false);
            }
        }, 420);
    };

    const handlePick = (r: NominatimResult) => {
        const a = r.address;
        const countryCode = (a.country_code || '').toUpperCase();

        // Resolve ISO state code from the full state name Nominatim returns
        const stateName = a.state || '';
        const stateMatch = State.getStatesOfCountry(countryCode).find(
            s => s.name.toLowerCase() === stateName.toLowerCase(),
        );
        const stateCode = stateMatch?.isoCode || '';

        // Nominatim city name may differ from the country-state-city dataset.
        // Try exact match first, then substring in either direction so the
        // LocationCascade dropdown has a valid <option> value to select.
        const nominatimCity = a.city || a.town || a.village || a.municipality || '';
        let city = nominatimCity;
        if (countryCode && stateCode && nominatimCity) {
            const datasetCities = City.getCitiesOfState(countryCode, stateCode);
            const norm = (s: string) => s.toLowerCase();
            const exact = datasetCities.find(c => norm(c.name) === norm(nominatimCity));
            const partial = !exact && datasetCities.find(
                c => norm(c.name).includes(norm(nominatimCity)) || norm(nominatimCity).includes(norm(c.name)),
            );
            city = exact?.name ?? partial?.name ?? nominatimCity;
        }

        const zip = a.postcode || '';
        const street = [a.house_number, a.road].filter(Boolean).join(' ') || r.display_name;

        onAddressChange(street);
        onPlacePicked({ country: countryCode, state: stateCode, city, zip });
        setOpen(false);
        setResults([]);
    };

    return (
        <div className="relative">
            <div className="relative">
                <input
                    type="text"
                    autoComplete="off"
                    placeholder="Start typing a street address…"
                    value={value}
                    onChange={e => handleChange(e.target.value)}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 160)}
                    className={inputClass}
                />
                {fetching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
            {open && results.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto text-sm">
                    {results.map((r, i) => (
                        <li
                            key={i}
                            onMouseDown={() => handlePick(r)}
                            className="flex items-start gap-2.5 px-4 py-3 hover:bg-teal-50 cursor-pointer border-b border-gray-50 last:border-0"
                        >
                            <svg className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-gray-700 leading-snug">{r.display_name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function StepLoadProfile({
    data,
    onChange,
    facilities,
    activeFacilityIdx,
    onSwitchFacility,
    onAddFacility,
    onDeleteFacility,
}: {
    data: any;
    onChange: (f: string, v: string) => void;
    facilities: FacilityOnboardingData[];
    activeFacilityIdx: number;
    onSwitchFacility: (idx: number) => void;
    onAddFacility: () => void;
    onDeleteFacility: (idx: number) => void;
}) {
    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';
    const sectionHeading = 'text-base font-semibold text-gray-800 mb-4 mt-6 first:mt-0';

    const knownZones: string[] = ISO_ZONES[data.lp_iso_rto] ?? [];
    const isCustomZone = knownZones.length > 0 &&
        data.lp_availability_zone !== '' &&
        !knownZones.includes(data.lp_availability_zone);
    const [otherZoneMode, setOtherZoneMode] = useState(isCustomZone);

    return (
        <div className="px-12 py-8">
            <div className="mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Facility Profile</h1>
            </div>
            <p className="text-sm text-gray-500 mb-6">Tell us about your facility and its grid connection details.</p>

            {/* Facility tab bar */}
            <div className="flex items-center gap-2 mb-8 flex-wrap">
                {facilities.map((fac, idx) => (
                    <div
                        key={idx}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[1.5px] text-sm font-medium transition-all ${
                            idx === activeFacilityIdx
                                ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onSwitchFacility(idx)}
                            className="leading-none"
                        >
                            {fac.lp_facility_name || `Facility ${idx + 1}`}
                        </button>
                        {facilities.length > 1 && (
                            <button
                                type="button"
                                onClick={() => onDeleteFacility(idx)}
                                title="Remove facility"
                                className={`leading-none rounded-full w-3.5 h-3.5 flex items-center justify-center transition-colors ${
                                    idx === activeFacilityIdx
                                        ? 'text-teal-400 hover:text-red-500'
                                        : 'text-gray-300 hover:text-red-500'
                                }`}
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                ))}
                <button
                    type="button"
                    onClick={onAddFacility}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-medium bg-white border-[1.5px] border-dashed border-gray-300 text-gray-400 hover:border-teal-400 hover:text-teal-600 transition-all"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Facility
                </button>
            </div>

            <div className="space-y-0 max-w-4xl">
                {/* Core Information */}
                <h2 className={sectionHeading}>Core Information</h2>
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Facility Status*</label>
                        <div className="relative">
                            <select
                                className={selectClass}
                                value={data.lp_facility_status}
                                onChange={e => onChange('lp_facility_status', e.target.value)}
                            >
                                <option value="" disabled>Select status</option>
                                <option value="Brownfield">Brownfield (Operational)</option>
                                <option value="Greenfield">Greenfield (New / Planned)</option>
                            </select>
                            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Facility Name*</label>
                        <input
                            className={inputClass}
                            type="text"
                            placeholder="e.g. Ashburn-1"
                            value={data.lp_facility_name}
                            onChange={e => onChange('lp_facility_name', e.target.value)}
                        />
                    </div>
                </div>

                {/* Location Details */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-800 mb-2">Street Address*</label>
                    <AddressAutocomplete
                        value={data.lp_address}
                        onAddressChange={v => onChange('lp_address', v)}
                        onPlacePicked={({ country, state, city, zip }) => {
                            onChange('lp_country', country);
                            onChange('lp_state', state);
                            onChange('lp_city', city);
                            onChange('lp_zipcode', zip);
                        }}
                        inputClass={inputClass}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">Type to search — selecting a suggestion auto-fills Country, State, City and ZIP below.</p>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                    <LocationCascade
                        value={{
                            country: data.lp_country,
                            state: data.lp_state,
                            city: data.lp_city,
                            zip: data.lp_zipcode,
                        }}
                        onChange={patch => {
                            if (patch.country !== undefined) {
                                onChange('lp_country', patch.country);
                                onChange('lp_state', '');
                                onChange('lp_city', '');
                            }
                            if (patch.state !== undefined) {
                                onChange('lp_state', patch.state);
                                onChange('lp_city', '');
                            }
                            if (patch.city !== undefined) onChange('lp_city', patch.city);
                            if (patch.zip !== undefined) onChange('lp_zipcode', patch.zip);
                        }}
                        inputCls={inputClass}
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">ISO / RTO Region</label>
                        <div className="relative">
                            <select
                                className={selectClass}
                                value={data.lp_iso_rto}
                                onChange={e => {
                                    onChange('lp_iso_rto', e.target.value);
                                    onChange('lp_availability_zone', '');
                                    setOtherZoneMode(false);
                                }}
                            >
                                <option value="">Select…</option>
                                {ISO_RTO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">
                            Availability Zone
                            {!data.lp_iso_rto && <span className="text-gray-400 font-normal"> — select ISO/RTO first</span>}
                        </label>
                        {data.lp_iso_rto && ISO_ZONES[data.lp_iso_rto] ? (
                            <div className="space-y-2">
                                <div className="relative">
                                    <select
                                        className={selectClass}
                                        value={otherZoneMode ? '__other__' : data.lp_availability_zone}
                                        onChange={e => {
                                            if (e.target.value === '__other__') {
                                                setOtherZoneMode(true);
                                                onChange('lp_availability_zone', '');
                                            } else {
                                                setOtherZoneMode(false);
                                                onChange('lp_availability_zone', e.target.value);
                                            }
                                        }}
                                    >
                                        <option value="">Select zone…</option>
                                        {ISO_ZONES[data.lp_iso_rto].map(z => (
                                            <option key={z} value={z}>{z}</option>
                                        ))}
                                        <option value="__other__">Other</option>
                                    </select>
                                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                                {otherZoneMode && (
                                    <input
                                        className={inputClass}
                                        type="text"
                                        placeholder="Enter availability zone"
                                        value={data.lp_availability_zone}
                                        onChange={e => onChange('lp_availability_zone', e.target.value)}
                                        autoFocus
                                    />
                                )}
                            </div>
                        ) : (
                            <input
                                className={`${inputClass} bg-gray-50 cursor-not-allowed text-gray-400`}
                                type="text"
                                placeholder="Select an ISO / RTO first"
                                disabled
                                value=""
                            />
                        )}
                    </div>
                </div>

                {/* Grid & Technical Specifications */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Grid Connection Voltage (kV)</label>
                        <input
                            className={inputClass}
                            type="number"
                            step="0.1"
                            placeholder="e.g. 230"
                            value={data.lp_grid_voltage_kv}
                            onChange={e => onChange('lp_grid_voltage_kv', e.target.value)}
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <label className="text-sm font-medium text-gray-800">Settlement Node (POD) ID</label>
                            {(() => {
                                const portal = data.lp_iso_rto ? ISO_POD_PORTALS[data.lp_iso_rto] : null;
                                return portal ? (
                                    <div className="relative group">
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold cursor-default select-none">?</span>
                                        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-gray-900 text-white text-xs rounded-xl p-3.5 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity leading-relaxed">
                                            <p className="mb-2">{portal.hint}</p>
                                            <a
                                                href={portal.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200 font-medium underline underline-offset-2"
                                            >
                                                {portal.label}
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </a>
                                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-2.5 h-2.5 bg-gray-900 rotate-45 -mt-1.5" />
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                        <input
                            className={inputClass}
                            type="text"
                            placeholder={data.lp_iso_rto ? `e.g. ${data.lp_iso_rto === 'ERCOT' ? 'HB_NORTH' : data.lp_iso_rto === 'NYISO' ? 'CAPITL' : data.lp_iso_rto === 'CAISO' ? 'DLAP_SDGE-APND' : 'COMED_RTO'}` : 'e.g. Pnode-1234'}
                            value={data.lp_settlement_node_id}
                            onChange={e => onChange('lp_settlement_node_id', e.target.value)}
                        />
                        {!data.lp_iso_rto && (
                            <p className="text-xs text-gray-400 mt-1.5">Select an ISO / RTO above to see where to find your node ID.</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Contracted Grid Import Capacity (MW)</label>
                        <input
                            className={inputClass}
                            type="number"
                            step="0.1"
                            placeholder="e.g. 50.0"
                            value={data.lp_contracted_capacity_mw}
                            onChange={e => onChange('lp_contracted_capacity_mw', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Interconnection Agreement Expiry</label>
                        <input
                            className={inputClass}
                            type="date"
                            value={data.lp_interconnection_expiry}
                            onChange={e => onChange('lp_interconnection_expiry', e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 2 — IT Load & Capacity ─────────────────────────────────────────────

const IT_MEASUREMENT_POINTS = [
    'At IT Equipment (server PDUs)',
    'At PDU Input',
    'At UPS Output',
    'At Utility Meter',
];

const FORECAST_SCENARIOS = ['Base Case', 'Conservative', 'Aggressive', 'Custom'];

function UploadRow({
    label,
    fieldName,
    value,
    onChange,
    buttonLabel = 'Upload CSV',
    accept = '.csv',
}: {
    label: string;
    fieldName: string;
    value: string;
    onChange: (f: string, v: string) => void;
    buttonLabel?: string;
    accept?: string;
}) {
    return (
        <div className="flex items-center justify-between py-4">
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
                <label className="cursor-pointer">
                    <input
                        type="file"
                        accept={accept}
                        className="hidden"
                        onChange={e => onChange(fieldName, e.target.files?.[0]?.name || '')}
                    />
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {buttonLabel}
                    </span>
                </label>
                {value && <span className="text-xs text-teal-600 truncate max-w-[220px]">{value}</span>}
            </div>
        </div>
    );
}

function StepFacilityInformation({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">IT Load & Capacity</h1>
            </div>
            <p className="text-sm text-gray-500 mb-8">Upload your load data or enter manually below.</p>

            <div className="max-w-4xl space-y-8">
                {/* File Upload Section */}
                <div>
                    <h2 className="text-base font-semibold text-gray-800 mb-4">File Upload Section (CSV Uploads)</h2>
                    <div className="bg-white rounded-xl border border-gray-200 px-6 divide-y divide-gray-100">
                        <UploadRow
                            label="Planned IT Capacity Additions by Year (MW)"
                            fieldName="csv_planned_it_capacity"
                            value={data.csv_planned_it_capacity}
                            onChange={onChange}
                        />
                        <UploadRow
                            label="Utilisation Rate"
                            fieldName="csv_utilisation_rate"
                            value={data.csv_utilisation_rate}
                            onChange={onChange}
                        />
                        <UploadRow
                            label="Planned PUE Improvement by Year (e.g., 0.05 = 5%)"
                            fieldName="csv_planned_pue"
                            value={data.csv_planned_pue}
                            onChange={onChange}
                        />
                        <UploadRow
                            label="Planned On-site Renewables"
                            fieldName="csv_planned_renewables"
                            value={data.csv_planned_renewables}
                            onChange={onChange}
                        />
                        <UploadRow
                            label="Planned Battery Storage Additions by Year (MW)"
                            fieldName="csv_planned_battery"
                            value={data.csv_planned_battery}
                            onChange={onChange}
                        />
                        <UploadRow
                            label="Historical Interval Data"
                            fieldName="csv_historical_interval"
                            value={data.csv_historical_interval}
                            onChange={onChange}
                            buttonLabel="Choose File"
                        />
                        <UploadRow
                            label="PPUE Curve Upload (CSV)"
                            fieldName="csv_ppue_curve"
                            value={data.csv_ppue_curve}
                            onChange={onChange}
                            buttonLabel="Choose File"
                        />
                    </div>
                </div>

                {/* Manual Input Section */}
                <div>
                    <h2 className="text-base font-semibold text-gray-800 mb-1">Manual Input</h2>
                    <p className="text-sm text-gray-500 mb-6">Don't have the file? Input manually</p>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">
                                    Where is your primary IT power measurement taken?
                                </label>
                                <div className="relative">
                                    <select
                                        className={selectClass}
                                        value={data.it_measurement_point}
                                        onChange={e => onChange('it_measurement_point', e.target.value)}
                                    >
                                        <option value="" disabled>Select option</option>
                                        {IT_MEASUREMENT_POINTS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Installed IT Capacity (MW)</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 30.0"
                                    value={data.installed_it_capacity_mw} onChange={e => onChange('installed_it_capacity_mw', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Total IT Load*</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 24.5"
                                    value={data.total_it_load_mw} onChange={e => onChange('total_it_load_mw', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">UPS System Efficiency (%)</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 97.0"
                                    value={data.ups_efficiency_pct} onChange={e => onChange('ups_efficiency_pct', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Cooling System Power (MW)</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 6.2"
                                    value={data.cooling_system_power_mw} onChange={e => onChange('cooling_system_power_mw', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">PDU/Transformer Efficiency (%)</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 98.0"
                                    value={data.pdu_efficiency_pct} onChange={e => onChange('pdu_efficiency_pct', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Battery Storage Capacity (MW)</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 6.2"
                                    value={data.battery_storage_capacity_mw} onChange={e => onChange('battery_storage_capacity_mw', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Lighting / General Facility Load (MW)</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 1.5"
                                    value={data.lighting_facility_load_mw} onChange={e => onChange('lighting_facility_load_mw', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Forecast Scenario</label>
                                <div className="relative">
                                    <select
                                        className={selectClass}
                                        value={data.forecast_scenario}
                                        onChange={e => onChange('forecast_scenario', e.target.value)}
                                    >
                                        <option value="" disabled>Select option</option>
                                        {FORECAST_SCENARIOS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-2">Organic IT Load Growth</label>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 1.5"
                                    value={data.organic_it_load_growth} onChange={e => onChange('organic_it_load_growth', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 3 — Procurement Status ─────────────────────────────────────────────

function StepProcurementStatus({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';

    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    const isOther = data.electricity_contract_type === 'Other';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Procurement Status</h1>
            </div>
            <p className="text-sm text-gray-500 mb-8">Where are you in the process? We'll meet you where you are.</p>

            <div className="space-y-8 max-w-4xl">
                {/* Existing Utility/Retailer */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Existing Utility/Retailer*</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">Who is your current load serving entity?</p>
                        <input className={inputClass} type="text" placeholder="ex: Pacific Gas & Electric"
                            value={data.utility_retailer} onChange={e => onChange('utility_retailer', e.target.value)} />
                    </div>
                </div>

                {/* Electricity Contract Type */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Electricity Contract Type*</span>
                        </div>
                        <div className="relative">
                            <select className={selectClass} value={data.electricity_contract_type}
                                onChange={e => onChange('electricity_contract_type', e.target.value)}>
                                <option value="" disabled>Select option</option>
                                {ELECTRICITY_CONTRACT_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        {isOther && (
                            <input
                                className={`${inputClass} mt-3`}
                                type="text"
                                placeholder="Please describe your contract type…"
                                value={data.electricity_contract_other}
                                onChange={e => onChange('electricity_contract_other', e.target.value)}
                            />
                        )}
                    </div>
                </div>

                {/* Existing Renewables */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Existing Renewables (optional)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What % of the portfolio is renewables based?</p>
                        <input className={inputClass} type="text" placeholder=""
                            value={data.existing_renewables} onChange={e => onChange('existing_renewables', e.target.value)} />
                    </div>
                </div>

                {/* Existing Contracted Capacity */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Existing Contracted Capacity (MW, optional)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">How much capacity is already under contract?</p>
                        <input className={inputClass} type="text" placeholder="ex: 50MW"
                            value={data.contracted_capacity} onChange={e => onChange('contracted_capacity', e.target.value)} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Remaining Capacity to Contract (MW, optional)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">How much capacity still needs to be contracted?</p>
                        <input className={inputClass} type="text" placeholder="ex: 30MW"
                            value={data.remaining_capacity} onChange={e => onChange('remaining_capacity', e.target.value)} />
                    </div>
                </div>

                {/* Net Neutrality Target */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Net Neutrality Target (optional)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What share of your portfolio needs to be carbon-neutral?</p>
                        <input className={inputClass} type="text" placeholder="ex: 100% by 2030"
                            value={data.net_neutrality_target} onChange={e => onChange('net_neutrality_target', e.target.value)} />
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 5 — Sustainability Goals ───────────────────────────────────────────

function ToggleGroup({
    options,
    value,
    onChange,
}: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    className={`rounded-lg border px-4 py-2 text-sm transition-colors ${value === opt
                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    {opt}
                </button>
            ))}
        </div>
    );
}

function StepSustainabilityGoals({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';

    const isNetZeroGoal = data.primary_goal === 'Carbon Neutrality / Net Zero' || data.primary_goal === 'RE100 Commitment';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Sustainability Goals</h1>
            </div>
            <p className="text-sm text-gray-500 mb-8">What does a win look like for your organization?</p>

            <div className="space-y-8 max-w-4xl">
                {/* Primary Goal */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Primary Goal</span>
                        </div>
                        <div className="relative">
                            <select className={selectClass} value={data.primary_goal} onChange={e => onChange('primary_goal', e.target.value)}>
                                <option value="" disabled>Select option</option>
                                {PRIMARY_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Follow-up: net zero year */}
                {isNetZeroGoal && (
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <InfoIcon />
                                <span className="text-sm font-medium text-gray-800">By what year do you need to be net neutral?</span>
                            </div>
                            <input
                                className={inputClass}
                                type="text"
                                placeholder="ex: 2030"
                                value={data.net_zero_year}
                                onChange={e => onChange('net_zero_year', e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {/* Sustainability Targets */}
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <InfoIcon />
                        <span className="text-sm font-medium text-gray-800">Sustainability Targets (optional)</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Do you have a public RE100 or Net Zero commitment year?</p>
                    <ToggleGroup options={['Yes', 'No']} value={data.sustainability_targets} onChange={v => onChange('sustainability_targets', v)} />
                </div>

                {/* Carbon Matching Preference */}
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <InfoIcon />
                        <span className="text-sm font-medium text-gray-800">Carbon Matching Preference*</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">How does your renewable energy match your consumption?</p>
                    <ToggleGroup
                        options={['Annual Matching', 'Monthly Matching', 'Hourly / 24-7 CFE']}
                        value={data.carbon_match_pref}
                        onChange={v => onChange('carbon_match_pref', v)}
                    />
                </div>

                {/* Additionality */}
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <InfoIcon />
                        <span className="text-sm font-medium text-gray-800">Additionality Requirement (optional)</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Do you require "new to grid" projects or are you open to existing assets?</p>
                    <ToggleGroup
                        options={['New-Build Projects Only', 'Operating Assets Accepted', 'No Preference']}
                        value={data.additionality_req}
                        onChange={v => onChange('additionality_req', v)}
                    />
                </div>
            </div>
        </div>
    );
}


// ─── Step 5 — KPI's & Targets ────────────────────────────────────────────────

const POWER_COST_BUDGET_OPTIONS = [
    '< $30 / MWh',
    '$30 – $50 / MWh',
    '$50 – $75 / MWh',
    '$75 – $100 / MWh',
    '> $100 / MWh',
];

function StepKPIsTargets({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">KPI's & Targets</h1>
            </div>
            <p className="text-sm text-gray-500 mb-8">Define your performance benchmarks and cost constraints.</p>

            <div className="max-w-4xl space-y-8">
                <div>
                    <h2 className="text-base font-semibold text-gray-800 mb-6">Budget & Targets</h2>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <InfoIcon />
                                    <span className="text-sm font-medium text-gray-800">Power Cost Budget ($/MWh)</span>
                                </div>
                                <div className="relative">
                                    <select
                                        className={selectClass}
                                        value={data.power_cost_budget}
                                        onChange={e => onChange('power_cost_budget', e.target.value)}
                                    >
                                        <option value="" disabled>Select range</option>
                                        {POWER_COST_BUDGET_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <InfoIcon />
                                    <span className="text-sm font-medium text-gray-800">Carbon Intensity Target (%)</span>
                                </div>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 30.0"
                                    value={data.carbon_intensity_target} onChange={e => onChange('carbon_intensity_target', e.target.value)} />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <InfoIcon />
                                    <span className="text-sm font-medium text-gray-800">Renewable Energy Target (%)</span>
                                </div>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 24.5"
                                    value={data.renewable_energy_target} onChange={e => onChange('renewable_energy_target', e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <InfoIcon />
                                    <span className="text-sm font-medium text-gray-800">Maximum Price Risk Tolerance (%)</span>
                                </div>
                                <input className={inputClass} type="number" step="0.1" placeholder="e.g. 97.0"
                                    value={data.max_price_risk_tolerance} onChange={e => onChange('max_price_risk_tolerance', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 6 — 3rd-Party Market ───────────────────────────────────────────────

function StepThirdPartyMarket({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">3rd-Party Market</h1>
            </div>
            <p className="text-sm text-gray-500 mb-8">Upload external market and site data files to power your analysis.</p>

            <div className="max-w-4xl">
                <h2 className="text-base font-semibold text-gray-800 mb-4">File Uploads (CSV/PDF)</h2>
                <div className="bg-white rounded-xl border border-gray-200 px-6 divide-y divide-gray-100">
                    <UploadRow
                        label="Day-ahead Power Price - Nodal (CSV)"
                        fieldName="csv_day_ahead_power_price"
                        value={data.csv_day_ahead_power_price}
                        onChange={onChange}
                        buttonLabel="Choose File"
                    />
                    <UploadRow
                        label="Forward Price Power Curve (CSV)"
                        fieldName="csv_forward_price_curve"
                        value={data.csv_forward_price_curve}
                        onChange={onChange}
                        buttonLabel="Choose File"
                    />
                    <UploadRow
                        label="LMP History - 3 Years (CSV)"
                        fieldName="csv_lmp_history"
                        value={data.csv_lmp_history}
                        onChange={onChange}
                        buttonLabel="Choose File"
                    />
                    <UploadRow
                        label="Utility Tariff Schedule (CSV/PDF)"
                        fieldName="csv_utility_tariff"
                        value={data.csv_utility_tariff}
                        onChange={onChange}
                        buttonLabel="Choose File"
                        accept=".csv,.pdf"
                    />
                    <UploadRow
                        label="Hourly Temperature at Site (CSV)"
                        fieldName="csv_hourly_temperature"
                        value={data.csv_hourly_temperature}
                        onChange={onChange}
                        buttonLabel="Choose File"
                    />
                    <UploadRow
                        label="Renewable Generation Profile (CSV)"
                        fieldName="csv_renewable_gen_profile"
                        value={data.csv_renewable_gen_profile}
                        onChange={onChange}
                        buttonLabel="Choose File"
                    />
                </div>
            </div>
        </div>
    );
}


// ─── Step 7 — Review ─────────────────────────────────────────────────────────

function EditIcon() {
    return (
        <svg className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    );
}

function ReviewField({ label, value, optional = false }: { label: string; value: string; optional?: boolean }) {
    return (
        <div>
            <p className="text-xs text-gray-500 mb-0.5">
                {label}
                {optional && <span className="text-gray-400"> (optional)</span>}
            </p>
            <p className={`text-sm font-semibold ${value ? 'text-gray-900' : 'text-gray-400'}`}>
                {value || '—'}
            </p>
        </div>
    );
}

function ReviewSection({ title, onEdit, children }: {
    title: string;
    onEdit?: () => void;
    children: ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-gray-900">{title}</h2>
                <button onClick={onEdit}><EditIcon /></button>
            </div>
            <hr className="border-gray-200 mb-4" />
            {children}
        </div>
    );
}

function StepReview({ data, facilityProfiles, onGoToStep }: { data: any; facilityProfiles: FacilityOnboardingData[]; onGoToStep: (s: number) => void }) {

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Review Your Information</h1>
            </div>
            <p className="text-sm text-gray-500 mb-8">Review your answers before we create your personalized dashboard.</p>

            <div className="max-w-4xl space-y-8">
                {/* Facility Profiles */}
                <ReviewSection title="Facility Profiles" onEdit={() => onGoToStep(1)}>
                    <div className="space-y-6">
                        {facilityProfiles.map((fp, i) => (
                            <div key={i} className={facilityProfiles.length > 1 ? 'pb-5 border-b border-gray-100 last:border-0 last:pb-0' : ''}>
                                {facilityProfiles.length > 1 && (
                                    <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-3">
                                        Facility {i + 1}{fp.lp_facility_name ? ` — ${fp.lp_facility_name}` : ''}
                                    </p>
                                )}
                                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                                    <ReviewField label="Facility Name" value={fp.lp_facility_name} />
                                    <ReviewField label="Status" value={fp.lp_facility_status} />
                                    <ReviewField label="Address" value={fp.lp_address} optional />
                                    <ReviewField label="City" value={fp.lp_city} optional />
                                    <ReviewField label="State / Province" value={fp.lp_state} optional />
                                    <ReviewField label="Country" value={fp.lp_country} optional />
                                    <ReviewField label="ZIP / Postal Code" value={fp.lp_zipcode} optional />
                                    <ReviewField label="ISO / RTO Region" value={fp.lp_iso_rto} optional />
                                    <ReviewField label="Availability Zone" value={fp.lp_availability_zone} optional />
                                    <ReviewField label="Grid Voltage (kV)" value={fp.lp_grid_voltage_kv} optional />
                                    <ReviewField label="Settlement Node (POD) ID" value={fp.lp_settlement_node_id} optional />
                                    <ReviewField label="Contracted Capacity (MW)" value={fp.lp_contracted_capacity_mw} optional />
                                    <ReviewField label="Interconnection Expiry" value={fp.lp_interconnection_expiry} optional />
                                </div>
                            </div>
                        ))}
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* IT Load & Capacity */}
                <ReviewSection title="IT Load & Capacity" onEdit={() => onGoToStep(2)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="IT Power Measurement Point" value={data.it_measurement_point} />
                        <ReviewField label="Installed IT Capacity (MW)" value={data.installed_it_capacity_mw} />
                        <ReviewField label="Total IT Load*" value={data.total_it_load_mw} />
                        <ReviewField label="UPS System Efficiency (%)" value={data.ups_efficiency_pct} />
                        <ReviewField label="Cooling System Power (MW)" value={data.cooling_system_power_mw} />
                        <ReviewField label="PDU/Transformer Efficiency (%)" value={data.pdu_efficiency_pct} />
                        <ReviewField label="Battery Storage Capacity (MW)" value={data.battery_storage_capacity_mw} />
                        <ReviewField label="Lighting / General Facility Load (MW)" value={data.lighting_facility_load_mw} />
                        <ReviewField label="Forecast Scenario" value={data.forecast_scenario} />
                        <ReviewField label="Organic IT Load Growth" value={data.organic_it_load_growth} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* Procurement Status */}
                <ReviewSection title="Procurement Status" onEdit={() => onGoToStep(3)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Existing Utility/Retailer*" value={data.utility_retailer} />
                        <ReviewField label="Electricity Contract Type*" value={
                            data.electricity_contract_type === 'Other' && data.electricity_contract_other
                                ? `Other: ${data.electricity_contract_other}`
                                : data.electricity_contract_type
                        } />
                        <ReviewField label="Existing Renewables" optional value={data.existing_renewables} />
                        <ReviewField label="Existing Contracted Capacity (MW)" optional value={data.contracted_capacity} />
                        <ReviewField label="Remaining Capacity to Contract (MW)" optional value={data.remaining_capacity} />
                        <ReviewField label="Net Neutrality Target" optional value={data.net_neutrality_target} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* Sustainability Goals */}
                <ReviewSection title="Sustainability Goals" onEdit={() => onGoToStep(4)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Primary Goal*" value={data.primary_goal} />
                        {data.net_zero_year && (
                            <ReviewField label="Net Zero Target Year" value={data.net_zero_year} />
                        )}
                        <ReviewField label="Sustainability Targets" optional value={data.sustainability_targets} />
                        <ReviewField label="Carbon Matching Preference*" value={data.carbon_match_pref} />
                        <ReviewField label="Additionality Requirement" optional value={data.additionality_req} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* KPI's & Targets */}
                <ReviewSection title="KPI's & Targets" onEdit={() => onGoToStep(5)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Power Cost Budget ($/MWh)" value={data.power_cost_budget} />
                        <ReviewField label="Carbon Intensity Target (%)" value={data.carbon_intensity_target} />
                        <ReviewField label="Renewable Energy Target (%)" value={data.renewable_energy_target} />
                        <ReviewField label="Maximum Price Risk Tolerance (%)" value={data.max_price_risk_tolerance} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* 3rd-Party Market */}
                <ReviewSection title="3rd-Party Market" onEdit={() => onGoToStep(6)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Day-ahead Power Price - Nodal" value={data.csv_day_ahead_power_price} />
                        <ReviewField label="Forward Price Power Curve" value={data.csv_forward_price_curve} />
                        <ReviewField label="LMP History - 3 Years" value={data.csv_lmp_history} />
                        <ReviewField label="Utility Tariff Schedule" value={data.csv_utility_tariff} />
                        <ReviewField label="Hourly Temperature at Site" value={data.csv_hourly_temperature} />
                        <ReviewField label="Renewable Generation Profile" value={data.csv_renewable_gen_profile} />
                    </div>
                </ReviewSection>
            </div>
        </div>
    );
}


// ─── Root Onboarding shell ────────────────────────────────────────────────────

const LP_FIELDS = new Set<string>([
    'lp_facility_status', 'lp_facility_name', 'lp_address', 'lp_country',
    'lp_state', 'lp_city', 'lp_zipcode', 'lp_availability_zone', 'lp_iso_rto',
    'lp_grid_voltage_kv', 'lp_settlement_node_id', 'lp_contracted_capacity_mw',
    'lp_interconnection_expiry',
]);

export default function Onboarding() {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [justRegistered, setJustRegistered] = useState(false);
    const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
    const [facilityProfiles, setFacilityProfiles] = useState<FacilityOnboardingData[]>([{ ...EMPTY_FACILITY }]);
    const [activeFacilityIdx, setActiveFacilityIdx] = useState(0);
    const hasRestoredRef = useRef(false);
    const navigate = useNavigate();
    const { user, signIn, signUp, signOut, loading: authLoading } = useAuth();

    const [accountData, setAccountData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        title: '',
        password: '',
        confirmPassword: '',
    });

    const [formData, setFormData] = useState({
        // Facility Profile (step 1)
        lp_facility_status: '',
        lp_facility_name: '',
        lp_address: '',
        lp_country: '',
        lp_state: '',
        lp_city: '',
        lp_zipcode: '',
        lp_availability_zone: '',
        lp_iso_rto: '',
        lp_grid_voltage_kv: '',
        lp_settlement_node_id: '',
        lp_contracted_capacity_mw: '',
        lp_interconnection_expiry: '',
        csv_planned_it_capacity: '',
        csv_utilisation_rate: '',
        csv_planned_pue: '',
        csv_planned_renewables: '',
        csv_planned_battery: '',
        csv_historical_interval: '',
        csv_ppue_curve: '',
        it_measurement_point: '',
        installed_it_capacity_mw: '',
        total_it_load_mw: '',
        ups_efficiency_pct: '',
        cooling_system_power_mw: '',
        pdu_efficiency_pct: '',
        battery_storage_capacity_mw: '',
        lighting_facility_load_mw: '',
        forecast_scenario: '',
        organic_it_load_growth: '',
        utility_retailer: '',
        electricity_contract_type: '',
        electricity_contract_other: '',
        existing_renewables: '',
        contracted_capacity: '',
        remaining_capacity: '',
        net_neutrality_target: '',
        primary_goal: '',
        net_zero_year: '',
        sustainability_targets: '',
        carbon_match_pref: '',
        additionality_req: '',
        power_cost_budget: '',
        carbon_intensity_target: '',
        renewable_energy_target: '',
        max_price_risk_tolerance: '',
        csv_day_ahead_power_price: '',
        csv_forward_price_curve: '',
        csv_lmp_history: '',
        csv_utility_tariff: '',
        csv_hourly_temperature: '',
        csv_renewable_gen_profile: '',
    });

    // Restore saved progress when a returning user lands on this page (runs once)
    useEffect(() => {
        if (authLoading) return;
        if (hasRestoredRef.current) return;

        // Not logged in — stay on step 0 (Create Account)
        if (!user) {
            setRestoring(false);
            return;
        }

        hasRestoredRef.current = true;

        // After a fresh signup, accountData already holds what the user typed.
        // Skip the DB-derived population so those values aren't overwritten.
        if (justRegistered) {
            setRestoring(false);
            return;
        }

        // Populate Step 0 from the DB users table record for returning users.
        // contact_person stores the full name (e.g. "Jane Smith"); split on first space.
        const fullName = (user as any).contact_person || '';
        const spaceIdx = fullName.indexOf(' ');
        const derivedFirstName = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx);
        const derivedLastName = spaceIdx === -1 ? '' : fullName.slice(spaceIdx + 1);
        setAccountData({
            firstName: derivedFirstName,
            lastName: derivedLastName,
            email: user.email || '',
            title: (user as any).title || '',
            password: '••••••••',
            confirmPassword: '••••••••',
        });

        const restore = async () => {
            // Try database first (authoritative source across devices/browsers)
            try {
                const response = await fetch(`/api/onboarding/progress/${user.id}`);
                if (response.ok) {
                    const { data } = await response.json();
                    if (data && Object.keys(data).length > 0) {
                        const { id: _id, updated_at: _u, completed: _c, facility_profiles: rawProfiles, ...fields } = data;

                        // Restore facility profiles array from DB (stored as JSONB)
                        let parsedProfiles: FacilityOnboardingData[] | null = null;
                        if (rawProfiles) {
                            try {
                                const arr = typeof rawProfiles === 'string' ? JSON.parse(rawProfiles) : rawProfiles;
                                if (Array.isArray(arr) && arr.length > 0) {
                                    parsedProfiles = arr as FacilityOnboardingData[];
                                }
                            } catch { /* ignore parse errors */ }
                        }

                        if (parsedProfiles) {
                            setFacilityProfiles(parsedProfiles);
                            // Sync the first (active) facility's lp_ fields into formData so
                            // Section A (Facility Identity & Grid Connection) renders pre-filled
                            setFormData(prev => ({ ...prev, ...fields, ...parsedProfiles![0] }));
                        } else {
                            setFormData(prev => ({ ...prev, ...fields }));
                        }

                        setStep(inferStep(fields));
                        setRestoring(false);
                        return;
                    }
                }
            } catch {
                // network error — fall through to localStorage
            }

            // Fall back to localStorage
            const storageKey = `onboarding_progress_${user.id}`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const { step: savedStep, formData: savedForm, facilityProfiles: savedFacilities } = JSON.parse(saved);
                    if (savedForm) setFormData(prev => ({ ...prev, ...savedForm }));
                    if (savedFacilities && Array.isArray(savedFacilities) && savedFacilities.length > 0) {
                        setFacilityProfiles(savedFacilities);
                    }
                    if (savedStep && savedStep > 0) setStep(savedStep);
                } catch {
                    setStep(1);
                }
            } else {
                setStep(1);
            }
            setRestoring(false);
        };

        restore();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user, justRegistered]);

    // Auto-save to localStorage whenever step or form data changes
    useEffect(() => {
        const finalUserId = user?.id || registeredUserId;
        if (!finalUserId || step === 0) return;

        localStorage.setItem(
            `onboarding_progress_${finalUserId}`,
            JSON.stringify({ step, formData, facilityProfiles })
        );
    }, [step, formData, facilityProfiles, user, registeredUserId]);

    const updateAccountField = (field: string, value: string) => {
        setAccountData(prev => ({ ...prev, [field]: value }));
    };

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (LP_FIELDS.has(field)) {
            setFacilityProfiles(prev => {
                const next = [...prev];
                next[activeFacilityIdx] = { ...next[activeFacilityIdx], [field]: value } as FacilityOnboardingData;
                return next;
            });
        }
    };

    const switchFacility = (idx: number) => {
        setActiveFacilityIdx(idx);
        const fac = facilityProfiles[idx];
        setFormData(prev => ({ ...prev, ...fac }));
    };

    const addFacility = () => {
        const newFac = { ...EMPTY_FACILITY };
        setFacilityProfiles(prev => [...prev, newFac]);
        const newIdx = facilityProfiles.length;
        setActiveFacilityIdx(newIdx);
        setFormData(prev => ({ ...prev, ...EMPTY_FACILITY }));
    };

    const deleteFacility = (idx: number) => {
        if (facilityProfiles.length <= 1) return;
        const next = facilityProfiles.filter((_, i) => i !== idx);
        setFacilityProfiles(next);
        const newActive = idx >= next.length ? next.length - 1 : idx;
        setActiveFacilityIdx(newActive);
        setFormData(prev => ({ ...prev, ...next[newActive] }));
    };

    const goNext = async () => {
        setError(null);
        if (step === 0) {
            if (user) {
                setStep(1);
                return;
            }
            if (!accountData.firstName || !accountData.lastName || !accountData.email || !accountData.title || !accountData.password || !accountData.confirmPassword) {
                setError('Please fill in all required fields.');
                return;
            }
            if (accountData.password.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
            }
            if (accountData.password !== accountData.confirmPassword) {
                setError('Passwords do not match.');
                return;
            }

            setLoading(true);
            try {
                const { userId } = await signUp(accountData.email, accountData.password, {
                    firstName: accountData.firstName,
                    lastName: accountData.lastName,
                    role: 'buyer',
                    title: accountData.title,
                });
                setRegisteredUserId(userId);
                // Auto-login so sidebar buttons are enabled and properly highlighted
                try {
                    await signIn(accountData.email, accountData.password);
                } catch {
                    // Non-fatal — user can proceed as guest through onboarding
                }
                setJustRegistered(true);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (
                    errMsg.includes('unexpected_failure') ||
                    errMsg.includes('Database error') ||
                    errMsg.includes('already exists') ||
                    errMsg.includes('already registered')
                ) {
                    setError('A user with this email already exists.');
                } else {
                    setError(errMsg || 'Registration failed.');
                }
            } finally {
                setLoading(false);
            }
        } else {
            const nextStep = Math.min(step + 1, STEPS.length - 1);
            setStep(nextStep);

            // Auto-save progress to backend so it survives across devices/browsers
            const finalUserId = user?.id || registeredUserId;
            if (finalUserId) {
                const NUMERIC_FIELDS = new Set([
                    'battery_storage_capacity_mw', 'cooling_system_power_mw',
                    'installed_it_capacity_mw', 'lighting_facility_load_mw',
                    'total_it_load_mw', 'ups_efficiency_pct', 'pdu_efficiency_pct',
                    'organic_it_load_growth', 'carbon_intensity_target',
                    'renewable_energy_target', 'max_price_risk_tolerance',
                    'lp_grid_voltage_kv', 'lp_contracted_capacity_mw',
                    'contracted_capacity', 'remaining_capacity', 'existing_renewables',
                ]);
                const sanitized = Object.fromEntries(
                    Object.entries(formData).map(([k, v]) => [
                        k,
                        NUMERIC_FIELDS.has(k) && v === '' ? null : v,
                    ])
                );
                fetch('/api/onboarding/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: finalUserId, ...sanitized, facility_profiles: facilityProfiles }),
                }).catch(() => { /* best-effort, ignore errors */ });
            }
        }
    };

    const handleSubmit = async () => {
        const finalUserId = user?.id || registeredUserId;
        if (!finalUserId) {
            setError('User session not found. Please log in.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            // Numeric columns in Postgres reject empty strings — coerce them to null.
            const NUMERIC_FIELDS = new Set([
                'battery_storage_capacity_mw', 'cooling_system_power_mw',
                'installed_it_capacity_mw', 'lighting_facility_load_mw',
                'total_it_load_mw', 'ups_efficiency_pct', 'pdu_efficiency_pct',
                'organic_it_load_growth', 'carbon_intensity_target',
                'renewable_energy_target', 'max_price_risk_tolerance',
                'lp_grid_voltage_kv', 'lp_contracted_capacity_mw',
                'contracted_capacity', 'remaining_capacity', 'existing_renewables',
            ]);
            const sanitized = Object.fromEntries(
                Object.entries(formData).map(([k, v]) => [
                    k,
                    NUMERIC_FIELDS.has(k) && v === '' ? null : v,
                ])
            );

            const response = await fetch('/api/onboarding/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: finalUserId,
                    completed: true,
                    ...sanitized,
                    facility_profiles: facilityProfiles,
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to submit');

            // Insert each facility profile into the `facilities` table so the
            // Profile page sidebar and datacenterProfiles can link data centers to them.
            const API_URL = import.meta.env.VITE_API_URL || '/api';
            await Promise.allSettled(
                facilityProfiles
                    .filter(fp => fp.lp_facility_name?.trim())
                    .map(fp =>
                        fetch(`${API_URL}/facilities`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                buyer_id: finalUserId,
                                name: fp.lp_facility_name.trim(),
                                country: fp.lp_country || null,
                                state: fp.lp_state || null,
                                city: fp.lp_city || null,
                                zip_code: fp.lp_zipcode || null,
                                iso_rto: fp.lp_iso_rto || null,
                                utility: null,
                                grid_voltage_kv: fp.lp_grid_voltage_kv ? Number(fp.lp_grid_voltage_kv) : null,
                                settlement_node_id: fp.lp_settlement_node_id || null,
                                contracted_capacity_mw: fp.lp_contracted_capacity_mw ? Number(fp.lp_contracted_capacity_mw) : null,
                                interconnection_expiry: fp.lp_interconnection_expiry || null,
                            }),
                        })
                    )
            );

            const finalUserIdForCleanup = user?.id || registeredUserId;
            if (finalUserIdForCleanup) {
                localStorage.removeItem(`onboarding_progress_${finalUserIdForCleanup}`);
            }
            setShowSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Submission failed.');
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => setStep(s => Math.max(s - 1, 0));

    // Show a loading screen while auth resolves and progress is being fetched
    // to prevent the step-0 flash for returning users
    if (authLoading || restoring) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Loading your progress…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-[256px] flex-shrink-0 flex flex-col font-['Manrope']" style={{ background: 'rgba(13, 6, 48, 0.78)' }}>
                    <div
                        onClick={async () => { await signOut(); navigate('/login'); }}
                        className="h-[118px] flex items-center px-10 gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <img src="/favicon.png" alt="Power Dime" className="w-9 h-9 flex-shrink-0" />
                        <span className="text-white font-extrabold text-2xl tracking-tight whitespace-nowrap">Power Dime</span>
                    </div>
                    <nav className="flex-1 py-0 overflow-y-auto">
                        {STEPS.map((label, i) => (
                            <button
                                key={label}
                                onClick={() => setStep(i)}
                                disabled={loading || (i > 0 && !user)}
                                className={`w-full text-left h-[65px] px-10 text-base transition-all ${i === step
                                    ? 'bg-white text-black font-semibold'
                                    : 'text-white font-medium hover:bg-white/5'
                                    } ${(loading || (i > 0 && !user)) && i !== step ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* Main panel */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50">
                    {/* Progress dots */}
                    <div className="bg-white border-b border-gray-200 px-10 pt-6 pb-5 flex-shrink-0">
                        <div className="flex items-center">
                            {STEPS.map((_, i) => (
                                <div key={i} className="flex items-center flex-1 last:flex-none">
                                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${i <= step ? 'bg-teal-500 border-teal-500' : 'bg-white border-gray-300'}`} />
                                    {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 transition-colors ${i < step ? 'bg-teal-500' : 'bg-gray-300'}`} />}
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="px-10 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                            <span className="text-sm text-red-600 font-medium">{error}</span>
                            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto">
                        {step === 0 && <StepCreateAccount data={accountData} onChange={updateAccountField} disabled={!!user || justRegistered} />}
                        {step === 1 && <StepLoadProfile data={formData} onChange={updateField} facilities={facilityProfiles} activeFacilityIdx={activeFacilityIdx} onSwitchFacility={switchFacility} onAddFacility={addFacility} onDeleteFacility={deleteFacility} />}
                        {step === 2 && <StepFacilityInformation data={formData} onChange={updateField} />}
                        {step === 3 && <StepProcurementStatus data={formData} onChange={updateField} />}
                        {step === 4 && <StepSustainabilityGoals data={formData} onChange={updateField} />}
                        {step === 5 && <StepKPIsTargets data={formData} onChange={updateField} />}
                        {step === 6 && <StepThirdPartyMarket data={formData} onChange={updateField} />}
                        {step === 7 && <StepReview data={formData} facilityProfiles={facilityProfiles} onGoToStep={setStep} />}
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="h-[86px] flex-shrink-0 px-10 flex items-center justify-end" style={{ background: '#0D0630' }}>
                <div className="flex items-center gap-3">
                    {step > 0 && (
                        <button
                            onClick={goBack}
                            disabled={loading}
                            className="h-[34px] px-6 bg-transparent border border-white/30 hover:border-white/60 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Back
                        </button>
                    )}
                    {step === 0 && !justRegistered && (
                        <button
                            onClick={goNext}
                            disabled={loading || !!user}
                            className="h-[34px] px-6 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {loading ? 'Signing up…' : 'Sign Up'}
                        </button>
                    )}
                    {step === 0 && justRegistered && (
                        <button
                            onClick={() => { setJustRegistered(false); setStep(1); }}
                            className="h-[34px] px-6 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                            Continue →
                        </button>
                    )}
                    {step > 0 && step < 7 && (
                        <button
                            onClick={goNext}
                            disabled={loading}
                            className="h-[34px] px-6 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {loading ? 'Saving…' : 'Next →'}
                        </button>
                    )}
                    {step === 7 && (
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="h-[34px] px-6 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {loading ? 'Submitting…' : 'Submit'}
                        </button>
                    )}
                </div>
            </div>

            {/* Success Dialog */}
            {showSuccess && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center border border-slate-100">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-6">
                            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Onboarding Successful!</h3>
                        <p className="text-slate-600 mb-8 leading-relaxed">
                            Your details have been saved. Please verify your email address to log in and access your dashboard.
                        </p>
                        <button
                            onClick={() => window.location.href = '/login'}
                            className="w-full rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                        >
                            Return to Login
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
