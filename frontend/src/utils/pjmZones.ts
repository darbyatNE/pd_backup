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
