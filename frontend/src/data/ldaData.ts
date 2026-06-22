// Load Distribution Area (LDA) data for PJM capacity qualification
// Northern Virginia falls within the Dominion (DOM) LDA

export interface LDA {
  code: string;
  name: string;
  isConstrained: boolean;
  neighbors: string[]; // LDA codes that can deliver capacity to this LDA
}

// All 27 modeled LDAs in PJM including constrained sub-zones
export const LDAS: Record<string, LDA> = {
  // Constrained zones
  'DOM': {
    code: 'DOM',
    name: 'Dominion',
    isConstrained: true,
    neighbors: ['DOM', 'BGE', 'PEPCO', 'DPL South', 'ATSI'] // Can receive from itself and neighboring unconstrained zones
  },
  'EMAAC': {
    code: 'EMAAC',
    name: 'Eastern MAAC',
    isConstrained: true,
    neighbors: ['EMAAC', 'PSEG', 'PSEG North', 'PEPCO', 'DPL South', 'BGE']
  },
  'MAAC': {
    code: 'MAAC',
    name: 'Mid-Atlantic MAAC',
    isConstrained: true,
    neighbors: ['MAAC', 'PSEG', 'PSEG North', 'PEPCO', 'DPL South', 'BGE', 'DOM']
  },
  'SWMAAC': {
    code: 'SWMAAC',
    name: 'Southwest MAAC',
    isConstrained: true,
    neighbors: ['SWMAAC', 'ATSI', 'DOM', 'DPL South']
  },
  'ATSI': {
    code: 'ATSI',
    name: 'American Transmission Systems Inc',
    isConstrained: true,
    neighbors: ['ATSI', 'DOM', 'SWMAAC', 'DPL South']
  },
  'ComEd': {
    code: 'ComEd',
    name: 'Commonwealth Edison',
    isConstrained: true,
    neighbors: ['ComEd', 'ATSI', 'DOM']
  },
  'PSEG': {
    code: 'PSEG',
    name: 'Public Service Electric & Gas',
    isConstrained: true,
    neighbors: ['PSEG', 'PSEG North', 'MAAC', 'EMAAC', 'PEPCO', 'DPL South', 'BGE']
  },
  'PSEG North': {
    code: 'PSEG North',
    name: 'PSEG North',
    isConstrained: true,
    neighbors: ['PSEG North', 'PSEG', 'MAAC', 'EMAAC', 'PEPCO', 'DPL South', 'BGE']
  },
  'DPL South': {
    code: 'DPL South',
    name: 'Delmarva Power South',
    isConstrained: true,
    neighbors: ['DPL South', 'DOM', 'ATSI', 'SWMAAC', 'MAAC', 'EMAAC', 'PSEG', 'PSEG North', 'PEPCO', 'BGE']
  },
  'BGE': {
    code: 'BGE',
    name: 'Baltimore Gas & Electric',
    isConstrained: true,
    neighbors: ['BGE', 'DOM', 'PEPCO', 'DPL South', 'MAAC', 'EMAAC', 'PSEG', 'PSEG North']
  },
  'PEPCO': {
    code: 'PEPCO',
    name: 'Potomac Electric Power Company',
    isConstrained: true,
    neighbors: ['PEPCO', 'DOM', 'BGE', 'DPL South', 'MAAC', 'EMAAC', 'PSEG', 'PSEG North']
  },

  // Unconstrained zones (can deliver to any LDA)
  'AEP': {
    code: 'AEP',
    name: 'American Electric Power',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'DAY': {
    code: 'DAY',
    name: 'Dayton Power & Light',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'DEOK': {
    code: 'DEOK',
    name: 'Detroit Edison',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'DUQ': {
    code: 'DUQ',
    name: 'Duquesne Light',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'EKPC': {
    code: 'EKPC',
    name: 'East Kentucky Power Cooperative',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'JCPL': {
    code: 'JCPL',
    name: 'Jersey Central Power & Light',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'ME': {
    code: 'ME',
    name: 'Maine',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'NE': {
    code: 'NE',
    name: 'New England',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'NI': {
    code: 'NI',
    name: 'Niagara',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'NYISO': {
    code: 'NYISO',
    name: 'New York ISO',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'PJM': {
    code: 'PJM',
    name: 'PJM Wide',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'PS': {
    code: 'PS',
    name: 'Public Service',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'RECO': {
    code: 'RECO',
    name: 'Reliant Energy',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'AP': {
    code: 'AP',
    name: 'Allegheny Power',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  },
  'VEA': {
    code: 'VEA',
    name: 'Virginia Electric & Power',
    isConstrained: false,
    neighbors: [] // Can deliver to all LDAs
  }
};

// Check if a generation LDA can deliver capacity to a load LDA
export function canDeliverCapacity(genLda: string, loadLda: string): boolean {
  const genLdaInfo = LDAS[genLda];
  const loadLdaInfo = LDAS[loadLda];
  
  if (!genLdaInfo || !loadLdaInfo) {
    return false; // Invalid LDA codes
  }
  
  // Unconstrained generation can deliver to any load LDA
  if (!genLdaInfo.isConstrained) {
    return true;
  }
  
  // Constrained generation can only deliver to its own LDA or neighboring LDAs
  return genLdaInfo.neighbors.includes(loadLda);
}

// Get all LDAs that can deliver capacity to a given load LDA
export function getEligibleGenerationLDAs(loadLda: string): string[] {
  const loadLdaInfo = LDAS[loadLda];
  if (!loadLdaInfo) {
    return [];
  }
  
  return Object.keys(LDAS).filter(genLda => canDeliverCapacity(genLda, loadLda));
}
