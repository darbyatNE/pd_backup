import { OVERHEDGE_PATTERN_ID } from './types';

function TryOnPatternDef() {
  return (
    <pattern id="tryon-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#818cf8" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#4338ca" strokeWidth="1.5" />
    </pattern>
  );
}

function CapacityTryOnPatternDef() {
  return (
    <pattern id="capacity-tryon-pattern" patternUnits="userSpaceOnUse" width="10" height="10">
      <rect width="10" height="10" fill="#f8fafc" />
      <path d="M5,1 L8,3 L8,7 L5,9 L2,7 L2,3 Z" stroke="#cbd5e1" strokeWidth="1" fill="none" />
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

function CapacityExistingWavePatternDef() {
  return (
    <pattern id="capacity-existing-wave-pattern" patternUnits="userSpaceOnUse" width="10" height="6">
      <path d="M0,3 Q2.5,0 5,3 T10,3" fill="none" stroke="#1e293b" strokeWidth="1.2" />
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

function GreenCapacityTryOnPatternDef() {
  return (
    <pattern id="capacity-tryon-green-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#d1fae5" />
      <path d="M0,8 L8,0 M-1,1 L1,-1 M7,9 L9,7" stroke="#059669" strokeWidth="1.5" />
    </pattern>
  );
}

export function TryOnPatternDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <ExistingCombinedPatternDef />
        <TryOnPatternDef />
        <CapacityTryOnPatternDef />
        <CapacityExistingWavePatternDef />
        <OverhedgePatternDef />
        <GreenCapacityTryOnPatternDef />
      </defs>
    </svg>
  );
}
