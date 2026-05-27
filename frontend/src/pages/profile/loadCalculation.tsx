// Phase 1 through 4 logic implementation for load forecasting
import { supabase } from '../../services/supabase';

export type Scenario = 'BASE' | 'HIGH' | 'LOW';

interface Contract {
    CV_i: number; // Contract Volume
    // other fields as needed
}

export interface FacilityData {
    FACILITY_STATUS: string;
    MEASUREMENT_POINT: string;
    P_IT_START: number;
    LF_ASSUMED: number;
    PUE_EXPECTED: number;
    facility_location?: string; // PostGIS EWKB hex (SRID 4326 Point)

    IT_LOAD: number;
    IT_CAP: number;
    PUE: number;
    ETA_UPS: number;
    ETA_PDU: number;
    P_COOL: number;
    P_FAC: number;
    BATT_CAP: number;

    DELTA_CAP_y: number[]; // Capacity additions by year
    UTIL_RAMP: number[]; // Cumulative utilization fraction at month m of year-of-addition y (10 yrs × 12 mo = 120 vals). Steady-state after year of addition = the December value of that year's curve.
    PUE_y: number[]; // PUE improvement by year
    RE_GEN_y: number[]; // Planned on-site renewable additions by year (MW) — replaces the old single-value GEN_CAP
    BATT_ADD_y: number[]; // Planned battery storage additions by year (MWh)
    g_IT: number; // Organic growth rate
    TEMP_AMB_monthly?: number[]; // Operator-entered 12 monthly average ambient temperatures (°C). When present and length=12, Phase 1 derives a per-month effective PUE from calcPPUE(T) + P_FAC/IT instead of broadcasting the flat form.PUE.

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

const MULT_HIGH = 1.25; // HIGH-scenario growth multiplier (+25% on g_IT and DELTA_CAP)
const MULT_LOW = 0.75;  // LOW-scenario growth multiplier (−25% on g_IT and DELTA_CAP)
const HOURS_PER_MONTH = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744]; // standard non-leap year, sums to 8760

// Parse UTIL_RAMP from the DB. New rows store 120 comma-separated cumulative-
// utilisation values (10 yrs × 12 mo). Legacy rows store a single monthly-
// increment value; expand those into the equivalent 120-cell linear ramp,
// capped per year by the legacy UTIL_y target so projections stay numerically
// equivalent until the user re-saves with a chart-edited curve.
function parseUtilRamp(str?: string, utilYStr?: string): number[] {
    if (!str) return [];
    const parts = str.split(',').map(s => s.trim()).filter(s => s !== ''); // Non-empty comma-separated tokens from the raw DB string
    if (parts.length === 0) return [];
    const nums = parts.map(s => Number(s)); // Numeric form of each token (NaN preserved for non-numerics)
    if (nums.length !== 1) return nums;
    const v = nums[0]; // Single legacy monthly-increment value to expand into 120 cells
    if (isNaN(v)) return [];
    const utilY = utilYStr ? utilYStr.split(',').map(s => Number(s.trim())) : []; // Legacy per-year utilisation caps (% by year, optional)
    const expanded: number[] = []; // 120-cell linear ramp (10 yrs × 12 mo) built below
    for (let y = 0; y < 10; y++) {
        const cap = !isNaN(utilY[y]) ? utilY[y] : 100; // Year-y utilisation ceiling (% — defaults to 100 if missing)
        for (let m = 0; m < 12; m++) {
            expanded.push(Math.min(cap, (m + 1) * v));
        }
    }
    return expanded;
}

function calcPPUE(T: number): number {
    return 7.1705e-5 * T * T + 0.0041 * T + 1.0743;
}

export interface HourlyForecastInputs {
    // Primary: 12 monthly IT load values, MW. Pass forecast.P_IT_PROJ['BASE'][0]
    // for the current year, or P_IT_PROJ[s][y] for any (scenario, year) cell.
    pItMonthly: number[];
    pFac?: number;                // Flat facility/aux load, MW.
    pGen?: number;                // Flat onsite generation capacity, MW.
    tempAmbHourly?: number[];     // 8760 °C — preferred when available (e.g. Open-Meteo archive).
    pGenHourly?: number[];        // Optional 8760 MW generation profile, overrides pGen per hour.
}

export interface HourlyForecastResult {
    pIt: number[];        // 8760
    ppue: number[];       // 8760
    pCooling: number[];   // 8760
    pGross: number[];     // 8760
    pGen: number[];       // 8760
    pNet: number[];       // 8760
}

// Hourly forecast of net grid import for a single (scenario, year) given that
// scenario-year's monthly P_IT. Within each month P_IT is held flat at the
// monthly mean; cooling varies hour-by-hour with ambient temperature through
// the pPUE polynomial. BESS dispatch is 0 to match calculateMultiYearForecast.
export function calculateHourlyForecast(inputs: HourlyForecastInputs): HourlyForecastResult {
    const totalHours = HOURS_PER_MONTH.reduce((s, v) => s + v, 0); // 8760 — total hours in a non-leap year

    const monthStarts: number[] = [0]; // Hour-of-year index at which each month begins (Jan=0, Feb=744, …)
    for (let i = 0; i < 11; i++) monthStarts.push(monthStarts[i] + HOURS_PER_MONTH[i]);

    const pFac = inputs.pFac ?? 0;     // Flat facility/aux load applied every hour (MW)
    const pGenFlat = inputs.pGen ?? 0; // Flat onsite generation fallback when no hourly profile (MW)
    const hasHourlyTemp = !!(inputs.tempAmbHourly && inputs.tempAmbHourly.length >= totalHours); // True iff the 8760-pt temperature archive is available

    const pIt = new Array<number>(totalHours);      // 8760-pt IT load series (MW)
    const ppue = new Array<number>(totalHours);     // 8760-pt partial PUE per hour
    const pCooling = new Array<number>(totalHours); // 8760-pt cooling power (MW)
    const pGross = new Array<number>(totalHours);   // 8760-pt gross facility draw (MW)
    const pGen = new Array<number>(totalHours);     // 8760-pt onsite generation (MW)
    const pNet = new Array<number>(totalHours);     // 8760-pt net grid import (MW)

    for (let m = 0; m < 12; m++) {
        const pItM = inputs.pItMonthly[m] || 0; // IT load for month m (MW), held flat within the month
        const hours = HOURS_PER_MONTH[m];       // Hours in month m (744/720/etc.)
        for (let i = 0; i < hours; i++) {
            const h = monthStarts[m] + i;                              // Absolute hour-of-year index
            const T = hasHourlyTemp ? inputs.tempAmbHourly![h] : 0;    // Ambient temp at hour h (°C); 0 fallback when archive absent
            const ppueH = calcPPUE(T);                                 // Partial PUE for this hour from temperature polynomial
            const coolH = pItM * (ppueH - 1);                          // Cooling power: IT × (pPUE − 1)
            const grossH = pItM + coolH + pFac;                        // Gross facility draw: IT + cooling + aux
            const genH = inputs.pGenHourly?.[h] ?? pGenFlat;           // Onsite generation: per-hour profile if provided, else flat fallback
            const netH = Math.max(0, grossH - genH);                   // Net grid import, clamped at 0 (no export modelled)

            pIt[h] = pItM;
            ppue[h] = ppueH;
            pCooling[h] = coolH;
            pGross[h] = grossH;
            pGen[h] = genH;
            pNet[h] = netH;
        }
    }

    return { pIt, ppue, pCooling, pGross, pGen, pNet };
}

export function calculateMultiYearForecast(data: FacilityData): ForecastResult {
    // ---------------------------------------------------------
    // Phase 1: Current State Calibration (y=0)
    // ---------------------------------------------------------

    let P_GROSS = Array(12).fill(0);
    let P_IT = Array(12).fill(0);
    let PUE_CALC = Array(12).fill(0);
    let IT_SHAPE = Array(12).fill(0); // Flat shape assumed if hourly data absent

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
        }
        // Case A (PDU Output / Rack): pit_val passes through unchanged.

        const pue = data.PUE || 1.0; // Effective PUE for a running facility (user-entered; defaults to 1.0)
        P_IT = Array(12).fill(pit_val);

        // Temp-aware path: per-month effective PUE driven by ambient temperature when the operator has supplied 12 monthly temps.
        const hasMonthlyTemps = !!(data.TEMP_AMB_monthly && data.TEMP_AMB_monthly.length === 12);
        if (hasMonthlyTemps && pit_val > 0) {
            const p_other = data.P_FAC || 0; // Lighting/general facilities load (MW), held flat across months
            P_GROSS = data.TEMP_AMB_monthly!.map(T => pit_val * calcPPUE(T) + p_other); // pPUE(T) drives cooling; constant aux added on top
            PUE_CALC = P_GROSS.map(g => g / pit_val); // Effective monthly PUE = gross / IT (matches form.PUE definition)
        } else {
            P_GROSS = Array(12).fill(pit_val * pue);
            PUE_CALC = Array(12).fill(pue);
        }
    } else {
        // Greenfield / New Facility
        const pit_start = data.P_IT_START || 0; // Expected IT load at commissioning (in MW) for the new greenfield facility

        P_IT = Array(12).fill(pit_start); // Monthly profile of initial IT load (flat baseline in MW)

        const assumed_pue = data.PUE_EXPECTED || 1.0; // Assumed design Power Usage Effectiveness (PUE) at commissioning

        // Temp-aware path: per-month effective PUE driven by ambient temperature when the operator has supplied 12 monthly temps.
        const hasMonthlyTemps = !!(data.TEMP_AMB_monthly && data.TEMP_AMB_monthly.length === 12);
        if (hasMonthlyTemps && pit_start > 0) {
            const p_other = data.P_FAC || 0;
            P_GROSS = data.TEMP_AMB_monthly!.map(T => pit_start * calcPPUE(T) + p_other);
            PUE_CALC = P_GROSS.map(g => g / pit_start);
        } else {
            P_GROSS = Array(12).fill(pit_start * assumed_pue);
            PUE_CALC = Array(12).fill(assumed_pue);
        }
    }

    // ---------------------------------------------------------
    // Phase 2: Forward Forecasting (y=1 to 10)
    // ---------------------------------------------------------
    const scenarios: Scenario[] = ['BASE', 'HIGH', 'LOW']; // Three scenarios computed side-by-side and returned as record-keyed arrays

    const results: ForecastResult = { // Accumulator populated below, returned to the caller
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

    const totalContractVol = (data.contracts || []).reduce((acc, c) => acc + (Number(c.CV_i) || 0), 0); // Sum of contracted capacity across all contracts (MW); compared against projected peaks for coverage

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

        const base_pue_proj: number[][] = []; // [year][month] PUE projection before any further hour-level adjustments
        const total_pit_hours_0 = P_IT.reduce((sum, p, m) => sum + p * HOURS_PER_MONTH[m], 0); // Year-0 IT energy: Σ P_IT[m] × hours[m] (MW·h)
        const total_hours_per_year = HOURS_PER_MONTH.reduce((s, h) => s + h, 0); // 8760 — total hours per year
        const p_it_avg_0 = total_hours_per_year > 0 ? total_pit_hours_0 / total_hours_per_year : 0; // Hour-weighted average year-0 IT load (MW), used as IT_SHAPE denominator
        IT_SHAPE = P_IT.map(p => (p_it_avg_0 > 0 ? p / p_it_avg_0 : 1.0));
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
                const rampArr = data.UTIL_RAMP || []; // 120-cell util ramp (Y1-Y10 × 12 months), in %
                let capacity_sum = 0;
                for (let j = 1; j <= y; j++) {
                    const delta_cap_j = y > 0 ? (delta_cap_s[j - 1] || 0) : 0; // adjusted capacity added in year j

                    // UTIL_RAMP[(j-1)*12 + k] is the cumulative utilisation fraction at month k of
                    // capacity-addition year j (always 120-cell after parsing). When j == y the
                    // capacity is still ramping at month m; when j < y it sits at the December
                    // value of year j's curve (the steady-state captured by the chart's last point).
                    const idx = (j - 1) * 12 + (j < y ? 11 : m); // Ramp index: live month m for the in-flight year, Dec steady-state for prior years
                    const v = rampArr[idx];                       // Cumulative utilisation % at that (year, month) cell
                    const util_j_y_m = (v === undefined || isNaN(v)) ? 0 : v / 100; // Utilisation as decimal (0 when cell missing/NaN)
                    capacity_sum += delta_cap_j * util_j_y_m;
                }
                let p_it_proj_m = (P_IT[m] * Math.pow(1 + g_IT_s, y)) + IT_SHAPE[m] * capacity_sum;
                results.P_IT_PROJ[s][y][m] = p_it_proj_m;
                // Step 6: Forecast PUE
                // Formula: PUE[m] = SUM(P_FACILITY[h] * delta_t) / SUM(P_IT[h] * delta_t)
                const pue_eff_improve = y > 0 ? (data.PUE_y?.[y - 1] || 0) : 0; // PUE efficiency improvement rate for the current year (from scenario/inputs)
                base_pue_proj[y][m] = 1 + (PUE_CALC[m] - 1) * (1 - pue_eff_improve);

                const pue_proj_m = base_pue_proj[y][m];           // Forecast PUE for (scenario s, year y, month m)
                const p_gross_proj_m = p_it_proj_m * pue_proj_m;  // Gross facility draw (MW) before onsite gen / BESS netting

                results.PUE_PROJ[s][y][m] = pue_proj_m;
                results.P_GROSS_PROJ[s][y][m] = p_gross_proj_m;

                // Step 8: Forecast Net Grid Import
                const p_gen_avg = (y > 0 ? data.RE_GEN_y?.[y - 1] : 0) || 0; // Planned on-site renewable generation for year y (MW)
                const p_bess_dis = 0; // BESS average discharge power (MW) — placeholder
                const p_bess_ch = (y > 0 ? data.BATT_ADD_y?.[y - 1] : 0) || 0; // BESS charging proxied by planned battery additions for year y (MW)
                const p_net_avg = Math.max(0, p_gross_proj_m - p_gen_avg - p_bess_dis + p_bess_ch); // Net grid import (in MW) after offsetting gross demand with onsite generation and BESS
                results.P_NET_AVG_MONTH[s][y][m] = p_net_avg;

                p_net_avg_sum += p_net_avg;

                // Step 9: Forecast Annual Energy
                e_annual_y += p_net_avg * HOURS_PER_MONTH[m];
            }

            results.E_ANNUAL_PROJ[s][y] = e_annual_y;

            // Step 10: Forecast Peak Demand
            // When LF_ASSUMED is supplied, each month's avg is inflated to a peak as avg/lf, and the
            // annual peak is the max of those. When LF_ASSUMED is missing, we don't have a basis to
            // inflate within-month — so the annual peak is taken as the highest monthly average, and
            // the effective load factor falls out as lf = annual_avg / annual_peak.
            const annual_avg = p_net_avg_sum / 12; // Annual mean of monthly net imports (MW)
            const monthly_avgs = results.P_NET_AVG_MONTH[s][y]; // 12 monthly net-import averages
            const max_monthly_avg = monthly_avgs.length > 0 ? Math.max(...monthly_avgs) : 0; // Highest of the 12 monthly averages (MW)

            let lf: number;          // Effective load factor used for this year (decimal)
            let p_net_peak_proj_y: number; // Annual peak demand (MW)
            if (data.LF_ASSUMED) {
                lf = data.LF_ASSUMED / 100;
                p_net_peak_proj_y = lf > 0 ? max_monthly_avg / lf : max_monthly_avg;
            } else {
                p_net_peak_proj_y = max_monthly_avg;
                lf = p_net_peak_proj_y > 0 ? annual_avg / p_net_peak_proj_y : 0; // Derived: lf = annual_avg / annual_peak
            }
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
                const alertMsg = `Alert A1: Projected peak demand (${p_net_peak_proj_y.toFixed(2)} MW) exceeds contracted capacity (${data.C_MAX} MW) in Year ${y} (Scenario: ${s})`; // Capacity-breach alert text (deduped by string match below)
                if (!results.ALERTS.includes(alertMsg)) {
                    results.ALERTS.push(alertMsg);
                }
            }

            // Uncontracted Exposure
            const uncont_exp = Math.max(0, p_net_peak_proj_y - totalContractVol); // Peak demand uncovered by existing contracts (MW); floored at 0
            results.UNCONT_EXP_PROJ[s][y] = uncont_exp;

            // Coverage Ratio
            const ccr = p_net_peak_proj_y > 0 ? totalContractVol / p_net_peak_proj_y : 1; // Contract coverage ratio (decimal); 1.0 fallback when peak is zero to avoid div/0 and false-positive shortfall alerts
            results.CCR_ANNUAL_PROJ[s][y] = ccr * 100;


            const cov_min = data.COV_MIN || 70; // Minimum acceptable coverage % from facility settings (defaults to 70% when unset)
            if ((ccr * 100) < cov_min) {
                const alertMsg = `Alert: Coverage Ratio drops below minimum ${cov_min}% in Year ${y} (Scenario: ${s})`; // Coverage-shortfall alert text
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
    // Supabase returns either an array of rows or an error; never both meaningfully populated.
    const { data, error } = await supabase
        .from('data_centers')
        .select('*')
        .eq('buyer_id', buyerId);

    if (error || !data) {
        console.error('Failed to fetch facilities:', error);
        return [];
    }

    const parseNumArray = (str?: string) => { // Parse a comma-separated DB string into number[]; blank cells become undefined so downstream `[i] || 0` works
        if (!str) return [];
        return str.split(',').map(s => {
            const trimmed = s.trim(); // Token with surrounding whitespace stripped
            return trimmed === '' ? undefined : Number(trimmed);
        }) as number[];
    };

    return data.map((row: any) => ({
        id: String(row.id),
        name: row.FAC_ID || `Facility ${row.id}`,
        data: {
            ...row,
            DELTA_CAP_y: parseNumArray(row.DELTA_CAP_y),
            UTIL_RAMP: parseUtilRamp(row.UTIL_RAMP, row.UTIL_y),
            PUE_y: parseNumArray(row.PUE_y),
            RE_GEN_y: parseNumArray(row.RE_GEN_y),
            BATT_ADD_y: parseNumArray(row.BATT_ADD_y),
            TEMP_AMB_monthly: parseNumArray(row.TEMP_AMB_monthly),
            contracts: typeof row.contracts === 'string'
                ? JSON.parse(row.contracts)
                : (row.contracts || []),
        } as FacilityData,
    }));
}

