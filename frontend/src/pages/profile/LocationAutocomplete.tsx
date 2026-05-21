import { useEffect, useRef, useState } from 'react';
import { ewkbToPoint, pointToEWKB } from './ewkb';

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

// Nominatim forward geocoding — typed query → candidate addresses.
// Free tier policy: max ~1 req/sec, send a meaningful Referer (the browser
// already supplies it). Heavy production use should self-host or pay.
async function forwardGeocode(query: string, signal: AbortSignal): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
  const res = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
  return res.json();
}

async function reverseGeocode(lat: number, lng: number, signal: AbortSignal): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  const res = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return '';
  const j = await res.json();
  return j.display_name || '';
}

interface Props {
  value: string;       // EWKB hex
  onChange: (ewkb: string) => void;
  className?: string;
  placeholder?: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  className,
  placeholder = 'Type an address…',
}: Props) {
  const [displayText, setDisplayText] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  // Track which EWKB value last produced our displayText so we don't overwrite
  // a user's freshly-typed input when the parent re-renders with the same value.
  const lastResolvedRef = useRef<string>('');

  // When the EWKB value changes externally (initial load, facility tab switch),
  // decode it and reverse-geocode for a human-readable address. While Nominatim
  // is in flight (or if it fails), fall back to showing the raw coordinates so
  // the user always sees that a location is present.
  useEffect(() => {
    if (value === lastResolvedRef.current) return;
    lastResolvedRef.current = value;
    if (!value) {
      setDisplayText('');
      return;
    }
    const point = ewkbToPoint(value);
    if (!point) {
      console.warn('[LocationAutocomplete] Could not decode EWKB:', value);
      setDisplayText('');
      return;
    }
    // Fallback display so the field never looks empty for a populated facility.
    setDisplayText(`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
    const ctrl = new AbortController();
    reverseGeocode(point.lat, point.lng, ctrl.signal)
      .then(name => {
        if (name) setDisplayText(name);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') {
          console.warn('[LocationAutocomplete] Reverse-geocode failed:', err);
        }
      });
    return () => ctrl.abort();
  }, [value]);

  function handleInputChange(text: string) {
    setDisplayText(text);
    setOpen(true);
    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
    }
    if (!text.trim()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      setLoading(true);
      try {
        const results = await forwardGeocode(text, ctrl.signal);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 600);
  }

  function handleSelect(s: NominatimResult) {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    if (isNaN(lat) || isNaN(lng)) return;
    const ewkb = pointToEWKB(lng, lat);
    lastResolvedRef.current = ewkb;
    setDisplayText(s.display_name);
    setSuggestions([]);
    setOpen(false);
    onChange(ewkb);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={displayText}
        placeholder={placeholder}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        // Delay close so onClick on a suggestion can fire before blur tears the dropdown down.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={className}
      />
      {open && (loading || suggestions.length > 0) && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            marginTop: 4,
            zIndex: 50,
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
          }}
        >
          {loading && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>Searching…</div>
          )}
          {!loading &&
            suggestions.map(s => (
              <button
                key={s.place_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  fontSize: 12,
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  color: '#334155',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {s.display_name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
