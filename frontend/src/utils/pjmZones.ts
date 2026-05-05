// PJM zone abbreviation → [lng, lat] centroid.
// Overrides from echo/src/utils/config.js ZONE_LABEL_OVERRIDES applied for zones
// with irregular or multi-part shapes (config stores [lat,lng], flipped here to [lng,lat]).
const ZONE_COORDS: Record<string, [number, number]> = {
  // PJM zone abbreviations (overrides from echo config take precedence)
  ekpc:    [-85.17, 37.19],   // override: irregular multi-part shape
  duq:     [-79.96, 40.44],   // override
  day:     [-84.42, 40.02],   // override
  ugi:     [-76.0926, 41.2874],
  penelec: [-78.29, 40.45],   // override: multi-part shape
  meted:   [-76.45, 40.37],   // override: multi-part shape
  jcpl:    [-74.24, 40.13],   // override: multi-part shape
  dpl:     [-75.68, 38.74],   // override
  aeco:    [-75.2009, 39.5434],
  pepco:   [-76.8761, 38.7164],
  bge:     [-76.5509, 39.1210],
  ppl:     [-76.2232, 40.5703],
  peco:    [-75.39, 40.10],   // override
  pseg:    [-74.3818, 40.5413],
  comed:   [-88.67, 41.95],   // override
  dom:     [-77.65, 37.52],   // override
  dominion:[-77.65, 37.52],
  reco:    [-74.34, 41.13],   // override
  deok:    [-84.2731, 38.8902],
  lge:     [-85.06, 38.00],   // override
  'fe-atsi':[-81.52, 41.2],  // override
  atsi:    [-81.52, 41.2],
  aps:     [-79.8, 39.14],    // override: multi-part shape
  aep:     [-84.4, 40.9],     // override: multi-part shape

  // Full zone name fragments (kept in sync with abbreviation overrides above)
  'east kentucky':      [-85.17, 37.19],
  'duquesne':           [-79.96, 40.44],
  'dayton':             [-84.42, 40.02],
  'jersey central':     [-74.24, 40.13],
  'delmarva':           [-75.68, 38.74],
  'atlantic electric':  [-75.2009, 39.5434],
  'potomac':            [-76.8761, 38.7164],
  'baltimore':          [-76.5509, 39.1210],
  'pennsylvania power': [-76.2232, 40.5703],
  'pennsylvania electric': [-78.29, 40.45],
  'commonwealth edison':[-88.67, 41.95],
  'virginia power':     [-77.65, 37.52],
  'allegheny':          [-79.8, 39.14],
  'american electric':  [-84.4, 40.9],
  'duke energy ohio':   [-84.2731, 38.8902],
  'louisville':         [-85.06, 38.00],
  'firstenergy':        [-81.52, 41.2],

  // US states in PJM footprint
  'pennsylvania':    [-77.1945, 40.9999],
  'new jersey':      [-74.4057, 40.0583],
  'maryland':        [-76.6413, 39.0458],
  'delaware':        [-75.5277, 38.9108],
  'virginia':        [-78.6569, 37.4316],
  'west virginia':   [-80.4549, 38.5976],
  'ohio':            [-82.9071, 40.4173],
  'kentucky':        [-84.2700, 37.8393],
  'illinois':        [-89.3985, 40.6331],
  'indiana':         [-86.1349, 40.2672],
  'michigan':        [-85.6024, 44.3148],
  'dc':              [-77.0369, 38.9072],
  'washington dc':   [-77.0369, 38.9072],
  'north carolina':  [-79.0193, 35.7596],

  // ISO-NE states and regions
  'maine':           [-69.4455, 45.2538],
  'new hampshire':   [-71.5724, 43.1939],
  'vermont':         [-72.5778, 44.0459],
  'connecticut':     [-72.7273, 41.6032],
  'rhode island':    [-71.4774, 41.5801],
  // Massachusetts: coast entry takes precedence over state centroid for offshore wind
  'massachusetts coast':     [-70.2, 41.5],   // Cape Cod / offshore wind corridor
  'massachusetts coastal':   [-70.2, 41.5],
  'offshore massachusetts':  [-70.1, 41.4],
  'massachusetts, usa':      [-70.2, 41.5],   // seed data format — pin at coast
  'massachusetts':           [-71.8, 42.1],   // state centroid fallback

  // NYISO states and regions
  'new york':        [-74.2179, 43.2994],
  'new york city':   [-73.9857, 40.7484],
  'long island':     [-73.1496, 40.7891],
  'upstate new york':[-75.5268, 43.1009],

  // MISO states and regions
  'minnesota':       [-94.6859, 46.3797],
  'wisconsin':       [-89.6165, 44.2685],
  'iowa':            [-93.0977, 42.0046],
  'missouri':        [-92.3580, 38.5767],
  'arkansas':        [-92.3731, 34.9697],
  'louisiana':       [-91.9623, 31.1695],
  'mississippi':     [-89.3985, 32.7416],
  'alabama':         [-86.9023, 32.3182],

  // West Ohio cities (AEP / DAY / DEOK PJM zones)
  'dayton, oh':      [-84.19, 39.76],
  'dayton, ohio':    [-84.19, 39.76],
  'lima, oh':        [-84.11, 40.74],
  'lima, ohio':      [-84.11, 40.74],
  'findlay, oh':     [-83.65, 41.04],
  'findlay, ohio':   [-83.65, 41.04],
  'toledo, oh':      [-83.56, 41.66],
  'toledo, ohio':    [-83.56, 41.66],
  'columbus, oh':    [-83.00, 39.96],
  'columbus, ohio':  [-83.00, 39.96],
  'cincinnati, oh':  [-84.51, 39.10],
  'cincinnati, ohio':[-84.51, 39.10],

  // ERCOT / Texas regions — explicit entries override partial 'texas' match
  'west texas':      [-101.5, 31.9],   // ERCOT West — Permian Basin wind/solar corridor
  'west texas, usa': [-101.5, 31.9],
  'permian basin':   [-102.3, 31.5],
  'texas coast':     [-97.0, 27.8],    // South Texas / Gulf coast solar
  'south texas':     [-98.5, 29.0],
  'north texas':     [-97.3, 33.2],
  'texas':           [-99.3, 31.0],    // ERCOT general centroid
  'texas, usa':      [-99.3, 31.0],

  // Southeast states (SERC/TVA — no zone overlay yet but within eastern grid)
  'florida':         [-81.5158, 27.6648],
  'georgia':         [-83.6431, 32.1656],
  'south carolina':  [-80.8964, 33.8361],
  'tennessee':       [-86.6923, 35.5175],

  // WECC and SPP states intentionally omitted — no zone overlays loaded for those ISOs.
  // Projects with locations in CA, OR, WA, AZ, NV, CO, WY, MT, NM will appear as Unmapped.
};

export function getZoneCoords(location: string): [number, number] | null {
  const key = location.toLowerCase().trim();
  if (ZONE_COORDS[key]) return ZONE_COORDS[key];
  // partial match — check if any known key is contained in the location string
  for (const [zone, coords] of Object.entries(ZONE_COORDS)) {
    if (key.includes(zone) || zone.includes(key)) return coords;
  }
  return null;
}
