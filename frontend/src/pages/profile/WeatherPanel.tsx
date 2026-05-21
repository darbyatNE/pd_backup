import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ewkbToPoint } from './ewkb';

type Unit = 'celsius' | 'fahrenheit';
type Metric = 'temp' | 'ppue' | 'cooling';

type ForecastResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  current?: {
    time: string;
    temperature_2m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
  };
};

type ChartPoint = {
  ts: number;
  label: string;
  temp: number;       // in the selected display unit
  tempC: number;      // always Celsius (used for pPUE polynomial)
  ppue: number;       // partial PUE = 1 + P_COOL / P_IT
  cooling: number;    // P_COOLING in MW = P_IT × (pPUE − 1)
};

type WeatherPanelProps = {
  facilityLocation: string;
  facilityStatus: string;
  itLoadMw: number | null;        // IT_LOAD (Running facility, MW)
  pItStartMw: number | null;      // P_IT_START (Greenfield, MW)
  measurementPoint: string;       // 'UPS Input' | 'PDU Input' | 'PDU Output / Rack'
  etaUpsPct: number | null;       // ETA_UPS (%)
  etaPduPct: number | null;       // ETA_PDU (%)
};

const FORECAST_DAYS = 7;

function buildUrl(lat: number, lng: number, unit: Unit): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: 'temperature_2m',
    current: 'temperature_2m',
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: unit,
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function formatTick(ts: number): string {
  const d = new Date(ts);
  const hour = d.getHours();
  if (hour === 0) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return `${hour}:00`;
}

function formatTooltipLabel(ts: unknown): string {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!isFinite(n)) return '';
  const d = new Date(n);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Partial PUE polynomial fit (T in °C) — matches loadCalculation.calcPPUE
function calcPPUE(T_celsius: number): number {
  return 7.1705e-5 * T_celsius * T_celsius + 0.0041 * T_celsius + 1.0743;
}

// Year-0 IT load, equivalent to P_IT_PROJ[s][0][m] from calculateMultiYearForecast.
// At y=0 there is no growth/capacity addition, so the projection collapses to
// the Phase-1 P_IT value (a flat 12-month array). We compute the scalar here.
function computeYear0PIT(props: {
  facilityStatus: string;
  itLoadMw: number | null;
  pItStartMw: number | null;
  measurementPoint: string;
  etaUpsPct: number | null;
  etaPduPct: number | null;
}): number {
  if (props.facilityStatus === 'Running') {
    const eta_ups = props.etaUpsPct != null ? props.etaUpsPct / 100 : 0.97;
    const eta_pdu = props.etaPduPct != null ? props.etaPduPct / 100 : 0.98;
    let pit = props.itLoadMw ?? 0;
    if (props.measurementPoint === 'UPS Input') pit = pit * eta_ups * eta_pdu;
    else if (props.measurementPoint === 'PDU Input') pit = pit * eta_pdu;
    return pit;
  }
  return props.pItStartMw ?? 0;
}

export default function WeatherPanel({
  facilityLocation,
  facilityStatus,
  itLoadMw,
  pItStartMw,
  measurementPoint,
  etaUpsPct,
  etaPduPct,
}: WeatherPanelProps) {
  const point = useMemo(() => ewkbToPoint(facilityLocation), [facilityLocation]);
  const [unit, setUnit] = useState<Unit>('celsius');
  const [metric, setMetric] = useState<Metric>('temp');
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pItMw = useMemo(
    () =>
      computeYear0PIT({
        facilityStatus,
        itLoadMw,
        pItStartMw,
        measurementPoint,
        etaUpsPct,
        etaPduPct,
      }),
    [facilityStatus, itLoadMw, pItStartMw, measurementPoint, etaUpsPct, etaPduPct],
  );

  useEffect(() => {
    if (!point) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(buildUrl(point.lat, point.lng, unit))
      .then(async (res) => {
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        return (await res.json()) as ForecastResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load forecast');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [point?.lat, point?.lng, unit]);

  const chartData: ChartPoint[] = useMemo(() => {
    if (!data) return [];
    const { time, temperature_2m } = data.hourly;
    const len = Math.min(time.length, temperature_2m.length);
    const out: ChartPoint[] = [];
    for (let i = 0; i < len; i++) {
      const ts = new Date(time[i]).getTime();
      if (isNaN(ts)) continue;
      const tempDisp = temperature_2m[i];
      // pPUE polynomial is fit for Celsius — always feed it Celsius.
      const tempC = unit === 'celsius' ? tempDisp : (tempDisp - 32) * (5 / 9);
      const ppue = calcPPUE(tempC);
      const cooling = pItMw * (ppue - 1);
      out.push({ ts, label: time[i], temp: tempDisp, tempC, ppue, cooling });
    }
    return out;
  }, [data, unit, pItMw]);

  const nowTs = useMemo(() => {
    if (!data?.current?.time) return null;
    const t = new Date(data.current.time).getTime();
    return isNaN(t) ? null : t;
  }, [data]);

  // Current-hour stats: prefer the API's "current" payload, otherwise the
  // chart point nearest to "now".
  const currentStats = useMemo(() => {
    if (data?.current) {
      const tempDisp = data.current.temperature_2m;
      const tempC = unit === 'celsius' ? tempDisp : (tempDisp - 32) * (5 / 9);
      const ppue = calcPPUE(tempC);
      const cooling = pItMw * (ppue - 1);
      return { tempDisp, ppue, cooling };
    }
    if (chartData.length === 0) return null;
    const now = Date.now();
    let best = chartData[0];
    let bestDist = Math.abs(best.ts - now);
    for (const p of chartData) {
      const d = Math.abs(p.ts - now);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return { tempDisp: best.temp, ppue: best.ppue, cooling: best.cooling };
  }, [data, chartData, unit, pItMw]);

  const unitSymbol = unit === 'celsius' ? '°C' : '°F';
  const sectionCls = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6';

  const metricCfg: Record<
    Metric,
    { key: keyof ChartPoint; label: string; color: string; fmt: (v: number) => string }
  > = {
    temp: {
      key: 'temp',
      label: 'Temperature',
      color: '#0ea5e9',
      fmt: (v) => `${v.toFixed(1)} ${unitSymbol}`,
    },
    ppue: {
      key: 'ppue',
      label: 'pPUE',
      color: '#8b5cf6',
      fmt: (v) => v.toFixed(3),
    },
    cooling: {
      key: 'cooling',
      label: 'Cooling power',
      color: '#ef4444',
      fmt: (v) => `${v.toFixed(3)} MW`,
    },
  };

  const activeMetric = metricCfg[metric];
  const coolingDisabled = !(pItMw > 0);
  // If the user clears P_IT after picking Cooling, snap back to Temperature.
  useEffect(() => {
    if (coolingDisabled && metric === 'cooling') {
      setMetric('temp');
    }
  }, [coolingDisabled, metric]);

  return (
    <section className={sectionCls}>
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-xl font-bold text-slate-900">
          Hourly Temperature, pPUE &amp; Cooling Power
        </h2>
        <div className="inline-flex bg-slate-100 rounded-full p-[3px] gap-[2px]">
          {(['celsius', 'fahrenheit'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${unit === u
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {u === 'celsius' ? '°C' : '°F'}
            </button>
          ))}
        </div>
      </div>

      {!point && (
        <div className="text-sm text-slate-500 py-8 text-center">
          Set a facility location above to see the local temperature forecast.
        </div>
      )}

      {point && loading && (
        <div className="text-sm text-slate-500 py-8 text-center">Loading forecast…</div>
      )}

      {point && error && !loading && (
        <div className="text-sm text-red-600 py-8 text-center">
          Couldn't load forecast: {error}
        </div>
      )}

      {point && data && !loading && !error && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mb-4">
            {currentStats && (
              <>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    Current temp
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {currentStats.tempDisp.toFixed(1)}
                    <span className="text-base font-medium text-slate-500 ml-1">
                      {unitSymbol}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    Current pPUE
                  </div>
                  <div className="text-3xl font-bold text-violet-600">
                    {currentStats.ppue.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    Cooling power
                  </div>
                  <div className="text-3xl font-bold text-rose-600">
                    {pItMw > 0 ? currentStats.cooling.toFixed(3) : '—'}
                    <span className="text-base font-medium text-slate-500 ml-1">MW</span>
                  </div>
                </div>
              </>
            )}
            <div className="text-xs text-slate-500">
              <div>
                <span className="font-semibold text-slate-700">P_IT (year 0):</span>{' '}
                {pItMw > 0 ? `${pItMw.toFixed(3)} MW` : 'not set — enter IT load above'}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Coordinates:</span>{' '}
                {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Timezone:</span>{' '}
                {data.timezone}
              </div>
            </div>
          </div>

          <div className="inline-flex bg-slate-100 rounded-full p-[3px] gap-[2px] mb-3">
            {(['temp', 'ppue', 'cooling'] as Metric[]).map((m) => {
              const disabled = m === 'cooling' && coolingDisabled;
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMetric(m)}
                  title={disabled ? 'Enter IT load to enable cooling power' : undefined}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : disabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  {metricCfg[m].label}
                </button>
              );
            })}
          </div>

          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  scale="time"
                  tickFormatter={formatTick}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  stroke="#cbd5e1"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  stroke="#cbd5e1"
                  tickFormatter={(v: number) => {
                    if (metric === 'temp') return `${Math.round(v)}${unitSymbol}`;
                    if (metric === 'ppue') return v.toFixed(2);
                    return `${v.toFixed(2)}`;
                  }}
                  width={55}
                  domain={
                    metric === 'ppue' ? ['dataMin - 0.005', 'dataMax + 0.005'] : ['auto', 'auto']
                  }
                />
                <Tooltip
                  labelFormatter={(ts) => formatTooltipLabel(ts)}
                  formatter={(value) => {
                    const n = typeof value === 'number' ? value : Number(value);
                    const text = isFinite(n) ? activeMetric.fmt(n) : String(value);
                    return [text, activeMetric.label];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                {nowTs !== null && (
                  <ReferenceLine
                    x={nowTs}
                    stroke="#14b8a6"
                    strokeDasharray="4 4"
                    label={{ value: 'now', position: 'top', fontSize: 10, fill: '#14b8a6' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey={activeMetric.key}
                  stroke={activeMetric.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
