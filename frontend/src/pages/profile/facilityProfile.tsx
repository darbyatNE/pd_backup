import { useState, useEffect } from 'react';

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
  STATE: string;
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
  GEN_CAP: string;
  BATT_CAP: string;
  HIST_MW: File | null;
  TEMP_AMB_monthly: string;

  // Section C — Capacity Expansion Plans
  DELTA_CAP_y: string;
  UTIL_RAMP: string;
  UTIL_y: string;
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
  STATE: '',
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
  GEN_CAP: '',
  BATT_CAP: '',
  HIST_MW: null,

  DELTA_CAP_y: '',
  UTIL_RAMP: '',
  UTIL_y: '',
  PUE_y: '',
  RE_GEN_y: '',
  BATT_ADD_y: '',
  g_IT: '',
  SCENARIO: 'Base',
  TEMP_AMB_monthly: '',


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
import { supabase } from '../../services/supabase';

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
  GEN_CAP: { min: 0, max: 5000, msg: 'Generation: 0 – 5,000 MW' },
  BATT_CAP: { min: 0, max: 10000, msg: 'Battery: 0 – 10,000 MWh' },
  P_IT_START: { min: 0.01, max: 1000, msg: 'IT load at commissioning: 0.01 – 1,000 MW' },
  LF_ASSUMED: { min: 1, max: 100, msg: 'Load factor: 1 – 100 %' },
  PUE_EXPECTED: { min: 1.0, max: 4.0, msg: 'Expected PUE: 1.0 – 4.0' },
  UTIL_RAMP: { min: 0, max: 100, msg: 'Utilisation ramp: 0 – 100 %' },
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
    STATE: row.STATE ?? '',
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
    GEN_CAP: toStr(row.GEN_CAP),
    BATT_CAP: toStr(row.BATT_CAP),
    HIST_MW: null,
    DELTA_CAP_y: toStr(row.DELTA_CAP_y),
    UTIL_RAMP: toStr(row.UTIL_RAMP),
    UTIL_y: toStr(row.UTIL_y),
    PUE_y: toStr(row.PUE_y),
    TEMP_AMB_monthly: toStr(row.TEMP_AMB_monthly),
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

export default function FacilityProfile() {
  const { user } = useAuth();
  const [form, setFormRaw] = useState<FacilityFormData>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FacilityFormData, string>>>({});
  // Multi-facility
  const [facilities, setFacilities] = useState<{ id: string; name: string; row: any }[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const [loadingFacilities, setLoadingFacilities] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoadingFacilities(false); return; }
    supabase
      .from('data_centers')
      .select('*')
      .eq('buyer_id', user.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const list = data.map((row: any) => ({
            id: row.id,
            name: row.FAC_ID || `Facility ${row.id}`,
            row,
          }));
          setFacilities(list);
          setActiveFacilityId(list[0].id);
          setFormRaw(dbRowToForm(list[0].row));
        }
        setLoadingFacilities(false);
      });
  }, [user?.id]);

  const selectFacility = (id: string | null) => {
    setActiveFacilityId(id);
    setErrors({});
    if (id === null) {
      setFormRaw(INITIAL_FORM);
    } else {
      const fac = facilities.find((f) => f.id === id);
      if (fac) setFormRaw(dbRowToForm(fac.row));
    }
  };

  // Auto-calculate PUE based on (p_total_facility / p_it)
  useEffect(() => {
    if (form.FACILITY_STATUS !== 'Running') return;
    const itNum = Number(form.IT_LOAD) || 0;
    const coolNum = Number(form.P_COOL) || 0;
    const facNum = Number(form.P_FAC) || 0;

    if (itNum > 0) {
      const expectedPue = (itNum + coolNum + facNum) / itNum;
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
  }, [form.IT_LOAD, form.P_COOL, form.P_FAC, form.FACILITY_STATUS]);

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
  const setForm = <K extends keyof FacilityFormData>(key: K, value: FacilityFormData[K]) => {
    setFormRaw((prev) => ({ ...prev, [key]: value }));
    validateField(key, value);
  };

  const setField = setForm;

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
      const payload: any = { ...form, buyer_id: user?.id };
      const fileKeys = ['HIST_MW', 'DA_PRICE', 'FWD_CURVE', 'LMP', 'TARIFF', 'TEMP', 'RE_GEN_P'];
      fileKeys.forEach((key) => {
        if (payload[key] instanceof File) payload[key] = payload[key].name;
        else if (payload[key] === null) delete payload[key];
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
      if (isEditing) {
        setFacilities((prev) =>
          prev.map((f) => f.id === activeFacilityId ? { ...f, name: updatedName, row: { ...f.row, ...payload } } : f)
        );
      } else {
        const newId = saved?.id || saved?.data?.[0]?.id || String(Date.now());
        const newEntry = { id: newId, name: updatedName, row: { ...payload, id: newId } };
        setFacilities((prev) => [...prev, newEntry]);
        setActiveFacilityId(newId);
      }
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (error) {
      console.error('Submission error:', error);
      alert('Error saving facility profile');
    }
  };

  if (loadingFacilities) {
    return <div className="p-8 text-sm text-slate-500">Loading facilities...</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Facility Tab Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {facilities.map((fac) => (
          <button
            key={fac.id}
            type="button"
            id={`facility-tab-${fac.id}`}
            onClick={() => selectFacility(fac.id)}
            style={{
              padding: '6px 18px',
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
            {fac.name || 'Unnamed Facility'}
          </button>
        ))}
        <button
          type="button"
          id="facility-tab-new"
          onClick={() => selectFacility(null)}
          style={{
            padding: '6px 18px',
            borderRadius: '9999px',
            border: activeFacilityId === null ? '1.5px solid #6366f1' : '1.5px dashed #cbd5e1',
            background: activeFacilityId === null ? '#eef2ff' : '#ffffff',
            color: activeFacilityId === null ? '#6366f1' : '#94a3b8',
            fontSize: 13,
            fontWeight: activeFacilityId === null ? 600 : 400,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          + New Facility
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
          <Field label="State" symbol="STATE">
            <input
              type="text"
              placeholder="e.g. Virginia"
              value={form.STATE}
              onChange={(e) => setField('STATE', e.target.value)}
              className={inputCls}
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

      {/* Section B */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Section B — Current IT Load and Power Infrastructure
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
            <Field label="On-site generation capacity (MW)" symbol="GEN_CAP" error={errors.GEN_CAP}>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 40.0"
                value={form.GEN_CAP}
                onChange={(e) => setField('GEN_CAP', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Battery storage capacity (MWh)" symbol="BATT_CAP" error={errors.BATT_CAP}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 1.35"
                    value={form.PUE_EXPECTED}
                    onChange={(e) => setField('PUE_EXPECTED', e.target.value)}
                    className={inputCls}
                  />
                  {form.PUE_EXPECTED && (
                    <button
                      type="button"
                      onClick={() => setField('PUE_EXPECTED', '')}
                      style={{ fontSize: 12, color: '#0d9488', textDecoration: 'underline', whiteSpace: 'nowrap', fontWeight: 500 }}
                    >
                      Use Ambient Temps
                    </button>
                  )}
                </div>
              </Field>
            </div>
            {!form.PUE_EXPECTED && (
              <div className="mt-4 md:col-span-3">
                <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
                  Ambient Temperature (°C) - Fill 12 months to compute temperature-dependent PUE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const vals = form.TEMP_AMB_monthly ? form.TEMP_AMB_monthly.split(',') : [];
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>M{i + 1}</span>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="0"
                          value={vals[i]?.trim() || ''}
                          onChange={(e) => {
                            const arr = form.TEMP_AMB_monthly ? form.TEMP_AMB_monthly.split(',').map(s => s.trim()) : [];
                            while (arr.length < 12) arr.push('');
                            arr[i] = e.target.value;
                            setField('TEMP_AMB_monthly', arr.join(', '));
                          }}
                          style={{
                            width: '100%', textAlign: 'center', border: '1px solid #e2e8f0',
                            borderRadius: 6, padding: '4px 2px', fontSize: 12,
                            fontFamily: 'Inter, sans-serif', outline: 'none',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const arrStr = form.TEMP_AMB_monthly ? form.TEMP_AMB_monthly.split(',') : [];
                  if (arrStr.length === 12 && arrStr.every(s => s.trim() !== '')) {
                    const temps = arrStr.map(s => Number(s.trim()));
                    const calcPPUE = (T: number) => 7.1705e-5 * T * T + 0.0041 * T + 1.0743;
                    const avgPPUE = temps.reduce((acc, t) => acc + calcPPUE(t), 0) / 12;
                    const pit = Number(form.P_IT_START) || 1;
                    const pfac = Number(form.P_FAC) || 0;
                    const avgPUE = avgPPUE + (pfac / pit);
                    return (
                      <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setField('PUE_EXPECTED', avgPUE.toFixed(3));
                          }}
                          style={{ padding: '6px 12px', backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 500 }}
                        >
                          Auto-fill Expected PUE ({avgPUE.toFixed(3)})
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
            </div>
        )}
      </section>

      {/* Section C */}
      <section className={sectionCls}>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Section C — Capacity Expansion Plans
        </h2>
        <p className="text-xs text-slate-400 mb-5">
          Enter values per year (Y1 – Y10) for each field below.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned IT capacity additions by year (MW) <span style={{ color: '#94a3b8', fontWeight: 400 }}>ΔCAP[y]</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => {
                const vals = form.DELTA_CAP_y ? form.DELTA_CAP_y.split(',') : [];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Y{i + 1}</span>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0"
                      value={vals[i]?.trim() || ''}
                      onChange={(e) => {
                        const arr = form.DELTA_CAP_y ? form.DELTA_CAP_y.split(',').map(s => s.trim()) : [];
                        while (arr.length < 10) arr.push('');
                        arr[i] = e.target.value;
                        setField('DELTA_CAP_y', arr.join(', '));
                      }}
                      style={{
                        width: '100%', textAlign: 'center', border: '1px solid #e2e8f0',
                        borderRadius: 6, padding: '4px 2px', fontSize: 12,
                        fontFamily: 'Inter, sans-serif', outline: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned capacity utilization by year (%) <span style={{ color: '#94a3b8', fontWeight: 400 }}>UTIL[y]</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => {
                const vals = form.UTIL_y ? form.UTIL_y.split(',') : [];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Y{i + 1}</span>
                    <input
                      type="number"
                      step="1"
                      placeholder="80"
                      value={vals[i]?.trim() || ''}
                      onChange={(e) => {
                        const arr = form.UTIL_y ? form.UTIL_y.split(',').map(s => s.trim()) : [];
                        while (arr.length < 10) arr.push('');
                        arr[i] = e.target.value;
                        setField('UTIL_y', arr.join(', '));
                      }}
                      style={{
                        width: '100%', textAlign: 'center', border: '1px solid #e2e8f0',
                        borderRadius: 6, padding: '4px 2px', fontSize: 12,
                        fontFamily: 'Inter, sans-serif', outline: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <Field label="Utilisation rate of new capacity at ramp per month (%)" symbol="UTIL_RAMP" error={errors.UTIL_RAMP}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 85.0"
              value={form.UTIL_RAMP}
              onChange={(e) => setField('UTIL_RAMP', e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned PUE improvement by year (fractional, e.g. 0.05 = 5%) <span style={{ color: '#94a3b8', fontWeight: 400 }}>PUE[y]</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => {
                const vals = form.PUE_y ? form.PUE_y.split(',') : [];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Y{i + 1}</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={vals[i]?.trim() || ''}
                      onChange={(e) => {
                        const arr = form.PUE_y ? form.PUE_y.split(',').map(s => s.trim()) : [];
                        while (arr.length < 10) arr.push('');
                        arr[i] = e.target.value;
                        setField('PUE_y', arr.join(', '));
                      }}
                      style={{
                        width: '100%', textAlign: 'center', border: '1px solid #e2e8f0',
                        borderRadius: 6, padding: '4px 2px', fontSize: 12,
                        fontFamily: 'Inter, sans-serif', outline: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned on-site renewable additions by year (MW) <span style={{ color: '#94a3b8', fontWeight: 400 }}>RE_GEN[y]</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => {
                const vals = form.RE_GEN_y ? form.RE_GEN_y.split(',') : [];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Y{i + 1}</span>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0"
                      value={vals[i]?.trim() || ''}
                      onChange={(e) => {
                        const arr = form.RE_GEN_y ? form.RE_GEN_y.split(',').map(s => s.trim()) : [];
                        while (arr.length < 10) arr.push('');
                        arr[i] = e.target.value;
                        setField('RE_GEN_y', arr.join(', '));
                      }}
                      style={{
                        width: '100%', textAlign: 'center', border: '1px solid #e2e8f0',
                        borderRadius: 6, padding: '4px 2px', fontSize: 12,
                        fontFamily: 'Inter, sans-serif', outline: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={{ display: 'block', marginBottom: 8 }}>
              Planned battery storage additions by year (MWh) <span style={{ color: '#94a3b8', fontWeight: 400 }}>BATT_ADD[y]</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {Array.from({ length: 10 }, (_, i) => {
                const vals = form.BATT_ADD_y ? form.BATT_ADD_y.split(',') : [];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Y{i + 1}</span>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0"
                      value={vals[i]?.trim() || ''}
                      onChange={(e) => {
                        const arr = form.BATT_ADD_y ? form.BATT_ADD_y.split(',').map(s => s.trim()) : [];
                        while (arr.length < 10) arr.push('');
                        arr[i] = e.target.value;
                        setField('BATT_ADD_y', arr.join(', '));
                      }}
                      style={{
                        width: '100%', textAlign: 'center', border: '1px solid #e2e8f0',
                        borderRadius: 6, padding: '4px 2px', fontSize: 12,
                        fontFamily: 'Inter, sans-serif', outline: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
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
                  label="Contracted volume (MW or MWh)"
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

      <div className="flex items-center justify-end gap-3 pb-6">
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
    </form>
  );

} // End of FacilityProfile

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
