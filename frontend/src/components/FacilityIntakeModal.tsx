import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useScopeContext } from '../contexts/ScopeContext';
import { State, City } from 'country-state-city';
import LocationCascade from '../pages/profile/LocationCascade';

// ─── Types ────────────────────────────────────────────────────────────────────

type FacilityForm = {
  lp_facility_status: string;
  lp_facility_name: string;
  lp_address: string;
  lp_country: string;
  lp_state: string;
  lp_city: string;
  lp_zipcode: string;
  lp_iso_rto: string;
};

const EMPTY: FacilityForm = {
  lp_facility_status: '',
  lp_facility_name: '',
  lp_address: '',
  lp_country: '',
  lp_state: '',
  lp_city: '',
  lp_zipcode: '',
  lp_iso_rto: '',
};

const ISO_RTO_OPTIONS = ['PJM', 'MISO', 'ERCOT', 'CAISO', 'NYISO', 'ISO-NE', 'SPP'];

// ─── Address autocomplete ─────────────────────────────────────────────────────

type NominatimResult = {
  display_name: string;
  address: {
    city?: string; town?: string; village?: string; municipality?: string;
    state?: string; country_code?: string; postcode?: string;
  };
};

function AddressAutocomplete({ value, onAddressChange, onPlacePicked, inputClass }: {
  value: string;
  onAddressChange: (v: string) => void;
  onPlacePicked: (parts: { country: string; state: string; city: string; zip: string }) => void;
  inputClass: string;
}) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    onAddressChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.length < 3) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v)}&format=json&addressdetails=1&limit=6`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch { /* ignore */ }
    }, 420);
  };

  const handlePick = (r: NominatimResult) => {
    const a = r.address;
    const countryCode = (a.country_code || '').toUpperCase();
    const stateName = a.state || '';
    const stateMatch = State.getStatesOfCountry(countryCode).find(
      s => s.name.toLowerCase() === stateName.toLowerCase(),
    );
    const stateCode = stateMatch?.isoCode || '';
    const nominatimCity = a.city || a.town || a.village || a.municipality || '';
    let city = nominatimCity;
    if (countryCode && stateCode && nominatimCity) {
      const datasetCities = City.getCitiesOfState(countryCode, stateCode);
      const norm = (s: string) => s.toLowerCase();
      const exact = datasetCities.find(c => norm(c.name) === norm(nominatimCity));
      const partial = !exact && datasetCities.find(
        c => norm(c.name).includes(norm(nominatimCity)) || norm(nominatimCity).includes(norm(c.name)),
      );
      city = exact?.name || partial?.name || nominatimCity;
    }
    onAddressChange(r.display_name);
    onPlacePicked({ country: countryCode, state: stateCode, city, zip: a.postcode || '' });
    setResults([]);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={inputClass}
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="123 Main St, Ashburn, VA…"
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10100,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          marginTop: 4, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
        }}>
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handlePick(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', fontSize: 12, background: 'none', border: 'none',
                borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none',
                cursor: 'pointer', color: '#334155', fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  initialName: string;
  onClose: () => void;
  onSaved: (facilityName: string) => void;
}

export default function FacilityIntakeModal({ initialName, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { addSite, refreshSites } = useScopeContext();
  const [form, setForm] = useState<FacilityForm>({ ...EMPTY, lp_facility_name: initialName });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FacilityForm, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.lp_facility_name.trim()) { setError('Facility name is required.'); return; }
    if (!user?.id) { setError('Not signed in.'); return; }
    setSaving(true);
    setError(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${API_URL}/facilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: user.id,
          name: form.lp_facility_name.trim(),
          country: form.lp_country || null,
          state: form.lp_state || null,
          city: form.lp_city || null,
          zip_code: form.lp_zipcode || null,
          iso_rto: form.lp_iso_rto || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save facility');
      const name = form.lp_facility_name.trim();
      addSite(name);
      await refreshSites();
      onSaved(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  // Lock body scroll while modal is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const inputCls =
    'w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 ' +
    'placeholder-slate-400 bg-white transition ' +
    'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100';

  const selectCls =
    'w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 ' +
    'appearance-none bg-white transition ' +
    'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100';

  return (
    <>
      {/* Layer 1 — full-viewport dark scrim (z-40) */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw', height: '100vh',
          zIndex: 40,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      />

      {/* Layer 2 — scroll + centering wrapper (z-50), above scrim */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw', height: '100vh',
          zIndex: 50,
          overflowY: 'auto',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '72px 24px 48px',
        }}
        onClick={onClose}
      >
        {/* Modal card — stops click propagation so backdrop click doesn't fire */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            width: '100%',
            maxWidth: 560,
            boxShadow: '0 32px 80px rgba(2,8,23,0.35)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '28px 32px 0',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em' }}>
                  Add New Facility
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
                Set up the site's identity and location. Grid details can be filled in&nbsp;Facility Profile after creation.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                flexShrink: 0, marginLeft: 16, marginTop: 2,
                width: 32, height: 32, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b',
                fontSize: 16, lineHeight: 1, transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#e2e8f0')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f1f5f9')}
            >
              ✕
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#f1f5f9', margin: '24px 0 0' }} />

          {/* Form body */}
          <div style={{ padding: '24px 32px' }}>

            {/* Status + Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em' }}>
                  Facility Status
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    className={selectCls}
                    value={form.lp_facility_status}
                    onChange={e => set('lp_facility_status', e.target.value)}
                  >
                    <option value="" disabled>Select…</option>
                    <option value="Brownfield">Brownfield (Operational)</option>
                    <option value="Greenfield">Greenfield (Planned)</option>
                  </select>
                  <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em' }}>
                  Facility Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  className={inputCls}
                  type="text"
                  placeholder="e.g. Ashburn-1"
                  value={form.lp_facility_name}
                  onChange={e => set('lp_facility_name', e.target.value)}
                />
              </div>
            </div>

            {/* Section label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Location</span>
              <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
            </div>

            {/* Address search */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
                Street Address
              </label>
              <AddressAutocomplete
                value={form.lp_address}
                onAddressChange={v => set('lp_address', v)}
                onPlacePicked={({ country, state, city, zip }) => {
                  setForm(prev => ({ ...prev, lp_country: country, lp_state: state, lp_city: city, lp_zipcode: zip }));
                }}
                inputClass={inputCls}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 5, fontFamily: 'Inter, sans-serif' }}>
                Selecting a suggestion auto-fills Country, State, City and ZIP below.
              </p>
            </div>

            {/* Country / State / City / ZIP */}
            <div style={{ marginBottom: 20 }}>
              <LocationCascade
                value={{ country: form.lp_country, state: form.lp_state, city: form.lp_city, zip: form.lp_zipcode }}
                onChange={patch => {
                  setForm(prev => {
                    const next = { ...prev };
                    if (patch.country !== undefined) { next.lp_country = patch.country; next.lp_state = ''; next.lp_city = ''; }
                    if (patch.state !== undefined) { next.lp_state = patch.state; next.lp_city = ''; }
                    if (patch.city !== undefined) next.lp_city = patch.city;
                    if (patch.zip !== undefined) next.lp_zipcode = patch.zip;
                    return next;
                  });
                }}
                inputCls={inputCls}
              />
            </div>

            {/* Section label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Grid Region</span>
              <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
            </div>

            {/* ISO / RTO */}
            <div style={{ marginBottom: 4 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
                ISO / RTO
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  className={selectCls}
                  value={form.lp_iso_rto}
                  onChange={e => set('lp_iso_rto', e.target.value)}
                >
                  <option value="">Select…</option>
                  {ISO_RTO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>

            {/* Info hint */}
            <div style={{
              marginTop: 20, padding: '12px 14px', borderRadius: 10,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <svg style={{ flexShrink: 0, marginTop: 1, color: '#16a34a' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <p style={{ margin: 0, fontSize: 12, color: '#15803d', fontFamily: 'Inter, sans-serif', lineHeight: 1.55 }}>
                Grid voltage, contracted capacity, POD ID and interconnection details can be completed in <strong>Facility Profile</strong> after the site is created.
              </p>
            </div>

            {/* Error */}
            {error && (
              <p style={{ marginTop: 14, fontSize: 13, color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>{error}</p>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 32px 24px',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            borderTop: '1px solid #f1f5f9',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 20px', borderRadius: 9, border: '1px solid #e2e8f0',
                background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600,
                fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.lp_facility_name.trim()}
              style={{
                padding: '9px 24px', borderRadius: 9, border: 'none',
                background: saving || !form.lp_facility_name.trim()
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                cursor: saving || !form.lp_facility_name.trim() ? 'not-allowed' : 'pointer',
                boxShadow: saving || !form.lp_facility_name.trim() ? 'none' : '0 2px 8px rgba(15,118,110,0.35)',
              }}
            >
              {saving ? 'Saving…' : 'Create Facility'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
