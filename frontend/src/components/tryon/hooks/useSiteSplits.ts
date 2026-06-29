import { useState, useCallback } from 'react';
import { ALL_SITE_KEYS } from '../types';

export function useSiteSplits() {
  // Each data center's allocation is independent and persistent: splits[k] is that
  // site's OWN volume as a % of the project's max offering (0–100). Setting one
  // site never changes another, and unchecking a site (chart/save inclusion) does
  // NOT alter its stored value — it persists until the user changes it. The
  // contracted total is simply the sum over the checked sites. Starts at an even
  // split so the deal opens at the full offering, adjustable per site from there.
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
