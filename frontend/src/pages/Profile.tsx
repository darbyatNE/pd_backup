import { useState, useEffect, useMemo, useRef } from 'react';
import { Country } from 'country-state-city';
import { useAuth } from '../contexts/AuthContext';
import { useScopeContext } from '../contexts/ScopeContext';
import FacilityProfile from './profile/datacenterProfiles';
import LoadForcast from './profile/loadForecast';

type ProfileTab = 'facility' | 'load-forecast';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'facility', label: 'Facility Profile' },
  { id: 'load-forecast', label: 'Load Forecast' },
];

// ─── Electricity Maps zone API ───────────────────────────────────────────────
// Falls back to STATIC_GRID_ZONES when the env token is absent or the fetch fails.

const EM_TOKEN = import.meta.env.VITE_ELECTRICITY_MAPS_TOKEN as string | undefined;

type EMZone = { zoneName: string; countryCode?: string };
let emZonesCache: Record<string, EMZone> | null = null;
let emFetchPromise: Promise<Record<string, EMZone> | null> | null = null;

function fetchEmZones(): Promise<Record<string, EMZone> | null> {
  if (emZonesCache) return Promise.resolve(emZonesCache);
  if (emFetchPromise) return emFetchPromise;
  if (!EM_TOKEN) return Promise.resolve(null);

  emFetchPromise = fetch('https://api.electricitymap.org/v3/zones', {
    headers: { 'auth-token': EM_TOKEN },
  })
    .then(r => (r.ok ? r.json() : null))
    .then(data => { emZonesCache = data; return data; })
    .catch(() => null);

  return emFetchPromise;
}

// Static fallback: country ISO-2 → common grid/market zone names
const STATIC_GRID_ZONES: Record<string, string[]> = {
  US: ['PJM', 'MISO', 'ERCOT', 'CAISO', 'NYISO', 'ISO-NE', 'SPP', 'WECC'],
  CA: ['AESO', 'IESO', 'HQ', 'NBSO', 'NSPML', 'SaskPower'],
  GB: ['National Grid ESO'],
  DE: ['Amprion', 'TenneT DE', '50Hertz', 'TransnetBW'],
  FR: ['RTE'],
  NL: ['TenneT NL'],
  IE: ['EirGrid'],
  SE: ['Svenska kraftnät'],
  NO: ['Statnett'],
  FI: ['Fingrid'],
  DK: ['Energinet'],
  PL: ['PSE'],
  ES: ['REE'],
  IT: ['Terna'],
  BE: ['Elia'],
  AT: ['APG'],
  CH: ['Swissgrid'],
  PT: ['REN'],
  AU: ['AEMO', 'WEM'],
  JP: ['TEPCO', 'Kansai', 'Chubu', 'Kyushu', 'Tohoku', 'Hokkaido'],
  SG: ['EMA'],
  KR: ['KPX'],
  IN: ['NLDC', 'SRPC', 'NRPC', 'ERPC', 'WRPC'],
  BR: ['ONS'],
  CL: ['CDEC-SIC', 'CDEC-SING'],
  ZA: ['Eskom'],
  MX: ['CENACE'],
};

function useGridZones(countryCode: string): { zones: string[]; loading: boolean } {
  const [zones, setZones] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) { setZones([]); return; }
    setLoading(true);

    fetchEmZones().then(data => {
      if (data) {
        const matched = Object.entries(data)
          .filter(([key, z]) =>
            z.countryCode === countryCode ||
            key === countryCode ||
            key.startsWith(countryCode + '-'),
          )
          .map(([, z]) => z.zoneName)
          .filter(Boolean)
          .sort();
        setZones(matched.length > 0 ? matched : (STATIC_GRID_ZONES[countryCode] ?? []));
      } else {
        setZones(STATIC_GRID_ZONES[countryCode] ?? []);
      }
      setLoading(false);
    });
  }, [countryCode]);

  return { zones, loading };
}

// ─── Region → ISO-3166 alpha-2 country code mapping ──────────────────────────
const REGION_COUNTRIES: Record<string, string[]> = {
  'North America': ['US', 'CA', 'MX'],
  'Europe': ['GB', 'DE', 'FR', 'NL', 'IE', 'SE', 'NO', 'FI', 'DK', 'PL', 'ES', 'IT', 'BE', 'AT', 'CH', 'PT', 'CZ', 'HU', 'RO'],
  'Asia Pacific': ['JP', 'SG', 'AU', 'KR', 'IN', 'CN', 'HK', 'TW', 'TH', 'MY', 'NZ'],
  'South America': ['BR', 'CL', 'CO', 'AR', 'PE'],
  'Middle East & Africa': ['AE', 'SA', 'ZA', 'EG', 'NG', 'IL', 'TR'],
};

function countryToRegion(isoCode: string): string {
  for (const [region, codes] of Object.entries(REGION_COUNTRIES)) {
    if (codes.includes(isoCode)) return region;
  }
  return '';
}

function countryDisplayName(isoCode: string): string {
  if (!isoCode) return '';
  return Country.getCountryByCode(isoCode)?.name ?? isoCode;
}

type FacilityRow = { id: string; name: string; COUNTRY: string; STATE: string; CITY: string; ISO: string; AVAILABILITY_ZONE: string };

// ─── Sidebar section: searchable dropdown + selected chip ─────────────────────
function SidebarSection({
  label,
  options,
  value,
  onSelect,
  onClear,
  searchable,
  labelFn,
}: {
  label: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
  labelFn?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const displayFn = labelFn ?? ((v: string) => v);
  const filteredOpts = searchable
    ? options.filter(o => displayFn(o).toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} style={{ marginBottom: 14, position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '7px 10px',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          background: '#fff',
          fontSize: 12,
          color: '#64748b',
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 200,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#fff',
            marginTop: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            overflow: 'hidden',
          }}
        >
          {searchable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'Inter, sans-serif', color: '#1e293b', background: 'transparent' }}
              />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>⌕</span>
            </div>
          )}
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filteredOpts.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>No options</div>
            )}
            {filteredOpts.map((opt) => (
              <button
                key={opt}
                onClick={() => { onSelect(opt); setOpen(false); setSearch(''); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  background: value === opt ? '#f0fdfa' : 'transparent',
                  border: 'none',
                  fontSize: 12,
                  color: value === opt ? '#0d9488' : '#1e293b',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: value === opt ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (value !== opt) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (value !== opt) e.currentTarget.style.background = 'transparent'; }}
              >
                {displayFn(opt)}
              </button>
            ))}
          </div>
        </div>
      )}

      {value && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 6, padding: '4px 10px', marginTop: 6, fontSize: 12, color: '#1e293b', fontFamily: 'Inter, sans-serif', fontWeight: 500, maxWidth: '100%', overflow: 'hidden' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayFn(value)}</span>
          <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0 }} title="Clear">×</button>
        </div>
      )}
    </div>
  );
}

// ─── Location Sidebar ─────────────────────────────────────────────────────────
function LocationSidebar({
  facilities,
  activeFacilityId,
  onSelect,
}: {
  facilities: FacilityRow[];
  activeFacilityId: string | null;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [locRegion, setLocRegion] = useState('');
  const [locCountry, setLocCountry] = useState('');
  const [locAZ, setLocAZ] = useState('');
  const [locSite, setLocSite] = useState('');

  const availableRegions = useMemo(() => {
    const regions = [...new Set(facilities.map(f => countryToRegion(f.COUNTRY)).filter(Boolean))];
    return regions.length > 0 ? regions : Object.keys(REGION_COUNTRIES);
  }, [facilities]);

  const availableCountries = useMemo(() => {
    if (locRegion) {
      // Show every country in the selected region
      return REGION_COUNTRIES[locRegion] ?? [];
    }
    // No region selected: show only countries the user actually has facilities in
    return [...new Set(facilities.map(f => f.COUNTRY).filter(Boolean))];
  }, [facilities, locRegion]);

  const availableAZs = useMemo(() =>
    [...new Set(
      facilities
        .filter(f =>
          (!locRegion || countryToRegion(f.COUNTRY) === locRegion) &&
          (!locCountry || f.COUNTRY === locCountry),
        )
        .map(f => f.AVAILABILITY_ZONE)
        .filter(Boolean),
    )],
  [facilities, locRegion, locCountry]);

  const availableSites = useMemo(() =>
    [...new Set(
      facilities
        .filter(f =>
          (!locRegion || countryToRegion(f.COUNTRY) === locRegion) &&
          (!locCountry || f.COUNTRY === locCountry) &&
          (!locAZ || f.AVAILABILITY_ZONE === locAZ),
        )
        .map(f => f.CITY).filter(Boolean),
    )],
  [facilities, locRegion, locCountry, locAZ]);

  const filteredFacilities = useMemo(() =>
    facilities.filter(f =>
      (!locRegion || countryToRegion(f.COUNTRY) === locRegion) &&
      (!locCountry || f.COUNTRY === locCountry) &&
      (!locAZ || f.AVAILABILITY_ZONE === locAZ) &&
      (!locSite || f.CITY === locSite),
    ),
  [facilities, locRegion, locCountry, locAZ, locSite]);

  if (collapsed) {
    return (
      <div style={{ width: 32, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 0 }}>
        <button
          onClick={() => setCollapsed(false)}
          title="Expand location filter"
          style={{
            boxSizing: 'border-box',
            width: 32,
            height: 64,
            background: '#FFFFFF',
            border: '1px solid rgba(134, 133, 133, 0.33)',
            borderRadius: '0px 10px 10px 0px',
            cursor: 'pointer',
            fontSize: 13,
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700,
          }}
        >
          {'»'}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        boxSizing: 'border-box',
        width: 234,
        minHeight: 872,
        flexShrink: 0,
        background: '#FFFFFF',
        border: '1px solid rgba(134, 133, 133, 0.33)',
        borderRadius: '0px 10px 10px 0px',
        padding: '20px 16px',
        marginRight: 24,
        fontFamily: 'Inter, sans-serif',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Location</span>
        <button onClick={() => setCollapsed(true)} title="Collapse" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif', padding: '2px 4px' }}>{'«'}</button>
      </div>

      <SidebarSection
        label="Region"
        options={availableRegions}
        value={locRegion}
        onSelect={(v) => { setLocRegion(v); setLocCountry(''); setLocAZ(''); setLocSite(''); }}
        onClear={() => { setLocRegion(''); setLocCountry(''); setLocAZ(''); setLocSite(''); }}
      />
      <SidebarSection
        label="Country"
        options={availableCountries}
        value={locCountry}
        onSelect={(v) => { setLocCountry(v); setLocAZ(''); setLocSite(''); }}
        onClear={() => { setLocCountry(''); setLocAZ(''); setLocSite(''); }}
        searchable
        labelFn={countryDisplayName}
      />
      <SidebarSection
        label="Availability Zone"
        options={availableAZs}
        value={locAZ}
        onSelect={(v) => { setLocAZ(v); setLocSite(''); }}
        onClear={() => { setLocAZ(''); setLocSite(''); }}
      />
      <SidebarSection
        label="Site"
        options={availableSites}
        value={locSite}
        onSelect={(v) => setLocSite(v)}
        onClear={() => setLocSite('')}
      />
      {/* ── Facility cards ── */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Facility
        </div>

        {filteredFacilities.length === 0 && facilities.length > 0 && (
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>No facilities match the selected filters.</p>
        )}

        {filteredFacilities.map(f => {
          const active = activeFacilityId === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 8,
                borderRadius: 8,
                border: active ? '1.5px solid #0d9488' : '1px solid #e2e8f0',
                background: active ? '#f0fdfa' : '#fff',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.15s ease',
                boxShadow: active ? '0 1px 6px rgba(13,148,136,0.10)' : 'none',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: active ? '#0d9488' : '#1e293b', marginBottom: 2 }}>
                {f.name}
              </div>
              {(f.CITY || f.COUNTRY) && (
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {[f.CITY, countryDisplayName(f.COUNTRY)].filter(Boolean).join(', ')}
                </div>
              )}
              {f.ISO && (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {f.ISO}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────
export default function Profile() {
  const { user } = useAuth();
  const { availableSites } = useScopeContext();
  const [activeTab, setActiveTab] = useState<ProfileTab>('facility');
  const [focusFacilityId, setFocusFacilityId] = useState<string | null>(null);
  const [facilityRows, setFacilityRows] = useState<FacilityRow[]>([]);

  // Re-fetch whenever availableSites changes (e.g. after FacilityIntakeModal saves a new facility)
  const availableSitesKey = availableSites.join(',');

  useEffect(() => {
    if (!user?.id) return;
    const API_URL = import.meta.env.VITE_API_URL || '/api';

    Promise.all([
      fetch(`${API_URL}/facilities?buyer_id=${user.id}`).then(r => r.ok ? r.json() : { data: [] }),
      fetch(`${API_URL}/onboarding/progress/${user.id}`).then(r => r.ok ? r.json() : { data: null }),
    ]).then(([facilitiesRes, onboardingRes]) => {
      // Build name → availability_zone map from onboarding facility_profiles
      const azByName: Record<string, string> = {};
      const profiles = onboardingRes.data?.facility_profiles;
      const parsed = typeof profiles === 'string' ? JSON.parse(profiles) : profiles;
      if (Array.isArray(parsed)) {
        for (const fp of parsed) {
          if (fp.lp_facility_name && fp.lp_availability_zone) {
            azByName[fp.lp_facility_name.trim()] = fp.lp_availability_zone;
          }
        }
      }

      const rows: FacilityRow[] = (facilitiesRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        name: r.name || `Facility ${r.id}`,
        COUNTRY: r.country ?? '',
        STATE: r.state ?? '',
        CITY: r.city ?? '',
        ISO: r.iso_rto ?? '',
        AVAILABILITY_ZONE: azByName[r.name?.trim()] ?? '',
      }));
      setFacilityRows(rows);
      if (!focusFacilityId && rows.length > 0) setFocusFacilityId(rows[0].id);
    }).catch(() => setFacilityRows([]));
  }, [user?.id, availableSitesKey]);


  const handleFacilitySaved = (facilityId: string) => {
    setFocusFacilityId(facilityId);
    setActiveTab('load-forecast');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto pr-4 sm:pr-6 lg:pr-8 py-6" style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <LocationSidebar
        facilities={facilityRows}
        activeFacilityId={focusFacilityId}
        onSelect={(id) => setFocusFacilityId(id)}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="border-b border-slate-200 mb-6">
          <nav className="-mb-px flex gap-6" aria-label="Profile sections">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap border-b-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {activeTab === 'facility' && (
          <FacilityProfile onSaved={handleFacilitySaved} initialFacilityId={focusFacilityId} facilityId={focusFacilityId} />
        )}
        {activeTab === 'load-forecast' && (
          <LoadForcast facilityId={focusFacilityId} onFacilityChange={setFocusFacilityId} />
        )}
      </div>
    </div>
  );
}
