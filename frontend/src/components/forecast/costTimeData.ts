import { getEffectiveLoadAt } from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import {
  contractMwForHourAvgInYear,
  contractMwForMonthInYear,
} from '../../data/linkedContracts'
import type { LinkedContract } from '../../data/linkedContracts'

// Estimated utility tariff — fixed across sites, time-of-use shaped.
// Off-peak (HE 1–7, HE 24): $48/MWh  |  On-peak (HE 8–23): $58/MWh
const UTILITY_OFF_PEAK = 48
const UTILITY_ON_PEAK = 58

// Weighted-average utility price across a full day (flat monthly equivalent).
// (8h × $48 + 16h × $58) / 24 = $54.67
const UTILITY_MONTHLY_AVG = Math.round((8 * UTILITY_OFF_PEAK + 16 * UTILITY_ON_PEAK) / 24)

function utilityPriceForHour(hour: number): number {
  const isOnPeak = hour >= 7 && hour <= 22 // PJM on-peak HE 8–23
  return isOnPeak ? UTILITY_ON_PEAK : UTILITY_OFF_PEAK
}

export interface CostTimeData {
  labels: string[]
  optimized: number[]
  unoptimized: number[]
  optAvg: number
  unoptAvg: number
  savingsPct: number
}

export function computeCostTimeData(
  contracts: LinkedContract[],
  profile: SiteLoadProfile,
  startYear: number,
  endYear: number,
  granularity: 'hours' | 'months' = 'hours',
): CostTimeData {
  if (endYear < startYear) {
    return { labels: [], optimized: [], unoptimized: [], optAvg: 0, unoptAvg: 0, savingsPct: 0 }
  }

  const yearCount = endYear - startYear + 1
  const optimized: number[] = []
  const unoptimized: number[] = []
  const labels: string[] = []

  if (granularity === 'hours') {
    for (let h = 0; h < 24; h++) {
      labels.push(`${h.toString().padStart(2, '0')}`)

      // Average load at this hour across months + scope years
      let totalLoadMw = 0
      for (let y = startYear; y <= endYear; y++) {
        for (let m = 1; m <= 12; m++) {
          const eff = getEffectiveLoadAt(profile, h, m, y)
          totalLoadMw += eff.totalMw
        }
      }
      const avgLoadMw = totalLoadMw / (12 * yearCount)

      // Contracted MW and blended contract price at this hour
      let totalContractedMw = 0
      let totalContractCost = 0

      for (const c of contracts) {
        let contractMw = 0
        for (let y = startYear; y <= endYear; y++) {
          contractMw += contractMwForHourAvgInYear(c, h, y)
        }
        contractMw /= yearCount

        totalContractedMw += contractMw
        totalContractCost += contractMw * c.pricePerMwh
      }

      const avgContractPrice = totalContractedMw > 0
        ? totalContractCost / totalContractedMw
        : 0

      const utilityPrice = utilityPriceForHour(h)
      const unhedgedMw = Math.max(0, avgLoadMw - totalContractedMw)

      const optCost = avgLoadMw > 0
        ? (totalContractedMw * avgContractPrice + unhedgedMw * utilityPrice) / avgLoadMw
        : utilityPrice
      const unoptCost = utilityPrice

      optimized.push(Math.round(optCost))
      unoptimized.push(Math.round(unoptCost))
    }
  } else {
    // monthly
    const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    for (let m = 1; m <= 12; m++) {
      labels.push(MONTH_LABELS[m - 1])

      // Average load across all hours for this month + scope years
      let totalLoadMw = 0
      for (let y = startYear; y <= endYear; y++) {
        for (let h = 0; h < 24; h++) {
          const eff = getEffectiveLoadAt(profile, h, m, y)
          totalLoadMw += eff.totalMw
        }
      }
      const avgLoadMw = totalLoadMw / (24 * yearCount)

      // Contracted MW and blended contract price for this month
      let totalContractedMw = 0
      let totalContractCost = 0

      for (const c of contracts) {
        let contractMw = 0
        for (let y = startYear; y <= endYear; y++) {
          contractMw += contractMwForMonthInYear(c, y, m)
        }
        contractMw /= yearCount

        totalContractedMw += contractMw
        totalContractCost += contractMw * c.pricePerMwh
      }

      const avgContractPrice = totalContractedMw > 0
        ? totalContractCost / totalContractedMw
        : 0

      const utilityPrice = UTILITY_MONTHLY_AVG
      const unhedgedMw = Math.max(0, avgLoadMw - totalContractedMw)

      const optCost = avgLoadMw > 0
        ? (totalContractedMw * avgContractPrice + unhedgedMw * utilityPrice) / avgLoadMw
        : utilityPrice
      const unoptCost = utilityPrice

      optimized.push(Math.round(optCost))
      unoptimized.push(Math.round(unoptCost))
    }
  }

  const optAvg = Math.round(optimized.reduce((a, b) => a + b, 0) / optimized.length)
  const unoptAvg = Math.round(unoptimized.reduce((a, b) => a + b, 0) / unoptimized.length)
  const savingsPct = unoptAvg > 0 ? Math.round(((unoptAvg - optAvg) / unoptAvg) * 100) : 0

  return { labels, optimized, unoptimized, optAvg, unoptAvg, savingsPct }
}
