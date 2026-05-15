import { getEffectiveAnnualLoadMwh } from '../../data/loadProfile'
import type { SiteLoadProfile } from '../../data/loadProfile'
import {
  getContractAnnualMwhForYear,
} from '../../data/linkedContracts'
import type { LinkedContract } from '../../data/linkedContracts'

// Utility prices from costTimeData.ts - Off-peak: $48/MWh, On-peak: $58/MWh
// Weighted average: (8h × $48 + 16h × $58) / 24 = $54.67 ≈ $55
const DEFAULT_UTILITY_PRICE = Math.round((8 * 48 + 16 * 58) / 24)

const GEN_TYPE_COLORS: Record<string, string> = {
  Solar: '#2563eb',
  Wind: '#f97316',
  Nuclear: '#8b5cf6',
  Hybrid: '#06b6d4',
  'Combined Cycle': '#64748b',
  Battery: '#ec4899',
  Peaker: '#ef4444',
  'Unhedged / Utility Tariff': '#94a3b8',
}

export interface EnergyMixItem {
  name: string
  mwh: number
  value: number // percent 0-100
  cost: number  // blended $/MWh
  color: string
}

export function computeEnergyMix(
  contracts: LinkedContract[],
  profile: SiteLoadProfile,
  startYear: number,
  endYear: number,
): EnergyMixItem[] {
  if (endYear < startYear) return []

  const yearCount = endYear - startYear + 1

  // ── Total load MWh across scope ──
  let totalLoadMwh = 0
  for (let y = startYear; y <= endYear; y++) {
    totalLoadMwh += getEffectiveAnnualLoadMwh(profile, y)
  }
  totalLoadMwh /= yearCount

  // ── Contract MWh by generation type ──
  const byType = new Map<string, { mwh: number; costMwh: number }>()

  for (const c of contracts) {
    let contractMwh = 0
    for (let y = startYear; y <= endYear; y++) {
      contractMwh += getContractAnnualMwhForYear(c, y)
    }
    contractMwh /= yearCount

    if (contractMwh <= 0) continue

    const type = c.generationType
    const existing = byType.get(type) ?? { mwh: 0, costMwh: 0 }
    existing.mwh += contractMwh
    existing.costMwh += contractMwh * c.pricePerMwh
    byType.set(type, existing)
  }

  // ── Build output rows ──
  const rows: EnergyMixItem[] = []
  let totalContractedMwh = 0

  for (const [type, data] of byType) {
    totalContractedMwh += data.mwh
    rows.push({
      name: type,
      mwh: Math.round(data.mwh),
      value: 0, // filled after total known
      cost: Math.round(data.costMwh / data.mwh),
      color: GEN_TYPE_COLORS[type] ?? '#64748b',
    })
  }

  // ── Unhedged / Utility Tariff ──
  const unhedgedMwh = Math.max(0, totalLoadMwh - totalContractedMwh)
  if (unhedgedMwh > 0) {
    rows.push({
      name: 'Unhedged / Utility Tariff',
      mwh: Math.round(unhedgedMwh),
      value: 0,
      cost: DEFAULT_UTILITY_PRICE,
      color: GEN_TYPE_COLORS['Unhedged / Utility Tariff'],
    })
  }

  // ── Compute percentages ──
  const grandTotal = rows.reduce((s, r) => s + r.mwh, 0)
  for (const r of rows) {
    r.value = grandTotal > 0 ? Math.round((r.mwh / grandTotal) * 100) : 0
  }

  // Sort by MWh descending
  rows.sort((a, b) => b.mwh - a.mwh)

  return rows
}
