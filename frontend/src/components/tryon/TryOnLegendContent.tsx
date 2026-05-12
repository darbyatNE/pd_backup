import { LOAD_COLORS } from '../../data/linkedContracts';
import type { LinkedContract } from '../../data/linkedContracts';
import { OVERHEDGE_PATTERN_ID } from './types';
import { contractKey } from './utils';

interface LegendPayloadItem {
  value: string;
}

interface TryOnLegendContentProps {
  payload?: LegendPayloadItem[];
  existingContracts: LinkedContract[];
  projectName: string;
}

export function TryOnLegendContent({ payload, existingContracts, projectName }: TryOnLegendContentProps) {
  if (!payload) return null;
  const seen = new Set<string>();
  const unique = payload.filter((entry) => {
    const name = entry.value as string;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] leading-none mt-1">
      {unique.map((entry) => {
        const name = entry.value as string;
        const isExisting = existingContracts.some((c) => c.projectName === name);
        const isTryOn = name === projectName;
        const isBase = name === 'Baseload';
        const isPeak = name === 'Peak';
        const isOver = name === 'Over-hedge';

        if (isExisting) {
          const c = existingContracts.find((ec) => ec.projectName === name)!;
          return (
            <span key={name} className="inline-flex items-center gap-1">
              <svg width="12" height="8">
                <rect width="12" height="8" fill={LOAD_COLORS.base} />
                <rect width="12" height="8" fill={`url(#pat-${c.pattern}-base-${contractKey(c.projectName)})`} stroke="#1e293b" strokeWidth="0.3" />
              </svg>
              <span className="text-slate-600">{name}</span>
            </span>
          );
        }
        if (isTryOn) {
          return (
            <span key={name} className="inline-flex items-center gap-1">
              <svg width="12" height="8">
                <rect width="12" height="8" fill="#818cf8" />
                <rect width="12" height="8" fill="url(#tryon-pattern)" stroke="#4338ca" strokeWidth="0.5" />
              </svg>
              <span className="text-slate-600">{name}</span>
            </span>
          );
        }
        if (isBase) {
          return (
            <span key={name} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2" style={{ background: LOAD_COLORS.base }} />
              <span className="text-slate-600">Baseload</span>
            </span>
          );
        }
        if (isPeak) {
          return (
            <span key={name} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2" style={{ background: LOAD_COLORS.peak }} />
              <span className="text-slate-600">Peak</span>
            </span>
          );
        }
        if (isOver) {
          return (
            <span key={name} className="inline-flex items-center gap-1">
              <svg width="12" height="8">
                <rect width="12" height="8" fill={`url(#${OVERHEDGE_PATTERN_ID})`} stroke="#b91c1c" strokeWidth="0.5" />
              </svg>
              <span className="text-slate-600">Over-hedge</span>
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}
