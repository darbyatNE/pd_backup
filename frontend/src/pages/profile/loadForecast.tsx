import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchAllFacilities,
  calculateMultiYearForecast,
  calculateHourlyForecast,
  calculateContractCoverage,
  type FacilityData,
  type ForecastResult,
  type Scenario,
} from './loadCalculation';
import { ewkbToPoint } from './ewkb';
import { useHourlyArchive } from '../../hooks/useHourlyArchive';
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
  ComposedChart,
  Area,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS_PER_MONTH = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744];

type XAxisMode = 'hours' | 'months';
type Horizon = 3 | 5 | 10;
type ForecastViewMode = 'yearly' | 'monthly';

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

function LoadShapePlot({
  profile,
  xAxisMode,
  peakOverlayMw,
}: {
  profile: SiteLoadProfile;
  xAxisMode: XAxisMode;
  peakOverlayMw?: number; // Annual P_NET_PEAK_PROJ[BASE][0] — when present, drawn as a horizontal reference line above the baseload+peak bars.
}) {
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
        {peakOverlayMw != null && peakOverlayMw > 0 && (
          <ReferenceLine
            y={peakOverlayMw}
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 4"
            ifOverflow="extendDomain"
            label={{
              value: `P_NET_PEAK_PROJ ${peakOverlayMw.toFixed(1)} MW`,
              position: 'insideTopRight',
              fill: '#f59e0b',
              fontSize: 10,
              fontFamily: 'Inter',
            }}
          />
        )}
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

// ─── Monthly Forward Forecast Chart (single year) ─────────────────────────────

function MonthlyForecastChart({
  forecast,
  scenario,
  year,
  lf,
}: {
  forecast: ForecastResult;
  scenario: Scenario;
  year: number;
  lf: number;
}) {
  const monthlyAvg = forecast.P_NET_AVG_MONTH[scenario]?.[year] || Array(12).fill(0);
  const colors = SCENARIO_COLORS[scenario];

  const data = MONTH_LABELS.map((label, m) => {
    const avg = parseFloat((monthlyAvg[m] || 0).toFixed(3));
    const peak = parseFloat((avg / lf).toFixed(3));
    return {
      month: label,
      'Avg Load (MW)': avg,
      'Peak Load (MW)': peak,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
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

// ─── PUE Forecast Chart (yearly or monthly) ───────────────────────────────────

function PueForecastChart({
  forecast,
  scenario,
  startYear,
  viewMode,
  year,
}: {
  forecast: ForecastResult;
  scenario: Scenario;
  startYear: number;
  viewMode: ForecastViewMode;
  year: number;
}) {
  const pueData = forecast.PUE_PROJ[scenario] || [];
  const PUE_COLOR = '#8b5cf6';

  const data = viewMode === 'yearly'
    ? Array.from({ length: 11 }, (_, y) => {
      const months = pueData[y] || Array(12).fill(0);
      const avg = months.reduce((s: number, v: number) => s + v, 0) / 12;
      return { label: `${startYear + y}`, PUE: parseFloat(avg.toFixed(3)) };
    })
    : MONTH_LABELS.map((label, m) => {
      const months = pueData[year] || Array(12).fill(0);
      return { label, PUE: parseFloat((months[m] || 0).toFixed(3)) };
    });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false}
          tickLine={false}
          width={48}
          domain={['auto', 'auto']}
          label={{ value: 'PUE', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }}
        />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'Inter', color: '#f8fafc' }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          itemStyle={{ color: '#f8fafc' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', color: '#94a3b8' }} />
        <Line
          type="monotone"
          dataKey="PUE"
          stroke={PUE_COLOR}
          strokeWidth={2}
          dot={<Dot r={4} fill={PUE_COLOR} stroke="#fff" strokeWidth={1.5} />}
          activeDot={{ r: 6, fill: PUE_COLOR }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Uncontracted Power & Energy Chart (all forecast years) ───────────────────

function UncontractedPowerChart({
  forecast,
  startYear,
  scenario,
  contractedMw,
}: {
  forecast: ForecastResult;
  startYear: number;
  scenario: Scenario;
  contractedMw: number;
}) {
  const peakData = forecast.P_NET_PEAK_PROJ[scenario] || [];

  const PEAK_COLOR = '#6366f1';
  const UNCONT_COLOR = '#ef4444'; // Red fill above the contracted line — peak demand uncovered by contracts.

  const data = Array.from({ length: 11 }, (_, y) => {
    const peakMw = parseFloat((peakData[y] || 0).toFixed(3));
    const uncontMw = parseFloat(Math.max(0, peakMw - contractedMw).toFixed(3)); // Excess above the contracted line; visually anchored at contractedMw via the transparent stacked spacer below.
    return {
      year: `${startYear + y}`,
      __base: contractedMw, // Invisible spacer area so the red Uncontracted area stacks ON the contracted line instead of from y=0.
      'Uncontracted (MW)': uncontMw,
      'Peak Load (MW)': peakMw,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
        <XAxis
          dataKey="year"
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false}
          tickLine={false}
          width={48}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, offset: 10 }}
        />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'Inter', color: '#f8fafc' }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          itemStyle={{ color: '#f8fafc' }}
          formatter={(value: number | string | undefined, name: string) => (name === '__base' ? null : [value, name])}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', color: '#94a3b8' }}
          formatter={(value: string) => (value === '__base' ? null : value)}
        />
        <ReferenceLine
          y={contractedMw}
          stroke="#10b981"
          strokeWidth={2}
          strokeDasharray="6 4"
          label={{ value: `Contracted ${contractedMw.toFixed(1)} MW`, position: 'insideTopRight', fill: '#10b981', fontSize: 10, fontFamily: 'Inter' }}
          ifOverflow="extendDomain"
        />
        {/* Green envelope fills 0 → contractedMw — the contracted capacity band. Red Uncontracted area stacks on top so its bottom edge sits on the green dashed line. */}
        <Area
          type="monotone"
          dataKey="__base"
          stackId="band"
          stroke="transparent"
          fill="#10b981"
          fillOpacity={0.18}
          isAnimationActive={false}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="Uncontracted (MW)"
          stackId="band"
          stroke={UNCONT_COLOR}
          strokeWidth={1.5}
          fill={UNCONT_COLOR}
          fillOpacity={0.22}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="Peak Load (MW)"
          stroke={PEAK_COLOR}
          strokeWidth={2}
          dot={<Dot r={4} fill={PEAK_COLOR} stroke="#fff" strokeWidth={1.5} />}
          activeDot={{ r: 6, fill: PEAK_COLOR }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FacilityEntry = { id: string; name: string; data: FacilityData };

export default function LoadForcast({ initialFacilityId, onFacilityChange }: { initialFacilityId?: string | null; onFacilityChange?: (facilityId: string) => void } = {}) {
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('months');
  const [horizon, setHorizon] = useState<Horizon>(3);
  const [scenario, setScenario] = useState<Scenario>('BASE');
  const [forecastView, setForecastView] = useState<ForecastViewMode>('yearly');
  const [monthlyYearOffset, setMonthlyYearOffset] = useState<number>(0);
  const [pueView, setPueView] = useState<ForecastViewMode>('yearly');
  const [pueYearOffset, setPueYearOffset] = useState<number>(0);
  // Percentile of hourly P_NET that splits the load-shape stack: hours at or
  // below this percentile become baseload; the excess becomes peak.
  const [thresholdPct, setThresholdPct] = useState<number>(25);

  const { user } = useAuth();
  const [facilities, setFacilities] = useState<FacilityEntry[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const [facilityData, setFacilityData] = useState<FacilityData | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  const { selectedSites, startYear } = useScopeContext();

  // Fetch all facilities once. If the parent passed `initialFacilityId` (set
  // when the user just saved a facility profile), focus that facility instead
  // of defaulting to the first one in the list.
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    fetchAllFacilities(user.id).then((list) => {
      setFacilities(list);
      if (list.length > 0) {
        const focus = (initialFacilityId && list.find(f => f.id === initialFacilityId)) || list[0];
        setActiveFacilityId(focus.id);
        setFacilityData(focus.data);
        onFacilityChange?.(focus.id);
      }
      setLoading(false);
    });
  }, [user?.id, initialFacilityId]);

  // Recompute forecast when active facility changes
  const selectFacility = (fac: FacilityEntry) => {
    setActiveFacilityId(fac.id);
    setFacilityData(fac.data);
    onFacilityChange?.(fac.id);
  };

  // Single source of truth for forecast: any change to facilityData (initial
  // load, facility switch, or a profile edit propagated back into this state)
  // re-runs the multi-year calc. Without this, edits to fields like P_FAC
  // didn't impact the displayed forecast until the user switched facilities.
  useEffect(() => {
    if (facilityData) setForecast(calculateMultiYearForecast(facilityData));
  }, [facilityData]);

  // Open-Meteo ERA5 archive: most recent completed calendar year of hourly
  // temperatures at the facility coordinates. When the archive is unavailable
  // (no location, or fetch hasn't resolved) the hourly forecast uses T=0.
  const facilityPoint = useMemo(
    () => (facilityData?.facility_location ? ewkbToPoint(facilityData.facility_location) : null),
    [facilityData?.facility_location],
  );
  const archiveYear = new Date().getUTCFullYear() - 1;
  const { data: tempAmbHourly } = useHourlyArchive(facilityPoint, archiveYear);

  // Hourly P_NET for year 0 of the BASE scenario. Cooling varies hour-by-hour
  // with ambient temperature via the pPUE polynomial; P_IT is flat at the
  // monthly mean within each month. See loadCalculation.calculateHourlyForecast.
  // Computed before any early return so hook order stays stable across renders.
  const hourly = useMemo(() => {
    if (!facilityData || !forecast || !forecast.P_IT_PROJ['BASE']) return null;
    return calculateHourlyForecast({
      pItMonthly: forecast.P_IT_PROJ['BASE'][0],
      pFac: facilityData.P_FAC,
      pGen: 0,
      tempAmbHourly: tempAmbHourly ?? undefined,
      pNetPeakAnnual: forecast.P_NET_PEAK_PROJ['BASE']?.[0] ?? 0,
    });
  }, [facilityData, forecast, tempAmbHourly]);

  // Monthly contract-coverage ratio for year 0 BASE: pNet vs the sum of all contracts'
  // CV_i active in that hour, aggregated up to per-month coverage %. Flat contracts only
  // for now (see calculateContractCoverage). Anchored at startYear so contract date
  // windows (CS_i / CE_i) are checked against the correct calendar year.
  const coverage = useMemo(() => {
    if (!hourly || !facilityData) return null;
    return calculateContractCoverage({
      pNet: hourly.pNet,
      contracts: facilityData.contracts,
      year: startYear,
    });
  }, [hourly, facilityData, startYear]);

  // Threshold (MW) is the chosen percentile of the 8760-point pNet series.
  // Hours at or below it become baseload; the excess becomes peak.
  const thresholdMw = useMemo(() => {
    if (!hourly) return 0;
    const sorted = [...hourly.pNet].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((thresholdPct / 100) * (sorted.length - 1))));
    return sorted[idx] ?? 0;
  }, [hourly, thresholdPct]);

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

  if (hourly) {
    // monthStarts[m] = hour-of-year index where month m begins (Jan=0, Feb=744, …).
    const monthStarts = [0];
    for (let i = 0; i < 11; i++) {
      monthStarts.push(monthStarts[i] + HOURS_PER_MONTH[i]);
    }

    profile = {
      ...profile,
      loadShape: profile.loadShape.map(pt => {
        const m = pt.month - 1;
        // pt.hour is hour-of-day (0-23). Sample the corresponding hour from the
        // 8760-point hourly series at the first day of each month.
        const idx = monthStarts[m] + pt.hour;
        const v = hourly.pNet[idx] ?? 0;
        return {
          ...pt,
          baseloadMw: Math.min(v, thresholdMw),
          peakMw: Math.max(0, v - thresholdMw),
          totalMw: v,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {hourly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label
                  htmlFor="shape-threshold-slider"
                  style={{ fontSize: 11, color: '#64748b', fontFamily: 'Inter, sans-serif', fontWeight: 500, whiteSpace: 'nowrap' }}
                >
                  Baseload ≤
                </label>
                <input
                  id="shape-threshold-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={thresholdPct}
                  onChange={(e) => setThresholdPct(Number(e.target.value))}
                  style={{ width: 120, accentColor: '#6366f1' }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: '#64748b',
                    fontFamily: 'Inter, sans-serif',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 96,
                    textAlign: 'right',
                  }}
                >
                  {thresholdMw.toFixed(2)} MW (p{thresholdPct})
                </span>
              </div>
            )}
            <PillToggle<XAxisMode>
              options={['months', 'hours']}
              value={xAxisMode}
              onChange={setXAxisMode}
              labelFn={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
              idPrefix="shape-toggle"
            />
          </div>
        </div>
        {/* Peak overlay temporarily hidden — restore by passing `peakOverlayMw={hourly?.pNetPeakAnnual}`. */}
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
              {forecastView === 'yearly'
                ? `Projected avg & peak net grid import — ${scenario} scenario, ${startYear}–${startYear + horizon}`
                : `Monthly avg & peak net grid import — ${scenario} scenario, ${startYear + monthlyYearOffset}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <PillToggle<Scenario>
              options={['BASE', 'LOW', 'HIGH']}
              value={scenario}
              onChange={setScenario}
              idPrefix="scenario-toggle"
            />
            <PillToggle<ForecastViewMode>
              options={['yearly', 'monthly']}
              value={forecastView}
              onChange={setForecastView}
              labelFn={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
              idPrefix="forecast-view-toggle"
            />
            {forecastView === 'yearly' ? (
              <PillToggle<Horizon>
                options={[3, 5, 10]}
                value={horizon}
                onChange={setHorizon}
                labelFn={(v) => `+${v}`}
                idPrefix="horizon-toggle"
              />
            ) : (
              <select
                id="monthly-year-select"
                value={monthlyYearOffset}
                onChange={(e) => setMonthlyYearOffset(Number(e.target.value))}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#1e293b',
                  fontSize: 12,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={i}>{startYear + i}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {forecast ? (
          forecastView === 'yearly' ? (
            <ForwardForecastChart forecast={forecast} startYear={startYear} horizon={horizon} scenario={scenario} />
          ) : (
            <MonthlyForecastChart
              forecast={forecast}
              scenario={scenario}
              year={monthlyYearOffset}
              lf={facilityData?.LF_ASSUMED ? facilityData.LF_ASSUMED / 100 : 0.82}
            />
          )
        ) : (
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontFamily: 'Inter' }}>
            No forecast data available
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f1f5f9' }} />

      {/* ── Section 3: Uncontracted Power (all years) ── */}
      {forecast && (() => {
        const contractedMw = (facilityData?.contracts || []).reduce(
          (acc: number, c: { CV_i?: number | string }) => acc + (Number(c.CV_i) || 0),
          0,
        );
        return (
          <div>
            <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                  Uncontracted Power{activeName ? ` — ${activeName}` : ''}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                  Peak load vs. contracted capacity across all forecast years — {scenario} scenario, {startYear}–{startYear + 10}
                </p>
              </div>
            </div>
            <UncontractedPowerChart
              forecast={forecast}
              startYear={startYear}
              scenario={scenario}
              contractedMw={contractedMw}
            />

            {/* Monthly Contract Coverage Ratio strip (year 0 BASE, hour-resolved internally).
                Temporarily hidden — flip the `false &&` to re-enable. The `coverage` useMemo
                still runs so the data is ready to display when re-enabled. */}
            {false && coverage && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' }}>
                  Monthly Coverage Ratio — {startYear}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'Inter, sans-serif', margin: '0 0 8px 0' }}>
                  Σ min(pNet, contracted) ÷ Σ pNet per month, hour-by-hour. Green ≥ 90%, amber 70–90%, red &lt; 70%.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
                  {MONTH_LABELS.map((label, m) => {
                    const pct = coverage.ccrMonthly[m] ?? 0;
                    const bg = pct >= 90 ? '#dcfce7' : pct >= 70 ? '#fef3c7' : '#fee2e2';
                    const fg = pct >= 90 ? '#166534' : pct >= 70 ? '#92400e' : '#991b1b';
                    return (
                      <div
                        key={label}
                        title={`${label}: ${pct.toFixed(1)}% covered`}
                        style={{
                          background: bg,
                          color: fg,
                          borderRadius: 6,
                          padding: '8px 4px',
                          textAlign: 'center',
                          fontFamily: 'Inter, sans-serif',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{pct.toFixed(0)}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Divider */}
      {forecast && <div style={{ height: 1, background: '#f1f5f9' }} />}

      {/* ── Section 4: PUE Forecast (yearly or monthly) ── */}
      {forecast && (
        <div>
          <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                PUE Forecast{activeName ? ` — ${activeName}` : ''}
              </p>
              <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                {pueView === 'yearly'
                  ? `Annual average PUE — ${scenario} scenario, ${startYear}–${startYear + 10}`
                  : `Monthly PUE — ${scenario} scenario, ${startYear + pueYearOffset}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <PillToggle<ForecastViewMode>
                options={['yearly', 'monthly']}
                value={pueView}
                onChange={setPueView}
                labelFn={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                idPrefix="pue-view-toggle"
              />
              {pueView === 'monthly' && (
                <select
                  id="pue-year-select"
                  value={pueYearOffset}
                  onChange={(e) => setPueYearOffset(Number(e.target.value))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    color: '#1e293b',
                    fontSize: 12,
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>{startYear + i}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <PueForecastChart
            forecast={forecast}
            scenario={scenario}
            startYear={startYear}
            viewMode={pueView}
            year={pueYearOffset}
          />
        </div>
      )}

    </div>
  );
}
