import { useEffect, useState } from 'react';

type Point = { lat: number; lng: number };

type ArchiveResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
  };
};

// Module-level caches keyed by coordinate (rounded to 4 dp ≈ 11 m) + year.
// Survives component remounts and facility switches within the session.
const cache = new Map<string, number[]>();
const inFlight = new Map<string, Promise<number[]>>();

function cacheKey(p: Point, year: number): string {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)},${year}`;
}

function buildArchiveUrl(p: Point, year: number): string {
  const params = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lng),
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    hourly: 'temperature_2m',
    timezone: 'auto',
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

// Leap years return 8784 hours; calculateHourlyForecast expects 8760 (non-leap
// HOURS_PER_MONTH). Drop Feb 29's 24 hours starting at hour-of-year 1416.
function normalizeTo8760(series: number[]): number[] {
  if (series.length === 8784) {
    return [...series.slice(0, 1416), ...series.slice(1440)];
  }
  return series;
}

async function fetchArchive(p: Point, year: number): Promise<number[]> {
  const key = cacheKey(p, year);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetch(buildArchiveUrl(p, year))
    .then(async (res) => {
      if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
      return (await res.json()) as ArchiveResponse;
    })
    .then((json) => {
      const arr = json.hourly?.temperature_2m;
      if (!Array.isArray(arr)) throw new Error('Missing hourly.temperature_2m');
      const series = normalizeTo8760(arr.map((v) => (typeof v === 'number' ? v : 0)));
      cache.set(key, series);
      return series;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

// Fetches Open-Meteo's ERA5 archive (free, no key) for a full calendar year of
// hourly °C temperatures at (lat, lng). Returns 8760 values (leap years are
// normalised by dropping Feb 29). Caches across hook calls by coordinate+year.
export function useHourlyArchive(point: Point | null, year: number): {
  data: number[] | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<number[] | null>(() => {
    if (!point) return null;
    return cache.get(cacheKey(point, year)) ?? null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!point) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const key = cacheKey(point, year);
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchArchive(point, year)
      .then((series) => {
        if (cancelled) return;
        setData(series);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : 'Failed to load archive');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [point?.lat, point?.lng, year]);

  return { data, loading, error };
}
