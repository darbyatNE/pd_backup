import { useState, useCallback, useMemo } from 'react';
import { ALL_SITE_KEYS } from '../types';

export function useSiteSplits() {
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

  const splitSum = useMemo(
    () => ALL_SITE_KEYS.reduce((s, k) => s + (splits[k] || 0), 0),
    [splits]
  );
  const splitValid = splitSum === 100;

  const updateSplit = useCallback((key: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setSplits((prev) => ({ ...prev, [key]: clamped }));
  }, []);

  const normalizeSplits = useCallback(() => {
    const sum = ALL_SITE_KEYS.reduce((s, k) => s + (splits[k] || 0), 0);
    if (sum === 0) return;
    const normalized: Record<string, number> = {};
    ALL_SITE_KEYS.forEach((k) => {
      normalized[k] = Math.round(((splits[k] || 0) / sum) * 100);
    });
    let drift = 100 - ALL_SITE_KEYS.reduce((s, k) => s + normalized[k], 0);
    for (let i = 0; drift !== 0 && i < ALL_SITE_KEYS.length; i++) {
      const k = ALL_SITE_KEYS[i];
      if (normalized[k] + drift >= 0 && normalized[k] + drift <= 100) {
        normalized[k] += drift;
        drift = 0;
      }
    }
    setSplits(normalized);
  }, [splits]);

  return { splits, splitSum, splitValid, updateSplit, normalizeSplits };
}
