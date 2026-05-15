import { LOAD_COLORS } from '../../data/linkedContracts';
import { OVERHEDGE_PATTERN_ID } from './types';

interface LegendPayloadItem {
  value: string;
}

interface TryOnLegendContentProps {
  payload?: LegendPayloadItem[];
  projectName: string;
  projectTier?: 'base' | 'peak';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{title}</p>
      {children}
    </div>
  );
}

function Swatch({ fill, patternUrl, stroke }: { fill: string; patternUrl?: string; stroke?: string }) {
  return (
    <svg width="12" height="8">
      <rect width="12" height="8" fill={fill} />
      {patternUrl && <rect width="12" height="8" fill={patternUrl} stroke={stroke ?? '#1e293b'} strokeWidth="0.3" />}
    </svg>
  );
}

export function TryOnLegendContent({ payload, projectName, projectTier }: TryOnLegendContentProps) {
  if (!payload) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[10px] leading-none mt-1">
      {/* Section 1 — Delivery Types (uncovered load) */}
      <Section title="Delivery Types">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-2" style={{ background: LOAD_COLORS.base }} />
          <span className="text-slate-600">Baseload</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-2" style={{ background: LOAD_COLORS.peak }} />
          <span className="text-slate-600">Peak</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Swatch fill={`url(#${OVERHEDGE_PATTERN_ID})`} stroke="#b91c1c" />
          <span className="text-slate-600">Over-hedge</span>
        </span>
      </Section>

      {/* Section 2 — Existing Hedge (combined) */}
      <Section title="Existing Hedge">
        <span className="inline-flex items-center gap-1">
          <Swatch fill="#94a3b8" patternUrl="url(#existing-combined-pattern)" stroke="#475569" />
          <span className="text-slate-600">Combined contracts</span>
        </span>
      </Section>

      {/* Section 3 — Proposed Project */}
      <Section title="PROPOSED PROJECT">
        <span className="inline-flex items-center gap-1">
          <Swatch fill={projectTier === 'base' ? '#2563eb' : '#60a5fa'} patternUrl="url(#tryon-pattern)" stroke="#1e3a8a" />
          <span className="text-slate-600">{projectName}</span>
        </span>
      </Section>
    </div>
  );
}
