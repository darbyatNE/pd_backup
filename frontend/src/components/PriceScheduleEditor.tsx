import { useState, useCallback, useMemo } from 'react';
import { ChevronDownIcon, ChevronUpIcon, CalculatorIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { PriceScheduleFormEntry, PriceCurrency } from '../types/ppa';

interface PriceScheduleEditorProps {
    schedule: PriceScheduleFormEntry[];
    onChange: (schedule: PriceScheduleFormEntry[]) => void;
    currency?: PriceCurrency;
    startYear?: number;
    termYears?: number;
    basePrice?: number;
    baseQuantity?: number;
    escalatorPercent?: number;
    readOnly?: boolean;
}

const CURRENCY_SYMBOLS: Record<PriceCurrency, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€'
};

export default function PriceScheduleEditor({
    schedule,
    onChange,
    currency = 'USD',
    startYear,
    termYears = 15,
    basePrice,
    baseQuantity,
    escalatorPercent = 2.0,
    readOnly = false
}: PriceScheduleEditorProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [bulkEscalator, setBulkEscalator] = useState(escalatorPercent.toString());
    const [showBulkTools, setShowBulkTools] = useState(false);

    const currencySymbol = CURRENCY_SYMBOLS[currency];

    // Calculate the actual start year (default to next year)
    const effectiveStartYear = startYear || new Date().getFullYear() + 1;

    // Initialize schedule if empty
    const initializeSchedule = useCallback(() => {
        const newSchedule: PriceScheduleFormEntry[] = [];
        for (let i = 0; i < termYears; i++) {
            const contractYear = i + 1;
            
            // Apply escalator if base price provided
            let price = basePrice || 0;
            if (basePrice && i > 0) {
                price = basePrice * Math.pow(1 + (escalatorPercent / 100), i);
            }
            
            newSchedule.push({
                contract_year: contractYear,
                fixed_settlement_price_per_mwh: (Math.round(price * 100) / 100).toString(),
                eac_credits_price_per_mwh: '',
                annual_quantity_mwh: baseQuantity ? baseQuantity.toString() : ''
            });
        }
        onChange(newSchedule);
    }, [termYears, basePrice, baseQuantity, escalatorPercent, onChange]);

    // Update a single entry
    const updateEntry = useCallback((index: number, field: keyof PriceScheduleFormEntry, value: string) => {
        const newSchedule = [...schedule];
        newSchedule[index] = { ...newSchedule[index], [field]: value };
        onChange(newSchedule);
    }, [schedule, onChange]);

    // Apply escalator to all years from base price
    const applyEscalator = useCallback(() => {
        if (schedule.length === 0) return;
        
        const escalator = parseFloat(bulkEscalator) / 100;
        const basePrice = parseFloat(schedule[0].fixed_settlement_price_per_mwh) || 0;
        
        const newSchedule = schedule.map((entry, index) => ({
            ...entry,
            fixed_settlement_price_per_mwh: (Math.round(basePrice * Math.pow(1 + escalator, index) * 100) / 100).toString()
        }));
        
        onChange(newSchedule);
    }, [schedule, bulkEscalator, onChange]);

    // Copy quantity to all years
    const copyQuantityToAll = useCallback(() => {
        if (schedule.length === 0) return;
        
        const baseQuantity = schedule[0].annual_quantity_mwh;
        const newSchedule = schedule.map(entry => ({
            ...entry,
            annual_quantity_mwh: baseQuantity
        }));
        
        onChange(newSchedule);
    }, [schedule, onChange]);

    // Calculate totals
    const totals = useMemo(() => {
        if (schedule.length === 0) return { totalQuantity: 0, totalValue: 0, avgPrice: 0 };
        
        const totalQuantity = schedule.reduce((sum, e) => sum + (parseFloat(e.annual_quantity_mwh) || 0), 0);
        const totalValue = schedule.reduce((sum, e) => 
            sum + ((parseFloat(e.fixed_settlement_price_per_mwh) || 0) * (parseFloat(e.annual_quantity_mwh) || 0)), 0);
        const avgPrice = totalQuantity > 0 ? totalValue / totalQuantity : 0;
        
        return { totalQuantity, totalValue, avgPrice };
    }, [schedule]);
    
    // Get calendar year from contract year
    const getCalendarYear = (contractYear: number) => effectiveStartYear + contractYear - 1;

    // Format large numbers
    const formatNumber = (num: number) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toFixed(2);
    };

    return (
        <div className="border rounded-lg overflow-hidden">
            {/* Header */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100"
            >
                <div className="flex items-center gap-3">
                    <CalculatorIcon className="h-5 w-5 text-indigo-600" />
                    <div className="text-left">
                        <span className="text-sm font-semibold text-gray-900">
                            Price & Quantity Schedule (Schedule 1)
                        </span>
                        {schedule.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                                {schedule.length} years • Avg: {currencySymbol}{totals.avgPrice.toFixed(2)}/MWh • 
                                Total: {formatNumber(totals.totalQuantity)} MWh
                            </p>
                        )}
                    </div>
                </div>
                {isExpanded ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                )}
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="p-4 border-t">
                    {/* Initialize button if schedule is empty */}
                    {schedule.length === 0 ? (
                        <div className="text-center py-8">
                            <CalculatorIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-sm text-gray-500 mb-4">
                                No price schedule defined yet. Initialize a {termYears}-year schedule to get started.
                            </p>
                            <button
                                type="button"
                                onClick={initializeSchedule}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                            >
                                <ArrowPathIcon className="h-4 w-4" />
                                Initialize {termYears}-Year Schedule
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Bulk Tools */}
                            {!readOnly && (
                                <div className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkTools(!showBulkTools)}
                                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        {showBulkTools ? 'Hide' : 'Show'} Bulk Tools
                                    </button>
                                    
                                    {showBulkTools && (
                                        <div className="mt-3 p-3 bg-gray-50 rounded-lg flex flex-wrap gap-4 items-end">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Annual Escalator (%)
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        max="20"
                                                        value={bulkEscalator}
                                                        onChange={(e) => setBulkEscalator(e.target.value)}
                                                        className="w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={applyEscalator}
                                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-xs font-medium"
                                                    >
                                                        Apply to Prices
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <button
                                                type="button"
                                                onClick={copyQuantityToAll}
                                                className="px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-xs font-medium"
                                            >
                                                Copy Year 1 Quantity to All
                                            </button>
                                            
                                            <button
                                                type="button"
                                                onClick={initializeSchedule}
                                                className="px-3 py-1.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-xs font-medium"
                                            >
                                                Reset Schedule
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Schedule Table */}
                            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                Year
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                Calendar Year
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                                Price ({currencySymbol}/MWh)
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                                Quantity (MWh)
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                                Value ({currencySymbol})
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {schedule.map((entry, index) => {
                                            const price = parseFloat(entry.fixed_settlement_price_per_mwh) || 0;
                                            const quantity = parseFloat(entry.annual_quantity_mwh) || 0;
                                            const value = price * quantity;
                                            return (
                                                <tr key={entry.contract_year} className="hover:bg-gray-50">
                                                    <td className="px-3 py-2 text-sm font-medium text-gray-900">
                                                        {entry.contract_year}
                                                    </td>
                                                    <td className="px-3 py-2 text-sm text-gray-600">
                                                        {getCalendarYear(entry.contract_year)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {readOnly ? (
                                                            <span className="text-sm text-gray-900">
                                                                {currencySymbol}{price.toFixed(2)}
                                                            </span>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={entry.fixed_settlement_price_per_mwh}
                                                                onChange={(e) => updateEntry(index, 'fixed_settlement_price_per_mwh', e.target.value)}
                                                                className="w-24 text-right rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {readOnly ? (
                                                            <span className="text-sm text-gray-900">
                                                                {formatNumber(quantity)}
                                                            </span>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                step="100"
                                                                min="0"
                                                                value={entry.annual_quantity_mwh}
                                                                onChange={(e) => updateEntry(index, 'annual_quantity_mwh', e.target.value)}
                                                                className="w-28 text-right rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-sm text-gray-600">
                                                        {currencySymbol}{formatNumber(value)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-100 sticky bottom-0">
                                        <tr className="font-semibold">
                                            <td colSpan={2} className="px-3 py-2 text-sm text-gray-900">
                                                Total / Average
                                            </td>
                                            <td className="px-3 py-2 text-right text-sm text-gray-900">
                                                {currencySymbol}{totals.avgPrice.toFixed(2)} avg
                                            </td>
                                            <td className="px-3 py-2 text-right text-sm text-gray-900">
                                                {formatNumber(totals.totalQuantity)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-sm text-gray-900">
                                                {currencySymbol}{formatNumber(totals.totalValue)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Summary Cards */}
                            <div className="mt-4 grid grid-cols-3 gap-4">
                                <div className="bg-indigo-50 rounded-lg p-3">
                                    <p className="text-xs text-indigo-600 font-medium">Contract Term</p>
                                    <p className="text-lg font-bold text-indigo-900">{schedule.length} Years</p>
                                </div>
                                <div className="bg-green-50 rounded-lg p-3">
                                    <p className="text-xs text-green-600 font-medium">Total Quantity</p>
                                    <p className="text-lg font-bold text-green-900">{formatNumber(totals.totalQuantity)} MWh</p>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-3">
                                    <p className="text-xs text-blue-600 font-medium">Total Contract Value</p>
                                    <p className="text-lg font-bold text-blue-900">{currencySymbol}{formatNumber(totals.totalValue)}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
