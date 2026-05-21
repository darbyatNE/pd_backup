import { useMemo } from 'react';
import type { LinkedContract } from '../../../data/linkedContracts';
import type { SummaryStats, XAxisMode } from '../types';

export function useHedgeStats(
  hourlyData: Record<string, number | string>[],
  monthRows: Record<string, number | string>[],
  xAxis: XAxisMode,
  existingContracts: LinkedContract[],
) {
  return useMemo<SummaryStats>(() => {
    const rows = xAxis === 'hours' ? hourlyData : monthRows;
    if (rows.length === 0) {
      return { preBase: 0, prePeak: 0, postBase: 0, postPeak: 0 };
    }

    let totalBase = 0;
    let totalPeak = 0;
    let existingBase = 0;
    let existingPeak = 0;
    let tryOnBase = 0;
    let tryOnPeak = 0;

    rows.forEach((row) => {
      const uncBase = (row.base_uncovered as number) || 0;
      const uncPeak = (row.peak_uncovered as number) || 0;
      const tBase = (row.tryon_base as number) || 0;
      const tPeak = (row.tryon_peak as number) || 0;
      const eBase = (row.existing_base as number) || 0;
      const ePeak = (row.existing_peak as number) || 0;

      totalBase += eBase + tBase + uncBase;
      totalPeak += ePeak + tPeak + uncPeak;
      existingBase += eBase;
      existingPeak += ePeak;
      tryOnBase += tBase;
      tryOnPeak += tPeak;
    });

    const n = rows.length;
    const tb = totalBase / n;
    const tp = totalPeak / n;
    const eb = existingBase / n;
    const ep = existingPeak / n;
    const tib = tryOnBase / n;
    const tip = tryOnPeak / n;

    const preBase = tb > 0 ? Math.round((eb / tb) * 100) : 0;
    const prePeak = tp > 0 ? Math.round((ep / tp) * 100) : 0;
    const postBase = tb > 0 ? Math.round(((eb + tib) / tb) * 100) : 0;
    const postPeak = tp > 0 ? Math.round(((ep + tip) / tp) * 100) : 0;

    return { preBase, prePeak, postBase, postPeak };
  }, [hourlyData, monthRows, xAxis, existingContracts]);
}
