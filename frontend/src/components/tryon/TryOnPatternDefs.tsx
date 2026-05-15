import { OVERHEDGE_PATTERN_ID } from './types';

function TryOnPatternDef() {
  return (
    <pattern id="tryon-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#818cf8" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#4338ca" strokeWidth="1.5" />
    </pattern>
  );
}

function ExistingCombinedPatternDef() {
  return (
    <pattern id="existing-combined-pattern" patternUnits="userSpaceOnUse" width="6" height="6">
      <path d="M0,6 L6,0" stroke="#1e293b" strokeWidth="1.5" />
      <path d="M0,0 L6,6" stroke="#1e293b" strokeWidth="1.5" />
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

export function TryOnPatternDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <ExistingCombinedPatternDef />
        <TryOnPatternDef />
        <OverhedgePatternDef />
      </defs>
    </svg>
  );
}
