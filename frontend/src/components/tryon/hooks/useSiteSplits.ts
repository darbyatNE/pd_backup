import { useState, useCallback } from 'react';
import { ALL_SITE_KEYS } from '../types';

export function useSiteSplits() {
  // Each data center's allocation is independent (0–100% of the project's
  // committed volume). They are NOT normalized to sum to 100% — the contracted
  // total is the sum of the per-site allocations and grows/shrinks as each
  // slider moves. The starting position is an even split (so the total opens at
  // the full committed volume), freely adjustable up or down from there.
  const [splits, setSplits] = useState<Record<string, number>>(() => {
    const total = ALL_SITE_KEYS.length;
    const base = Math.floor(100 / total);
    const rem = 100 - base * total;
    const out: Record<string, number> = {};
    ALL_SITE_KEYS.forEach((k, i) => {
      out[k] = base + (i < rem ? 1 : 0);
    });
    return out;
  });

  const updateSplit = useCallback((key: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setSplits((prev) => ({ ...prev, [key]: clamped }));
  }, []);

  return { splits, updateSplit };
}
