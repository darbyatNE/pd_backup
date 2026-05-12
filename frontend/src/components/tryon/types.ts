import type { Project } from '../../types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ALL_SITE_KEYS = ['ashburn-dc', 'manassas-industrial', 'sterling-hyperscale'] as const;

export const SITE_NAMES: Record<string, string> = {
  'ashburn-dc': 'Ashburn DC',
  'manassas-industrial': 'Manassas Industrial',
  'sterling-hyperscale': 'Sterling Hyperscale',
};

export const OVERHEDGE_PATTERN_ID = 'tryon-overhedge';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TryOnOverlayProps {
  project: Project;
  onClose: () => void;
}

export interface SummaryStats {
  preBase: number;
  prePeak: number;
  postBase: number;
  postPeak: number;
}

export interface SplitState {
  splits: Record<string, number>;
  splitSum: number;
  splitValid: boolean;
  updateSplit: (key: string, val: number) => void;
  normalizeSplits: () => void;
}

export type XAxisMode = 'hours' | 'months';
