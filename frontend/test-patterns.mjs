/**
 * Pattern consistency test — no test framework required, runs with: node test-patterns.mjs
 *
 * Verifies:
 *  1. Every gen type has a unique pattern (no collisions)
 *  2. patternId() produces IDs that match what the legend swatch references
 *  3. Every active contract in each scope year has a pattern that appears in the legend
 *  4. Pattern IDs are stable (same contract name → same ID regardless of call order)
 */

// ── Inline the pure logic from linkedContracts.ts (no TS imports needed) ────

const GENERATION_TYPE_PATTERNS = {
  'Solar':          'dots',
  'Wind':           'diagonal',
  'Nuclear':        'wave',
  'Hybrid':         'crosshatch',
  'Combined Cycle': 'vertical',
  'Peaker':         'grid',
  'Battery':        'horizontal',
  'Hydro':          'zigzag',
};

const GENERATION_TYPE_ORDER = [
  'Solar', 'Wind', 'Hydro', 'Nuclear', 'Hybrid', 'Combined Cycle', 'Peaker', 'Battery',
];

function getPatternForGenerationType(genType) {
  return GENERATION_TYPE_PATTERNS[genType] ?? 'grid';
}

// Mirrors patternId() from linkedContracts.ts
function patternId(c, tier) {
  const t = tier ?? c.tier;
  return `pat-${c.pattern}-${t}-${c.projectName.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

// Mirrors contractKey() from LoadShape2D.tsx
function contractKey(name) {
  return name.replace(/[^a-zA-Z0-9]+/g, '_');
}

// Legend swatch ID — mirrors what LoadShape2D renders for dummy legend contracts
function legendPatternId(genType) {
  const pattern = getPatternForGenerationType(genType);
  const dummyName = `__legend__${genType}`;
  return `pat-${pattern}-base-${dummyName.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

// Contracts from LINKED_CONTRACTS (merged via getContractsForSites logic)
const ALL_SITE_CONTRACTS = {
  'ashburn-dc': [
    { projectName: 'Susquehanna SMR',       generationType: 'Nuclear',        mwCovered: 20, tier: 'base', pattern: getPatternForGenerationType('Nuclear'),        startYear: 2027, startMonth: 1,  endYear: 2033, endMonth: 12 },
    { projectName: 'Spotsylvania Solar II', generationType: 'Solar',          mwCovered: 8,  tier: 'peak', pattern: getPatternForGenerationType('Solar'),          startYear: 2026, startMonth: 1,  endYear: 2032, endMonth: 12 },
    { projectName: 'Tucker Mountain Wind',  generationType: 'Wind',           mwCovered: 4,  tier: 'peak', pattern: getPatternForGenerationType('Wind'),           startYear: 2024, startMonth: 1,  endYear: 2027, endMonth: 12 },
  ],
  'manassas-industrial': [
    { projectName: 'North Anna Allocation', generationType: 'Nuclear',        mwCovered: 20, tier: 'base', pattern: getPatternForGenerationType('Nuclear'),        startYear: 2026, startMonth: 1,  endYear: 2030, endMonth: 12 },
    { projectName: 'Front Royal Hybrid',    generationType: 'Hybrid',         mwCovered: 10, tier: 'peak', pattern: getPatternForGenerationType('Hybrid'),         startYear: 2026, startMonth: 1,  endYear: 2027, endMonth: 12 },
    { projectName: 'Loudoun Solar Garden',  generationType: 'Solar',          mwCovered: 5,  tier: 'peak', pattern: getPatternForGenerationType('Solar'),          startYear: 2027, startMonth: 7,  endYear: 2032, endMonth: 12 },
  ],
  'sterling-hyperscale': [
    { projectName: 'Susquehanna SMR',       generationType: 'Nuclear',        mwCovered: 30, tier: 'base', pattern: getPatternForGenerationType('Nuclear'),        startYear: 2027, startMonth: 1,  endYear: 2033, endMonth: 12 },
    { projectName: 'Hudson Co. Hybrid',     generationType: 'Hybrid',         mwCovered: 8,  tier: 'peak', pattern: getPatternForGenerationType('Hybrid'),         startYear: 2026, startMonth: 1,  endYear: 2032, endMonth: 12 },
    { projectName: 'Garrett Ridge Wind',    generationType: 'Wind',           mwCovered: 12, tier: 'peak', pattern: getPatternForGenerationType('Wind'),           startYear: 2026, startMonth: 1,  endYear: 2028, endMonth: 12 },
    { projectName: 'Marcus Hook CCGT II',   generationType: 'Combined Cycle', mwCovered: 10, tier: 'base', pattern: getPatternForGenerationType('Combined Cycle'), startYear: 2027, startMonth: 4,  endYear: 2034, endMonth: 3  },
  ],
};

function isContractActiveAt(c, year, month) {
  const before = year < c.startYear || (year === c.startYear && month < c.startMonth);
  const after  = year > c.endYear   || (year === c.endYear   && month > c.endMonth);
  return !before && !after;
}

// ── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ── TEST 1: No duplicate patterns across gen types ────────────────────────────

console.log('\n[1] Pattern uniqueness — every gen type must have a distinct pattern');
const patterns = Object.entries(GENERATION_TYPE_PATTERNS);
const patternValues = patterns.map(([, p]) => p);
const duplicates = patternValues.filter((p, i) => patternValues.indexOf(p) !== i);
assert(duplicates.length === 0, `No duplicate patterns (found: ${duplicates.length === 0 ? 'none' : duplicates.join(', ')})`);
patterns.forEach(([gt, p]) => {
  const count = patternValues.filter(v => v === p).length;
  assert(count === 1, `${gt} → '${p}' is unique`);
});

// ── TEST 2: Legend swatch IDs match patternId() format ────────────────────────

console.log('\n[2] Legend swatch IDs match patternId() scheme');
GENERATION_TYPE_ORDER.forEach((genType) => {
  const pattern = getPatternForGenerationType(genType);
  const dummyContract = {
    projectName: `__legend__${genType}`,
    generationType: genType,
    pattern,
    tier: 'base',
  };
  const expectedId = patternId(dummyContract, 'base');
  const legendId   = legendPatternId(genType);
  assert(expectedId === legendId, `${genType}: patternId()='${expectedId}' matches legend swatch ID`);
});

// ── TEST 3: Each contract's pattern matches its gen type ──────────────────────

console.log('\n[3] Contract pattern field matches gen type');
for (const [site, contracts] of Object.entries(ALL_SITE_CONTRACTS)) {
  for (const c of contracts) {
    const expected = getPatternForGenerationType(c.generationType);
    assert(c.pattern === expected,
      `[${site}] '${c.projectName}' (${c.generationType}): pattern='${c.pattern}' expected='${expected}'`);
  }
}

// ── TEST 4: Active contracts per year have legend coverage ────────────────────

console.log('\n[4] Active contracts in each scope year have a matching legend entry');
const scopeYears = [2026, 2027, 2028];
const allSites = ['ashburn-dc', 'manassas-industrial', 'sterling-hyperscale'];

for (const year of scopeYears) {
  const activeGenTypes = new Set();
  for (const site of allSites) {
    for (const c of ALL_SITE_CONTRACTS[site]) {
      // Check if active in any month of the year
      const activeInYear = Array.from({length:12},(_,i)=>i+1).some(m => isContractActiveAt(c, year, m));
      if (activeInYear) activeGenTypes.add(c.generationType);
    }
  }
  const legendGenTypes = new Set(GENERATION_TYPE_ORDER);
  activeGenTypes.forEach(gt => {
    assert(legendGenTypes.has(gt),
      `Year ${year}: active gen type '${gt}' is covered by legend`);
  });
  console.log(`     Year ${year} active gen types: ${[...activeGenTypes].join(', ')}`);
}

// ── TEST 5: contractKey() used in chart row data keys is collision-free ───────

console.log('\n[5] contractKey() produces unique row data keys across all merged contracts');
// Simulate getContractsForSites for all 3 sites
const merged = new Map();
for (const site of allSites) {
  for (const c of ALL_SITE_CONTRACTS[site]) {
    if (merged.has(c.projectName)) {
      merged.get(c.projectName).mwCovered += c.mwCovered;
    } else {
      merged.set(c.projectName, { ...c });
    }
  }
}
const allContracts = [...merged.values()];
const keys = allContracts.map(c => contractKey(c.projectName));
const uniqueKeys = new Set(keys);
assert(keys.length === uniqueKeys.size, `All ${keys.length} contracts produce unique contractKey() row keys`);
allContracts.forEach(c => {
  const k = contractKey(c.projectName);
  console.log(`     '${c.projectName}' → key='${k}' (${c.generationType}, pattern='${c.pattern}')`);
});

// ── TEST 6: Sort order consistency — sortedContracts matches GENERATION_TYPE_ORDER ──

console.log('\n[6] sortedContracts order matches GENERATION_TYPE_ORDER');
function getGenerationTypeOrder(gt) {
  const i = GENERATION_TYPE_ORDER.indexOf(gt);
  return i === -1 ? 999 : i;
}
const sorted = [...allContracts].sort((a, b) => {
  const oa = getGenerationTypeOrder(a.generationType);
  const ob = getGenerationTypeOrder(b.generationType);
  if (oa !== ob) return oa - ob;
  return b.mwCovered - a.mwCovered;
});
sorted.forEach((c, i) => {
  const prevOrder = i > 0 ? getGenerationTypeOrder(sorted[i-1].generationType) : -1;
  const currOrder = getGenerationTypeOrder(c.generationType);
  assert(currOrder >= prevOrder,
    `Position ${i}: '${c.projectName}' (${c.generationType}, order=${currOrder}) ≥ prev order ${prevOrder}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
