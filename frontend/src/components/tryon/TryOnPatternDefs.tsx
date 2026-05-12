import { PATTERN_FG } from '../../data/linkedContracts';
import type { LinkedContract } from '../../data/linkedContracts';
import { OVERHEDGE_PATTERN_ID } from './types';
import { contractKey } from './utils';

function TryOnPatternDef() {
  return (
    <pattern id="tryon-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#818cf8" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#4338ca" strokeWidth="1.5" />
    </pattern>
  );
}

function OverhedgePatternDef() {
  return (
    <pattern id={OVERHEDGE_PATTERN_ID} patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#fecaca" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#b91c1c" strokeWidth="2" />
    </pattern>
  );
}

function ExistingPatternDef({ c }: { c: LinkedContract }) {
  const id = `pat-${c.pattern}-base-${contractKey(c.projectName)}`;
  const fg = PATTERN_FG;
  switch (c.pattern) {
    case 'diagonal':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="7" height="7">
          <path d="M0,7 L7,0 M-1,1 L1,-1 M6,8 L8,6" stroke={fg} strokeWidth="1.3" />
        </pattern>
      );
    case 'dots':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.3" fill={fg} />
        </pattern>
      );
    case 'crosshatch':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8">
          <path d="M0,8 L8,0" stroke={fg} strokeWidth="1" />
          <path d="M0,0 L8,8" stroke={fg} strokeWidth="1" />
        </pattern>
      );
    case 'vertical':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="5" height="5">
          <line x1="2.5" y1="0" x2="2.5" y2="5" stroke={fg} strokeWidth="1.4" />
        </pattern>
      );
    case 'wave':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="10" height="6">
          <path d="M0,3 Q2.5,0 5,3 T10,3" fill="none" stroke={fg} strokeWidth="1.2" />
        </pattern>
      );
    case 'grid':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
          <path d="M0,0 L6,0 M0,3 L6,3 M0,0 L0,6 M3,0 L3,6" stroke={fg} strokeWidth="0.7" />
        </pattern>
      );
    default:
      return null;
  }
}

export function TryOnPatternDefs({ existingContracts }: { existingContracts: LinkedContract[] }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {existingContracts.map((c) => (
          <ExistingPatternDef key={c.projectName} c={c} />
        ))}
        <TryOnPatternDef />
        <OverhedgePatternDef />
      </defs>
    </svg>
  );
}
