import { useMemo } from 'react';
import { Country, State, City } from 'country-state-city';

// Cascading Country → State → City dropdowns plus a free-text ZIP/postal code.
//
// Stored values:
//   country — ISO-3166 alpha-2 code (e.g. "US"), needed to look up states
//   state   — ISO state code (e.g. "CA"), needed to look up cities
//   city    — city name (the dataset has no stable code for cities)
//   zip     — free text
//
// Selecting a country clears the state, city; selecting a state clears the city,
// so a stale child value can never be saved against a new parent.

export type LocationCascadeValue = {
  country: string;
  state: string;
  city: string;
  zip: string;
};

// Resolve a {lat, lng} from the cascade selection using the coordinates baked
// into the country-state-city dataset. Resolves to the most specific level
// available: city centre → state centroid → country centroid → null. Used to
// drive the weather forecast when no precise address has been geocoded.
export function resolveCascadeCoords(v: {
  country: string;
  state: string;
  city: string;
}): { lat: number; lng: number } | null {
  const num = (lat?: string | null, lng?: string | null) => {
    const la = Number(lat);
    const lo = Number(lng);
    return isFinite(la) && isFinite(lo) ? { lat: la, lng: lo } : null;
  };

  if (v.country && v.state && v.city) {
    const city = City.getCitiesOfState(v.country, v.state).find((c) => c.name === v.city);
    const p = city && num(city.latitude, city.longitude);
    if (p) return p;
  }
  if (v.country && v.state) {
    const state = State.getStatesOfCountry(v.country).find((s) => s.isoCode === v.state);
    const p = state && num(state.latitude, state.longitude);
    if (p) return p;
  }
  if (v.country) {
    const country = Country.getCountryByCode(v.country);
    const p = country && num(country.latitude, country.longitude);
    if (p) return p;
  }
  return null;
}

type Props = {
  value: LocationCascadeValue;
  onChange: (patch: Partial<LocationCascadeValue>) => void;
  inputCls: string;
};

export default function LocationCascade({ value, onChange, inputCls }: Props) {
  const countries = useMemo(() => Country.getAllCountries(), []);
  const states = useMemo(
    () => (value.country ? State.getStatesOfCountry(value.country) : []),
    [value.country],
  );
  const cities = useMemo(
    () =>
      value.country && value.state
        ? City.getCitiesOfState(value.country, value.state)
        : [],
    [value.country, value.state],
  );

  return (
    <>
      <Labelled label="Country">
        <select
          value={value.country}
          onChange={(e) =>
            // New country → drop any previously selected state/city.
            onChange({ country: e.target.value, state: '', city: '' })
          }
          className={inputCls}
        >
          <option value="">Select…</option>
          {countries.map((c) => (
            <option key={c.isoCode} value={c.isoCode}>
              {c.name}
            </option>
          ))}
        </select>
      </Labelled>

      <Labelled label="State / Province">
        <select
          value={value.state}
          onChange={(e) => onChange({ state: e.target.value, city: '' })}
          className={inputCls}
          disabled={!value.country || states.length === 0}
        >
          <option value="">
            {!value.country
              ? 'Select a country first…'
              : states.length === 0
                ? 'No states available'
                : 'Select…'}
          </option>
          {states.map((s) => (
            <option key={s.isoCode} value={s.isoCode}>
              {s.name}
            </option>
          ))}
        </select>
      </Labelled>

      <Labelled label="City">
        <select
          value={value.city}
          onChange={(e) => onChange({ city: e.target.value })}
          className={inputCls}
          disabled={!value.state || cities.length === 0}
        >
          <option value="">
            {!value.state
              ? 'Select a state first…'
              : cities.length === 0
                ? 'No cities available'
                : 'Select…'}
          </option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Labelled>

      <Labelled label="ZIP / Postal code">
        <input
          type="text"
          placeholder="e.g. 20147"
          value={value.zip}
          onChange={(e) => onChange({ zip: e.target.value })}
          className={inputCls}
        />
      </Labelled>
    </>
  );
}

// Light-weight label wrapper matching the Field layout used in facilityProfile
// (uppercase tracked label above the control), without the tooltip/error slots
// the numeric fields need.
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-widest block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
