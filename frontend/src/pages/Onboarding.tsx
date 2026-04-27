import { useState, useRef } from 'react';
import type { ReactNode, Dispatch, SetStateAction, ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { uploadBuyerDocument } from '../services/api';
import type { FacilityType, BuyerDocumentCategory } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = [
    'Create Account',
    'Upload Documents',
    'Facility Information',
    'Energy Load',
    'Procurement Status',
    'Strategic Goals',
    'PPA Preferences',
    'Review',
];

const ROLES = [
    { label: 'Energy Buyer', value: 'buyer' },
    { label: 'Energy Seller', value: 'seller' },
    { label: 'Facility Manager', value: 'buyer' },
    { label: 'CFO / Finance', value: 'buyer' },
    { label: 'Operations', value: 'buyer' },
    { label: 'Other', value: 'buyer' },
];

type Doc = {
    id: string;
    name: string;
    type: string;
    facility: string;
    checked: boolean;
    file?: File;
};

const INITIAL_DOCS: Doc[] = [
];

// ─── Small shared components ──────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
    );
}

// ─── Step 0 — Create Account ("Who you are") ──────────────────────────────────

function StepCreateAccount({
    data,
    onChange
}: {
    data: any;
    onChange: (field: string, value: string) => void
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
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">We need a few details about you.</p>

            <div className="space-y-6 max-w-4xl">
                {/* First + Last */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">First Name*</label>
                        <input className={input} type="text" placeholder="Jane"
                            value={data.firstName} onChange={e => onChange('firstName', e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Last Name*</label>
                        <input className={input} type="text" placeholder="Smith"
                            value={data.lastName} onChange={e => onChange('lastName', e.target.value)} />
                    </div>
                </div>

                {/* Email + Role */}
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Work Email*</label>
                        <input className={input} type="email" placeholder="janesmith@powerDime.net"
                            value={data.email} onChange={e => onChange('email', e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Role*</label>
                        <div className="relative">
                            <select className={`${input} appearance-none pr-10`}
                                value={data.role} onChange={e => onChange('role', e.target.value)}>
                                <option value="" disabled>Select Your Role</option>
                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Password + Confirm Password */}
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

                {/* Password rules */}
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
            </div>
        </div>
    );
}


// ─── Step 2 — Facility Information ───────────────────────────────────────────

const DATA_CENTER_TYPES = ['Hyperscale', 'Colocation', 'Edge', 'Enterprise', 'Wholesale'];
const OPERATIONAL_STATUSES = ['Operational', 'Under Construction', 'Planned', 'Decommissioning'];
const SITE_COUNTS = ['1', '2–5', '6–10', '11–20', '20+'];
const LOCATIONS = ['US East', 'US West', 'US Central', 'Europe', 'Asia Pacific', 'Latin America'];

function InfoIcon() {
    return (
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}

function StepFacilityInformation({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';

    function Select({
        value, onSelect, options,
    }: { value: string; onSelect: (v: string) => void; options: string[] }) {
        return (
            <div className="relative">
                <select className={selectClass} value={value} onChange={e => onSelect(e.target.value)}>
                    <option value="" disabled>Select option</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        );
    }

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Facility Profile</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Tell us about the physical space we're finding power for.</p>

            <div className="space-y-7 max-w-4xl">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Data Center Type*</label>
                        <Select value={data.dc_type} onSelect={v => onChange('dc_type', v)} options={DATA_CENTER_TYPES} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Operational Status*</label>
                        <Select value={data.operational_status} onSelect={v => onChange('operational_status', v)} options={OPERATIONAL_STATUSES} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">
                            Number of Sites <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <Select value={data.num_sites} onSelect={v => onChange('num_sites', v)} options={SITE_COUNTS} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-2">Locations of Interest*</label>
                        <Select value={data.locations} onSelect={v => onChange('locations', v)} options={LOCATIONS} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Approx Total Rated IT Capacity Per Site*</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What is the design capacity of the facility?</p>
                        <input className={inputClass} type="text" placeholder="input a value"
                            value={data.it_capacity} onChange={e => onChange('it_capacity', e.target.value)} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Current Utilization (%)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What percentage of that capacity is currently live?</p>
                        <input className={inputClass} type="text" placeholder="input a value"
                            value={data.utilization} onChange={e => onChange('utilization', e.target.value)} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Power Usage Effectiveness (PUE)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What is your target or average annual PUE?</p>
                        <input className={inputClass} type="text" placeholder="input a value"
                            value={data.pue} onChange={e => onChange('pue', e.target.value)} />
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 3 — Energy Load ─────────────────────────────────────────────────────

function StepEnergyLoad({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Energy Load</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Help us understand how much power you need and when you need it.</p>

            <div className="space-y-8 max-w-4xl">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Annual Electricity Consumption (MWh)*</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">Total energy used in the last 12 months (if operational)</p>
                        <input className={inputClass} type="text" placeholder="input a value"
                            value={data.annual_mwh} onChange={e => onChange('annual_mwh', e.target.value)} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">AI/HPC Exposure*</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What percentage of your load is dedicated to High-Performance Computing or AI training?</p>
                        <input className={inputClass} type="text" placeholder="input a value"
                            value={data.ai_hpc_exposure} onChange={e => onChange('ai_hpc_exposure', e.target.value)} />
                    </div>
                </div>

                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <InfoIcon />
                        <span className="text-sm font-medium text-gray-800">Expansion Roadmap (optional)</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-4">Estimated MW growth over the next years.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1.5">3 Years</label>
                            <input className={inputClass} type="text" placeholder="ex: +40MW"
                                value={data.expansion_3yr} onChange={e => onChange('expansion_3yr', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1.5">5 Years</label>
                            <input className={inputClass} type="text" placeholder="ex: +40MW"
                                value={data.expansion_5yr} onChange={e => onChange('expansion_5yr', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1.5">10 Years</label>
                            <input className={inputClass} type="text" placeholder="ex: +40MW"
                                value={data.expansion_10yr} onChange={e => onChange('expansion_10yr', e.target.value)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 4 — Procurement Status ─────────────────────────────────────────────

const RATE_STRUCTURES = [
    'Flat Rate',
    'Time-of-Use (TOU)',
    'Real-Time Pricing',
    'Demand Charge',
    'Interruptible Service',
    'Green Tariff',
];

function StepProcurementStatus({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const inputClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 ' +
        'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition bg-white';

    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Procurement Status</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Where are you in the process? We'll meet you where you are.</p>

            <div className="space-y-8 max-w-4xl">
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

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Current Rate Structure*</span>
                        </div>
                        <div className="relative">
                            <select className={selectClass} value={data.rate_structure} onChange={e => onChange('rate_structure', e.target.value)}>
                                <option value="" disabled>Select option</option>
                                {RATE_STRUCTURES.map(r => <option key={r} value={r}>{r}</option>)}
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
                            <span className="text-sm font-medium text-gray-800">Existing Renewables (optional)</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">What % of the portfolio is renewables based?</p>
                        <input className={inputClass} type="text" placeholder=""
                            value={data.existing_renewables} onChange={e => onChange('existing_renewables', e.target.value)} />
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Step 5 — Strategic Goals ────────────────────────────────────────────────

const PRIMARY_GOALS = [
    'Cost Reduction',
    'Carbon Neutrality / Net Zero',
    'RE100 Commitment',
    'Energy Security',
    'Regulatory Compliance',
    'ESG Reporting',
];

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

function StepStrategicGoals({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Strategic Goals</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">What does a win look like for your organization?</p>

            <div className="space-y-8 max-w-4xl">
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

                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <InfoIcon />
                        <span className="text-sm font-medium text-gray-800">Sustainability Targets (optional)</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Do you have a public RE100 or Net Zero commitment year?</p>
                    <ToggleGroup options={['Yes', 'No']} value={data.sustainability_targets} onChange={v => onChange('sustainability_targets', v)} />
                </div>

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


// ─── Step 6 — PPA Preferences ────────────────────────────────────────────────

const PPA_PREFERENCES = ['Physical PPA', 'Virtual PPA (VPPA)', 'Utility Green Tariff', 'Direct Wire', 'No Preference'];
const TECHNOLOGIES = ['Solar', 'Wind', 'Geothermal', 'Nuclear/SMR', 'Battery Storage'];
const TENURE_OPTIONS = ['1–3 Years', '3–5 Years', '5–10 Years', '10–15 Years', '15–20 Years', '20+ Years'];

function StepPPAPreferences({ data, onChange }: { data: any; onChange: (f: string, v: string) => void }) {
    const selectClass =
        'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 appearance-none ' +
        'bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 transition';

    function Dropdown({
        value, onSelect, options, placeholder = 'Select option',
    }: { value: string; onSelect: (v: string) => void; options: string[]; placeholder?: string }) {
        return (
            <div className="relative">
                <select className={selectClass} value={value} onChange={e => onSelect(e.target.value)}>
                    <option value="" disabled>{placeholder}</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        );
    }

    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Contract Preferences</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Let's narrow down the contract structures that actually work for you.</p>

            <div className="space-y-8 max-w-4xl">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Power Purchase Agreement Preference*</span>
                        </div>
                        <Dropdown value={data.ppa_preference} onSelect={v => onChange('ppa_preference', v)} options={PPA_PREFERENCES} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Preferred Technology (optional)</span>
                        </div>
                        <Dropdown value={data.preferred_technology} onSelect={v => onChange('preferred_technology', v)} options={TECHNOLOGIES} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <InfoIcon />
                            <span className="text-sm font-medium text-gray-800">Desired Tenure (optional)</span>
                        </div>
                        <Dropdown value={data.desired_tenure} onSelect={v => onChange('desired_tenure', v)} options={TENURE_OPTIONS} />
                    </div>
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

function StepReview({ data, onGoToStep }: { data: any; onGoToStep: (s: number) => void }) {
    return (
        <div className="px-12 py-8">
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-3xl font-bold text-gray-900">Review Your Information</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1.5">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Review your answers before we create your personalized dashboard.</p>

            <div className="max-w-4xl space-y-8">
                {/* Facility Information */}
                <ReviewSection title="Facility Information" onEdit={() => onGoToStep(2)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Data Center Type*" value={data.dc_type} />
                        <ReviewField label="Operational Status*" value={data.operational_status} />
                        <ReviewField label="Locations of Interest*" value={data.locations} />
                        <ReviewField label="Current Utilization (%)*" value={data.utilization} />
                        <ReviewField label="Number of Sites" optional value={data.num_sites} />
                        <ReviewField label="Approx Total Rated IT Capacity Per Site*" value={data.it_capacity} />
                        <ReviewField label="Power Usage Effectiveness (PUE)*" value={data.pue} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* Energy Load */}
                <ReviewSection title="Energy Load" onEdit={() => onGoToStep(3)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Annual Electricity Consumption (MWh)*" value={data.annual_mwh} />
                        <div />
                        <ReviewField label="AI/HPC Exposure*" value={data.ai_hpc_exposure} />
                        <div>
                            <p className="text-xs text-gray-500 mb-0.5">Expansion Roadmap (optional)</p>
                            <p className="text-sm font-semibold text-gray-900">
                                3Y: {data.expansion_3yr || '—'} &nbsp; 5Y: {data.expansion_5yr || '—'} &nbsp; 10Y: {data.expansion_10yr || '—'}
                            </p>
                        </div>
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* Procurement Status */}
                <ReviewSection title="Procurement Status" onEdit={() => onGoToStep(4)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Existing Utility/Retailer*" value={data.utility_retailer} />
                        <ReviewField label="Current Rate Structure*" value={data.rate_structure} />
                        <ReviewField label="Existing Renewables" optional value={data.existing_renewables} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* Strategic Goals */}
                <ReviewSection title="Strategic Goals" onEdit={() => onGoToStep(5)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="Primary Goal*" value={data.primary_goal} />
                        <ReviewField label="Sustainability Targets" optional value={data.sustainability_targets} />
                        <ReviewField label="Carbon Matching Preference*" value={data.carbon_match_pref} />
                        <ReviewField label="Additionality Requirement" optional value={data.additionality_req} />
                    </div>
                </ReviewSection>

                <hr className="border-gray-200" />

                {/* PPA Preferences */}
                <ReviewSection title="Power Purchase Agreement Preferences" onEdit={() => onGoToStep(6)}>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        <ReviewField label="PPA Structure Preference*" value={data.ppa_preference} />
                        <ReviewField label="Preferred Technology" optional value={data.preferred_technology} />
                        <ReviewField label="Desired Tenure" optional value={data.desired_tenure} />
                    </div>
                </ReviewSection>
            </div>
        </div>
    );
}


// ─── Step 1 — Upload Documents ────────────────────────────────────────────────

function StepUploadDocuments({
    docs,
    setDocs,
    editDocId,
    setEditDocId
}: {
    docs: Doc[];
    setDocs: Dispatch<SetStateAction<Doc[]>>;
    editDocId: string | null;
    setEditDocId: (id: string | null) => void;
}) {
    const [isDragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const toggleCheck = (id: string) =>
        setDocs(prev => prev.map(d => d.id === id ? { ...d, checked: !d.checked } : d));

    const deleteDoc = (id: string) =>
        setDocs(prev => prev.filter(d => d.id !== id));

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newDocs: Doc[] = Array.from(files).map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            type: 'Utility Bill',
            facility: 'Unassigned',
            checked: true,
            file
        }));

        setDocs(prev => [...prev, ...newDocs]);
        if (fileRef.current) fileRef.current.value = '';
    };

    const updateDoc = (id: string, field: keyof Doc, value: any) => {
        setDocs(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
    };

    return (
        <div className="px-10 py-7">
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
                <h1 className="text-2xl font-bold text-gray-900">Upload Your Documents</h1>
                <div className="flex items-center gap-1.5 text-teal-600 text-sm font-medium mt-1">
                    <CheckIcon className="w-4 h-4" />
                    Progress Saved
                </div>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Add your documents or manually input your information.
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => fileRef.current?.click()}
                    className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    + Add Documents
                </button>
                <button className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    Manually Add Information
                </button>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        const newDocs: Doc[] = Array.from(files).map(file => ({
                            id: Math.random().toString(36).substr(2, 9),
                            name: file.name,
                            type: 'Utility Bill',
                            facility: 'Unassigned',
                            checked: true,
                            file
                        }));
                        setDocs(prev => [...prev, ...newDocs]);
                    }
                }}
                onClick={() => fileRef.current?.click()}
                className={`rounded-lg border-2 border-dashed p-12 flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragging ? 'border-teal-400 bg-teal-50' : 'border-gray-300 bg-white hover:bg-gray-50'
                    }`}
            >
                <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-500">
                    <span className="underline font-medium text-gray-700">click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-400 mt-1">Maximum file size 50 MB</p>
            </div>

            {/* Document table */}
            <div className="mt-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="border-b border-gray-200">
                        <tr>
                            <th className="w-8" />
                            <th className="w-10" />
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Document Name</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Facility</th>
                            <th className="w-28" />
                        </tr>
                    </thead>
                    <tbody>
                        {docs.map(doc => (
                            <tr key={doc.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                <td className="px-2 py-3 text-center text-gray-300 cursor-grab select-none text-xs leading-none">
                                    ⋮<br />⋮
                                </td>
                                <td className="px-2 py-3">
                                    <input type="checkbox" checked={doc.checked}
                                        onChange={() => toggleCheck(doc.id)}
                                        className="w-4 h-4 rounded accent-teal-500 cursor-pointer" />
                                </td>
                                <td className="px-4 py-3 text-gray-900">{doc.name}</td>
                                <td className="px-4 py-3">
                                    {editDocId === doc.id ? (
                                        <select
                                            value={doc.type}
                                            onChange={(e) => updateDoc(doc.id, 'type', e.target.value)}
                                            className="w-full text-sm border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                        >
                                            <option>DCIM Export</option>
                                            <option>Utility Bill</option>
                                            <option>Power Purchase Agreement</option>
                                            <option>Energy Contract</option>
                                            <option>Planning Model</option>
                                            <option>Storage Spec</option>
                                            <option>Other</option>
                                        </select>
                                    ) : (
                                        <span className="text-gray-600">{doc.type}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {editDocId === doc.id ? (
                                        <input
                                            type="text"
                                            value={doc.facility}
                                            onChange={(e) => updateDoc(doc.id, 'facility', e.target.value)}
                                            className="w-full text-sm border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                            placeholder="Facility Name"
                                        />
                                    ) : (
                                        <span className="text-gray-600">{doc.facility}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                        {editDocId === doc.id ? (
                                            <button
                                                onClick={() => setEditDocId(null)}
                                                className="text-teal-600 hover:text-teal-700 font-medium transition-colors"
                                            >
                                                Done
                                            </button>
                                        ) : (
                                            <>
                                                <button title="View" className="text-gray-400 hover:text-gray-600 transition-colors">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    title="Edit"
                                                    onClick={() => setEditDocId(doc.id)}
                                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                                <button title="Delete" onClick={() => deleteDoc(doc.id)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Root Onboarding shell ────────────────────────────────────────────────────

export default function Onboarding() {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
    const [docs, setDocs] = useState<Doc[]>(INITIAL_DOCS);
    const [editDocId, setEditDocId] = useState<string | null>(null);
    const { user, signUp } = useAuth();

    // Unified state for Step 0 (Account)
    const [accountData, setAccountData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: '',
        password: '',
        confirmPassword: '',
    });

    // Unified state for all other steps
    const [formData, setFormData] = useState({
        dc_type: '',
        operational_status: '',
        num_sites: '',
        locations: '',
        it_capacity: '',
        utilization: '',
        pue: '',
        annual_mwh: '',
        ai_hpc_exposure: '',
        expansion_3yr: '',
        expansion_5yr: '',
        expansion_10yr: '',
        utility_retailer: '',
        rate_structure: '',
        existing_renewables: '',
        primary_goal: '',
        sustainability_targets: '',
        carbon_match_pref: '',
        additionality_req: '',
        ppa_preference: '',
        preferred_technology: '',
        desired_tenure: '',
    });

    const updateAccountField = (field: string, value: string) => {
        setAccountData(prev => ({ ...prev, [field]: value }));
    };

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const goNext = async () => {
        setError(null);
        if (step === 0) {
            if (!accountData.firstName || !accountData.lastName || !accountData.email || !accountData.role || !accountData.password || !accountData.confirmPassword) {
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
                const res: any = await signUp(accountData.email, accountData.password, {
                    firstName: accountData.firstName,
                    lastName: accountData.lastName,
                    role: accountData.role
                });
                // Capture the ID directly from the result
                if (res?.data?.user?.id) {
                    setRegisteredUserId(res.data.user.id);
                }
                setStep(1);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Registration failed.');
            } finally {
                setLoading(false);
            }
        } else {
            setStep(s => Math.min(s + 1, STEPS.length - 1));
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
            const response = await fetch('http://localhost:3000/api/onboarding/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: finalUserId,
                    ...formData
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to submit');

            // Success! Show success dialog
            setShowSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Submission failed.');
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => setStep(s => Math.max(s - 1, 0));

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[256px] flex-shrink-0 flex flex-col font-['Manrope']" style={{ background: 'rgba(13, 6, 48, 0.78)' }}>
                <div className="h-[118px] flex items-center px-10 gap-3">
                    <img src="/favicon.png" alt="Power Dime" className="w-9 h-9 flex-shrink-0" />
                    <span className="text-white font-extrabold text-2xl tracking-tight">Power Dime</span>
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
                                } ${(loading || (i > 0 && !user)) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    {step === 0 && <StepCreateAccount data={accountData} onChange={updateAccountField} />}
                    {step === 1 && <StepUploadDocuments docs={docs} setDocs={setDocs} editDocId={editDocId} setEditDocId={setEditDocId} />}
                    {step === 2 && <StepFacilityInformation data={formData} onChange={updateField} />}
                    {step === 3 && <StepEnergyLoad data={formData} onChange={updateField} />}
                    {step === 4 && <StepProcurementStatus data={formData} onChange={updateField} />}
                    {step === 5 && <StepStrategicGoals data={formData} onChange={updateField} />}
                    {step === 6 && <StepPPAPreferences data={formData} onChange={updateField} />}
                    {step === 7 && <StepReview data={formData} onGoToStep={setStep} />}
                </div>

                {/* Bottom bar */}
                <div className="h-[86px] flex-shrink-0 px-10 flex items-center justify-between" style={{ background: '#0D0630' }}>
                    <button className="h-[34px] w-[202px] bg-[#F5F5F5] text-black text-base font-medium rounded-[7px] flex items-center justify-center transition-colors">
                        Save & Finish Later
                    </button>
                    <div className="flex items-center gap-3">
                        {step > 0 && (
                            <button onClick={goBack} disabled={loading} className="h-[34px] px-5 border border-white/30 text-white text-sm rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                Back
                            </button>
                        )}
                        {step < STEPS.length - 1 ? (
                            <button
                                onClick={goNext}
                                disabled={loading}
                                className="h-[34px] w-[94px] bg-[#F5F5F5] text-black text-base font-medium rounded-[7px] flex items-center justify-center gap-1 transition-colors disabled:opacity-70"
                            >
                                {loading ? '...' : 'Next'}
                                {!loading && (
                                    <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="h-[34px] px-6 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-70"
                            >
                                {loading ? 'Submitting...' : 'Submit'}
                            </button>
                        )}
                    </div>
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
