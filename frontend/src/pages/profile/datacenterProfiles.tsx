import { useState, useEffect, useMemo } from 'react';

type Contract = {
  CTYPE_i: string;
  CV_i: string;
  CP_i: string;
  CS_i: string;
  CE_i: string;
  C_SHAPE_i: string;
  C_RE_i: string;
};

type FacilityFormData = {
  FACILITY_STATUS: string;
  MEASUREMENT_POINT: string;
  P_IT_START: string;
  LF_ASSUMED: string;
  PUE_EXPECTED: string;

  // Section A — Facility Identity and Grid Connection
  FAC_ID: string;
  facility_location: string; // PostGIS EWKB hex string (SRID 4326 Point)
  ISO: string;
  UTIL: string;
  V_CONN: string;
  POD_ID: string;
  C_MAX: string;
  IC_EXP: string;

  // Section B — Current IT Load and Power Infrastructure
  IT_LOAD: string;
  IT_CAP: string;
  PUE: string;
  ETA_UPS: string;
  ETA_PDU: string;
  P_COOL: string;
  P_FAC: string;
  BATT_CAP: string;
  HIST_MW: File | null;
  TEMP_AMB_monthly: string; // CSV of 12 monthly avg ambient temps (°C). Optional; when all 12 are filled, the forecast computes per-month pPUE from the polynomial.

  // Section BESS — Battery Energy Storage System
  BESS_FILL_RATE_MAX: string;   // MW
  BESS_DRAW_RATE_MAX: string;   // MW
  BESS_RT_LOSS_PCT: string;     // % round-trip loss
  BESS_CAPACITY_MW: string;     // MW
  BESS_MAX_STORAGE_MWH: string; // MWh
  BESS_YEARS_REMAINING: string; // years
  BTM: boolean;                 // auto: true if any BESS field is filled

  // Section C — Capacity Expansion Plans
  DELTA_CAP_y: string;
  UTIL_RAMP: string;
  PUE_y: string;
  RE_GEN_y: string;
  BATT_ADD_y: string;
  g_IT: string;
  SCENARIO: string;

  // Section D — Existing Power Contracts (dynamic list)
  contracts: Contract[];

  // Section E — Organisational KPIs and Targets
  BUDGET: string;
  RE_TARGET: string;
  CI_TARGET: string;
  RISK_MAX: string;
  PREF_TERM: string;
  COV_MIN: string;
  GO_LIVE: string;

  // Section F — Third-Party Market Data Inputs
  DA_PRICE: File | null;
  FWD_CURVE: File | null;
  LMP: File | null;
  CAP_PRICE: string;
  PPA_BM: string;
  REC_PRICE: string;
  TARIFF: File | null;
  CI_GRID: string;
  TEMP: File | null;
  RE_GEN_P: File | null;
};

const EMPTY_CONTRACT: Contract = {
  CTYPE_i: '',
  CV_i: '',
  CP_i: '',
  CS_i: '',
  CE_i: '',
  C_SHAPE_i: 'Flat',
  C_RE_i: '',
};

const INITIAL_FORM: FacilityFormData = {
  FACILITY_STATUS: 'Running',
  MEASUREMENT_POINT: 'UPS Input',
  P_IT_START: '',
  LF_ASSUMED: '',
  PUE_EXPECTED: '',

  FAC_ID: '',
  facility_location: '',
  ISO: '',
  UTIL: '',
  V_CONN: '',
  POD_ID: '',
  C_MAX: '',
  IC_EXP: '',

  IT_LOAD: '',
  IT_CAP: '',
  PUE: '',
  ETA_UPS: '',
  ETA_PDU: '',
  P_COOL: '',
  P_FAC: '',
  BATT_CAP: '',
  HIST_MW: null,
  TEMP_AMB_monthly: '',

  BESS_FILL_RATE_MAX: '',
  BESS_DRAW_RATE_MAX: '',
  BESS_RT_LOSS_PCT: '',
  BESS_CAPACITY_MW: '',
  BESS_MAX_STORAGE_MWH: '',
  BESS_YEARS_REMAINING: '',
  BTM: false,

  DELTA_CAP_y: '',
  UTIL_RAMP: '',
  PUE_y: '',
  RE_GEN_y: '',
  BATT_ADD_y: '',
  g_IT: '',
  SCENARIO: 'Base',

  contracts: [{ ...EMPTY_CONTRACT }],

  BUDGET: '',
  RE_TARGET: '',
  CI_TARGET: '',
  RISK_MAX: '',
  PREF_TERM: '',
  COV_MIN: '',
  GO_LIVE: '',

  DA_PRICE: null,
  FWD_CURVE: null,
  LMP: null,
  CAP_PRICE: '',
  PPA_BM: '',
  REC_PRICE: '',
  TARIFF: null,
  CI_GRID: '',
  TEMP: null,
  RE_GEN_P: null,
};

import { useAuth } from '../../contexts/AuthContext';
import UtilRampCurveEditor, { YEARS as UTIL_RAMP_YEARS, YEAR_COLORS as UTIL_RAMP_YEAR_COLORS } from './UtilRampCurveEditor';
import YearlyMetricCurveEditor from './YearlyMetricCurveEditor';
import LocationAutocomplete from './LocationAutocomplete';
import WeatherPanel from './WeatherPanel';
import { toEwkbHex, ewkbToPoint, pointToEWKB } from './ewkb';
import { useHourlyArchive } from '../../hooks/useHourlyArchive';
import {
  fitQuadratic,
  setPpueCoefficients,
  getPpueCoefficients,
  resetPpueCoefficients,
} from './loadCalculation';

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-500';
const labelCls =
  'text-[10px] font-semibold text-slate-700 uppercase tracking-widest';
const sectionCls =
  'bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6';

// ── Validation Rules ──────────────────────────────────────────────────────────
type FieldRule = { min?: number; max?: number; msg: string };
const FIELD_RULES: Partial<Record<keyof FacilityFormData, FieldRule>> = {
  V_CONN: { min: 0.1, max: 765, msg: 'Voltage: 0.1 – 765 kV' },
  C_MAX: { min: 0.1, max: 5000, msg: 'Capacity: 0.1 – 5,000 MW' },
  IT_LOAD: { min: 0, max: 1000, msg: 'IT load: 0 – 1,000 MW' },
  IT_CAP: { min: 0, max: 1000, msg: 'IT capacity: 0 – 1,000 MW' },
  PUE: { min: 1.0, max: 4.0, msg: 'PUE: 1.0 – 4.0' },
  ETA_UPS: { min: 50, max: 100, msg: 'UPS efficiency: 50 – 100 %' },
  ETA_PDU: { min: 50, max: 100, msg: 'PDU efficiency: 50 – 100 %' },
  P_COOL: { min: 0, max: 1000, msg: 'Cooling: 0 – 1,000 MW' },
  P_FAC: { min: 0, max: 500, msg: 'Facilities power: 0 – 500 MW' },
  BATT_CAP: { min: 0, max: 10000, msg: 'Battery: 0 – 10,000 MWh' },
  BESS_FILL_RATE_MAX: { min: 0, max: 5000, msg: 'Fill rate: 0 – 5,000 MW' },
  BESS_DRAW_RATE_MAX: { min: 0, max: 5000, msg: 'Draw rate: 0 – 5,000 MW' },
  BESS_RT_LOSS_PCT: { min: 0, max: 100, msg: 'R/T loss: 0 – 100 %' },
  BESS_CAPACITY_MW: { min: 0, max: 5000, msg: 'Capacity: 0 – 5,000 MW' },
  BESS_MAX_STORAGE_MWH: { min: 0, max: 100000, msg: 'Max storage: 0 – 100,000 MWh' },
  BESS_YEARS_REMAINING: { min: 0, max: 50, msg: 'Years remaining: 0 – 50' },
  P_IT_START: { min: 0.01, max: 1000, msg: 'IT load at commissioning: 0.01 – 1,000 MW' },
  LF_ASSUMED: { min: 1, max: 100, msg: 'Load factor: 1 – 100 %' },
  PUE_EXPECTED: { min: 1.0, max: 4.0, msg: 'Expected PUE: 1.0 – 4.0' },
  g_IT: { min: -50, max: 200, msg: 'Growth rate: −50 – 200 %' },
  BUDGET: { min: 0, max: 2000, msg: 'Budget: $0 – $2,000/MWh' },
  RE_TARGET: { min: 0, max: 100, msg: 'RE target: 0 – 100 %' },
  CI_TARGET: { min: 0, max: 1000, msg: 'CI target: 0 – 1,000 gCO₂/kWh' },
  RISK_MAX: { min: 0, max: 100, msg: 'Risk tolerance: 0 – 100 %' },
  PREF_TERM: { min: 0.5, max: 30, msg: 'Tenor: 0.5 – 30 years' },
  COV_MIN: { min: 0, max: 100, msg: 'Coverage ratio: 0 – 100 %' },
  CAP_PRICE: { min: 0, max: 5000, msg: 'Capacity price: $0 – $5,000/MW-day' },
  PPA_BM: { min: 0, max: 500, msg: 'PPA benchmark: $0 – $500/MWh' },
  REC_PRICE: { min: 0, max: 200, msg: 'REC price: $0 – $200/MWh' },
  CI_GRID: { min: 0, max: 1000, msg: 'Grid CI: 0 – 1,000 gCO₂/kWh' },
};

// Tooltip body shown next to the CSV upload control for any 10-year vector
// field (DELTA_CAP_y, PUE_y, RE_GEN_y, BATT_ADD_y).
const CSV_TOOLTIP_YEARLY = (unit: string) =>
  `Upload a CSV with 10 numeric values (Y1–Y10) in ${unit}. ` +
  `Accepted layouts: one value per row, or a single comma-separated row. ` +
  `Non-numeric tokens are ignored; extra values past Y10 are dropped.`;

// Tooltip body shown next to the CSV upload control for UTIL_RAMP, which is
// a 10-year × 12-month grid (120 values total).
const CSV_TOOLTIP_UTIL_RAMP =
  'Upload a CSV with a 10 × 12 grid: each row is a year (Y1–Y10) and each ' +
  'column is a month (Jan–Dec), values in %. A flat list of 120 numeric ' +
  'values in year-major order is also accepted. Header rows of text are ignored.';

// Expand a legacy single-value UTIL_RAMP (e.g. "20") into a 120-cell linear
// ramp matching the old calculation semantics: month m → min(cap, (m+1)*v),
// where cap is the legacy UTIL_y[year] target (default 100). Repeats per year.
// Already-120-cell values pass through unchanged.
function expandLegacyUtilRamp(raw: string, utilYRaw: string): string {
  if (!raw) return '';
  const parts = raw.split(',').map(s => s.trim()).filter(s => s !== '');
  if (parts.length !== 1) return raw;
  const v = Number(parts[0]);
  if (isNaN(v)) return '';
  const utilYParts = utilYRaw ? utilYRaw.split(',').map(s => s.trim()) : [];
  const expanded: string[] = [];
  for (let y = 0; y < 10; y++) {
    const capRaw = utilYParts[y];
    const cap = capRaw && capRaw !== '' && !isNaN(Number(capRaw)) ? Number(capRaw) : 100;
    for (let m = 0; m < 12; m++) {
      expanded.push(String(Math.min(cap, (m + 1) * v)));
    }
  }
  return expanded.join(', ');
}

// Map a raw DB row to FacilityFormData
function dbRowToForm(row: any): FacilityFormData {
  const contracts =
    typeof row.contracts === 'string'
      ? JSON.parse(row.contracts)
      : Array.isArray(row.contracts)
        ? row.contracts
        : [{ ...EMPTY_CONTRACT }];

  const toStr = (val: any) => (val === null || val === undefined ? '' : String(val));

  return {
    FACILITY_STATUS: row.FACILITY_STATUS ?? 'Running',
    MEASUREMENT_POINT: row.MEASUREMENT_POINT ?? 'UPS Input',
    P_IT_START: toStr(row.P_IT_START),
    LF_ASSUMED: toStr(row.LF_ASSUMED),
    PUE_EXPECTED: toStr(row.PUE_EXPECTED),
    FAC_ID: row.FAC_ID ?? '',
    facility_location: toEwkbHex(row.facility_location),
    ISO: row.ISO ?? '',
    UTIL: row.UTIL ?? '',
    V_CONN: toStr(row.V_CONN),
    POD_ID: row.POD_ID ?? '',
    C_MAX: toStr(row.C_MAX),
    IC_EXP: row.IC_EXP ?? '',
    IT_LOAD: toStr(row.IT_LOAD),
    IT_CAP: toStr(row.IT_CAP),
    PUE: toStr(row.PUE),
    ETA_UPS: toStr(row.ETA_UPS),
    ETA_PDU: toStr(row.ETA_PDU),
    P_COOL: toStr(row.P_COOL),
    P_FAC: toStr(row.P_FAC),
    BATT_CAP: toStr(row.BATT_CAP),
    HIST_MW: null,
    TEMP_AMB_monthly: toStr(row.TEMP_AMB_monthly),
    BESS_FILL_RATE_MAX: toStr(row.BESS_FILL_RATE_MAX),
    BESS_DRAW_RATE_MAX: toStr(row.BESS_DRAW_RATE_MAX),
    BESS_RT_LOSS_PCT: toStr(row.BESS_RT_LOSS_PCT),
    BESS_CAPACITY_MW: toStr(row.BESS_CAPACITY_MW),
    BESS_MAX_STORAGE_MWH: toStr(row.BESS_MAX_STORAGE_MWH),
    BESS_YEARS_REMAINING: toStr(row.BESS_YEARS_REMAINING),
    BTM: row.BTM === true || row.BTM === 'true',
    DELTA_CAP_y: toStr(row.DELTA_CAP_y),
    UTIL_RAMP: expandLegacyUtilRamp(toStr(row.UTIL_RAMP), toStr(row.UTIL_y)),
    PUE_y: toStr(row.PUE_y),
    RE_GEN_y: toStr(row.RE_GEN_y),
    BATT_ADD_y: toStr(row.BATT_ADD_y),
    g_IT: toStr(row.g_IT),
    SCENARIO: row.SCENARIO ?? 'Base',
    contracts: contracts.length > 0 ? contracts : [{ ...EMPTY_CONTRACT }],
    BUDGET: toStr(row.BUDGET),
    RE_TARGET: toStr(row.RE_TARGET),
    CI_TARGET: toStr(row.CI_TARGET),
    RISK_MAX: toStr(row.RISK_MAX),
    PREF_TERM: toStr(row.PREF_TERM),
    COV_MIN: toStr(row.COV_MIN),
    GO_LIVE: row.GO_LIVE ?? '',
    DA_PRICE: null,
    FWD_CURVE: null,
    LMP: null,
    CAP_PRICE: toStr(row.CAP_PRICE),
    PPA_BM: toStr(row.PPA_BM),
    REC_PRICE: toStr(row.REC_PRICE),
    TARIFF: null,
    CI_GRID: toStr(row.CI_GRID),
    TEMP: null,
    RE_GEN_P: null,
  };
}

export default function FacilityProfile({ onSaved, initialFacilityId, facilityId }: { onSaved?: (facilityId: string) => void; initialFacilityId?: string | null; facilityId?: string | null } = {}) {
  const { user } = useAuth();
  const [form, setFormRaw] = useState<FacilityFormData>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FacilityFormData, string>>>({});
  // Multi-facility
  const [facilities, setFacilities] = useState<{ id: string; name: string; row: any }[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  // Selected outer facility record — drives Section A pre-fill
  const [facilityRecord, setFacilityRecord] = useState<any>(null);
  // Resolved lat/lng for the outer facility (PostGIS or forward-geocoded text location)
  const [facilityCoords, setFacilityCoords] = useState<{ lat: number; lng: number } | null>(null);
  // UTIL_RAMP chart legend/control state (lifted out of the chart so the legend
  // can sit between the DELTA_CAP_y and UTIL_RAMP charts).
  const [utilRampVisible, setUtilRampVisible] = useState<boolean[]>(() => Array(UTIL_RAMP_YEARS).fill(true));
  const [utilRampPropagate, setUtilRampPropagate] = useState(false);
  // Input mode for the yearly-by-year plan fields in Section C. 'graph' uses
  // the drag-editable curve; 'manual' renders per-year numeric inputs; 'csv'
  // accepts a CSV upload whose numeric values are flattened into the same
  // comma-separated string the other modes produce.
  const [planMode, setPlanMode] = useState<'graph' | 'manual' | 'csv'>('manual');

  useEffect(() => {
    if (!user?.id) { setLoadingFacilities(false); return; }
    setLoadingFacilities(true);
    const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';
    let url = `${API_URL}/datacenters?buyer_id=${user.id}`;
    if (facilityId) url += `&facility_id=${facilityId}`;
    fetch(url)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const list = data.map((row: any) => ({
            id: row.id,
            name: row.FAC_ID || `Data Center ${row.id}`,
            row,
          }));
          setFacilities(list);
          const focus =
            (initialFacilityId && list.find((f: any) => String(f.id) === String(initialFacilityId))) ||
            list[0];
          setActiveFacilityId(focus.id);
          setFormRaw(dbRowToForm(focus.row));
        } else {
          setFacilities([]);
          setActiveFacilityId(null);
          setFormRaw(INITIAL_FORM);
        }
        setLoadingFacilities(false);
      })
      .catch(() => setLoadingFacilities(false));
  }, [user?.id, initialFacilityId, facilityId]);

  // Fetch the outer facility's record and resolve coordinates whenever facilityId changes.
  // Coordinates are resolved regardless of which DC tab is active so WeatherPanel
  // always has a location to work with even when the DC itself has no saved coords.
  useEffect(() => {
    if (!facilityId) { setFacilityRecord(null); setFacilityCoords(null); return; }
    const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';
    fetch(`${API_URL}/facilities/${facilityId}`)
      .then(r => r.ok ? r.json() : { data: null })
      .then(({ data }) => {
        setFacilityRecord(data ?? null);
        if (!data) { setFacilityCoords(null); return; }
        // Prefer the stored PostGIS point
        const ewkb = toEwkbHex(data.facility_location);
        if (ewkb) { setFacilityCoords(ewkbToPoint(ewkb)); return; }
        // Fall back to forward-geocoding the text address
        const query = [data.city, data.state, data.country].filter(Boolean).join(', ');
        if (!query) { setFacilityCoords(null); return; }
        fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
          { headers: { 'Accept-Language': 'en' } },
        )
          .then(r => r.ok ? r.json() : [])
          .then((results: { lat: string; lon: string }[]) => {
            if (results.length > 0) {
              setFacilityCoords({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
            } else {
              setFacilityCoords(null);
            }
          })
          .catch(() => setFacilityCoords(null));
      })
      .catch(() => { setFacilityRecord(null); setFacilityCoords(null); });
  }, [facilityId]);

  // When the outer facility changes while in "new DC" mode, update Section A.
  // facilityCoords is already resolved by the fetch effect above.
  // NOTE: loadingFacilities is in the dependency array intentionally — the data_centers
  // fetch calls setFormRaw(INITIAL_FORM) when it finds no DCs, which would wipe any
  // pre-fill we applied. By waiting for loadingFacilities=false before running, we
  // guarantee this effect always fires AFTER the data_centers fetch settles.
  useEffect(() => {
    if (loadingFacilities) return;                    // wait for DC fetch to finish
    if (!facilityRecord || activeFacilityId !== null) return;
    const locationEwkb = toEwkbHex(facilityRecord.facility_location)
      || (facilityCoords ? pointToEWKB(facilityCoords.lng, facilityCoords.lat) : '');
    setFormRaw(prev => ({
      ...prev,
      FAC_ID: facilityRecord.name ?? prev.FAC_ID,
      facility_location: locationEwkb || prev.facility_location,
      ISO: facilityRecord.iso_rto ?? prev.ISO,
      UTIL: facilityRecord.utility ?? prev.UTIL,
      V_CONN: facilityRecord.grid_voltage_kv != null ? String(facilityRecord.grid_voltage_kv) : prev.V_CONN,
      POD_ID: facilityRecord.settlement_node_id ?? prev.POD_ID,
      C_MAX: facilityRecord.contracted_capacity_mw != null ? String(facilityRecord.contracted_capacity_mw) : prev.C_MAX,
      IC_EXP: facilityRecord.interconnection_expiry ?? prev.IC_EXP,
    }));
  }, [facilityRecord, activeFacilityId, facilityCoords, loadingFacilities]);


  const selectFacility = (id: string | null) => {
    setActiveFacilityId(id);
    setErrors({});
    if (id === null) {
      // New DC: pre-fill Section A from the outer facility
      const prefill = facilityRecord ? {
        FAC_ID: facilityRecord.name ?? '',
        facility_location: toEwkbHex(facilityRecord.facility_location)
          || (facilityCoords ? pointToEWKB(facilityCoords.lng, facilityCoords.lat) : ''),
        ISO: facilityRecord.iso_rto ?? '',
        UTIL: facilityRecord.utility ?? '',
        V_CONN: facilityRecord.grid_voltage_kv != null ? String(facilityRecord.grid_voltage_kv) : '',
        POD_ID: facilityRecord.settlement_node_id ?? '',
        C_MAX: facilityRecord.contracted_capacity_mw != null ? String(facilityRecord.contracted_capacity_mw) : '',
        IC_EXP: facilityRecord.interconnection_expiry ?? '',
      } : {};
      setFormRaw({ ...INITIAL_FORM, ...prefill });
    } else {
      const fac = facilities.find((f) => f.id === id);
      if (fac) setFormRaw(dbRowToForm(fac.row));
    }
  };

  // DC's own EWKB takes priority; fall back to the outer facility's geocoded coords.
  // Used by WeatherPanel and MonthlyTempPanel so they always have a location.
  const effectiveFacilityLocation = useMemo(
    () => form.facility_location
      || (facilityCoords ? pointToEWKB(facilityCoords.lng, facilityCoords.lat) : ''),
    [form.facility_location, facilityCoords],
  );

  // Auto-calculate PUE based on (p_total_facility / p_it)
  useEffect(() => {
    if (form.FACILITY_STATUS !== 'Running') return;

    const rawItNum = Number(form.IT_LOAD) || 0;
    const etaUps = form.ETA_UPS !== '' ? Number(form.ETA_UPS) / 100 : 0.97;
    const etaPdu = form.ETA_PDU !== '' ? Number(form.ETA_PDU) / 100 : 0.98;

    let itNum = rawItNum;
    if (form.MEASUREMENT_POINT === 'UPS Input') {
      itNum = rawItNum * etaUps * etaPdu;
    } else if (form.MEASUREMENT_POINT === 'PDU Input') {
      itNum = rawItNum * etaPdu;
    }

    const coolNum = Number(form.P_COOL) || 0;
    const facNum = Number(form.P_FAC) || 0;

    if (itNum > 0) {
      const expectedPue = (rawItNum + coolNum + facNum) / itNum;
      const expectedPueStr = expectedPue.toFixed(2);
      if (form.PUE !== expectedPueStr) {
        setFormRaw((prev) => ({ ...prev, PUE: expectedPueStr }));
        setErrors((prev) => {
          const n = { ...prev };
          delete n.PUE;
          return n;
        });
      }
    } else {
      if (form.PUE !== '') {
        setFormRaw((prev) => ({ ...prev, PUE: '' }));
      }
    }
  }, [form.IT_LOAD, form.P_COOL, form.P_FAC, form.FACILITY_STATUS, form.MEASUREMENT_POINT, form.ETA_UPS, form.ETA_PDU]);

  // BTM is true whenever any BESS field has a non-empty value
  useEffect(() => {
    const hasBess = [
      form.BESS_FILL_RATE_MAX,
      form.BESS_DRAW_RATE_MAX,
      form.BESS_RT_LOSS_PCT,
      form.BESS_CAPACITY_MW,
      form.BESS_MAX_STORAGE_MWH,
      form.BESS_YEARS_REMAINING,
    ].some(v => v !== '');
    if (form.BTM !== hasBess) {
      setFormRaw(prev => ({ ...prev, BTM: hasBess }));
    }
  }, [form.BESS_FILL_RATE_MAX, form.BESS_DRAW_RATE_MAX, form.BESS_RT_LOSS_PCT,
      form.BESS_CAPACITY_MW, form.BESS_MAX_STORAGE_MWH, form.BESS_YEARS_REMAINING]);

  // Validate a single numeric field against FIELD_RULES
  const validateField = <K extends keyof FacilityFormData>(key: K, value: FacilityFormData[K]) => {
    const rule = FIELD_RULES[key];
    if (!rule || typeof value !== 'string' || value === '') {
      setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    const num = Number(value);
    if (isNaN(num)) {
      setErrors((prev) => ({ ...prev, [key]: 'Enter a valid number' }));
      return;
    }
    if (rule.min !== undefined && num < rule.min) {
      setErrors((prev) => ({ ...prev, [key]: `Out of range — ${rule.msg}` }));
      return;
    }
    if (rule.max !== undefined && num > rule.max) {
      setErrors((prev) => ({ ...prev, [key]: `Out of range — ${rule.msg}` }));
      return;
    }
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  // Unified setter that also validates
  const setField = <K extends keyof FacilityFormData>(key: K, value: FacilityFormData[K]) => {
    setFormRaw((prev) => ({ ...prev, [key]: value }));
    validateField(key, value);
  };

  const setContractField = (
    idx: number,
    key: keyof Contract,
    value: string,
  ) => {
    setFormRaw((prev) => {
      const next = [...prev.contracts];
      next[idx] = { ...next[idx], [key]: value };
      return { ...prev, contracts: next };
    });
  };

  const addContract = () => {
    setFormRaw((prev) => ({
      ...prev,
      contracts: [...prev.contracts, { ...EMPTY_CONTRACT }],
    }));
  };

  const removeContract = (idx: number) => {
    setFormRaw((prev) => ({
      ...prev,
      contracts: prev.contracts.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Block submit if any validation errors remain
    if (Object.keys(errors).length > 0) {
      alert('Please fix the highlighted field errors before saving.');
      return;
    }
    try {
      const payload: any = { ...form, buyer_id: user?.id, ...(facilityId ? { facility_id: facilityId } : {}) };
      // HIST_MW is uploaded separately to S3 after the profile is saved (the
      // backend's /:id/hist-mw route writes the S3 key into the DB). Other
      // file-typed fields are still stubbed to a filename until they get
      // their own upload routes.
      const histMwFile: File | null = payload.HIST_MW instanceof File ? payload.HIST_MW : null;
      const fileKeys = ['HIST_MW', 'DA_PRICE', 'FWD_CURVE', 'LMP', 'TARIFF', 'TEMP', 'RE_GEN_P'];
      fileKeys.forEach((key) => {
        if (key === 'HIST_MW') {
          // Always drop the File from the JSON body; if no new file was picked,
          // leaving the field out preserves any existing S3 key already in the DB.
          delete payload[key];
        } else if (payload[key] instanceof File) {
          payload[key] = payload[key].name;
        } else if (payload[key] === null) {
          delete payload[key];
        }
      });
      Object.keys(payload).forEach((key) => { if (payload[key] === '') payload[key] = null; });
      if (Array.isArray(payload.contracts)) {
        payload.contracts = payload.contracts.map((c: any) => {
          const s = { ...c };
          Object.keys(s).forEach((k) => { if (s[k] === '') s[k] = null; });
          return s;
        });
      }
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const isEditing = activeFacilityId !== null;
      const url = isEditing ? `${API_URL}/datacenters/${activeFacilityId}` : `${API_URL}/datacenters/submit`;
      const method = isEditing ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to save to database');
      const saved = await response.json().catch(() => ({}));
      const updatedName = payload.FAC_ID || (isEditing ? activeFacilityId! : 'New Facility');
      let savedId: string;
      if (isEditing) {
        savedId = activeFacilityId!;
        setFacilities((prev) =>
          prev.map((f) => f.id === activeFacilityId ? { ...f, name: updatedName, row: { ...f.row, ...payload } } : f)
        );
      } else {
        const newId = saved?.id || saved?.data?.id || saved?.data?.[0]?.id || String(Date.now());
        savedId = newId;
        const newEntry = { id: newId, name: updatedName, row: { ...payload, id: newId } };
        setFacilities((prev) => [...prev, newEntry]);
        setActiveFacilityId(newId);
      }

      // After the profile row exists, push the HIST_MW CSV to S3. The backend
      // writes the resulting S3 key into data_centers.HIST_MW itself, so we
      // don't need to re-PUT the profile here.
      if (histMwFile) {
        try {
          const token = localStorage.getItem('pd_access_token');
          const formData = new FormData();
          formData.append('file', histMwFile);
          const uploadRes = await fetch(`${API_URL}/datacenters/${savedId}/hist-mw`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: formData,
          });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            console.error('HIST_MW upload failed:', err);
            alert(
              `Facility profile saved, but historical meter data upload failed: ${err.error || 'unknown error'}. You can re-upload the CSV by editing the facility.`,
            );
          } else {
            const uploadJson = await uploadRes.json().catch(() => ({}));
            // Reflect the new S3 key in local facility state so a subsequent
            // save without re-picking a file doesn't think it's missing.
            setFacilities((prev) =>
              prev.map((f) =>
                f.id === savedId ? { ...f, row: { ...f.row, HIST_MW: uploadJson.key } } : f,
              ),
            );
            setFormRaw((prev) => ({ ...prev, HIST_MW: null }));
          }
        } catch (uploadErr) {
          console.error('HIST_MW upload error:', uploadErr);
          alert(
            'Facility profile saved, but historical meter data upload failed. You can re-upload the CSV by editing the facility.',
          );
        }
      }

      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
      onSaved?.(savedId);
    } catch (error) {
      console.error('Submission error:', error);
      alert('Error saving facility profile');
    }
  };

  const handleDelete = async () => {
    if (!activeFacilityId) return;
    const facName = facilities.find((f) => f.id === activeFacilityId)?.name || 'this facility';
    if (!window.confirm(`Delete "${facName}"? This cannot be undone.`)) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${API_URL}/datacenters/${activeFacilityId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete from database');
      const remaining = facilities.filter((f) => f.id !== activeFacilityId);
      setFacilities(remaining);
      setErrors({});
      if (remaining.length > 0) {
        setActiveFacilityId(remaining[0].id);
        setFormRaw(dbRowToForm(remaining[0].row));
      } else {
        setActiveFacilityId(null);
        setFormRaw(INITIAL_FORM);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Error deleting facility');
    }
  };

  if (loadingFacilities) {
    return <div className="p-8 text-sm text-slate-500">Loading facilities...</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Datacenter selector bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        {/* Left: associated datacenter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
            Data Centers
          </span>
          {facilities.length === 0 ? (
            <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'Inter, sans-serif', fontStyle: 'italic' }}>None yet</span>
          ) : (
            facilities.map((fac) => (
              <button
                key={fac.id}
                type="button"
                id={`facility-tab-${fac.id}`}
                onClick={() => selectFacility(fac.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '9999px',
                  border: activeFacilityId === fac.id ? '1.5px solid #0d9488' : '1.5px solid #e2e8f0',
                  background: activeFacilityId === fac.id ? '#f0fdfa' : '#ffffff',
                  color: activeFacilityId === fac.id ? '#0d9488' : '#64748b',
                  fontSize: 13,
                  fontWeight: activeFacilityId === fac.id ? 600 : 400,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: activeFacilityId === fac.id ? '0 1px 6px rgba(13,148,136,0.12)' : 'none',
                }}
              >
                {fac.name || 'Unnamed Data Center'}
              </button>
            ))
          )}
        </div>
        {/* Right: add button */}
        <button
          type="button"
          id="facility-tab-new"
          onClick={() => selectFacility(null)}
          style={{
            padding: '6px 16px',
            borderRadius: '9999px',
            border: activeFacilityId === null ? '1.5px solid #6366f1' : '1.5px dashed #cbd5e1',
            background: activeFacilityId === null ? '#eef2ff' : '#ffffff',
            color: activeFacilityId === null ? '#6366f1' : '#94a3b8',
            fontSize: 13,
            fontWeight: activeFacilityId === null ? 600 : 400,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + New Data Center
        </button>
      </div>
      {/* Gateway Section */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Gateway: Facility Status
        </h2>
        <p className="text-xs text-slate-400 mb-5">
          Is this an existing operational facility or a new facility currently in the planning/commissioning phase?
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Facility Status">
            <select
              value={form.FACILITY_STATUS}
              onChange={(e) => setField('FACILITY_STATUS', e.target.value)}
              className={inputCls}
            >
              <option value="Running">Brownfield</option>
              <option value="New">Greenfield</option>
            </select>
          </Field>
        </div>
      </section>

      {/* Section A */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Section A — Facility Identity and Grid Connection
        </h2>
        <p className="text-xs text-slate-400 mb-5">Operator-entered</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Facility name / ID" symbol="FAC_ID">
            <input
              type="text"
              placeholder="e.g. Ashburn-1"
              value={form.FAC_ID}
              onChange={(e) => setField('FAC_ID', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Location" symbol="facility_location">
            <LocationAutocomplete
              value={form.facility_location}
              onChange={(ewkb) => setField('facility_location', ewkb)}
              className={inputCls}
              placeholder="Type a facility address…"
              defaultText={facilityRecord ? [facilityRecord.city, facilityRecord.state, facilityRecord.country].filter(Boolean).join(', ') : undefined}
            />
          </Field>
          <Field label="ISO / RTO region" symbol="ISO">
            <select
              value={form.ISO}
              onChange={(e) => setField('ISO', e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              <option>PJM</option>
              <option>MISO</option>
              <option>ERCOT</option>
              <option>CAISO</option>
              <option>NYISO</option>
              <option>ISO-NE</option>
              <option>SPP</option>
            </select>
          </Field>
          <Field label="Utility provider" symbol="UTIL">
            <input
              type="text"
              placeholder="e.g. Dominion Energy"
              value={form.UTIL}
              onChange={(e) => setField('UTIL', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Grid connection voltage (kV)" symbol="V_CONN" error={errors.V_CONN}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 230"
              value={form.V_CONN}
              onChange={(e) => setField('V_CONN', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Settlement node (POD) ID" symbol="POD_ID">
            <input
              type="text"
              placeholder="e.g. Pnode-1234"
              value={form.POD_ID}
              onChange={(e) => setField('POD_ID', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Contracted grid import capacity (MW)" symbol="C_MAX" error={errors.C_MAX}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 50.0"
              value={form.C_MAX}
              onChange={(e) => setField('C_MAX', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Interconnection agreement expiry" symbol="IC_EXP">
            <input
              type="date"
              value={form.IC_EXP}
              onChange={(e) => setField('IC_EXP', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {/* Weather forecast at facility coordinates */}
      <WeatherPanel
        facilityLocation={effectiveFacilityLocation}
        facilityStatus={form.FACILITY_STATUS}
        itLoadMw={form.IT_LOAD === '' ? null : Number(form.IT_LOAD)}
        pItStartMw={form.P_IT_START === '' ? null : Number(form.P_IT_START)}
        measurementPoint={form.MEASUREMENT_POINT}
        etaUpsPct={form.ETA_UPS === '' ? null : Number(form.ETA_UPS)}
        etaPduPct={form.ETA_PDU === '' ? null : Number(form.ETA_PDU)}
      />

      {/* Section B + C (combined) */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Current IT Load and Capacity Expansion Plans
        </h2>
        <p className="text-xs text-slate-400 mb-5">Operator-entered</p>

        {form.FACILITY_STATUS === 'Running' && (
          <div className="mb-4">
            <Field label="Where is your primary IT power measurement taken?">
              <select
                value={form.MEASUREMENT_POINT}
                onChange={(e) => setField('MEASUREMENT_POINT', e.target.value)}
                className={inputCls}
              >
                <option value="UPS Input">UPS Input (Case C)</option>
                <option value="PDU Input">PDU Input (Case B)</option>
                <option value="PDU Output / Rack">PDU Output / Rack (Case A)</option>
              </select>
            </Field>
          </div>
        )}

        {form.FACILITY_STATUS === 'Running' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Total IT load (MW)" symbol="IT_LOAD" error={errors.IT_LOAD}>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 24.5"
                value={form.IT_LOAD}
                onChange={(e) => setField('IT_LOAD', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Installed IT capacity (MW)" symbol="IT_CAP" error={errors.IT_CAP}>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 30.0"
                value={form.IT_CAP}
                onChange={(e) => setField('IT_CAP', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Power Usage Effectiveness (Calculated)" symbol="PUE" error={errors.PUE}>
              <input
                type="number"
                step="0.01"
                readOnly
                placeholder="Calculated automatically"
                value={form.PUE}
                className={`${inputCls} bg-slate-50 cursor-not-allowed`}
              />
            </Field>
            {form.FACILITY_STATUS === 'Running' && form.MEASUREMENT_POINT === 'UPS Input' && (
              <Field label="UPS system efficiency (%)" symbol="ETA_UPS" error={errors.ETA_UPS}>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 97.0 (Default: 0.97)"
                  value={form.ETA_UPS}
                  onChange={(e) => setField('ETA_UPS', e.target.value)}
                  className={inputCls}
                />
              </Field>
            )}
            {form.FACILITY_STATUS === 'Running' && ['UPS Input', 'PDU Input'].includes(form.MEASUREMENT_POINT) && (
              <Field label="PDU / transformer efficiency (%)" symbol="ETA_PDU" error={errors.ETA_PDU}>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 98.0 (Default: 0.98)"
                  value={form.ETA_PDU}
                  onChange={(e) => setField('ETA_PDU', e.target.value)}
                  className={inputCls}
                />
              </Field>
            )}
            <Field label="Cooling system power (MW)" symbol="P_COOL" error={errors.P_COOL}>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 6.2"
                value={form.P_COOL}
                onChange={(e) => setField('P_COOL', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Lighting and general facilities (MW)" symbol="P_FAC" error={errors.P_FAC}>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 1.5"
                value={form.P_FAC}
                onChange={(e) => setField('P_FAC', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Battery storage capacity (MW)" symbol="BATT_CAP" error={errors.BATT_CAP}>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 10.0"
                value={form.BATT_CAP}
                onChange={(e) => setField('BATT_CAP', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field
              label="Historical interval meter data (CSV)"
              symbol="HIST_MW[]"
              tooltip="15-minute interval data expected. Each row should contain a timestamp and gross facility power draw (MW). Minimum 12 months recommended for accurate load shape calibration."
            >
              <FileInput
                file={form.HIST_MW}
                onChange={(f) => setField('HIST_MW', f)}
              />
            </Field>
          </div>
        )}

        {form.FACILITY_STATUS === 'New' && (
          <div className="col-span-1 md:col-span-2 mt-4 p-4 bg-teal-50 rounded-lg border border-teal-100">
            <p className="text-sm font-semibold text-teal-800 mb-3">Since there is no historical data, please provide the following design assumptions:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Expected IT Load at Commissioning (MW)" symbol="P_IT_START" error={errors.P_IT_START}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 24.5"
                  value={form.P_IT_START}
                  onChange={(e) => setField('P_IT_START', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Assumed Load Factor (%)" symbol="LF_ASSUMED" error={errors.LF_ASSUMED}>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 85.0"
                  value={form.LF_ASSUMED}
                  onChange={(e) => setField('LF_ASSUMED', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Expected Annual PUE" symbol="PUE_EXPECTED" error={errors.PUE_EXPECTED}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1.35"
                  value={form.PUE_EXPECTED}
                  onChange={(e) => setField('PUE_EXPECTED', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Monthly ambient temperatures — auto-fetched from Open-Meteo's ERA5 archive
            for the facility's lat/lng (most recent completed calendar year, averaged
            per month). Feeds calcPPUE in the forecast. */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <Field
            label="Monthly average outdoor temperature (°C)"
            symbol="TEMP_AMB_monthly[]"
            tooltip="Auto-fetched from the Open-Meteo ERA5 archive at the facility's location, averaged hour-by-hour into 12 monthly means. The forecast feeds these into the pPUE polynomial. Set the facility location above to populate."
          >
            <MonthlyTempPanel
              facilityLocation={effectiveFacilityLocation}
              value={form.TEMP_AMB_monthly}
              onChange={(s) => setField('TEMP_AMB_monthly', s)}
            />
          </Field>

          {/* Optional CSV upload to refit the pPUE(T) polynomial from a manufacturer's
              cooling-performance table (e.g. Liebert EconoPhase). The fit replaces the
              global coefficients used by calcPPUE; coefficients persist in localStorage. */}
          <div className="mt-5">
            <Field
              label="pPUE curve upload (CSV)"
              tooltip="Optional. Upload a CSV with header row including 'Outdoor Ambient' (°F) and 'pPUE' columns — we'll convert to °C and fit pPUE = a·T² + b·T + c, replacing the global coefficients used everywhere in the forecast."
            >
              <PpueCurveUpload />
            </Field>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-200 flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold text-slate-700">Capacity Expansion Plans</h3>
          <div className="inline-flex bg-slate-100 rounded-full p-[3px] gap-[2px]">
            {(['graph', 'manual', 'csv'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPlanMode(m)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${planMode === m
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {m === 'graph' ? 'Graph' : m === 'manual' ? 'Manual' : 'CSV'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Enter values per year (Y1 – Y10) for each field below.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned IT capacity additions by year (MW) <span style={{ color: '#94a3b8', fontWeight: 400 }}>ΔCAP[y]</span>
            </label>
            {planMode === 'csv' ? (
              <CsvUploadInput
                value={form.DELTA_CAP_y}
                onChange={(s) => setField('DELTA_CAP_y', s)}
                expectedCount={10}
                unit="MW"
                tooltip={CSV_TOOLTIP_YEARLY('MW')}
              />
            ) : (
              <ManualYearlyInputs
                value={form.DELTA_CAP_y}
                onChange={(s) => setField('DELTA_CAP_y', s)}
                step={0.1}
                unit="MW"
              />
            )}
          </div>
          {planMode === 'graph' && (
            <div
              className="md:col-span-2"
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                background: '#fff',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: 0.4, marginBottom: 8 }}>
                LEGEND AND CONTROLS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', rowGap: 6 }}>
                {Array.from({ length: UTIL_RAMP_YEARS }, (_, y) => (
                  <label key={y} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={utilRampVisible[y]}
                      onChange={() => setUtilRampVisible(prev => prev.map((v, i) => (i === y ? !v : v)))}
                    />
                    <span style={{ width: 12, height: 12, background: UTIL_RAMP_YEAR_COLORS[y].line, borderRadius: 2, display: 'inline-block' }} />
                    Year {y + 1}
                  </label>
                ))}
                <div style={{ width: 1, height: 22, background: '#e2e8f0' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={utilRampPropagate}
                    onChange={() => setUtilRampPropagate(p => !p)}
                  />
                  Propagate Forward
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>
                    (apply Δ to same month in later years)
                  </span>
                </label>
              </div>
            </div>
          )}
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Utilisation rate of new capacity at ramp per month (%) <span style={{ color: '#94a3b8', fontWeight: 400 }}>UTIL_RAMP[y,m]</span>
            </label>
            {planMode === 'csv' ? (
              <CsvUploadInput
                value={form.UTIL_RAMP}
                onChange={(s) => setField('UTIL_RAMP', s)}
                expectedCount={120}
                unit="%"
                tooltip={CSV_TOOLTIP_UTIL_RAMP}
              />
            ) : planMode === 'manual' ? (
              <UtilRampManualGrid
                value={form.UTIL_RAMP}
                onChange={(s) => setField('UTIL_RAMP', s)}
              />
            ) : (
              <UtilRampCurveEditor
                value={form.UTIL_RAMP}
                onChange={(s) => setField('UTIL_RAMP', s)}
                visible={utilRampVisible}
                propagateForward={utilRampPropagate}
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned PUE improvement by year (fractional, e.g. 0.05 = 5%) <span style={{ color: '#94a3b8', fontWeight: 400 }}>PUE[y]</span>
            </label>
            {planMode === 'graph' ? (
              <YearlyMetricCurveEditor
                value={form.PUE_y}
                onChange={(s) => setField('PUE_y', s)}
                color="#10b981"
                fillColor="rgba(16, 185, 129, 0.10)"
                unit="fraction"
                step={0.05}
                yMaxAbsolute={1}
                yTickStep={0.05}
                userAdjustableMax
              />
            ) : planMode === 'csv' ? (
              <CsvUploadInput
                value={form.PUE_y}
                onChange={(s) => setField('PUE_y', s)}
                expectedCount={10}
                unit="fraction"
                tooltip={CSV_TOOLTIP_YEARLY('fraction')}
              />
            ) : (
              <ManualYearlyInputs
                value={form.PUE_y}
                onChange={(s) => setField('PUE_y', s)}
                step={0.05}
                unit="fraction"
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned on-site renewable additions by year (MW) <span style={{ color: '#94a3b8', fontWeight: 400 }}>RE_GEN[y]</span>
            </label>
            {planMode === 'graph' ? (
              <YearlyMetricCurveEditor
                value={form.RE_GEN_y}
                onChange={(s) => setField('RE_GEN_y', s)}
                color="#f59e0b"
                fillColor="rgba(245, 158, 11, 0.10)"
                unit="MW"
                step={0.1}
                yMaxFloor={20}
                yMaxAbsolute={200}
                userAdjustableMax
              />
            ) : planMode === 'csv' ? (
              <CsvUploadInput
                value={form.RE_GEN_y}
                onChange={(s) => setField('RE_GEN_y', s)}
                expectedCount={10}
                unit="MW"
                tooltip={CSV_TOOLTIP_YEARLY('MW')}
              />
            ) : (
              <ManualYearlyInputs
                value={form.RE_GEN_y}
                onChange={(s) => setField('RE_GEN_y', s)}
                step={0.1}
                unit="MW"
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned battery storage additions by year (MW) <span style={{ color: '#94a3b8', fontWeight: 400 }}>BATT_ADD[y]</span>
            </label>
            {planMode === 'graph' ? (
              <YearlyMetricCurveEditor
                value={form.BATT_ADD_y}
                onChange={(s) => setField('BATT_ADD_y', s)}
                color="#8b5cf6"
                fillColor="rgba(139, 92, 246, 0.10)"
                unit="MWh"
                step={0.1}
                yMaxFloor={50}
                yMaxAbsolute={2000}
                userAdjustableMax
              />
            ) : planMode === 'csv' ? (
              <CsvUploadInput
                value={form.BATT_ADD_y}
                onChange={(s) => setField('BATT_ADD_y', s)}
                expectedCount={10}
                unit="MWh"
                tooltip={CSV_TOOLTIP_YEARLY('MWh')}
              />
            ) : (
              <ManualYearlyInputs
                value={form.BATT_ADD_y}
                onChange={(s) => setField('BATT_ADD_y', s)}
                step={0.1}
                unit="MWh"
              />
            )}
          </div>
          <Field label="Organic IT load growth rate (%)" symbol="g_IT" error={errors.g_IT}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 2.5"
              value={form.g_IT}
              onChange={(e) => setField('g_IT', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Forecast scenario" symbol="SCENARIO">
            <select
              value={form.SCENARIO}
              onChange={(e) => setField('SCENARIO', e.target.value)}
              className={inputCls}
            >
              <option>High</option>
              <option>Base</option>
              <option>Low</option>
            </select>
          </Field>
        </div>
      </section>

      {/* Section BESS — Battery Energy Storage System */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-slate-900">
            Battery Energy Storage System
          </h2>
          {form.BTM && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 9999,
                background: '#f0fdfa',
                color: '#0d9488',
                border: '1px solid #99f6e4',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              BTM
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Behind-the-meter storage. BTM is automatically set to <strong>True</strong> when any field below is filled.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Fill rate max (MW)" symbol="BESS_FILL_RATE_MAX" error={errors.BESS_FILL_RATE_MAX}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 10.0"
              value={form.BESS_FILL_RATE_MAX}
              onChange={(e) => setField('BESS_FILL_RATE_MAX', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Draw rate max (MW)" symbol="BESS_DRAW_RATE_MAX" error={errors.BESS_DRAW_RATE_MAX}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 10.0"
              value={form.BESS_DRAW_RATE_MAX}
              onChange={(e) => setField('BESS_DRAW_RATE_MAX', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Round-trip loss (%)" symbol="BESS_RT_LOSS_PCT" error={errors.BESS_RT_LOSS_PCT}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 8.0"
              value={form.BESS_RT_LOSS_PCT}
              onChange={(e) => setField('BESS_RT_LOSS_PCT', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Capacity (MW)" symbol="BESS_CAPACITY_MW" error={errors.BESS_CAPACITY_MW}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 20.0"
              value={form.BESS_CAPACITY_MW}
              onChange={(e) => setField('BESS_CAPACITY_MW', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Max storage (MWh)" symbol="BESS_MAX_STORAGE_MWH" error={errors.BESS_MAX_STORAGE_MWH}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 80.0"
              value={form.BESS_MAX_STORAGE_MWH}
              onChange={(e) => setField('BESS_MAX_STORAGE_MWH', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Years remaining" symbol="BESS_YEARS_REMAINING" error={errors.BESS_YEARS_REMAINING}>
            <input
              type="number"
              step="1"
              placeholder="e.g. 15"
              value={form.BESS_YEARS_REMAINING}
              onChange={(e) => setField('BESS_YEARS_REMAINING', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {/* Section D */}
      <section className={sectionCls}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-bold text-slate-900">
            Section D — Existing Power Contracts
          </h2>
          <button
            type="button"
            onClick={addContract}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <span>+</span> Add contract
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Operator-entered. Each contract is indexed by <code>i</code>.
        </p>

        <div className="space-y-4">
          {form.contracts.map((c, idx) => (
            <div
              key={idx}
              className="border border-slate-200 rounded-xl p-4 bg-slate-50/50"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  Contract #{idx + 1}
                </h3>
                {form.contracts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeContract(idx)}
                    className="text-xs text-slate-400 hover:text-rose-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Contract type" symbol={`CTYPE_${idx + 1}`}>
                  <select
                    value={c.CTYPE_i}
                    onChange={(e) =>
                      setContractField(idx, 'CTYPE_i', e.target.value)
                    }
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    <option>Utility tariff</option>
                    <option>Fixed price PPA</option>
                    <option>Index PPA</option>
                    <option>VPPA</option>
                    <option>Hedge / swap</option>
                    <option>Block + index</option>
                  </select>
                </Field>
                <Field
                  label="Contracted volume (MW)"
                  symbol={`CV_${idx + 1}`}
                >
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 10.0"
                    value={c.CV_i}
                    onChange={(e) =>
                      setContractField(idx, 'CV_i', e.target.value)
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Contract price ($/MWh)" symbol={`CP_${idx + 1}`}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 45.50"
                    value={c.CP_i}
                    onChange={(e) =>
                      setContractField(idx, 'CP_i', e.target.value)
                    }
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Volume shape"
                  symbol={`C_SHAPE_${idx + 1}`}
                >
                  <select
                    value={c.C_SHAPE_i}
                    onChange={(e) =>
                      setContractField(idx, 'C_SHAPE_i', e.target.value)
                    }
                    className={inputCls}
                  >
                    <option>Flat</option>
                    <option>Shaped</option>
                  </select>
                </Field>
                <Field label="Start date" symbol={`CS_${idx + 1}`}>
                  <input
                    type="date"
                    value={c.CS_i}
                    onChange={(e) =>
                      setContractField(idx, 'CS_i', e.target.value)
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="End date" symbol={`CE_${idx + 1}`}>
                  <input
                    type="date"
                    value={c.CE_i}
                    onChange={(e) =>
                      setContractField(idx, 'CE_i', e.target.value)
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Renewable attribute" symbol={`C_RE_${idx + 1}`}>
                  <select
                    value={c.C_RE_i}
                    onChange={(e) =>
                      setContractField(idx, 'C_RE_i', e.target.value)
                    }
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    <option>None</option>
                    <option>Bundled RECs</option>
                    <option>Unbundled RECs</option>
                    <option>Additionality-certified</option>
                  </select>
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section E */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Section E — Organisational KPIs and Targets
        </h2>
        <p className="text-xs text-slate-400 mb-5">Operator-entered</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Power cost budget — blended ($/MWh)" symbol="BUDGET" error={errors.BUDGET}>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 65.00"
              value={form.BUDGET}
              onChange={(e) => setField('BUDGET', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Renewable energy target (%)" symbol="RE_TARGET" error={errors.RE_TARGET}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 100.0"
              value={form.RE_TARGET}
              onChange={(e) => setField('RE_TARGET', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field
            label="Carbon intensity target (gCO₂/kWh)"
            symbol="CI_TARGET"
            error={errors.CI_TARGET}
          >
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 0.0"
              value={form.CI_TARGET}
              onChange={(e) => setField('CI_TARGET', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Maximum price risk tolerance (%)" symbol="RISK_MAX" error={errors.RISK_MAX}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 15.0"
              value={form.RISK_MAX}
              onChange={(e) => setField('RISK_MAX', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Preferred contract tenor (years)" symbol="PREF_TERM" error={errors.PREF_TERM}>
            <input
              type="number"
              step="0.5"
              placeholder="e.g. 10.0"
              value={form.PREF_TERM}
              onChange={(e) => setField('PREF_TERM', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field
            label="Minimum contracted coverage ratio (%)"
            symbol="COV_MIN"
            error={errors.COV_MIN}
          >
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 80.0"
              value={form.COV_MIN}
              onChange={(e) => setField('COV_MIN', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Target supply go-live date" symbol="GO_LIVE">
            <input
              type="date"
              value={form.GO_LIVE}
              onChange={(e) => setField('GO_LIVE', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {/* Section F */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Section F — Third-Party Market Data Inputs
        </h2>
        <p className="text-xs text-slate-400 mb-5">
          Sourced from third-party APIs or file uploads.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Day-ahead power price — nodal (CSV)"
            symbol="DA_PRICE[h]"
          >
            <FileInput
              file={form.DA_PRICE}
              onChange={(f) => setField('DA_PRICE', f)}
            />
          </Field>
          <Field label="Forward power price curve (CSV)" symbol="FWD_CURVE[m]">
            <FileInput
              file={form.FWD_CURVE}
              onChange={(f) => setField('FWD_CURVE', f)}
            />
          </Field>
          <Field label="LMP history — 3 years (CSV)" symbol="LMP[h]">
            <FileInput
              file={form.LMP}
              onChange={(f) => setField('LMP', f)}
            />
          </Field>
          <Field
            label="Capacity market price / obligation ($/MW-day)"
            symbol="CAP_PRICE"
            error={errors.CAP_PRICE}
          >
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 50.00"
              value={form.CAP_PRICE}
              onChange={(e) => setField('CAP_PRICE', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Corporate PPA benchmark price ($/MWh)" symbol="PPA_BM" error={errors.PPA_BM}>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 40.00"
              value={form.PPA_BM}
              onChange={(e) => setField('PPA_BM', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="REC spot price ($/MWh)" symbol="REC_PRICE" error={errors.REC_PRICE}>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 3.50"
              value={form.REC_PRICE}
              onChange={(e) => setField('REC_PRICE', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Utility tariff schedule (PDF/CSV)" symbol="TARIFF">
            <FileInput
              file={form.TARIFF}
              onChange={(f) => setField('TARIFF', f)}
            />
          </Field>
          <Field label="Grid carbon intensity (gCO₂/kWh)" symbol="CI_GRID" error={errors.CI_GRID}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 350.0"
              value={form.CI_GRID}
              onChange={(e) => setField('CI_GRID', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Hourly temperature at site (CSV)" symbol="TEMP[h]">
            <FileInput
              file={form.TEMP}
              onChange={(f) => setField('TEMP', f)}
            />
          </Field>
          <Field
            label="Renewable generation profile (CSV)"
            symbol="RE_GEN_P[h]"
          >
            <FileInput
              file={form.RE_GEN_P}
              onChange={(f) => setField('RE_GEN_P', f)}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 pb-6">
        <div>
          {activeFacilityId !== null && (
            <button
              type="button"
              id="facility-delete"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors"
              style={{
                background: '#dbeafe',
                color: '#1d4ed8',
                border: '1px solid #93c5fd',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#bfdbfe'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
            >
              Delete Facility
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {submitted && (
            <span className="text-sm text-teal-700">
              Facility profile saved.
            </span>
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            Save Facility Profile
          </button>
        </div>
      </div>
    </form>
  );

} // End of FacilityProfile

// Renders 10 per-year numeric inputs (Y1–Y10) sharing the same comma-separated
// serialization the YearlyMetricCurveEditor uses, so the two input modes are
// fully interchangeable without touching form state shape.
function ManualYearlyInputs({
  value,
  onChange,
  step,
  unit,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  step?: number;
  unit?: string;
  placeholder?: string;
}) {
  const vals = value ? value.split(',') : [];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              Y{i + 1}
            </span>
            <input
              type="number"
              step={step ?? 0.1}
              placeholder={placeholder ?? '0'}
              value={vals[i]?.trim() || ''}
              onChange={(e) => {
                const arr = value ? value.split(',').map((s) => s.trim()) : [];
                while (arr.length < 10) arr.push('');
                arr[i] = e.target.value;
                onChange(arr.join(', '));
              }}
              style={{
                width: '100%',
                textAlign: 'center',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '4px 2px',
                fontSize: 12,
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
              }}
            />
          </div>
        ))}
      </div>
      {unit && (
        <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'Inter, sans-serif', marginTop: 6, textAlign: 'right' }}>
          values in {unit}
        </div>
      )}
    </div>
  );
}

// Auto-fetches the 12 monthly average outdoor temperatures (°C) for the facility's
// location from Open-Meteo's ERA5 archive (most recent completed calendar year),
// and writes them back into the form's TEMP_AMB_monthly CSV field so the existing
// save/parse pipeline keeps working. Read-only — the only way to refresh the
// values is to change the facility location.
function MonthlyTempPanel({
  facilityLocation,
  value,
  onChange,
}: {
  facilityLocation: string;
  value: string;
  onChange: (csv: string) => void;
}) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Non-leap-year hour counts per month; useHourlyArchive normalises leap years
  // by dropping Feb 29, so the 8760 series always matches this distribution.
  const HOURS_PER_MONTH = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744];

  const point = useMemo(
    () => (facilityLocation ? ewkbToPoint(facilityLocation) : null),
    [facilityLocation],
  );
  const archiveYear = new Date().getUTCFullYear() - 1;
  const { data: tempAmbHourly, loading, error } = useHourlyArchive(point, archiveYear);

  // Average the 8760-pt hourly series into 12 monthly means.
  const monthlyTemps = useMemo<number[] | null>(() => {
    if (!tempAmbHourly || tempAmbHourly.length < 8760) return null;
    const monthStarts = [0];
    for (let i = 0; i < 11; i++) monthStarts.push(monthStarts[i] + HOURS_PER_MONTH[i]);
    return HOURS_PER_MONTH.map((h, m) => {
      let sum = 0;
      for (let i = 0; i < h; i++) sum += tempAmbHourly[monthStarts[m] + i];
      return sum / h;
    });
  }, [tempAmbHourly]);

  // Push derived monthly temps back into form state. Compared as CSV string so
  // we don't fire setField on every render. value/onChange omitted from deps to
  // avoid a feedback loop (the effect itself is what mutates value).
  useEffect(() => {
    if (!monthlyTemps) return;
    const csv = monthlyTemps.map((t) => t.toFixed(1)).join(', ');
    if (csv !== value) onChange(csv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTemps]);

  // Cells display either the freshly-computed averages, the previously-saved
  // CSV (when archive hasn't loaded yet), or '—' when neither is available.
  const savedParts = (value || '').split(',').map((s) => s.trim());
  const cellText = (i: number): string => {
    if (monthlyTemps) return monthlyTemps[i].toFixed(1);
    const v = savedParts[i];
    if (v && !isNaN(Number(v))) return Number(v).toFixed(1);
    return '—';
  };

  let status: { text: string; tone: 'info' | 'warn' | 'error' } = { text: '', tone: 'info' };
  if (!point) status = { text: 'Set the facility location above to fetch temperatures.', tone: 'warn' };
  else if (loading) status = { text: `Fetching ${archiveYear} hourly archive…`, tone: 'info' };
  else if (error) status = { text: `Weather fetch failed: ${error}`, tone: 'error' };
  else if (monthlyTemps) status = { text: `Averaged from Open-Meteo ERA5 archive (${archiveYear}).`, tone: 'info' };

  return (
    <div>
      <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
        {MONTHS.map((label, i) => (
          <div key={label} className="flex flex-col">
            <label className="text-[10px] text-slate-500 mb-1 text-center font-medium">{label}</label>
            <div
              className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs text-center bg-slate-50 text-slate-700"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {cellText(i)}
            </div>
          </div>
        ))}
      </div>
      {status.text && (
        <p
          className="mt-2 text-xs"
          style={{
            color: status.tone === 'error' ? '#ef4444' : status.tone === 'warn' ? '#b45309' : '#64748b',
          }}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

// Parse a manufacturer cooling-performance CSV, extract (Outdoor Ambient °F, pPUE)
// pairs, convert temperatures to °C, and fit pPUE(T) = a·T² + b·T + c. The fitted
// coefficients replace the module-level defaults used by calcPPUE everywhere.
function PpueCurveUpload() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coeffs, setCoeffs] = useState<{ a: number; b: number; c: number } | null>(() => {
    const c = getPpueCoefficients();
    return { a: c.a, b: c.b, c: c.c };
  });
  const [r2, setR2] = useState<number | null>(null);
  const [nPoints, setNPoints] = useState<number | null>(null);

  // Find a column whose header matches any of the provided substrings (case-insensitive,
  // whitespace/punctuation tolerant). Returns -1 if no match.
  const findCol = (headers: string[], needles: string[]): number => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const nHeaders = headers.map(norm);
    for (const needle of needles.map(norm)) {
      const idx = nHeaders.findIndex((h) => h.includes(needle));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const handleFile = async (file: File | null) => {
    setError(null);
    if (!file) { setFileName(null); return; }
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map((r) => r.trim()).filter((r) => r !== '');
      if (rows.length < 2) { setError('CSV must have a header row and at least 3 data rows.'); return; }

      const splitRow = (r: string) => r.split(/[,;\t]/).map((c) => c.trim());
      const headers = splitRow(rows[0]);
      const tempCol = findCol(headers, ['outdoorambient', 'outdoor']);
      const ppueCol = findCol(headers, ['ppue']);
      if (tempCol === -1) { setError("Couldn't find an 'Outdoor Ambient' column."); return; }
      if (ppueCol === -1) { setError("Couldn't find a 'pPUE' column."); return; }

      const xsC: number[] = []; // °C, for fitting
      const ys: number[] = [];  // pPUE
      for (let i = 1; i < rows.length; i++) {
        const cells = splitRow(rows[i]);
        const tF = Number(cells[tempCol]);
        const p = Number(cells[ppueCol]);
        if (!isFinite(tF) || !isFinite(p)) continue;
        xsC.push((tF - 32) * (5 / 9));
        ys.push(p);
      }
      if (xsC.length < 3) { setError(`Need at least 3 valid data rows; found ${xsC.length}.`); return; }

      const fit = fitQuadratic(xsC, ys);
      if (!fit) { setError('Fit failed — temperature column may be constant or data is degenerate.'); return; }

      // R² of the fit, so the user can sanity-check that the curve matches their data.
      const yMean = ys.reduce((s, v) => s + v, 0) / ys.length;
      let ssRes = 0, ssTot = 0;
      for (let i = 0; i < xsC.length; i++) {
        const yHat = fit.a * xsC[i] * xsC[i] + fit.b * xsC[i] + fit.c;
        ssRes += (ys[i] - yHat) ** 2;
        ssTot += (ys[i] - yMean) ** 2;
      }
      const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;

      setPpueCoefficients(fit);
      setCoeffs(fit);
      setR2(rSquared);
      setNPoints(xsC.length);
    } catch (e) {
      setError(`Failed to read CSV: ${(e as Error).message}`);
    }
  };

  const handleReset = () => {
    resetPpueCoefficients();
    const c = getPpueCoefficients();
    setCoeffs({ a: c.a, b: c.b, c: c.c });
    setR2(null);
    setNPoints(null);
    setFileName(null);
    setError(null);
  };

  return (
    <div className="border border-slate-200 rounded-md p-3 bg-white">
      <div className="flex items-center gap-3 flex-wrap">
        <label
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
          style={{ background: '#0d9488', color: '#fff' }}
        >
          Choose CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
        </label>
        {fileName && (
          <span className="text-xs text-slate-600 font-medium">{fileName}</span>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Reset to defaults
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>
          ⚠ {error}
        </p>
      )}

    </div>
  );
}

function Field({
  label,
  tooltip,
  error,
  children,
}: {
  label: string;
  symbol?: string;
  tooltip?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {label}
        {tooltip && (
          <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            className="tooltip-anchor"
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#e2e8f0',
                color: '#64748b',
                fontSize: 9,
                fontWeight: 700,
                cursor: 'default',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              i
            </span>
            <span
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 6,
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: 11,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                lineHeight: 1.5,
                padding: '8px 12px',
                borderRadius: 8,
                width: 240,
                whiteSpace: 'normal',
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 0.15s ease',
                zIndex: 50,
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              }}
              className="tooltip-popup"
            >
              {tooltip}
            </span>
          </span>
        )}
      </label>
      {/* Red border wrapper when field has error */}
      <div
        className="mt-1.5"
        style={error ? { borderRadius: 8, outline: '1.5px solid #ef4444' } : undefined}
      >
        {children}
      </div>
      {error && (
        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#ef4444', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 12 }}>⚠</span> {error}
        </p>
      )}
      {/* Tooltip hover CSS */}
      <style>{`.tooltip-anchor:hover .tooltip-popup { opacity: 1 !important; }`}</style>
    </div>
  );
}

// CSV upload control for Section C yearly fields. Parses numeric tokens out of
// the file, validates the count matches what the field expects, and writes the
// flattened comma-separated string to form state — the same shape Graph and
// Manual modes produce, so downstream code is mode-agnostic.
function CsvUploadInput({
  value,
  onChange,
  expectedCount,
  unit,
  tooltip,
}: {
  value: string;
  onChange: (next: string) => void;
  expectedCount: number;
  unit?: string;
  tooltip: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const currentCount = value
    ? value.split(',').map((s) => s.trim()).filter((s) => s !== '' && !isNaN(Number(s))).length
    : 0;

  const handleFile = async (file: File | null) => {
    setError(null);
    if (!file) {
      setFileName(null);
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      const tokens = text
        .split(/[,\n\r\t;]+/)
        .map((t) => t.trim())
        .filter((t) => t !== '');
      const nums: number[] = [];
      for (const tok of tokens) {
        const n = Number(tok);
        if (!isNaN(n)) nums.push(n);
      }
      if (nums.length < expectedCount) {
        setError(`Expected ${expectedCount} numeric values, found ${nums.length}.`);
        return;
      }
      onChange(nums.slice(0, expectedCount).join(', '));
    } catch (e) {
      setError('Could not read file.');
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: '1px dashed #cbd5e1',
          borderRadius: 8,
          padding: '12px 14px',
          background: '#f8fafc',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#0f766e',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
          Upload CSV
        </label>
        <span style={{ fontSize: 12, color: '#475569', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName ?? (currentCount > 0 ? `${currentCount} value${currentCount === 1 ? '' : 's'} loaded` : 'No file chosen')}
        </span>
        <span
          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
          className="tooltip-anchor"
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#e2e8f0',
              color: '#475569',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'default',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            i
          </span>
          <span
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 6,
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: 11,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              lineHeight: 1.5,
              padding: '8px 12px',
              borderRadius: 8,
              width: 280,
              whiteSpace: 'normal',
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 0.15s ease',
              zIndex: 50,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
            className="tooltip-popup"
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>Expected CSV format</strong>
            {tooltip}
          </span>
        </span>
      </div>
      {error && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#ef4444', fontFamily: 'Inter, sans-serif' }}>
          ⚠ {error}
        </p>
      )}
      {unit && !error && currentCount > 0 && (
        <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'Inter, sans-serif', marginTop: 6, textAlign: 'right' }}>
          values in {unit}
        </div>
      )}
      <style>{`.tooltip-anchor:hover .tooltip-popup { opacity: 1 !important; }`}</style>
    </div>
  );
}

// Manual 10-year × 12-month grid editor for UTIL_RAMP. Uses the same
// year-major comma-separated serialization as UtilRampCurveEditor so all
// three modes (graph/manual/csv) round-trip cleanly through form state.
function UtilRampManualGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = value ? value.split(',').map((s) => s.trim()) : [];
  const get = (y: number, m: number) => {
    const v = parts[y * 12 + m];
    return v === undefined ? '' : v;
  };
  const setCell = (y: number, m: number, next: string) => {
    const arr = value ? value.split(',').map((s) => s.trim()) : [];
    while (arr.length < 120) arr.push('');
    arr[y * 12 + m] = next;
    onChange(arr.join(', '));
  };
  return (
    <div style={{ overflowX: 'auto', fontFamily: 'Inter, sans-serif' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 4, fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', color: '#94a3b8', fontWeight: 600, padding: '2px 4px' }} />
            {MONTHS.map((m) => (
              <th key={m} style={{ color: '#94a3b8', fontWeight: 600, padding: '2px 4px', textAlign: 'center', minWidth: 48 }}>
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }, (_, y) => (
            <tr key={y}>
              <td style={{ color: '#94a3b8', fontWeight: 600, padding: '2px 6px' }}>Y{y + 1}</td>
              {Array.from({ length: 12 }, (_, m) => (
                <td key={m}>
                  <input
                    type="number"
                    step={1}
                    value={get(y, m)}
                    onChange={(e) => setCell(y, m, e.target.value)}
                    style={{
                      width: 52,
                      textAlign: 'center',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: '3px 2px',
                      fontSize: 11,
                      outline: 'none',
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, textAlign: 'right' }}>
        values in %
      </div>
    </div>
  );
}

function FileInput({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
      />
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-slate-400 hover:text-rose-600"
          title="Remove file"
        >
          ×
        </button>
      )}
    </div>
  );
}
