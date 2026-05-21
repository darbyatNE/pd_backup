import { useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
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
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
  dragData,
);

export const YEARS = 10;
const MONTHS = 12;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const YEAR_COLORS: { line: string; fill: string }[] = [
  { line: '#3b82f6', fill: 'rgba(59, 130, 246, 0.10)' },
  { line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.10)' },
  { line: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.10)' },
  { line: '#ec4899', fill: 'rgba(236, 72, 153, 0.10)' },
  { line: '#10b981', fill: 'rgba(16, 185, 129, 0.10)' },
  { line: '#ef4444', fill: 'rgba(239, 68, 68, 0.10)' },
  { line: '#06b6d4', fill: 'rgba(6, 182, 212, 0.10)' },
  { line: '#84cc16', fill: 'rgba(132, 204, 22, 0.10)' },
  { line: '#f97316', fill: 'rgba(249, 115, 22, 0.10)' },
  { line: '#6366f1', fill: 'rgba(99, 102, 241, 0.10)' },
];

// Logistic S-curve from ~2% to ~98% with midpoint at month 5.5.
// Used to pre-seed brand-new facilities and to fill any missing cells.
function defaultSCurve(): number[] {
  return Array.from({ length: MONTHS }, (_, m) => {
    const v = 100 / (1 + Math.exp(-0.8 * (m - 5.5)));
    return Math.round(v * 10) / 10;
  });
}

function parseGrid(s: string): number[][] {
  const parts = s ? s.split(',') : [];
  return Array.from({ length: YEARS }, (_, y) =>
    Array.from({ length: MONTHS }, (_, m) => {
      const raw = parts[y * MONTHS + m];
      if (raw === undefined) return NaN;
      const t = raw.trim();
      if (t === '') return NaN;
      const n = Number(t);
      return isNaN(n) ? NaN : n;
    }),
  );
}

function serializeGrid(grid: number[][]): string {
  const flat: string[] = [];
  for (let y = 0; y < YEARS; y++) {
    for (let m = 0; m < MONTHS; m++) {
      const v = grid[y][m];
      flat.push(isNaN(v) ? '' : String(v));
    }
  }
  return flat.join(', ');
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, v));
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  visible: boolean[];
  propagateForward: boolean;
}

export default function UtilRampCurveEditor({ value, onChange, visible, propagateForward }: Props) {
  // Always render with a fully-populated grid: gaps are filled from the S-curve
  // template so the chart never shows breaks and every node is draggable.
  const grid = useMemo(() => {
    const parsed = parseGrid(value);
    const seed = defaultSCurve();
    return parsed.map(row => row.map((v, m) => (isNaN(v) ? seed[m] : v)));
  }, [value]);

  // If the incoming value had any missing cells, write the seeded grid back to
  // the parent so the form state matches what the user sees. This handles both
  // brand-new facilities (all empty) and any partial legacy rows.
  useEffect(() => {
    const parsed = parseGrid(value);
    const hasGaps = parsed.some(row => row.some(v => isNaN(v)));
    if (hasGaps) onChange(serializeGrid(grid));
  }, [value, grid, onChange]);

  function handleDragEnd(yearIdx: number, monthIdx: number, newValue: number) {
    const next = grid.map(row => [...row]);
    const newClamped = clamp01(Math.round(newValue * 10) / 10);
    const oldValue = grid[yearIdx][monthIdx];
    const delta = newClamped - oldValue;
    next[yearIdx][monthIdx] = newClamped;
    if (propagateForward) {
      for (let y = yearIdx + 1; y < YEARS; y++) {
        const updated = clamp01(Math.round((next[y][monthIdx] + delta) * 10) / 10);
        next[y][monthIdx] = updated;
      }
    }
    onChange(serializeGrid(next));
  }

  const data: ChartData<'line'> = useMemo(
    () => ({
      labels: MONTH_LABELS,
      datasets: grid.map((row, y) => ({
        label: `Year ${y + 1}`,
        data: row,
        borderColor: YEAR_COLORS[y].line,
        backgroundColor: YEAR_COLORS[y].fill,
        fill: 'origin',
        cubicInterpolationMode: 'monotone' as const,
        tension: 0,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: YEAR_COLORS[y].line,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        hidden: !visible[y],
        borderWidth: 2,
      })),
    }),
    [grid, visible],
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'nearest', intersect: true },
      scales: {
        x: { title: { display: true, text: 'Months' }, grid: { display: false } },
        y: {
          title: { display: true, text: 'Utilisation (%)' },
          min: 0,
          max: 100,
          ticks: { stepSize: 20 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx =>
              `${ctx.dataset.label} · ${ctx.label} · ${Number(ctx.parsed.y).toFixed(1)}%`,
          },
        },
        // chartjs-plugin-dragdata config — cast because its types aren't bundled into Chart.js's plugin map
        dragData: {
          round: 1,
          showTooltip: true,
          dragX: false,
          onDragStart: (_e: unknown, datasetIndex: number) => {
            if (!visible[datasetIndex]) return false;
          },
          onDragEnd: (
            _e: unknown,
            datasetIndex: number,
            index: number,
            v: number,
          ) => handleDragEnd(datasetIndex, index, v),
        },
      } as ChartOptions<'line'>['plugins'],
    }),
    // grid is captured via handleDragEnd closure; depend on it so the latest snapshot is used
    [visible, propagateForward, grid],
  );

  return (
    <div style={{ minHeight: 360, position: 'relative' }}>
      <Line data={data} options={options} />
    </div>
  );
}
