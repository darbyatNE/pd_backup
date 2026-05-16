// Phase 1 through 4 logic implementation for load forecasting
import { supabase } from '../../services/supabase';

export type Scenario = 'BASE' | 'HIGH' | 'LOW';

export interface Contract {
    CV_i: number; // Contract Volume
    // other fields as needed
}

export interface FacilityData {
    FACILITY_STATUS: string;
    MEASUREMENT_POINT: string;
    P_IT_START: number;
    LF_ASSUMED: number;
    PUE_EXPECTED: number;

    IT_LOAD: number;
    IT_CAP: number;
    PUE: number;
    ETA_UPS: number;
    ETA_PDU: number;
    P_COOL: number;
    P_FAC: number;
    GEN_CAP: number;
    BATT_CAP: number;

    DELTA_CAP_y: number[]; // Capacity additions by year
    UTIL_RAMP: number;
    PUE_y: number[]; // PUE improvement by year
    g_IT: number; // Organic growth rate

    C_MAX: number; // Grid capacity
    COV_MIN: number;
    contracts: Contract[];
}

export interface ForecastResult {
    P_IT_PROJ: Record<Scenario, number[][]>; // [scenario][year][month]
    PUE_PROJ: Record<Scenario, number[][]>;
    P_GROSS_PROJ: Record<Scenario, number[][]>;
    P_NET_AVG_MONTH: Record<Scenario, number[][]>;
    E_ANNUAL_PROJ: Record<Scenario, number[]>; // [scenario][year]
    P_NET_PEAK_PROJ: Record<Scenario, number[]>;
    UNCONT_EXP_PROJ: Record<Scenario, number[]>;
    CCR_ANNUAL_PROJ: Record<Scenario, number[]>;
    ALERTS: string[];
}

const MULT_HIGH = 1.25;
const MULT_LOW = 0.75;
const HOURS_PER_MONTH = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744]; // standard non-leap year

export interface HourlyLoadPoint {
    totalMw: number;
    baseloadMw: number;
    peakMw: number;
    superPeakMw: number;
}

export function calculateHourlyLoad(monthlyNetLoad: number[], lf_assumed: number = 0.85): HourlyLoadPoint[] {
    const hourlyLoad: HourlyLoadPoint[] = [];
    for (let m = 0; m < 12; m++) {
        const hoursInMonth = HOURS_PER_MONTH[m];
        const avgNetLoad = monthlyNetLoad[m] || 0;


        // Step 2: Peak Demand (P_NET_PEAK)
        const peakDemand = avgNetLoad / lf_assumed;

        // Step 3: Baseload and Super-Peak Thresholds
        const baseloadThresh = peakDemand * 0.76;
        const superPeakThresh = peakDemand * 1.05;

        // Synthesize Hourly Values (assuming flat shape for now, but keeping peak ranges)
        for (let h = 0; h < hoursInMonth; h++) {
            hourlyLoad.push({
                totalMw: peakDemand, // Representing the peak potential
                baseloadMw: baseloadThresh,
                peakMw: Math.max(0, peakDemand - baseloadThresh), // Swing range above baseload
                superPeakMw: superPeakThresh
            });
        }
    }
    return hourlyLoad;
}

export function calculateMultiYearForecast(data: FacilityData): ForecastResult {
    // ---------------------------------------------------------
    // Phase 1: Current State Calibration (y=0)
    // ---------------------------------------------------------

    let P_GROSS = Array(12).fill(0);
    let P_IT = Array(12).fill(0);
    let PUE_CALC = Array(12).fill(0);
    let IT_SHAPE = Array(12).fill(1); // Flat shape assumed if hourly data absent

    if (data.FACILITY_STATUS === 'Running') {
        // Step 1: Current Gross and Net Demand
        const baseGross = (data.IT_LOAD || 0) * (data.PUE || 1);
        P_GROSS = Array(12).fill(baseGross);
        // Step 2: IT Load Calculation (P_IT)
        let eta_ups = data.ETA_UPS ? data.ETA_UPS / 100 : 0.97; // Default 0.97
        let eta_pdu = data.ETA_PDU ? data.ETA_PDU / 100 : 0.98; // Default 0.98

        let pit_val = data.IT_LOAD || 0;
        if (data.MEASUREMENT_POINT === 'UPS Input') {
            // Case C
            pit_val = pit_val * eta_ups * eta_pdu;
        } else if (data.MEASUREMENT_POINT === 'PDU Input') {
            // Case B
            pit_val = pit_val * eta_pdu;
        } else {
            // Case A (PDU Output / Rack)
            pit_val = pit_val;
        }
        P_IT = Array(12).fill(pit_val);

        // Step 3: Current Calculated PUE & Shape
        for (let m = 0; m < 12; m++) {
            PUE_CALC[m] = P_IT[m] > 0 ? P_GROSS[m] / P_IT[m] : (data.PUE || 1.0);
            IT_SHAPE[m] = 1.0;
        }
    } else {
        // Greenfield / New Facility
        const pit_start = data.P_IT_START || 0;
        const assumed_pue = data.PUE_EXPECTED || 1.0;
        P_IT = Array(12).fill(pit_start);
        P_GROSS = Array(12).fill(pit_start * assumed_pue);
        PUE_CALC = Array(12).fill(assumed_pue);
        IT_SHAPE = Array(12).fill(1.0);
    }

    // ---------------------------------------------------------
    // Phase 2: Forward Forecasting (y=1 to 10)
    // ---------------------------------------------------------
    const scenarios: Scenario[] = ['BASE', 'HIGH', 'LOW'];

    const results: ForecastResult = {
        P_IT_PROJ: {} as Record<Scenario, number[][]>,
        PUE_PROJ: {} as Record<Scenario, number[][]>,
        P_GROSS_PROJ: {} as Record<Scenario, number[][]>,
        P_NET_AVG_MONTH: {} as Record<Scenario, number[][]>,
        E_ANNUAL_PROJ: {} as Record<Scenario, number[]>,
        P_NET_PEAK_PROJ: {} as Record<Scenario, number[]>,
        UNCONT_EXP_PROJ: {} as Record<Scenario, number[]>,
        CCR_ANNUAL_PROJ: {} as Record<Scenario, number[]>,
        ALERTS: []
    };

    const totalContractVol = (data.contracts || []).reduce((acc, c) => acc + (Number(c.CV_i) || 0), 0);

    scenarios.forEach(s => {
        results.P_IT_PROJ[s] = [];
        results.PUE_PROJ[s] = [];
        results.P_GROSS_PROJ[s] = [];
        results.P_NET_AVG_MONTH[s] = [];
        results.E_ANNUAL_PROJ[s] = [];
        results.P_NET_PEAK_PROJ[s] = [];
        results.UNCONT_EXP_PROJ[s] = [];
        results.CCR_ANNUAL_PROJ[s] = [];

        // Step 4: Scenario Input Multipliers
        let mult = 1.0;
        if (s === 'HIGH') mult = MULT_HIGH;
        if (s === 'LOW') mult = MULT_LOW;

        const g_IT_s = (data.g_IT || 0) / 100 * mult;
        const delta_cap_s = (data.DELTA_CAP_y || []).map(val => val * mult);

        for (let y = 0; y <= 10; y++) {
            results.P_IT_PROJ[s][y] = [];
            results.PUE_PROJ[s][y] = [];
            results.P_GROSS_PROJ[s][y] = [];
            results.P_NET_AVG_MONTH[s][y] = [];

            let e_annual_y = 0;
            let p_net_avg_sum = 0;

            for (let m = 0; m < 12; m++) {
                // Step 5: Forecast IT Load
                let sum_delta = 0;
                for (let j = 0; j < y; j++) {
                    const cap_add = delta_cap_s[j] || 0;
                    const util = (data.UTIL_RAMP || 100) / 100;
                    sum_delta += cap_add * util;
                }

                let p_it_proj_m = (P_IT[m] * Math.pow(1 + g_IT_s, y)) + (IT_SHAPE[m] * sum_delta);
                if (data.IT_CAP && p_it_proj_m > data.IT_CAP) {
                    p_it_proj_m = data.IT_CAP;
                }
                results.P_IT_PROJ[s][y][m] = p_it_proj_m;

                // Step 6: Forecast PUE
                // Formula: 1 + (PUE_CALC[0,m] - 1) * (1 - PUE_EFF_IMPROVE_s[y])
                const pue_eff_improve = data.PUE_y?.[y] || 0;
                const pue_proj_m = 1 + (PUE_CALC[m] - 1) * (1 - pue_eff_improve);
                results.PUE_PROJ[s][y][m] = pue_proj_m;

                // Step 7: Forecast Gross Facility Demand
                const p_gross_proj_m = p_it_proj_m * pue_proj_m;
                results.P_GROSS_PROJ[s][y][m] = p_gross_proj_m;

                // Step 8: Forecast Net Grid Import
                const p_gen_avg = data.GEN_CAP || 0;
                // BESS logic placeholder (assuming 0 for now unless hourly dispatch model is active)
                const p_bess_dis = 0;
                const p_bess_ch = 0;
                const p_net_avg = Math.max(0, p_gross_proj_m - p_gen_avg - p_bess_dis + p_bess_ch);
                results.P_NET_AVG_MONTH[s][y][m] = p_net_avg;

                p_net_avg_sum += p_net_avg;

                // Step 9: Forecast Annual Energy
                e_annual_y += p_net_avg * HOURS_PER_MONTH[m];
            }

            results.E_ANNUAL_PROJ[s][y] = e_annual_y;

            // Step 10: Forecast Peak Demand
            const lf = data.LF_ASSUMED ? data.LF_ASSUMED / 100 : 0.85; // Using 85% LF as default
            const p_net_avg_proj_y = p_net_avg_sum / 12;
            const p_net_peak_proj_y = p_net_avg_proj_y / lf;
            results.P_NET_PEAK_PROJ[s][y] = p_net_peak_proj_y;

            // ---------------------------------------------------------
            // Phase 3: Load Tiering & Procurement Decomposition
            // ---------------------------------------------------------
            // Step 11 & 12: LDC & Thresholds
            // Without pure hourly resolution generation here, we estimate Baseload and Superpeak via LF proxies.
            // E.g., Baseload = 90th percentile, Super-peak = 5th percentile.
            const p_base_thresh = p_net_peak_proj_y * 0.60; // Mock 90th pct
            const p_superpeak_thresh = p_net_peak_proj_y * 0.95; // Mock 5th pct

            // ---------------------------------------------------------
            // Phase 4: Capacity & Contract Gap Analysis
            // ---------------------------------------------------------
            // Capacity Alert
            if (data.C_MAX && p_net_peak_proj_y > data.C_MAX) {
                const alertMsg = `Alert A1: Projected peak demand (${p_net_peak_proj_y.toFixed(2)} MW) exceeds contracted capacity (${data.C_MAX} MW) in Year ${y} (Scenario: ${s})`;
                if (!results.ALERTS.includes(alertMsg)) {
                    results.ALERTS.push(alertMsg);
                }
            }

            // Uncontracted Exposure
            const uncont_exp = Math.max(0, p_net_peak_proj_y - totalContractVol);
            results.UNCONT_EXP_PROJ[s][y] = uncont_exp;

            // Coverage Ratio
            const ccr = p_net_peak_proj_y > 0 ? totalContractVol / p_net_peak_proj_y : 1;
            results.CCR_ANNUAL_PROJ[s][y] = ccr * 100;

            const cov_min = data.COV_MIN || 70;
            if ((ccr * 100) < cov_min) {
                const alertMsg = `Alert: Coverage Ratio drops below minimum ${cov_min}% in Year ${y} (Scenario: ${s})`;
                if (!results.ALERTS.includes(alertMsg)) {
                    results.ALERTS.push(alertMsg);
                }
            }
        }
    });

    return results;
}

export async function fetchAllFacilities(
    buyerId: string
): Promise<{ id: string; name: string; data: FacilityData }[]> {
    const { data, error } = await supabase
        .from('data_centers')
        .select('*')
        .eq('buyer_id', buyerId);

    if (error || !data) {
        console.error('Failed to fetch facilities:', error);
        return [];
    }

    const parseNumArray = (str?: string) => {
        if (!str) return [];
        return str.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    };

    return data.map((row: any) => ({
        id: String(row.id),
        name: row.FAC_ID || `Facility ${row.id}`,
        data: {
            ...row,
            DELTA_CAP_y: parseNumArray(row.DELTA_CAP_y),
            PUE_y: parseNumArray(row.PUE_y),
            contracts: typeof row.contracts === 'string'
                ? JSON.parse(row.contracts)
                : (row.contracts || []),
        } as FacilityData,
    }));
}

export async function fetchFacilityData(buyerId: string): Promise<FacilityData | null> {
    const { data, error } = await supabase
        .from('data_centers')
        .select('*')
        .eq('buyer_id', buyerId)
        .maybeSingle();

    if (error || !data) {
        console.error('Failed to fetch from data_centers:', error);
        return null;
    }

    const parseNumArray = (str?: string) => {
        if (!str) return [];
        return str.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    };

    return {
        ...data,
        DELTA_CAP_y: parseNumArray(data.DELTA_CAP_y),
        PUE_y: parseNumArray(data.PUE_y),
        contracts: typeof data.contracts === 'string' ? JSON.parse(data.contracts) : (data.contracts || [])
    } as FacilityData;
}
