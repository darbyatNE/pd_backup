import { useMemo } from 'react';
import type { Project } from '../../../types';
import {
  LOAD_PROFILE_MAP,
  aggregateProfiles,
  getEffectiveLoadAt,
} from '../../../data/loadProfile';
import {
  getContractsForSites,
  contractMwForHourAvgInYear,
  contractMwForMonthInYear,
} from '../../../data/linkedContracts';
import type { LinkedContract } from '../../../data/linkedContracts';
import { contractKey, r1 } from '../utils';
import type { XAxisMode } from '../types';

function mapGenType(genType: string): { shape: LinkedContract['shape']; tier: LinkedContract['tier'] } {
  switch (genType) {
    case 'Solar': return { shape: 'solar', tier: 'peak' };
    case 'Wind': return { shape: 'wind', tier: 'peak' };
    case 'Nuclear': return { shape: 'flat', tier: 'base' };
    case 'Battery': return { shape: 'evening', tier: 'peak' };
    case 'Hydrogen': return { shape: 'flat', tier: 'peak' };
    case 'Hybrid': return { shape: 'evening', tier: 'peak' };
    case 'Combined Cycle': return { shape: 'flat', tier: 'base' };
    case 'Peaker': return { shape: 'evening', tier: 'peak' };
    default: return { shape: 'flat', tier: 'peak' };
  }
}

export function useTryOnData(
  project: Project,
  previewSites: string[],
  splits: Record<string, number>,
  capacityPct: number,
  activeYear: number,
  startYear: number,
  xAxis: XAxisMode
) {
  // Aggregate profile for PREVIEW sites
  const aggregateProfile = useMemo(() => {
    const profiles = previewSites
      .map((k) => LOAD_PROFILE_MAP[k])
      .filter(Boolean);
    if (profiles.length === 0) return null;
    if (profiles.length === 1) return profiles[0];
    return aggregateProfiles(profiles);
  }, [previewSites]);

  // Existing contracts for preview sites
  const existingContracts = useMemo(() => {
    return getContractsForSites(previewSites);
  }, [previewSites]);

  // Try-on contract derived from project — only for preview sites
  const tryOnContract = useMemo<LinkedContract>(() => {
    const { shape, tier } = mapGenType(project.generation_type);
    const cod = project.expected_cod ? new Date(project.expected_cod) : null;
    const codYear = cod ? cod.getFullYear() : startYear;
    const codMonth = cod ? cod.getMonth() + 1 : 1;
    const term = project.delivery_term_years || 15;
    const scale = capacityPct / 100;
    const tryOnMw = previewSites.reduce(
      (sum, k) => sum + ((project.capacity_mw || 0) * scale * (splits[k] || 0)) / 100,
      0
    );
    return {
      projectName: project.name,
      generationType: project.generation_type as LinkedContract['generationType'],
      mwCovered: tryOnMw,
      shape,
      tier,
      pattern: 'diagonal',
      startYear: codYear,
      startMonth: codMonth,
      endYear: codYear + term,
      endMonth: codMonth,
      perSiteMw: previewSites
        .map((k) => ({
          siteKey: k,
          mwCovered: ((project.capacity_mw || 0) * scale * (splits[k] || 0)) / 100,
        }))
        .filter((s) => s.mwCovered > 0),
    };
  }, [project, splits, previewSites, startYear, capacityPct]);

  // Build a row with existing contracts + try-on, computing tiered coverage
  const buildRow = (
    label: string,
    baseMw: number,
    peakMw: number,
    existingMws: number[],
    tryOnMw: number,
  ) => {
    const totalLoad = baseMw + peakMw;
    let cumul = 0;
    let totalOverhedge = 0;

    const eBase: number[] = [];
    const ePeak: number[] = [];
    existingMws.forEach((want) => {
      const start = cumul;
      const end = cumul + want;
      const inBase = Math.max(0, Math.min(end, baseMw) - Math.max(start, 0));
      const inPeak = Math.max(0, Math.min(end, totalLoad) - Math.max(start, baseMw));
      const over = Math.max(0, end - Math.max(start, totalLoad));
      eBase.push(inBase);
      ePeak.push(inPeak);
      totalOverhedge += over;
      cumul = end;
    });

    const tryOnStart = cumul;
    const tryOnEnd = cumul + tryOnMw;
    const tryOnBase = Math.max(0, Math.min(tryOnEnd, baseMw) - Math.max(tryOnStart, 0));
    const tryOnPeak = Math.max(0, Math.min(tryOnEnd, totalLoad) - Math.max(tryOnStart, baseMw));
    const tryOnOver = Math.max(0, tryOnEnd - Math.max(tryOnStart, totalLoad));
    totalOverhedge += tryOnOver;
    cumul = tryOnEnd;

    const cumulInLoad = Math.min(cumul, totalLoad);
    const baseUncovered = Math.max(0, baseMw - Math.min(cumulInLoad, baseMw));
    const peakUncovered = Math.max(0, peakMw - Math.max(0, cumulInLoad - baseMw));

    const row: Record<string, number | string> = {
      label,
      capacity: aggregateProfile?.capacityMw ?? 0,
      base_uncovered: r1(baseUncovered),
      peak_uncovered: r1(peakUncovered),
      tryon_base: r1(tryOnBase),
      tryon_peak: r1(tryOnPeak),
      overhedge: -r1(totalOverhedge),
    };

    existingContracts.forEach((c, i) => {
      const k = contractKey(c.projectName);
      row[`e_${k}_base`] = r1(eBase[i]);
      row[`e_${k}_peak`] = r1(ePeak[i]);
    });

    return row;
  };

  const hourlyData = useMemo(() => {
    if (!aggregateProfile) return [];
    return Array.from({ length: 24 }, (_, h) => {
      let baseSum = 0;
      let peakSum = 0;
      for (let m = 1; m <= 12; m++) {
        const eff = getEffectiveLoadAt(aggregateProfile, h, m, activeYear);
        baseSum += eff.baseloadMw;
        peakSum += eff.peakMw;
      }
      const avgBase = baseSum / 12;
      const avgPeak = peakSum / 12;
      const existingMws = existingContracts.map((c) =>
        contractMwForHourAvgInYear(c, h, activeYear),
      );
      const tryOnAvg = contractMwForHourAvgInYear(tryOnContract, h, activeYear);
      return buildRow(`${h}h`, avgBase, avgPeak, existingMws, tryOnAvg);
    });
  }, [aggregateProfile, existingContracts, tryOnContract, activeYear]);

  const monthRows = useMemo(() => {
    if (!aggregateProfile) return [];
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthLabels.map((m, mi) => {
      let baseSum = 0;
      let peakSum = 0;
      for (let h = 0; h < 24; h++) {
        const eff = getEffectiveLoadAt(aggregateProfile, h, mi + 1, activeYear);
        baseSum += eff.baseloadMw;
        peakSum += eff.peakMw;
      }
      const baseMw = baseSum / 24;
      const peakMw = peakSum / 24;
      const existingMws = existingContracts.map((c) =>
        contractMwForMonthInYear(c, activeYear, mi + 1),
      );
      const tryOnMonth = contractMwForMonthInYear(tryOnContract, activeYear, mi + 1);
      return buildRow(m, baseMw, peakMw, existingMws, tryOnMonth);
    });
  }, [aggregateProfile, existingContracts, tryOnContract, activeYear]);

  const data = xAxis === 'hours' ? hourlyData : monthRows;
  const yLabel = xAxis === 'hours' ? 'MW' : 'MW avg';

  return {
    aggregateProfile,
    existingContracts,
    tryOnContract,
    hourlyData,
    monthRows,
    data,
    yLabel,
  };
}
