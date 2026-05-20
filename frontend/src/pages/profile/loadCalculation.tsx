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
    UTIL_y?: number[]; // Target utilization of capacity additions by year
    PUE_y: number[]; // PUE improvement by year
    g_IT: number; // Organic growth rate
    TEMP_AMB_monthly?: number[]; // Monthly average outdoor temp °C (12 values)


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

/**
 * currentLoadDemand()
 * Computes the current (Year 0) load demand snapshot from user-entered IT_LOAD and PUE.
 *
 * @param it_load  - IT load in MW (from form field IT_LOAD)
 * @param pue      - Power Usage Effectiveness (from form field PUE, e.g. 1.4)
 * @param gen_cap  - On-site generation capacity in MW (optional, defaults to 0)
 * @param lf       - Load factor as decimal (optional, defaults to 0.82)
 * @returns        - Object with current gross, net, cooling, and peak demand values
 */

export function currentLoadDemand(
    data: FacilityData,
    lf: number = 0.82
): {
    p_it: number;
    p_cooling: number;
    p_cooling_monthly: number[]; // Monthly cooling power (MW), 12 values
    p_gross: number;
    p_gross_monthly: number[];   // Monthly gross facility draw (MW), 12 values
    p_net_avg_current: number;
    p_net_peak_current: number;
    p_total_facility: number;
} {
    const isNew = data.FACILITY_STATUS === 'New';
    const it_load = isNew ? (data.P_IT_START || 0) : (data.IT_LOAD || 0);
    const pue = isNew ? (data.PUE_EXPECTED || 1.0) : (data.PUE || 1.0);
    const gen_cap = data.GEN_CAP || 0;
    const p_other = data.P_FAC || 0;

    const p_it = it_load; // IT load (MW)

    // Compute monthly cooling and gross if TEMP_AMB_monthly is available (Fix 3)
    let p_cooling_monthly: number[];
    let p_gross_monthly: number[];

    if (data.TEMP_AMB_monthly && data.TEMP_AMB_monthly.length === 12) {
        // Temperature-aware: derive per-month cooling from calcPPUE polynomial
        p_cooling_monthly = data.TEMP_AMB_monthly.map(T => it_load * (calcPPUE(T) - 1));
        p_gross_monthly = data.TEMP_AMB_monthly.map((_, m) => it_load + p_cooling_monthly[m] + p_other);
    } else {
        // Flat fallback — use the user-entered / calculated PUE
        const p_cooling_flat = it_load * (pue - 1);   // Cooling overhead = IT × (PUE − 1)
        const p_gross_flat   = it_load + p_cooling_flat + p_other; // Total facility draw
        p_cooling_monthly = Array(12).fill(p_cooling_flat);
        p_gross_monthly   = Array(12).fill(p_gross_flat);
    }

    // Annual averages (used by callers that only need a single scalar)
    const p_cooling = p_cooling_monthly.reduce((a, b) => a + b, 0) / 12;
    const p_gross   = p_gross_monthly.reduce((a, b) => a + b, 0) / 12;

    const p_net_avg_current = Math.max(0, p_gross - gen_cap); // Net grid import after on-site gen
    const p_net_peak_current = p_net_avg_current / lf;        // Peak demand from load factor
    const p_total_facility = p_it + (data.P_COOL || 0) + (data.P_FAC || 0);

    return { p_it, p_cooling, p_cooling_monthly, p_gross, p_gross_monthly, p_net_avg_current, p_net_peak_current, p_total_facility };
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

export function calculateMonthlyLoad(monthlyNetLoad: number[], lf_assumed: number = 0.85): number[] {
    const monthlyLoad: number[] = [];
    for (let m = 0; m < 12; m++) {
        const avgNetLoad = monthlyNetLoad[m] || 0;
        const peakDemand = avgNetLoad / lf_assumed;
        monthlyLoad.push(peakDemand);
    }
    return monthlyLoad;
}
function calcPPUE(T: number): number {
    return 7.1705e-5 * T * T + 0.0041 * T + 1.0743;
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

        // Step 3: Current Calculated PUE & Shape (Fix 1)
        if (data.TEMP_AMB_monthly && data.TEMP_AMB_monthly.length === 12) {
            // Temperature-aware path: derive monthly P_GROSS and PUE_CALC from calcPPUE polynomial
            for (let m = 0; m < 12; m++) {
                const T = data.TEMP_AMB_monthly[m];
                const ppue = calcPPUE(T);
                const p_cool_m = pit_val * (ppue - 1);
                const p_other  = data.P_FAC || 0;
                P_GROSS[m]   = pit_val + p_cool_m + p_other;
                PUE_CALC[m]  = pit_val > 0 ? P_GROSS[m] / pit_val : ppue;
                IT_SHAPE[m]  = 1.0;
            }
        } else {
            // Flat fallback: use the measured / user-entered PUE (preserves existing behaviour)
            // Step 1: Current Gross and Net Demand
            const baseGross = (data.IT_LOAD || 0) * (data.PUE || 1);
            P_GROSS = Array(12).fill(baseGross);

            // Formula: PUE[m] = SUM(P_FACILITY[h] * delta_t) / SUM(P_IT[h] * delta_t)
            for (let m = 0; m < 12; m++) {
                const hoursInMonth = HOURS_PER_MONTH[m];
                const delta_t = 1.0; // 1-hour interval duration

                let sum_facility_dt = 0;
                let sum_it_dt = 0;

                for (let h = 0; h < hoursInMonth; h++) {
                    const p_facility_h = P_GROSS[m]; // P_FACILITY[h] is P_GROSS[m] (constant hourly load for the month)
                    const p_it_h = P_IT[m];           // P_IT[h] is P_IT[m] (constant hourly IT load for the month)

                    sum_facility_dt += p_facility_h * delta_t;
                    sum_it_dt += p_it_h * delta_t;
                }

                PUE_CALC[m] = sum_it_dt > 0 ? sum_facility_dt / sum_it_dt : (data.PUE || 1.0);
                IT_SHAPE[m] = 1.0;
            }
        }
    } else {
        // Greenfield / New Facility
        const pit_start = data.P_IT_START || 0; // Expected IT load at commissioning (in MW) for the new greenfield facility

        P_IT = Array(12).fill(pit_start); // Monthly profile of initial IT load (flat baseline in MW)
        IT_SHAPE = Array(12).fill(1.0); // Flat monthly shape factor assumed for the new greenfield facility (no historical pattern exists)

        let p_gross_arr = Array(12).fill(0);
        let pue_calc_arr = Array(12).fill(0);

        if (data.TEMP_AMB_monthly && data.TEMP_AMB_monthly.length === 12) {
            for (let m = 0; m < 12; m++) {
                const T = data.TEMP_AMB_monthly[m];
                const ppue = calcPPUE(T);
                const p_cool = pit_start * (ppue - 1);
                const p_other = data.P_FAC || 0;
                p_gross_arr[m] = pit_start + p_cool + p_other;
                pue_calc_arr[m] = pit_start > 0 ? p_gross_arr[m] / pit_start : 1.0;
            }
        } else {
            const assumed_pue = data.PUE_EXPECTED || 1.0; // Assumed design Power Usage Effectiveness (PUE) at commissioning
            p_gross_arr = Array(12).fill(pit_start * assumed_pue);
            pue_calc_arr = Array(12).fill(assumed_pue);
        }

        P_GROSS = p_gross_arr;
        PUE_CALC = pue_calc_arr;
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
        let mult = 1.0; // Base case multiplier
        if (s === 'HIGH') mult = MULT_HIGH;
        if (s === 'LOW') mult = MULT_LOW;

        const g_IT_s = (data.g_IT || 0) / 100 * mult; // IT load growth rate for the scenario, adjusted by multiplier and converted to decimal
        const delta_cap_s = (data.DELTA_CAP_y || []).map(val => val * mult); // Array of yearly new capacities for the scenario, adjusted by scenario multiplier

        const base_pue_proj: number[][] = [];
        for (let y = 0; y <= 10; y++) {
            base_pue_proj[y] = [];
            results.P_IT_PROJ[s][y] = [];
            results.PUE_PROJ[s][y] = [];
            results.P_GROSS_PROJ[s][y] = [];
            results.P_NET_AVG_MONTH[s][y] = [];

            let e_annual_y = 0;
            let p_net_avg_sum = 0;

            for (let m = 0; m < 12; m++) {
                // Step 5: Forecast IT Load
                const ramp_rate = (data.UTIL_RAMP || 20) / 100; // single monthly ramp rate for all capacity additions
                let capacity_sum = 0;
                for (let j = 1; j <= y; j++) {
                    const delta_cap_j = y > 0 ? (delta_cap_s[j - 1] || 0) : 0; // adjusted capacity added in year j
                    // Target utilization for year j's capacity addition
                    const util_j = (data.UTIL_y?.[j - 1] !== undefined) ? (data.UTIL_y[j - 1] / 100) : 0.80; // default 80%

                    let util_j_y_m;
                    if (j < y) {
                        // Capacity added in previous years is fully ramped up to its target utilization
                        util_j_y_m = util_j;
                    } else {
                        // Capacity added in the current year y (which is j) is currently ramping up month-by-month
                        util_j_y_m = Math.min(util_j, (m + 1) * ramp_rate);
                    }
                    capacity_sum += delta_cap_j * util_j_y_m;
                }
                let p_it_proj_m = (P_IT[m] * Math.pow(1 + g_IT_s, y)) + capacity_sum;
                if (data.IT_CAP && p_it_proj_m > data.IT_CAP) {
                    p_it_proj_m = data.IT_CAP;
                }
                results.P_IT_PROJ[s][y][m] = p_it_proj_m;
                // Step 6: Forecast PUE
                // Formula: PUE[m] = SUM(P_FACILITY[h] * delta_t) / SUM(P_IT[h] * delta_t)
                const pue_eff_improve = y > 0 ? (data.PUE_y?.[y - 1] || 0) : 0; // PUE efficiency improvement rate for the current year (from scenario/inputs)
                base_pue_proj[y][m] = 1 + (PUE_CALC[m] - 1) * (1 - pue_eff_improve);

                const hoursInMonth = HOURS_PER_MONTH[m];
                let pue_proj_m = 0;
                let p_gross_proj_m = 0;

                // Fix 2: temp-aware PUE path now applies to ALL facilities when TEMP_AMB_monthly is present
                if (data.TEMP_AMB_monthly && data.TEMP_AMB_monthly.length === 12) {
                    const T = data.TEMP_AMB_monthly[m];
                    const ppue = calcPPUE(T);
                    const pue_eff_improve = y > 0 ? (data.PUE_y?.[y - 1] || 0) : 0;
                    const improved_ppue = 1 + (ppue - 1) * (1 - pue_eff_improve);

                    const p_cool_proj_m = p_it_proj_m * (improved_ppue - 1);
                    const p_other = data.P_FAC || 0;
                    p_gross_proj_m = p_it_proj_m + p_cool_proj_m + p_other;
                    pue_proj_m = p_it_proj_m > 0 ? p_gross_proj_m / p_it_proj_m : improved_ppue;
                } else {
                    const delta_t = 1.0;
                    let sum_facility_dt = 0;
                    let sum_it_dt = 0;
                    for (let h = 0; h < hoursInMonth; h++) {
                        const p_it_h = p_it_proj_m;
                        const p_facility_h = p_it_h * base_pue_proj[y][m];
                        sum_facility_dt += p_facility_h * delta_t;
                        sum_it_dt += p_it_h * delta_t;
                    }
                    pue_proj_m = sum_it_dt > 0 ? sum_facility_dt / sum_it_dt : base_pue_proj[y][m];
                    p_gross_proj_m = p_it_proj_m * pue_proj_m;
                }

                results.PUE_PROJ[s][y][m] = pue_proj_m;
                results.P_GROSS_PROJ[s][y][m] = p_gross_proj_m;

                // Step 8: Forecast Net Grid Import
                const p_gen_avg = data.GEN_CAP || 0; // Onsite generation capacity (in MW) available to offset facility demand
                // BESS logic placeholder (assuming 0 for now unless hourly dispatch model is active)
                const p_bess_dis = 0; // Battery Energy Storage System (BESS) average discharge power (in MW)
                const p_bess_ch = 0; // Battery Energy Storage System (BESS) average charging power (in MW)
                const p_net_avg = Math.max(0, p_gross_proj_m - p_gen_avg - p_bess_dis + p_bess_ch); // Net grid import (in MW) after offsetting gross demand with onsite generation and BESS
                results.P_NET_AVG_MONTH[s][y][m] = p_net_avg;

                p_net_avg_sum += p_net_avg;

                // Step 9: Forecast Annual Energy
                e_annual_y += p_net_avg * HOURS_PER_MONTH[m];
            }

            results.E_ANNUAL_PROJ[s][y] = e_annual_y;

            // Step 10: Forecast Peak Demand
            const lf = data.LF_ASSUMED ? data.LF_ASSUMED / 100 : 0.82; // Using 82% LF as default
            const p_net_avg_proj_y = p_net_avg_sum / 12;

            // Calculate Annual Peak as the maximum of the Monthly Peaks
            const monthly_peaks = results.P_NET_AVG_MONTH[s][y].map(avg => avg / lf);
            const p_net_peak_proj_y = Math.max(...monthly_peaks);

            results.P_NET_PEAK_PROJ[s][y] = p_net_peak_proj_y;

            // Tracking log to debug P_NET_PEAK_PROJ
            // ---------------------------------------------------------
            // Phase 3: Load Tiering & Procurement Decomposition
            // ---------------------------------------------------------
            // Step 11 & 12: LDC & Thresholds
            // Without pure hourly resolution generation here, we estimate Baseload and Superpeak via LF proxies.
            // E.g., Baseload = 90th percentile, Super-peak = 5th percentile.
            // (Thresholds are used dynamically in the Load Shape calculations instead)

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

            // --- REQUESTED SUMMARY CONSOLE LOG ---
            const avg_it_load = results.P_IT_PROJ[s][y].reduce((a, b) => a + b, 0) / 12;
            const avg_pue = results.PUE_PROJ[s][y].reduce((a, b) => a + b, 0) / 12;
            const e_annual_gwh = e_annual_y / 1000;
            const uncont_energy_gwh = (uncont_exp * lf * 8760) / 1000; // approximation
            const baseload_thresh = p_net_peak_proj_y * 0.76;
            const superpeak_thresh = p_net_peak_proj_y * 1.05;

            console.log(`--- YEAR ${y} [${s}] SUMMARY ---
Forecast IT load: ${avg_it_load.toFixed(2)} MW
Forecast PUE: ${avg_pue.toFixed(3)}
Forecast average net demand: ${p_net_avg_proj_y.toFixed(2)} MW
Forecast peak demand: ${p_net_peak_proj_y.toFixed(2)} MW
Forecast annual energy: ${e_annual_gwh.toFixed(1)} GWh
Contracted capacity: ${totalContractVol} MW
Peak uncontracted demand: ${uncont_exp.toFixed(2)} MW
Approx. uncontracted energy: ${uncont_energy_gwh.toFixed(1)} GWh
Baseload threshold: ${baseload_thresh.toFixed(2)} MW
Super-peak threshold: ${superpeak_thresh.toFixed(2)} MW
--------------------------------`);

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
        return str.split(',').map(s => {
            const trimmed = s.trim();
            return trimmed === '' ? undefined : Number(trimmed);
        }) as number[];
    };

    return data.map((row: any) => ({
        id: String(row.id),
        name: row.FAC_ID || `Facility ${row.id}`,
        data: {
            ...row,
            DELTA_CAP_y: parseNumArray(row.DELTA_CAP_y),
            UTIL_y: parseNumArray(row.UTIL_y),
            PUE_y: parseNumArray(row.PUE_y),
            TEMP_AMB_monthly: parseNumArray(row.TEMP_AMB_monthly),
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
        return str.split(',').map(s => {
            const trimmed = s.trim();
            return trimmed === '' ? undefined : Number(trimmed);
        }) as number[];
    };

    return {
        ...data,
        DELTA_CAP_y: parseNumArray(data.DELTA_CAP_y),
        UTIL_y: parseNumArray(data.UTIL_y),
        PUE_y: parseNumArray(data.PUE_y),
        TEMP_AMB_monthly: parseNumArray(data.TEMP_AMB_monthly),
        contracts: typeof data.contracts === 'string' ? JSON.parse(data.contracts) : (data.contracts || [])
    } as FacilityData;
}
