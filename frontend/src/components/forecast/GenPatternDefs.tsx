import { Fragment } from 'react'
import {
  COMMITMENT_LEVELS,
  COMMITMENT_PATTERN_FG,
  genTypePatternId,
  type CommitmentLevel,
} from '../../data/linkedContracts'

// The gen-type pattern SHAPES — identical across commitment levels. Only the
// foreground color (`fg`) changes per level. Defined once here so the chart bars
// (LoadShape2D) and the legend swatches (AssetSelectionLegend) stay in sync.
function genTypePatternsForLevel(commitment: CommitmentLevel) {
  const fg = COMMITMENT_PATTERN_FG[commitment]
  const id = (t: string) => genTypePatternId(t, commitment)
  return (
    <Fragment key={commitment}>
      <pattern id={id('Solar')}          patternUnits="userSpaceOnUse" width="6"  height="6"><circle cx="3" cy="3" r="1.3" fill={fg} /></pattern>
      <pattern id={id('Wind')}           patternUnits="userSpaceOnUse" width="7"  height="7"><path d="M0,7 L7,0 M-1,1 L1,-1 M6,8 L8,6" stroke={fg} strokeWidth="1.3" /></pattern>
      <pattern id={id('Hydro')}          patternUnits="userSpaceOnUse" width="10" height="6"><path d="M0,3 L2.5,0 L5,3 L7.5,6 L10,3" fill="none" stroke={fg} strokeWidth="1.2" /></pattern>
      <pattern id={id('Nuclear')}        patternUnits="userSpaceOnUse" width="10" height="6"><path d="M0,3 Q2.5,0 5,3 T10,3" fill="none" stroke={fg} strokeWidth="1.2" /></pattern>
      <pattern id={id('Hybrid')}         patternUnits="userSpaceOnUse" width="8"  height="8"><path d="M0,8 L8,0" stroke={fg} strokeWidth="1" /><path d="M0,0 L8,8" stroke={fg} strokeWidth="1" /></pattern>
      <pattern id={id('Combined Cycle')} patternUnits="userSpaceOnUse" width="5"  height="5"><line x1="2.5" y1="0" x2="2.5" y2="5" stroke={fg} strokeWidth="1.4" /></pattern>
      <pattern id={id('Peaker')}         patternUnits="userSpaceOnUse" width="6"  height="6"><path d="M0,0 L6,0 M0,3 L6,3 M0,0 L0,6 M3,0 L3,6" stroke={fg} strokeWidth="0.7" /></pattern>
      <pattern id={id('Battery')}        patternUnits="userSpaceOnUse" width="6"  height="5"><line x1="0" y1="2.5" x2="6" y2="2.5" stroke={fg} strokeWidth="1.4" /></pattern>
      <pattern id={id('Virtual')}        patternUnits="userSpaceOnUse" width="8"  height="8"><circle cx="4" cy="4" r="2" fill="none" stroke={fg} strokeWidth="1" /></pattern>
    </Fragment>
  )
}

/** All gen-type patterns, for every commitment level — for inclusion inside an
 *  existing <defs> (e.g. the chart's pattern layer). */
export function GenTypePatternDefsInner() {
  return <>{COMMITMENT_LEVELS.map(genTypePatternsForLevel)}</>
}

/** Standalone hidden <svg> carrying every gen-type × commitment pattern. Drop it
 *  anywhere a component needs the patterns available (e.g. the legend). */
export function GenTypePatternDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <GenTypePatternDefsInner />
      </defs>
    </svg>
  )
}
