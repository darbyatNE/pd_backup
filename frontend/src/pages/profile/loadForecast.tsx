import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchAllFacilities,
  calculateMultiYearForecast,
  calculateHourlyLoad,
  currentLoadDemand,
  type FacilityData,
  type ForecastResult,
  type Scenario,
} from './loadCalculation';
import {
  LOAD_PROFILES,
  LOAD_PROFILE_MAP,
  aggregateProfiles,
} from '../../data/loadProfile';
import type { SiteLoadProfile } from '../../data/loadProfile';
import { useScopeContext } from '../../contexts/ScopeContext';
import { LOAD_COLORS } from '../../data/linkedContracts';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  LineChart,
  Line,
  Dot,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS_PER_MONTH = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744];

type XAxisMode = 'hours' | 'months';
type Horizon = 3 | 5 | 10;

// ─── Pill Toggle ──────────────────────────────────────────────────────────────

function PillToggle<T extends string | number>({
  options,
  value,
  onChange,
  labelFn,
  idPrefix,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labelFn?: (v: T) => string;
  idPrefix: string;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: '#f1f5f9',
        borderRadius: '9999px',
        padding: '3px',
        gap: '2px',
      }}
    >
      {options.map((opt) => (
        <button
          key={String(opt)}
          id={`${idPrefix}-${opt}`}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 16px',
            borderRadius: '9999px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            background: value === opt ? '#ffffff' : 'transparent',
            color: value === opt ? '#1e293b' : '#94a3b8',
            boxShadow: value === opt ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
          }}
        >
          {labelFn ? labelFn(opt) : String(opt)}
        </button>
      ))}
    </div>
  );
}

// ─── Load Shape Bar Chart ────────────────────────────────────────────────────

function LoadShapePlot({ profile, xAxisMode }: { profile: SiteLoadProfile; xAxisMode: XAxisMode }) {
  const data = xAxisMode === 'hours'
    ? profile.loadShape.filter(pt => pt.month === 1).map(pt => ({
      label: `${pt.hour + 1}h`,
      baseloadMw: pt.baseloadMw,
      peakMw: pt.peakMw,
      totalMw: pt.totalMw,
    }))
    : MONTH_LABELS.map((label, mIdx) => {
      const pts = profile.loadShape.filter(pt => pt.month === mIdx + 1);
      const n = pts.length || 1;
      return {
        label,
        baseloadMw: parseFloat((pts.reduce((s, p) => s + p.baseloadMw, 0) / n).toFixed(3)),
        peakMw: parseFloat((pts.reduce((s, p) => s + p.peakMw, 0) / n).toFixed(3)),
        totalMw: parseFloat((pts.reduce((s, p) => s + p.totalMw, 0) / n).toFixed(3)),
      };
    });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} stackOffset="sign" margin={{ top: 8, right: 16, left: 8, bottom: 4 }} barCategoryGap="0%" barGap={0}>
        <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false} tickLine={false}
          interval={xAxisMode === 'hours' ? 1 : 0}
        />
        <YAxis
          tickFormatter={(v) => `${v}`}
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false} tickLine={false} width={40}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }}
        />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', color: '#94a3b8' }} />
        <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} />
        <Bar dataKey="baseloadMw" stackId="load" fill={LOAD_COLORS.base} stroke={LOAD_COLORS.base} strokeWidth={0} name="Baseload" isAnimationActive={false} />
        <Bar dataKey="peakMw" stackId="load" fill={LOAD_COLORS.peak} stroke={LOAD_COLORS.peak} strokeWidth={0} name="Peak" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Scenario colour map ──────────────────────────────────────────────────────

const SCENARIO_COLORS: Record<Scenario, { avg: string; peak: string; badge: string }> = {
  BASE: { avg: '#6366f1', peak: '#f59e0b', badge: '#e0e7ff' },
  HIGH: { avg: '#10b981', peak: '#f97316', badge: '#dcfce7' },
  LOW: { avg: '#64748b', peak: '#a78bfa', badge: '#f1f5f9' },
};

// ─── Forward Forecast Line Chart ──────────────────────────────────────────────

function ForwardForecastChart({
  forecast,
  startYear,
  horizon,
  scenario,
}: {
  forecast: ForecastResult;
  startYear: number;
  horizon: Horizon;
  scenario: Scenario;
}) {
  const avgData = forecast.P_NET_AVG_MONTH[scenario] || [];
  const peakData = forecast.P_NET_PEAK_PROJ[scenario] || [];
  const colors = SCENARIO_COLORS[scenario];

  const data = Array.from({ length: horizon + 1 }, (_, i) => {
    const yearIndex = Math.min(i, 10);
    const monthlyAvg = avgData[yearIndex] || Array(12).fill(0);
    const avgNetLoad = parseFloat((monthlyAvg.reduce((s: number, v: number) => s + v, 0) / 12).toFixed(3));
    const peakNetLoad = parseFloat((peakData[yearIndex] || 0).toFixed(3));
    return {
      year: `${startYear + i}`,
      'Avg Load (MW)': avgNetLoad,
      'Peak Load (MW)': peakNetLoad,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
        <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={40}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'Inter', color: '#f8fafc' }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          itemStyle={{ color: '#f8fafc' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', color: '#94a3b8' }} />
        <Line type="monotone" dataKey="Avg Load (MW)" stroke={colors.avg} strokeWidth={2}
          dot={<Dot r={4} fill={colors.avg} stroke="#fff" strokeWidth={1.5} />}
          activeDot={{ r: 6, fill: colors.avg }} isAnimationActive={false} />
        <Line type="monotone" dataKey="Peak Load (MW)" stroke={colors.peak} strokeWidth={2} strokeDasharray="5 3"
          dot={<Dot r={4} fill={colors.peak} stroke="#fff" strokeWidth={1.5} />}
          activeDot={{ r: 6, fill: colors.peak }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FacilityEntry = { id: string; name: string; data: FacilityData };

export default function LoadForcast() {
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('months');
  const [horizon, setHorizon] = useState<Horizon>(3);
  const [scenario, setScenario] = useState<Scenario>('BASE');

  const { user } = useAuth();
  const [facilities, setFacilities] = useState<FacilityEntry[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const [facilityData, setFacilityData] = useState<FacilityData | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  const { selectedSites, startYear } = useScopeContext();

  // Fetch all facilities once
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    fetchAllFacilities(user.id).then((list) => {
      setFacilities(list);
      if (list.length > 0) {
        setActiveFacilityId(list[0].id);
        setFacilityData(list[0].data);
        console.log(list[0].data, 'list[0].data');
        setForecast(calculateMultiYearForecast(list[0].data));
      }
      setLoading(false);
    });
  }, [user?.id]);

  // Recompute forecast when active facility changes
  const selectFacility = (fac: FacilityEntry) => {
    setActiveFacilityId(fac.id);
    setFacilityData(fac.data);
    setForecast(calculateMultiYearForecast(fac.data));
    console.log(calculateMultiYearForecast(fac.data), 'calculateMultiYearForecast(fac.data)');
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading forecast data...</div>;
  if (!facilityData) return <div className="p-8 text-sm text-rose-500">No facility profile found. Please complete the Facility Profile first.</div>;

  // ── Build load shape profile ──
  const profiles = selectedSites
    .map((k) => LOAD_PROFILE_MAP[k])
    .filter(Boolean) as SiteLoadProfile[];

  let profile = profiles.length === 0
    ? LOAD_PROFILES[0]
    : profiles.length === 1
      ? profiles[0]
      : aggregateProfiles(profiles);

  if (forecast && forecast.P_NET_AVG_MONTH['BASE']) {
    const monthlyNetLoad = forecast.P_NET_AVG_MONTH['BASE'][0] || Array(12).fill(0);
    const hourlyLoad = calculateHourlyLoad(monthlyNetLoad);
    const monthStarts = [0];
    for (let i = 0; i < 11; i++) {
      monthStarts.push(monthStarts[i] + HOURS_PER_MONTH[i]);
    }

    // Use the monthly dynamic load for the load shape plot
    const lf = facilityData.LF_ASSUMED ? facilityData.LF_ASSUMED / 100 : 0.82;

    profile = {
      ...profile,
      loadShape: profile.loadShape.map(pt => {
        const m = pt.month - 1;
        const baseloadMw = monthlyNetLoad[m] || 0;
        const totalMw = baseloadMw / lf;
        return {
          ...pt,
          baseloadMw: baseloadMw,
          totalMw: totalMw,
          peakMw: Math.max(0, totalMw - baseloadMw),
        };
      }),
    };
  }

  const activeName = facilities.find(f => f.id === activeFacilityId)?.name ?? '';

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* ── Facility Tab Bar ── */}
      {facilities.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Facility
          </span>
          {facilities.map((fac) => (
            <button
              key={fac.id}
              id={`forecast-facility-tab-${fac.id}`}
              type="button"
              onClick={() => selectFacility(fac)}
              style={{
                padding: '5px 16px',
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
              {fac.name || 'Unnamed'}
            </button>
          ))}
        </div>
      )}

      {/* ── Section 1: Load Shape ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', fontFamily: 'Inter, sans-serif', margin: 0 }}>
              Load Shape{activeName ? ` — ${activeName}` : ''}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif', margin: 0 }}>
              {xAxisMode === 'months' ? 'Monthly average baseload & peak (MW)' : 'Hourly profile — representative day (Jan)'}
            </p>
          </div>
          <PillToggle<XAxisMode>
            options={['months', 'hours']}
            value={xAxisMode}
            onChange={setXAxisMode}
            labelFn={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
            idPrefix="shape-toggle"
          />
        </div>
        <LoadShapePlot profile={profile} xAxisMode={xAxisMode} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f1f5f9' }} />

      {/* ── Section 2: Forward Forecast ── */}
      <div>
        <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', fontFamily: 'Inter, sans-serif', margin: 0 }}>
              Forward Forecast{activeName ? ` — ${activeName}` : ''}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif', margin: 0 }}>
              Projected avg & peak net grid import — {scenario} scenario, {startYear}–{startYear + horizon}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <PillToggle<Scenario>
              options={['BASE', 'LOW', 'HIGH']}
              value={scenario}
              onChange={setScenario}
              idPrefix="scenario-toggle"
            />
            <PillToggle<Horizon>
              options={[3, 5, 10]}
              value={horizon}
              onChange={setHorizon}
              labelFn={(v) => `+${v}`}
              idPrefix="horizon-toggle"
            />
          </div>
        </div>

        {forecast ? (
          <ForwardForecastChart forecast={forecast} startYear={startYear} horizon={horizon} scenario={scenario} />
        ) : (
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontFamily: 'Inter' }}>
            No forecast data available
          </div>
        )}

        {/* KPI summary row */}
        {forecast && (() => {
          const peakData = forecast.P_NET_PEAK_PROJ[scenario] || [];
          const avgData = forecast.P_NET_AVG_MONTH[scenario] || [];
          const itData = forecast.P_IT_PROJ[scenario] || [];
          const pueData = forecast.PUE_PROJ[scenario] || [];
          const colors = SCENARIO_COLORS[scenario];
          const hIdx = Math.min(horizon, 10);
          const peakAtHorizon = (peakData[hIdx] || 0).toFixed(2);
          const monthlyAvg = avgData[hIdx] || Array(12).fill(0);
          const avgAtHorizon = (monthlyAvg.reduce((s: number, v: number) => s + v, 0) / 12).toFixed(2);
          const peakNow = (peakData[0] || 0).toFixed(2);

          // Detailed metrics for the horizon year
          const itMonthly = itData[hIdx] || Array(12).fill(0);
          const avgIT = (itMonthly.reduce((s: number, v: number) => s + v, 0) / 12).toFixed(2);
          const pueMonthly = pueData[hIdx] || Array(12).fill(0);
          const avgPUE = (pueMonthly.reduce((s: number, v: number) => s + v, 0) / 12).toFixed(3);
          const lf = facilityData?.LF_ASSUMED ? facilityData.LF_ASSUMED / 100 : 0.82;
          const HOURS_PER_YEAR = 8760;
          const annualEnergyGWh = (monthlyAvg.reduce((s: number, v: number, i: number) => s + v * HOURS_PER_MONTH[i], 0) / 1000).toFixed(1);
          const totalContractVol = (facilityData?.contracts || []).reduce((acc: number, c: { CV_i?: number | string }) => acc + (Number(c.CV_i) || 0), 0);
          const peakHorizonNum = peakData[hIdx] || 0;
          const uncontPeak = Math.max(0, peakHorizonNum - totalContractVol).toFixed(2);
          const uncontEnergy = ((Math.max(0, peakHorizonNum - totalContractVol) * lf * HOURS_PER_YEAR) / 1000).toFixed(1);
          const baseloadThresh = (peakHorizonNum * 0.76).toFixed(2);
          const superPeakThresh = (peakHorizonNum * 1.05).toFixed(2);

          const detailMetrics = [
            { label: 'Forecast IT Load', value: `${avgIT} MW`, color: '#6366f1', formula: 'P_IT_0 * (1 + g)^y + Delta_CAP * util' },
            { label: 'Forecast PUE', value: avgPUE, color: '#8b5cf6', formula: 'SUM(P_FAC[h]*dt) / SUM(P_IT[h]*dt)' },
            { label: 'Annual Energy', value: `${annualEnergyGWh} GWh`, color: '#0ea5e9', formula: 'SUM(P_NET_AVG_MONTH * Hours) / 1000' },
            { label: 'Contracted Capacity', value: `${totalContractVol} MW`, color: '#10b981', formula: 'SUM(CV_i)' },
            { label: 'Peak Uncontracted', value: `${uncontPeak} MW`, color: '#f59e0b', formula: 'Peak Load - CV_i' },
            { label: 'Uncontracted Energy', value: `${uncontEnergy} GWh`, color: '#f59e0b', formula: 'UncontPeak * LF * 8760 / 1000' },
            { label: 'Baseload Threshold', value: `${baseloadThresh} MW`, color: '#64748b', formula: 'Peak Load * 0.76' },
            { label: 'Super-Peak Threshold', value: `${superPeakThresh} MW`, color: '#ef4444', formula: 'Peak Load * 1.05' },
          ];

          return (
            <>
              <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                {[
                  { label: `Avg Load ${startYear + horizon}`, value: `${avgAtHorizon} MW`, color: colors.avg, formula: 'P_NET_AVG_MONTH' },
                  { label: `Peak Load ${startYear + horizon}`, value: `${peakAtHorizon} MW`, color: colors.peak, formula: 'Avg Load / LF' },
                  { label: 'Peak Load Now', value: `${peakNow} MW`, color: '#94a3b8', formula: 'Avg Load (Y0) / LF' },
                ].map(({ label, value, color, formula }) => (
                  <div key={label} style={{
                    flex: 1, background: '#f8fafc', borderRadius: 10, padding: '12px 16px',
                    borderLeft: `3px solid ${color}`,
                  }}>
                    <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 8, color: '#64748b', fontFamily: 'monospace', fontStyle: 'italic' }}>{formula}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#51565eff', fontFamily: 'Inter' }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Detailed forecast breakdown row */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                {detailMetrics.map(({ label, value, color, formula }) => (
                  <div key={label} style={{
                    flex: '1 1 calc(25% - 10px)', minWidth: 140,
                    background: '#f8fafc', borderRadius: 8, padding: '10px 14px',
                    borderLeft: `3px solid ${color}`,
                  }}>
                    <p style={{ margin: 0, fontSize: 9, color: '#94a3b8', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 8, color: '#64748b', fontFamily: 'monospace', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={formula}>{formula}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: 'Inter' }}>{value}</p>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>

    </div>
  );
}
