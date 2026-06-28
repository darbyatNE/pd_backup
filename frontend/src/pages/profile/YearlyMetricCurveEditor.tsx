import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import dragData from 'chartjs-plugin-dragdata';

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
  dragData,
);

const YEARS = 10;
const YEAR_LABELS = Array.from({ length: YEARS }, (_, i) => `Y${i + 1}`);

function decimalsFromStep(step: number): number {
  if (step >= 1) return 0;
  return Math.max(0, -Math.floor(Math.log10(step)));
}

function parseYearly(s: string): number[] {
  const parts = s ? s.split(',') : [];
  return Array.from({ length: YEARS }, (_, i) => {
    const raw = parts[i];
    if (raw === undefined) return 0;
    const t = raw.trim();
    if (t === '') return 0;
    const n = Number(t);
    return isNaN(n) ? 0 : n;
  });
}

function serializeYearly(arr: number[], step: number): string {
  const d = decimalsFromStep(step);
  return arr.map(v => Number(v.toFixed(d)).toString()).join(', ');
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  color: string;
  fillColor: string;
  unit: string;
  step?: number;
  yMin?: number;
  // Floor for the auto-scaled y-axis when data is small — guarantees the chart
  // doesn't render as a hair-thin line at y=0 for an empty facility.
  yMaxFloor?: number;
  // Hard ceiling for the y-axis. Drag bounds inherit this, so set it to the
  // largest plausible value (e.g. 0.5 for PUE-improvement fractions).
  yMaxAbsolute?: number;
  // 'logarithmic' gives fine precision at the low end of a wide range
  // (e.g. 1 MW → 10,000 MW capacity additions). yMin must be > 0 in log mode;
  // any incoming value below yMin is floored to yMin on display.
  scaleType?: 'linear' | 'logarithmic';
  // Spacing between y-axis tick marks. Default = let Chart.js auto-pick.
  yTickStep?: number;
  // When true, renders a small numeric input above the chart for setting the
  // y-axis max. Useful when the realistic range varies a lot between facilities
  // (e.g. one site plans 50 MW additions, another plans 5 GW).
  userAdjustableMax?: boolean;
}

export default function YearlyMetricCurveEditor({
  value,
  onChange,
  color,
  fillColor,
  unit,
  step = 0.1,
  yMin = 0,
  yMaxFloor = 10,
  yMaxAbsolute,
  scaleType = 'linear',
  yTickStep,
  userAdjustableMax = false,
}: Props) {
  // User-overridable y-axis max. Undefined = fall back to yMaxAbsolute or auto-fit.
  const [customMax, setCustomMax] = useState<number | undefined>(undefined);

  const data = useMemo(() => {
    const parsed = parseYearly(value);
    if (scaleType === "linear") {
      // Log scale can't render 0 or negatives — floor at yMin so every point
      // is visible at the bottom of the chart and drag-clamping stays consistent.
      return parsed.map(v => (v < yMin ? yMin : v));
    }
    return parsed;
  }, [value, scaleType, yMin]);

  const yMax = useMemo(() => {
    if (customMax !== undefined) return customMax;
    if (yMaxAbsolute !== undefined) return yMaxAbsolute;
    const dataMax = Math.max(...data, 0);
    return Math.max(dataMax * 1.3, yMaxFloor);
  }, [data, yMaxFloor, yMaxAbsolute, customMax]);

  // Backfill any missing cell with 0 so the parent's form state matches what
  // the chart shows. Triggers once when the loaded value is empty or partial.
  useEffect(() => {
    const parts = value ? value.split(',').map(s => s.trim()) : [];
    const hasGaps = parts.length < YEARS || parts.some(p => p === '');
    if (hasGaps) onChange(serializeYearly(data, step));
  }, [value, data, onChange, step]);

  function handleDragEnd(index: number, newValue: number) {
    const clamped = Math.max(yMin, Math.min(yMax, newValue));
    // Snap to the nearest multiple of `step` (so step=0.05 yields 0, 0.05, 0.10, …
    // rather than 2-decimal rounding which would allow 0.07).
    const d = decimalsFromStep(step);
    const stepped = Number((Math.round(clamped / step) * step).toFixed(d));
    const next = [...data];
    next[index] = stepped;
    onChange(serializeYearly(next, step));
  }

  const chartData: ChartData<'line'> = useMemo(
    () => ({
      labels: YEAR_LABELS,
      datasets: [
        {
          label: unit || 'Value',
          data,
          borderColor: color,
          backgroundColor: fillColor,
          fill: 'origin',
          cubicInterpolationMode: 'monotone' as const,
          tension: 0,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: color,
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          borderWidth: 2,
        },
      ],
    }),
    [data, color, fillColor, unit],
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'nearest', intersect: true },
      scales: {
        x: { grid: { display: false } },
        // Cast: Chart.js types `type` per-scale as a discriminated union, so the
        // 'linear' | 'logarithmic' prop union can't satisfy either narrowed shape.
        y: {
          type: scaleType,
          title: { display: !!unit, text: unit },
          min: yMin,
          max: yMax,
          ticks: yTickStep !== undefined ? { stepSize: yTickStep } : undefined,
        },
      } as ChartOptions<'line'>['scales'],
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx =>
              `${ctx.label} · ${Number(ctx.parsed.y).toFixed(decimalsFromStep(step))}${unit ? ' ' + unit : ''}`,
          },
        },
        dragData: {
          round: decimalsFromStep(step),
          showTooltip: true,
          dragX: false,
          onDragEnd: (_e: unknown, _datasetIndex: number, index: number, v: number) =>
            handleDragEnd(index, v),
        },
      } as ChartOptions<'line'>['plugins'],
    }),
    [unit, yMin, yMax, step, data, scaleType, yTickStep],
  );

  return (
    <div>
      {userAdjustableMax && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
          <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, letterSpacing: 0.3 }}>
            Y-AXIS MAX
          </label>
          <input
            type="number"
            min={yMin > 0 ? yMin : step}
            step={step}
            value={yMax}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v) && v > yMin) setCustomMax(v);
            }}
            style={{
              width: 100,
              padding: '3px 8px',
              fontSize: 12,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              outline: 'none',
            }}
          />
          {unit && <span style={{ fontSize: 11, color: '#94a3b8' }}>{unit}</span>}
          {customMax !== undefined && (
            <button
              type="button"
              onClick={() => {
                setCustomMax(undefined);
                // Clamp any data points that the user dragged above the default
                // max while the axis was expanded — otherwise they render clipped
                // off the top of the chart after reset.
                if (yMaxAbsolute !== undefined) {
                  const clamped = data.map(v => Math.min(v, yMaxAbsolute));
                  if (clamped.some((v, i) => v !== data[i])) {
                    onChange(serializeYearly(clamped, step));
                  }
                }
              }}
              style={{ fontSize: 11, color: '#0d9488', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              reset
            </button>
          )}
        </div>
      )}
      <div style={{ height: 220, position: 'relative' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
