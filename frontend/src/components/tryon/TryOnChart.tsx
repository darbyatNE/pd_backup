import { Fragment } from 'react';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { LOAD_COLORS } from '../../data/linkedContracts';
import type { LinkedContract } from '../../data/linkedContracts';
import { getSiteCapacityForYear } from '../../data/loadProfile';
import type { SiteLoadProfile } from '../../data/loadProfile';
import { OVERHEDGE_PATTERN_ID } from './types';
import { contractKey, r1 } from './utils';
import { TryOnLegendContent } from './TryOnLegendContent';
import type { XAxisMode } from './types';

interface TryOnChartProps {
  data: Record<string, number | string>[];
  xAxis: XAxisMode;
  yLabel: string;
  activeYear: number;
  aggregateProfile: SiteLoadProfile | null;
  existingContracts: LinkedContract[];
  projectName: string;
  chartKey: string;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function PatternedBarShape(loadColor: string, patternUrl: string) {
  return (props: BarShapeProps) => {
    const { x, y, width, height } = props;
    if (!width || !height || height <= 0) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={loadColor} />
        <rect x={x} y={y} width={width} height={height} fill={patternUrl} stroke={loadColor} strokeWidth={0.4} />
      </g>
    );
  };
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  existingContracts: LinkedContract[];
  yLabel: string;
  projectName: string;
}

function ChartTooltip({ active, payload, label, existingContracts, yLabel, projectName }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const get = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0;

  let totalExisting = 0;
  let totalTryOn = get('tryon_base') + get('tryon_peak');
  const baseUnc = get('base_uncovered');
  const peakUnc = get('peak_uncovered');
  const over = -get('overhedge');

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs font-sans space-y-0.5">
      <p className="font-bold text-slate-700 mb-1">{label}</p>

      {existingContracts.map((c: LinkedContract) => {
        const k = contractKey(c.projectName);
        const inBase = get(`e_${k}_base`);
        const inPeak = get(`e_${k}_peak`);
        const total = inBase + inPeak;
        totalExisting += total;
        if (total <= 0) return null;
        const color = inBase >= inPeak ? LOAD_COLORS.base : LOAD_COLORS.peak;
        return (
          <p key={`e-${c.projectName}`}>
            <span style={{ color }}>■</span>{' '}
            <span className="text-slate-700">{c.projectName}</span>:{' '}
            <strong>{r1(total)} {yLabel}</strong>
          </p>
        );
      })}

      {totalTryOn > 0 && (
        <p>
          <span style={{ color: '#6366f1' }}>■</span>{' '}
          <span className="text-slate-700">{projectName}</span>:{' '}
          <strong>{r1(totalTryOn)} {yLabel}</strong>
        </p>
      )}

      {baseUnc > 0 && (
        <p>
          <span style={{ color: LOAD_COLORS.base }}>■</span>{' '}
          <span className="text-slate-500">Baseload (uncovered)</span>:{' '}
          <strong>{r1(baseUnc)} {yLabel}</strong>
        </p>
      )}
      {peakUnc > 0 && (
        <p>
          <span style={{ color: LOAD_COLORS.peak }}>■</span>{' '}
          <span className="text-slate-500">Peak (uncovered)</span>:{' '}
          <strong>{r1(peakUnc)} {yLabel}</strong>
        </p>
      )}

      <p className="text-slate-400 pt-1 border-t border-slate-100 mt-1">
        Load: <strong>{r1(totalExisting + totalTryOn + baseUnc + peakUnc)} {yLabel}</strong>
      </p>

      {over > 0 && (
        <div className="pt-1 mt-1 border-t border-rose-100">
          <p className="text-rose-700 font-semibold">Over-hedge: −{r1(over)} {yLabel}</p>
        </div>
      )}
    </div>
  );
}

export function TryOnChart({
  data,
  xAxis,
  yLabel,
  activeYear,
  aggregateProfile,
  existingContracts,
  projectName,
  chartKey,
}: TryOnChartProps) {
  if (!aggregateProfile) {
    return (
      <div className="text-center py-12 text-slate-500">
        No sites selected in scope. Select at least one site to preview fit.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240} key={chartKey}>
      <ReBarChart data={data} stackOffset="sign" margin={{ top: 4, right: 12, left: 4, bottom: 24 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="rgba(134,133,133,0.2)" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false}
          tickLine={false}
          interval={xAxis === 'hours' ? 2 : (data.length > 18 ? 2 : 0)}
        />
        <YAxis
          tickFormatter={(v) => `${v}`}
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
          axisLine={false}
          tickLine={false}
          width={40}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10, offset: 6 }}
        />
        <Tooltip
          content={
            <ChartTooltip
              existingContracts={existingContracts}
              yLabel={yLabel}
              projectName={projectName}
            />
          }
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
        />
        <ReferenceLine
          y={getSiteCapacityForYear(aggregateProfile, activeYear)}
          stroke="#ef4444"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{ value: `Capacity ${getSiteCapacityForYear(aggregateProfile, activeYear)} MW`, position: 'right', fill: '#ef4444', fontSize: 10 }}
        />
        <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} />

        {existingContracts.map((c) => {
          const k = contractKey(c.projectName);
          const patId = `pat-${c.pattern}-base-${k}`;
          return (
            <Fragment key={`e-${k}`}>
              <Bar
                dataKey={`e_${k}_base`}
                stackId="load"
                fill={LOAD_COLORS.base}
                shape={PatternedBarShape(LOAD_COLORS.base, `url(#${patId})`)}
                name={c.projectName}
                isAnimationActive={false}
              />
              <Bar
                dataKey={`e_${k}_peak`}
                stackId="load"
                fill={LOAD_COLORS.peak}
                shape={PatternedBarShape(LOAD_COLORS.peak, `url(#${patId})`)}
                name={c.projectName}
                isAnimationActive={false}
              />
            </Fragment>
          );
        })}

        <Bar
          dataKey="tryon_base"
          stackId="load"
          fill="#818cf8"
          shape={PatternedBarShape('#0d9488', 'url(#tryon-pattern)')}
          name={projectName}
          isAnimationActive={false}
        />
        <Bar
          dataKey="tryon_peak"
          stackId="load"
          fill="#818cf8"
          shape={PatternedBarShape('#f59e0b', 'url(#tryon-pattern)')}
          name={projectName}
          isAnimationActive={false}
        />

        <Bar
          dataKey="base_uncovered"
          stackId="load"
          fill={LOAD_COLORS.base}
          stroke={LOAD_COLORS.base}
          strokeWidth={0.4}
          name="Baseload"
          isAnimationActive={false}
        />

        <Bar
          dataKey="peak_uncovered"
          stackId="load"
          fill={LOAD_COLORS.peak}
          stroke={LOAD_COLORS.peak}
          strokeWidth={0.4}
          radius={[3, 3, 0, 0]}
          name="Peak"
          isAnimationActive={false}
        />

        <Bar
          dataKey="overhedge"
          stackId="load"
          fill={`url(#${OVERHEDGE_PATTERN_ID})`}
          stroke="#b91c1c"
          strokeWidth={0.5}
          name="Over-hedge"
          isAnimationActive={false}
        />
        <Legend
          content={<TryOnLegendContent existingContracts={existingContracts} projectName={projectName} />}
          verticalAlign="bottom"
          height={24}
        />
      </ReBarChart>
    </ResponsiveContainer>
  );
}
