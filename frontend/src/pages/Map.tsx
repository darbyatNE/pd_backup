import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../services/api';
import { getZoneCoords } from '../utils/pjmZones';
import TryOnOverlay from '../components/TryOnOverlay';
import { useScopeContext } from '../contexts/ScopeContext';
import { useDashboardView } from '../contexts/DashboardViewContext';
import { getLmpPeriodType, LMP_HISTORY_START, LMP_PERIODS_ALL, buildSimulatedLmpMap } from '../data/lmpData';
import { LOAD_PROFILES, getForecastCapacityForYear } from '../data/loadProfile';
import { getSuggestedBessMw } from '../utils/capacity';
import { useRecommendation } from '../contexts/RecommendationContext';
import { evaluateProjects } from '../data/projectRecommendation';
import type { Project, GenerationType, BTMAssetType } from '../types';

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Additional ISO zone overlays beyond PJM (toggleable from legend).
// Each ISO's geojson is fetched from /public on map load; layers start hidden
// unless the user previously enabled them (persisted in localStorage).
type IsoZoneKey = 'MISO' | 'ERCOT' | 'SWPP';
const ISO_ZONE_OVERLAYS: Record<IsoZoneKey, { file: string; color: string }> = {
  MISO:  { file: '/MISO_zones.geojson',  color: '#6d28d9' }, // violet
  ERCOT: { file: '/ERCOT_zones.geojson', color: '#be123c' }, // crimson
  SWPP:  { file: '/SWPP_zones.geojson',  color: '#ea580c' }, // orange
};

// Centroid + bbox per ISO (precomputed from the geojsons). PJM is always shown;
// MISO and ERCOT toggle into the view. The camera centers on the arithmetic
// mean of the visible centroids and zooms to fit the union of bboxes.
type IsoKey = 'PJM' | IsoZoneKey;
const ISO_META: Record<IsoKey, {
  centroid: [number, number];
  bbox: [[number, number], [number, number]];
}> = {
  PJM:   { centroid: [-82.10, 39.05], bbox: [[-90.30, 35.59], [-73.89, 42.51]] },
  MISO:  { centroid: [-94.89, 39.16], bbox: [[-107.36, 28.93], [-82.42, 49.38]] },
  ERCOT: { centroid: [-99.55, 30.95], bbox: [[-104.98, 25.84], [-94.13, 36.06]] },
  SWPP:  { centroid: [-105.10, 38.28], bbox: [[-112.99, 31.76], [-89.55, 49.00]] },
};

const PJM_ZONE_LABELS: { label: string; coords: [number, number] }[] = [
  { label: 'COMED',   coords: [-88.67,  41.95] },
  { label: 'AEP',     coords: [-84.4,   40.9]  },
  { label: 'DAY',     coords: [-84.42,  40.02] },
  { label: 'ATSI',    coords: [-81.52,  41.2]  },
  { label: 'DEOK',    coords: [-84.27,  38.89] },
  { label: 'LGE',     coords: [-85.06,  38.00] },
  { label: 'EKPC',    coords: [-85.17,  37.19] },
  { label: 'APS',     coords: [-79.8,   39.14] },
  { label: 'DOM',     coords: [-77.65,  37.52] },
  { label: 'DUQ',     coords: [-79.96,  40.44] },
  { label: 'PENELEC', coords: [-78.29,  40.45] },
  { label: 'UGI',     coords: [-76.09,  41.29] },
  { label: 'PPL',     coords: [-76.22,  40.57] },
  { label: 'METED',   coords: [-76.45,  40.37] },
  { label: 'BGE',     coords: [-76.55,  39.12] },
  { label: 'PEPCO',   coords: [-76.88,  38.72] },
  { label: 'PECO',    coords: [-75.39,  40.10] },
  { label: 'DPL',     coords: [-75.68,  38.74] },
  { label: 'AECO',    coords: [-75.20,  39.54] },
  { label: 'PSEG',    coords: [-74.38,  40.54] },
  { label: 'JCPL',    coords: [-74.24,  40.13] },
  { label: 'RECO',    coords: [-74.34,  41.13] },
];

const MARKER_COLORS: Record<GenerationType, string> = {
  Solar:            '#f59e0b',
  Wind:             '#0ea5e9',
  Nuclear:          '#8b5cf6',
  Battery:          '#10b981',
  Hydro:            '#06b6d4',
  Hybrid:           '#06b6d4',
  'Combined Cycle': '#64748b',
  Peaker:           '#ef4444',
  Virtual:          '#db2777',
};

// Map icon functions for generation types
function getMapIconSvg(generationType: string): string {
  switch (generationType) {
    case 'Wind':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="1.5" fill="#0ea5e9"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(45)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(135)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(225)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(315)"/></g></svg>`;
    case 'Hydro':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-8,4 L-3,4 L-3,-2 L3,-2 L3,4 L8,4 L8,8 L-8,8 Z" fill="#06b6d4"/><path d="M-6,10 Q-3,12 0,10 Q3,12 6,10" fill="none" stroke="#06b6d4" stroke-width="1.5"/><path d="M-6,12 Q-3,14 0,12 Q3,14 6,12" fill="none" stroke="#06b6d4" stroke-width="1.5"/></g></svg>`;
    case 'Nuclear':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="2" fill="#8b5cf6"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(0)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(60)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(120)"/></g></svg>`;
    case 'Solar':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="4" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><line x1="0" y1="-8" x2="0" y2="-6"/><line x1="5.66" y1="-5.66" x2="4.24" y2="-4.24"/><line x1="8" y1="0" x2="6" y2="0"/><line x1="5.66" y1="5.66" x2="4.24" y2="4.24"/><line x1="0" y1="8" x2="0" y2="6"/><line x1="-5.66" y1="5.66" x2="-4.24" y2="4.24"/><line x1="-8" y1="0" x2="-6" y2="0"/><line x1="-5.66" y1="-5.66" x2="-4.24" y2="-4.24"/></g></g></svg>`;
    case 'Combined Cycle':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-2" y="-8" width="4" height="12" rx="1" fill="#64748b"/><rect x="-6" y="2" width="12" height="4" rx="1" fill="#64748b"/><path d="M-2,-8 L-6,2 M2,-8 L6,2 M-2,4 L-6,2 M2,4 L6,2" stroke="#64748b" stroke-width="1" fill="none"/></g></svg>`;
    case 'Battery':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-8" y="-4" width="16" height="8" rx="1" fill="#10b981"/><rect x="8" y="-2" width="2" height="4" fill="#10b981"/><rect x="-6" y="-2" width="3" height="4" fill="white"/><rect x="-1.5" y="-2" width="3" height="4" fill="white"/><rect x="3" y="-2" width="2" height="4" fill="white"/></g></svg>`;
    case 'Hybrid':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M0,-8 L3,-2 L8,-3 L2,2 L4,8 L-2,2 L-8,3 L-3,-2 Z" fill="#06b6d4"/><circle r="2" fill="white"/></g></svg>`;
    case 'Peaker':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-6,6 L0,-8 L6,6 Z" fill="#ef4444"/><rect x="-2" y="2" width="4" height="4" fill="#dc2626"/></g></svg>`;
    case 'Virtual':
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="7" fill="none" stroke="#db2777" stroke-width="2.5"/><circle r="2.5" fill="#db2777"/></g></svg>`;
    default: {
      // Any other/new gen type: a filled dot in the type's legend color.
      const color = MARKER_COLORS[generationType as GenerationType] ?? '#64748b';
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><circle cx="12" cy="12" r="8" fill="${color}"/></svg>`;
    }
  }
}

const ALL_GEN_TYPES = Object.keys(MARKER_COLORS) as GenerationType[];

interface MappedProject extends Project {
  coords: [number, number] | null;
}

interface BuyerSite {
  id: string;
  name: string;
  location: string;
  project_type: 'brownfield' | 'greenfield';
  target_capacity_mw: number | null;
  settlement_zone: string | null;
  coords: [number, number] | null;
}

const SITE_KEYWORDS: Record<string, string> = {
  'ashburn-dc':          'ashburn',
  'manassas-industrial': 'manassas',
  'sterling-hyperscale': 'sterling',
};

function siteInScope(siteName: string, selectedSites: string[]): boolean {
  const normalized = siteName.toLowerCase();
  return selectedSites.some((key) => {
    const kw = SITE_KEYWORDS[key];
    if (kw && normalized.includes(kw)) return true;
    return normalized.includes(key.replace(/-/g, ' '));
  });
}

// Compute bounding box from any GeoJSON geometry for zone-level double-click zoom
function featureBounds(geometry: { type: string; coordinates: unknown }): maplibregl.LngLatBoundsLike | null {
  const coords: number[][] = [];
  const collect = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      coords.push(c as number[]);
    } else if (Array.isArray(c)) {
      c.forEach(collect);
    }
  };
  collect(geometry.coordinates);
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Map pnode_id → total_lmp for the selected month
type LmpMap = Map<number, number>;

export default function MapPage() {
  const { selectedSites, startYear, endYear, endMonth, setEndDate, addSite, peekSite } = useScopeContext();
  // Use the shared recommendation *preferences* (so Plan-tab slider edits sync),
  // but evaluate them against the map's own (freshly fetched) project list — so
  // newly created/published projects aren't excluded by a stale context set.
  const { prefs: recPrefs, scopeWindow: recScope, productSummaries: recSummaries } = useRecommendation();
  const navigate = useNavigate();
  const { setView, setSubTab } = useDashboardView();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pjmLabelMarkers = useRef<maplibregl.Marker[]>([]);

  // Refs for latest data — used by renderMarkers to avoid stale closures
  const projectsRef = useRef<MappedProject[]>([]);
  const buyerSitesRef = useRef<BuyerSite[]>([]);
  const visibleGenTypesRef = useRef<Set<GenerationType>>(new Set());
  const visibleIsoZonesRef = useRef<Set<IsoKey>>(new Set());
  const selectedSitesRef = useRef<string[]>([]);
  const setTryOnProjectRef = useRef<(p: MappedProject | null) => void>(() => {});
  // "View Load" from a data center popup: scope to just that site and open the Plan tab.
  const viewLoadRef = useRef<(siteKey: string) => void>(() => {});

  // Keep latest scope values reachable from popup click handlers without
  // forcing marker re-creation every time the scope changes.
  const scopeRef = useRef({ startYear, endYear, endMonth, setEndDate });
  useEffect(() => {
    scopeRef.current = { startYear, endYear, endMonth, setEndDate };
  }, [startYear, endYear, endMonth, setEndDate]);

  const [projects, setProjects] = useState<MappedProject[]>([]);
  const [buyerSites, setBuyerSites] = useState<BuyerSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleGenTypes, setVisibleGenTypes] = useState<Set<GenerationType>>(() => {
    const saved = localStorage.getItem('map-visibleGenTypes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return new Set(parsed as GenerationType[]);
      } catch {
        return new Set(ALL_GEN_TYPES);
      }
    }
    return new Set(ALL_GEN_TYPES);
  });
  const [tryOnProject, setTryOnProject] = useState<MappedProject | null>(null);
  const [tryOnSite, setTryOnSite] = useState<string | undefined>(undefined);
  // Load persisted states from localStorage
  const [showLabels, setShowLabels] = useState(() => {
    const saved = localStorage.getItem('map-showLabels');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [lmpPrices, setLmpPrices] = useState<LmpMap>(new Map());
  const [selectedZoneName, setSelectedZoneName] = useState<string | null>(null);
  const selectedZoneNameRef = useRef<string | null>(null);
  selectedZoneNameRef.current = selectedZoneName;
  const zonePnodesRef = useRef<Set<number>>(new Set());
  const pnodesByZoneRef = useRef<Record<string, number[]>>({});
  const [selectedPnode, setSelectedPnode] = useState<{ id: number; name: string } | null>(null);
  const lmpPricesRef = useRef<LmpMap>(new Map());
  const [legendMode, setLegendMode] = useState<'gen' | 'lmp'>('gen');
  const [showGenMarkers, setShowGenMarkers] = useState(true);
  const [showLmpDots, setShowLmpDots] = useState(false);
  // Show only Plan-tab "Recommended" projects (default on). Off = explore all.
  const [recommendedOnly, setRecommendedOnly] = useState(true);
  // Which ISO zone overlays are visible. All three (PJM/MISO/ERCOT) are
  // independently toggleable; default on first load is PJM only.
  const [visibleIsoZones, setVisibleIsoZones] = useState<Set<IsoKey>>(() => {
    const saved = localStorage.getItem('map-visibleIsoZones');
    if (saved) {
      try {
        const arr = JSON.parse(saved) as IsoKey[];
        return new Set(arr.length > 0 ? arr : (['PJM'] as IsoKey[]));
      } catch {
        return new Set(['PJM'] as IsoKey[]);
      }
    }
    return new Set(['PJM'] as IsoKey[]);
  });
  // Set to true once the map's style + initial sources are loaded so the
  // camera-positioning effect can safely call fly/jump.
  const [mapReady, setMapReady] = useState(false);
  
  // BTM (Behind The Meter) Assets state - custom build options for load sites
  const [selectedBTMOption, setSelectedBTMOption] = useState<{siteId: string; assetType: BTMAssetType} | null>(null);

  // LMP frames: always start from Jan 2020 (full historical range) up to scope end
  const LMP_FRAMES = useMemo(() => {
    const frames: { month: number; year: number }[] = [];
    const fromYear  = LMP_HISTORY_START.year;
    const fromMonth = LMP_HISTORY_START.month;
    for (let y = fromYear; y <= endYear; y++) {
      const mStart = y === fromYear ? fromMonth : 1;
      const mEnd   = y === endYear  ? endMonth  : 12;
      for (let m = mStart; m <= mEnd; m++) frames.push({ month: m, year: y });
    }
    return frames;
  }, [endYear, endMonth]);

  // Initial slider position = scope end; clamp if scope changes
  const [lmpMonth, setLmpMonth] = useState(endMonth);
  const [lmpYear,  setLmpYear]  = useState(endYear);
  useEffect(() => {
    if (LMP_FRAMES.length === 0) return;
    const inRange = LMP_FRAMES.some((f) => f.month === lmpMonth && f.year === lmpYear);
    if (!inRange) {
      const last = LMP_FRAMES[LMP_FRAMES.length - 1];
      setLmpMonth(last.month);
      setLmpYear(last.year);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LMP_FRAMES]);

  const lmpFrameIdx = LMP_FRAMES.findIndex((f) => f.month === lmpMonth && f.year === lmpYear);
  const lmpPeriodType = getLmpPeriodType(lmpYear, lmpMonth);
  const lmpCacheRef = useRef<Map<string, LmpMap>>(new Map());

  // Fetch LMP prices whenever selected month/year changes; fall back to simulated when DB empty
  useEffect(() => {
    const key = `${lmpYear}-${lmpMonth}`;
    if (lmpCacheRef.current.has(key)) {
      setLmpPrices(lmpCacheRef.current.get(key)!);
      return;
    }
    // LMP forecast prices are sourced from the ISO data Postgres database via
    // the backend API, not from Supabase.
    fetch(`${API_BASE_URL}/map/lmp?year=${lmpYear}&month=${lmpMonth}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`LMP fetch failed (${res.status})`))))
      .then(({ prices }: { prices: { pnode_id: number; total_lmp: number }[] }) => {
        let m: LmpMap;
        if (prices && prices.length > 0) {
          m = new Map();
          prices.forEach((r) => m.set(r.pnode_id, r.total_lmp));
        } else {
          // No DB data — synthesise from simulated zone averages
          m = buildSimulatedLmpMap(lmpYear, lmpMonth, pnodesByZoneRef.current);
        }
        lmpCacheRef.current.set(key, m);
        setLmpPrices(m);
      })
      .catch(() => {
        // On error, fall back to simulated prices so the map still renders.
        const m = buildSimulatedLmpMap(lmpYear, lmpMonth, pnodesByZoneRef.current);
        lmpCacheRef.current.set(key, m);
        setLmpPrices(m);
      });
  }, [lmpMonth, lmpYear]);

  // Lock body scroll while map page is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keep lmpPrices ref in sync for use in map event handlers
  useEffect(() => { lmpPricesRef.current = lmpPrices; }, [lmpPrices]);

  // Keep refs in sync so renderMarkers always sees latest data
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { buyerSitesRef.current = buyerSites; }, [buyerSites]);
  useEffect(() => { visibleGenTypesRef.current = visibleGenTypes; }, [visibleGenTypes]);
  useEffect(() => { visibleIsoZonesRef.current = visibleIsoZones; }, [visibleIsoZones]);
  useEffect(() => { selectedSitesRef.current = selectedSites; }, [selectedSites]);
  useEffect(() => { setTryOnProjectRef.current = setTryOnProject; }, [setTryOnProject]);
  useEffect(() => {
    viewLoadRef.current = (siteKey: string) => {
      peekSite(siteKey);         // temporarily scope to just this data center (restorable)
      setSubTab('energy');       // the load chart lives on the Energy sub-tab
      setView('forecast');       // the "Plan" dashboard view
      navigate('/dashboard');
    };
  }, [peekSite, setSubTab, setView, navigate]);

  // Recommended-project filter — shares the Plan tab's live preferences via
  // RecommendationContext, so slider edits there update the map in real time.
  // When the toggle is off, null = no filtering (explore all projects).
  const recommendedIds = useMemo<Set<string> | null>(() => {
    if (!recommendedOnly) return null;
    const ranked = evaluateProjects(projects, recSummaries, recPrefs, recScope, selectedSites);
    return new Set(ranked.map((r) => r.project.id));
  }, [recommendedOnly, projects, recSummaries, recPrefs, recScope, selectedSites]);
  const recommendedIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => { recommendedIdsRef.current = recommendedIds; }, [recommendedIds]);

  // Ref for showLabels so renderMarkers can access current value
  const showLabelsRef = useRef(showLabels);
  useEffect(() => { 
    showLabelsRef.current = showLabels;
    // Save to localStorage
    localStorage.setItem('map-showLabels', JSON.stringify(showLabels));
  }, [showLabels]);

  const showGenMarkersRef = useRef(showGenMarkers);
  useEffect(() => { showGenMarkersRef.current = showGenMarkers; }, [showGenMarkers]);

  const showLmpDotsRef = useRef(showLmpDots);
  useEffect(() => { showLmpDotsRef.current = showLmpDots; }, [showLmpDots]);

  // Save other states to localStorage
  useEffect(() => {
    localStorage.setItem('map-legendMode', JSON.stringify(legendMode));
  }, [legendMode]);

  useEffect(() => {
    localStorage.setItem('map-showGenMarkers', JSON.stringify(showGenMarkers));
  }, [showGenMarkers]);

  useEffect(() => {
    localStorage.setItem('map-showLmpDots', JSON.stringify(showLmpDots));
  }, [showLmpDots]);

  // Save visibleGenTypes state to localStorage
  useEffect(() => {
    localStorage.setItem('map-visibleGenTypes', JSON.stringify(Array.from(visibleGenTypes)));
  }, [visibleGenTypes]);

  // Persist + apply visibility for all ISO zone overlays.
  useEffect(() => {
    localStorage.setItem('map-visibleIsoZones', JSON.stringify(Array.from(visibleIsoZones)));
    if (!map.current) return;
    (['PJM', 'MISO', 'ERCOT', 'SWPP'] as IsoKey[]).forEach((iso) => {
      const visible = visibleIsoZones.has(iso) ? 'visible' : 'none';
      const prefix = iso.toLowerCase();
      (['fill', 'line', 'border'] as const).forEach((suffix) => {
        const id = `${prefix}-${suffix}`;
        if (map.current!.getLayer(id)) {
          map.current!.setLayoutProperty(id, 'visibility', visible);
        }
      });
    });
    // PJM zone-name label markers (COMED, AEP, ...) hide with the PJM overlay.
    const pjmVisible = visibleIsoZones.has('PJM');
    pjmLabelMarkers.current.forEach((m) => {
      m.getElement().style.display = pjmVisible ? '' : 'none';
    });
  }, [visibleIsoZones]);

  // Toggle a single ISO on/off. Guards against zero selected — the user must
  // always have at least one ISO visible (avoids an empty-map dead state).
  const toggleIsoZone = (iso: IsoKey) => {
    setVisibleIsoZones((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) {
        if (next.size <= 1) return prev; // can't turn off the last one
        next.delete(iso);
      } else {
        next.add(iso);
      }
      return next;
    });
  };

  // Camera positioning — fires on map-ready and on every ISO toggle.
  // Uses fitBounds on the union of selected ISO bboxes so the view's
  // geometric center matches what's actually on screen (no arithmetic-mean
  // skew from one ISO sitting far south of the others).
  const hasFlownRef = useRef(false);
  useEffect(() => {
    if (!mapReady || !map.current) return;
    const visible = Array.from(visibleIsoZones);
    if (visible.length === 0) return; // guard: nothing to focus on
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const iso of visible) {
      const m = ISO_META[iso];
      if (m.bbox[0][0] < minX) minX = m.bbox[0][0];
      if (m.bbox[0][1] < minY) minY = m.bbox[0][1];
      if (m.bbox[1][0] > maxX) maxX = m.bbox[1][0];
      if (m.bbox[1][1] > maxY) maxY = m.bbox[1][1];
    }
    const bounds: maplibregl.LngLatBoundsLike = [[minX, minY], [maxX, maxY]];
    const opts: maplibregl.FitBoundsOptions = {
      padding: 50,
      duration: hasFlownRef.current ? 800 : 0,
    };
    map.current.fitBounds(bounds, opts);
    hasFlownRef.current = true;
  }, [mapReady, visibleIsoZones]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Projects/load sites are sourced from the ISO data Postgres database via
      // the backend API (the browser cannot connect to Postgres directly), not
      // from Supabase.
      const [genRes, siteRes] = await Promise.all([
        fetch(`${API_BASE_URL}/map/projects`),
        fetch(`${API_BASE_URL}/map/buyer-projects`),
      ]);

      if (!genRes.ok) throw new Error(`Failed to load projects (${genRes.status})`);
      if (!siteRes.ok) throw new Error(`Failed to load load sites (${siteRes.status})`);

      const { projects: genData } = (await genRes.json()) as { projects: Project[] };
      const { buyerSites: siteData } = (await siteRes.json()) as { buyerSites: Omit<BuyerSite, 'coords'>[] };

      setProjects((genData ?? []).map((p: Project) => ({
        ...p,
        // Prefer explicit lat/lng when the project has them; else fall back to the
        // name-based lookup on `location`.
        coords: (p.latitude != null && p.longitude != null)
          ? [Number(p.longitude), Number(p.latitude)] as [number, number]
          : getZoneCoords(p.location ?? ''),
      })));
      setBuyerSites((siteData ?? []).map((s: Omit<BuyerSite, 'coords'>) => ({ ...s, coords: getZoneCoords(s.location ?? '') })));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // init map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: [-82.7, 39.25],
      zoom: 5,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add custom reset view button
    const resetViewButton = document.createElement('button');
    resetViewButton.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    resetViewButton.innerHTML = `
      <svg class="maplibregl-ctrl-icon" viewBox="0 0 24 24" width="24" height="24" style="display:block;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="#333" stroke-width="2"/>
        <circle cx="12" cy="12" r="6" fill="none" stroke="#333" stroke-width="2"/>
        <circle cx="12" cy="12" r="2" fill="#333"/>
      </svg>
      <span class="maplibregl-ctrl-tooltip" style="display:none;">Reset view</span>
    `;
    resetViewButton.style.cssText = 'position: relative;';
    
    resetViewButton.addEventListener('mouseenter', () => {
      const tooltip = resetViewButton.querySelector('.maplibregl-ctrl-tooltip') as HTMLElement;
      if (tooltip) {
        tooltip.style.display = 'block';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '100%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.marginBottom = '8px';
        tooltip.style.padding = '4px 8px';
        tooltip.style.background = '#333';
        tooltip.style.color = 'white';
        tooltip.style.fontSize = '12px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.zIndex = '1000';
      }
    });
    
    resetViewButton.addEventListener('mouseleave', () => {
      const tooltip = resetViewButton.querySelector('.maplibregl-ctrl-tooltip') as HTMLElement;
      if (tooltip) {
        tooltip.style.display = 'none';
      }
    });
    
    resetViewButton.addEventListener('click', () => {
      map.current?.flyTo({
        center: [-82.7, 39.25],
        zoom: 5.4,
        duration: 1000
      });
    });
    
    // Add the button to the navigation control group
    const navControl = map.current!.getContainer().querySelector('.maplibregl-ctrl-top-right .maplibregl-ctrl-group');
    if (navControl) {
      navControl.appendChild(resetViewButton);
    } else {
      // Fallback: add directly to top-right
      map.current!.addControl({
        onAdd: () => resetViewButton,
        onRemove: () => { resetViewButton.remove(); }
      }, 'top-right');
    }

    // disable default double-click zoom — we handle it ourselves
    map.current.doubleClickZoom.disable();

    map.current.on('load', async () => {
      if (!map.current) return;

      // Icons are now rendered as inline SVGs in DOM markers

      try {
        const res = await fetch('/PJM_zones.geojson');
        if (res.ok) {
          const geojson = await res.json();

          map.current!.addSource('pjm-zones', { type: 'geojson', data: geojson });
          const pjmInitial = visibleIsoZones.has('PJM') ? 'visible' : 'none';

          // Subtle fill for entire PJM region to make it stand out
          map.current!.addLayer({
            id: 'pjm-fill',
            type: 'fill',
            source: 'pjm-zones',
            layout: { visibility: pjmInitial },
            paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.05 },
          });

          // Zone interior lines (inter-zone boundaries)
          map.current!.addLayer({
            id: 'pjm-line',
            type: 'line',
            source: 'pjm-zones',
            layout: { visibility: pjmInitial },
            paint: { 'line-color': '#0f766e', 'line-width': 1.2, 'line-opacity': 0.7 },
          });

          // Outer PJM footprint border — thicker, darker line drawn on top
          map.current!.addLayer({
            id: 'pjm-border',
            type: 'line',
            source: 'pjm-zones',
            layout: { visibility: pjmInitial },
            paint: {
              'line-color': '#0f766e',
              'line-width': 2,
              'line-opacity': 0.9,
              'line-gap-width': 0,
            },
          });

          // Highlight layers for the zone selected via double-click
          map.current!.addSource('pjm-highlight', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.current!.addLayer({
            id: 'pjm-highlight-fill',
            type: 'fill',
            source: 'pjm-highlight',
            paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.18 },
          });

          map.current!.addLayer({
            id: 'pjm-highlight-line',
            type: 'line',
            source: 'pjm-highlight',
            paint: { 'line-color': '#b45309', 'line-width': 3, 'line-opacity': 0.95 },
          });

          // Zone name labels — initial display matches the PJM toggle state.
          const pjmLabelDisplay = visibleIsoZones.has('PJM') ? '' : 'none';
          PJM_ZONE_LABELS.forEach(({ label, coords }) => {
            const el = document.createElement('div');
            el.textContent = label;
            el.style.cssText = [
              'font-family:system-ui,sans-serif',
              'font-size:9px',
              'font-weight:700',
              'color:#0f766e',
              'background:rgba(255,255,255,0.75)',
              'padding:1px 3px',
              'border-radius:2px',
              'pointer-events:none',
              'white-space:nowrap',
              'letter-spacing:0.04em',
              'line-height:1',
            ].join(';');
            el.style.display = pjmLabelDisplay;
            pjmLabelMarkers.current.push(
              new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(coords)
                .addTo(map.current!),
            );
          });

          // Initial camera fit is handled by the camera-positioning effect
          // (centers on the midpoint of visible ISO centroids, zooms to fit).

          // Pointer cursor when hovering a zone
          map.current!.on('mouseenter', 'pjm-fill', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current!.on('mouseleave', 'pjm-fill', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });
        }
      } catch {
        // non-critical — map renders without zone overlay
      }

      // ── Additional ISO zone overlays (MISO, ERCOT) — toggleable via legend ──
      // Initial visibility derived from current visibleIsoZones state.
      for (const iso of Object.keys(ISO_ZONE_OVERLAYS) as IsoZoneKey[]) {
        const cfg = ISO_ZONE_OVERLAYS[iso];
        const prefix = iso.toLowerCase();
        const initial = visibleIsoZones.has(iso) ? 'visible' : 'none';
        try {
          const r = await fetch(cfg.file);
          if (!r.ok) continue;
          const gj = await r.json();
          if (!map.current) return;
          map.current.addSource(`${prefix}-zones`, { type: 'geojson', data: gj });

          map.current.addLayer({
            id: `${prefix}-fill`,
            type: 'fill',
            source: `${prefix}-zones`,
            layout: { visibility: initial },
            paint: { 'fill-color': cfg.color, 'fill-opacity': 0.04 },
          });
          map.current.addLayer({
            id: `${prefix}-line`,
            type: 'line',
            source: `${prefix}-zones`,
            layout: { visibility: initial },
            paint: { 'line-color': cfg.color, 'line-width': 1.0, 'line-opacity': 0.6 },
          });
          map.current.addLayer({
            id: `${prefix}-border`,
            type: 'line',
            source: `${prefix}-zones`,
            layout: { visibility: initial },
            paint: { 'line-color': cfg.color, 'line-width': 1.8, 'line-opacity': 0.85 },
          });
        } catch {
          // non-critical — overlay simply won't appear
        }
      }

      // ── PJM Priced Substations layer ────────────────────────────────────────
      try {
        const subsRes = await fetch('/PJM_subs_priced.geojson');
        if (subsRes.ok) {
          const subsGeoJson = await subsRes.json();

          // Build pnode-by-zone index for simulated fallback
          const byZone: Record<string, number[]> = {};
          (subsGeoJson.features as { properties: Record<string, unknown> }[]).forEach((feat) => {
            const zone = feat.properties['pjm_zone'] as string | null;
            const pid  = feat.properties['pnode_id'] as number | null;
            if (zone && pid != null) {
              if (!byZone[zone]) byZone[zone] = [];
              byZone[zone].push(pid);
            }
          });
          pnodesByZoneRef.current = byZone;

          map.current!.addSource('pjm-subs', { type: 'geojson', data: subsGeoJson });

          // ── LMP colored circle markers — data-driven color by price.
          // Initial visibility honors BOTH the LMP toggle and the PJM scope
          // toggle — substation dots stay hidden if PJM is off.
          const pjmDotsInitial =
            showLmpDotsRef.current && visibleIsoZones.has('PJM') ? 'visible' : 'none';
          map.current!.addLayer({
            id: 'pjm-subs-dots',
            type: 'circle',
            layout: { visibility: pjmDotsInitial },
            source: 'pjm-subs',
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                4, 3,
                8, 5,
                11, 8,
              ] as maplibregl.ExpressionSpecification,
              'circle-color': [
                'interpolate', ['linear'],
                ['coalesce', ['get', 'lmp_price'], 34],
                34, '#1e40af',
                40, '#0891b2',
                48, '#16a34a',
                56, '#ca8a04',
                64, '#ea580c',
                72, '#dc2626',
              ] as maplibregl.ExpressionSpecification,
              'circle-opacity': 0.85,
              'circle-stroke-width': 0.5,
              'circle-stroke-color': '#fff',
            },
          });

          // Hover tooltip for substations
          const subsTooltip = document.createElement('div');
          subsTooltip.style.cssText = [
            'position:absolute', 'pointer-events:none', 'display:none',
            'background:rgba(255,255,255,0.97)', 'border:1px solid #e2e8f0',
            'border-radius:6px', 'padding:6px 10px', 'font-family:system-ui,sans-serif',
            'font-size:11px', 'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
            'z-index:10', 'white-space:nowrap', 'max-width:240px',
          ].join(';');
          map.current!.getContainer().appendChild(subsTooltip);

          map.current!.on('mousemove', 'pjm-subs-dots', (e) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = 'crosshair';
            const f = e.features[0].properties as Record<string, unknown>;

            const lmpVal = f['lmp_price'] != null ? `$${Number(f['lmp_price']).toFixed(2)}/MWh` : 'No price data';
            const lmpRaw = f['lmp_price'] != null ? Number(f['lmp_price']) : null;
            const lmpColor = lmpRaw === null ? '#94a3b8' : lmpRaw >= 72 ? '#dc2626' : lmpRaw >= 64 ? '#ea580c' : lmpRaw >= 56 ? '#ca8a04' : lmpRaw >= 48 ? '#16a34a' : lmpRaw >= 40 ? '#0891b2' : '#1e40af';
            subsTooltip.innerHTML = [
              `<strong style="font-size:12px;color:#1e293b">${f['NAME'] ?? 'Unknown'}</strong>`,
              `<div style="color:${lmpColor};font-weight:700;font-size:13px;margin-top:3px">${lmpVal}</div>`,
              `<div style="color:#6366f1;font-weight:600;margin-top:2px;font-size:10px">PNode: ${f['pnode_name']} (${f['pnode_id']})</div>`,
              `<div style="color:#64748b;margin-top:1px;font-size:10px">${f['CITY'] ?? ''}, ${f['STATE'] ?? ''}${f['pjm_zone'] ? ` · <span style="color:#0f766e;font-weight:600">${f['pjm_zone']}</span>` : ''}</div>`,
              (() => {
                const voltage = Number(f['MAX_VOLT']);
                const isValidVoltage = voltage >= 0 && voltage <= 765;
                const voltageDisplay = isValidVoltage ? `${voltage} kV` : 'NA';
                return f['MAX_VOLT'] ? `<div style="color:#94a3b8;margin-top:1px;font-size:10px">${voltageDisplay} · ${f['pnode_subtype'] ?? ''}</div>` : '';
              })(),
            ].join('');

            subsTooltip.style.display = 'block';
            subsTooltip.style.left = `${e.point.x + 12}px`;
            subsTooltip.style.top = `${e.point.y - 10}px`;
          });

          map.current!.on('mouseleave', 'pjm-subs-dots', () => {
            if (!map.current) return;
            map.current.getCanvas().style.cursor = '';
            subsTooltip.style.display = 'none';
          });
        }
      } catch {
        // non-critical — map renders without substations layer
      }

      // Single-click: select pnode dot if hit (clears any zone selection)
      map.current!.on('click', (e) => {
        if (!map.current) return;
        const dotFeatures = map.current.queryRenderedFeatures(e.point, { layers: ['pjm-subs-dots'] });
        if (dotFeatures.length > 0) {
          const dp = dotFeatures[0].properties as Record<string, unknown>;
          const pid  = Number(dp['pnode_id']);
          const name = String(dp['pnode_name'] ?? dp['NAME'] ?? `PNode ${pid}`);
          setSelectedPnode(prev => (prev?.id === pid ? null : { id: pid, name }));
          zonePnodesRef.current = new Set();
          setSelectedZoneName(null);
          const highlightSrc = map.current.getSource('pjm-highlight') as maplibregl.GeoJSONSource | undefined;
          highlightSrc?.setData({ type: 'FeatureCollection', features: [] });
          e.preventDefault();
        }
      });

      // Double-click: highlight zone (pnode dots handled by single-click above)
      map.current!.on('dblclick', (e) => {
        if (!map.current) return;

        // If a pnode dot is hit, let single-click handle it — skip zone logic
        const dotFeatures = map.current.queryRenderedFeatures(e.point, { layers: ['pjm-subs-dots'] });
        if (dotFeatures.length > 0) {
          e.preventDefault();
          return;
        }

        const highlightSrc = map.current.getSource('pjm-highlight') as maplibregl.GeoJSONSource | undefined;
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['pjm-fill'] });
        if (features.length > 0 && features[0].geometry) {
          const f = features[0];
          const zoneName = (f.properties?.['Transact_Z'] as string) ?? (f.properties?.['Zone_Name'] as string) ?? 'Zone';

          // Toggle off if same zone double-clicked again
          if (zoneName === selectedZoneNameRef.current) {
            highlightSrc?.setData({ type: 'FeatureCollection', features: [] });
            zonePnodesRef.current = new Set();
            setSelectedZoneName(null);
            return;
          }

          // Outline the selected zone
          highlightSrc?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: f.geometry, properties: f.properties ?? {} }],
          });
          const bounds = featureBounds(f.geometry as { type: string; coordinates: unknown });
          if (bounds) {
            // Collect all pnode_ids in this zone — stored in ref, avg computed reactively
            const srcFeatures = map.current.querySourceFeatures('pjm-subs');
            const pnodeIds = new Set<number>();
            srcFeatures.forEach((d) => {
              if (d.properties?.['pjm_zone'] === zoneName) {
                pnodeIds.add(Number(d.properties?.['pnode_id']));
              }
            });
            zonePnodesRef.current = pnodeIds;
            setSelectedZoneName(zoneName);
            setSelectedPnode(null);
            map.current.fitBounds(bounds, { padding: 40, duration: 600 });
            return;
          }
        }
        // Off-zone: clear highlight, clear zone indicator, and zoom in
        highlightSrc?.setData({ type: 'FeatureCollection', features: [] });
        zonePnodesRef.current = new Set();
        setSelectedZoneName(null);
        map.current.flyTo({ center: e.lngLat, zoom: map.current.getZoom() + 2, duration: 500 });
      });

      renderMarkers();
      setMapReady(true);
    });

    return () => {
      pjmLabelMarkers.current.forEach((m) => m.remove());
      pjmLabelMarkers.current = [];
      setMapReady(false);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ESC key: clear all selections and reset map highlight
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedPnode(null);
      setSelectedZoneName(null);
      zonePnodesRef.current = new Set();
      const highlightSrc = map.current?.getSource('pjm-highlight') as maplibregl.GeoJSONSource | undefined;
      highlightSrc?.setData({ type: 'FeatureCollection', features: [] });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Render markers imperatively using refs so data is never stale
  const renderMarkers = useCallback(() => {
    if (!map.current) return;

    markers.current.forEach((m) => m.remove());
    markers.current.clear();

    const currentProjects = projectsRef.current;
    const currentVisible = visibleGenTypesRef.current;
    const currentBuyerSites = buyerSitesRef.current;
    const currentSelectedSites = selectedSitesRef.current;

    // ─── Collision Avoidance ─────────────────────────────────────────────────────
    // Collect all visible marker positions and calculate offsets for overlaps
    type MarkerPos = { id: string; lng: number; lat: number; type: 'project' | 'site' };
    const allMarkers: MarkerPos[] = [];

    // Add visible projects
    const recIds = recommendedIdsRef.current;
    currentProjects.forEach((p) => {
      if (recIds && !recIds.has(p.id)) return;
      if (p.coords && currentVisible.has(p.generation_type)) {
        allMarkers.push({ id: p.id, lng: p.coords[0], lat: p.coords[1], type: 'project' });
      }
    });

    // Add visible sites
    currentBuyerSites.forEach((s) => {
      if (s.coords && siteInScope(s.name, currentSelectedSites)) {
        // Use site name as unique id
        allMarkers.push({ id: s.name, lng: s.coords[0], lat: s.coords[1], type: 'site' });
      }
    });

    // Calculate pixel distance between two points at current zoom
    const getPixelDistance = (a: MarkerPos, b: MarkerPos): number => {
      const pa = map.current!.project([a.lng, a.lat]);
      const pb = map.current!.project([b.lng, b.lat]);
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Minimum pixel distance to avoid collision
    const MIN_DISTANCE_PX = 60;
    // Offset directions in degrees (N, NE, E, SE, S, SW, W, NW)
    const OFFSET_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
    // Offset distance in meters (roughly 5km at mid-latitudes)
    const OFFSET_METERS = 5000;

    // Track assigned offsets
    const assignedOffsets = new Map<string, [number, number]>();
    const offsetDirections = new Map<string, number>();

    // Simple collision resolution - assign offsets to overlapping markers
    for (let i = 0; i < allMarkers.length; i++) {
      const marker = allMarkers[i];
      let directionIndex = 0;

      // Check against already-processed markers
      for (let j = 0; j < i; j++) {
        const other = allMarkers[j];
        const dist = getPixelDistance(marker, other);

        if (dist < MIN_DISTANCE_PX) {
          // Find next available direction
          while (directionIndex < OFFSET_ANGLES.length) {
            let conflict = false;
            const angle = OFFSET_ANGLES[directionIndex];
            const rad = (angle * Math.PI) / 180;
            const offsetLng = marker.lng + (OFFSET_METERS / 111320) * Math.cos(rad) / Math.cos(marker.lat * Math.PI / 180);
            const offsetLat = marker.lat + (OFFSET_METERS / 111320) * Math.sin(rad);

            // Check if this offset conflicts with any assigned offset
            for (const [otherId, otherOffset] of assignedOffsets) {
              const otherMarker = allMarkers.find((m) => m.id === otherId);
              if (!otherMarker) continue;
              const px = map.current!.project([offsetLng, offsetLat]);
              const pother = map.current!.project([otherMarker.lng + otherOffset[0], otherMarker.lat + otherOffset[1]]);
              const d = Math.sqrt(Math.pow(px.x - pother.x, 2) + Math.pow(px.y - pother.y, 2));
              if (d < MIN_DISTANCE_PX) {
                conflict = true;
                break;
              }
            }

            if (!conflict) {
              assignedOffsets.set(marker.id, [offsetLng - marker.lng, offsetLat - marker.lat]);
              offsetDirections.set(marker.id, directionIndex);
              break;
            }
            directionIndex++;
          }
        }
      }
    }

    const getOffset = (id: string): [number, number] => {
      return assignedOffsets.get(id) || [0, 0];
    };

    const currentShowLabels = showLabelsRef.current;

    // Generation markers — filled circles
    currentProjects.forEach((project) => {
      if (!project.coords || !map.current) return;
      // Recommended-only filter (mirrors the Plan tab's Recommended section).
      if (recommendedIdsRef.current && !recommendedIdsRef.current.has(project.id)) return;
      if (!currentVisible.has(project.generation_type)) return;
      // Hide a project's gen-type marker when its ISO overlay is toggled off.
      if (!visibleIsoZonesRef.current.has((project.iso || 'PJM') as IsoKey)) return;

      // Marker container with label (label above marker)
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;';

      // Label with name and type (APPENDED FIRST so it appears above)
      if (currentShowLabels) {
        const label = document.createElement('div');
        label.textContent = `${project.name} · ${project.generation_type}`;
        label.style.cssText = `
          font-size: 10px;
          font-weight: 600;
          color: #1e293b;
          background: rgba(255,255,255,0.95);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        el.appendChild(label);
      }

      // Icon marker (APPENDED SECOND so it appears below label)
      const icon = document.createElement('div');
      const type = project.generation_type;
      
      // Create icon based on generation type using CSS
      icon.style.cssText = `
        width: 24px; height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      `;
      
      // Add specific icon content based on type
      switch (type) {
        case 'Wind':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <circle r="1.5" fill="#0ea5e9"/>
                <path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(45)"/>
                <path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(135)"/>
                <path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(225)"/>
                <path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(315)"/>
              </g>
            </svg>
          `;
          break;
        case 'Nuclear':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <circle r="2" fill="#8b5cf6"/>
                <ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(0)"/>
                <ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(60)"/>
                <ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(120)"/>
              </g>
            </svg>
          `;
          break;
        case 'Solar':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <circle r="4" fill="#f59e0b"/>
                <g stroke="#f59e0b" stroke-width="2" stroke-linecap="round">
                  <line x1="0" y1="-8" x2="0" y2="-6"/>
                  <line x1="5.66" y1="-5.66" x2="4.24" y2="-4.24"/>
                  <line x1="8" y1="0" x2="6" y2="0"/>
                  <line x1="5.66" y1="5.66" x2="4.24" y2="4.24"/>
                  <line x1="0" y1="8" x2="0" y2="6"/>
                  <line x1="-5.66" y1="5.66" x2="-4.24" y2="4.24"/>
                  <line x1="-8" y1="0" x2="-6" y2="0"/>
                  <line x1="-5.66" y1="-5.66" x2="-4.24" y2="-4.24"/>
                </g>
              </g>
            </svg>
          `;
          break;
        case 'Combined Cycle':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <rect x="-2" y="-8" width="4" height="12" rx="1" fill="#64748b"/>
                <rect x="-6" y="2" width="12" height="4" rx="1" fill="#64748b"/>
                <path d="M-2,-8 L-6,2 M2,-8 L6,2 M-2,4 L-6,2 M2,4 L6,2" stroke="#64748b" stroke-width="1" fill="none"/>
              </g>
            </svg>
          `;
          break;
        case 'Battery':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <rect x="-8" y="-4" width="16" height="8" rx="1" fill="#10b981"/>
                <rect x="8" y="-2" width="2" height="4" fill="#10b981"/>
                <rect x="-6" y="-2" width="3" height="4" fill="white"/>
                <rect x="-1.5" y="-2" width="3" height="4" fill="white"/>
                <rect x="3" y="-2" width="2" height="4" fill="white"/>
              </g>
            </svg>
          `;
          break;
        case 'Hybrid':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <path d="M0,-8 L3,-2 L8,-3 L2,2 L4,8 L-2,2 L-8,3 L-3,-2 Z" fill="#06b6d4"/>
                <circle r="2" fill="white"/>
              </g>
            </svg>
          `;
          break;
        case 'Hydro':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <path d="M-8,4 L-3,4 L-3,-2 L3,-2 L3,4 L8,4 L8,8 L-8,8 Z" fill="#06b6d4"/>
                <path d="M-6,10 Q-3,12 0,10 Q3,12 6,10" fill="none" stroke="#06b6d4" stroke-width="2"/>
                <path d="M-6,12 Q-3,14 0,12 Q3,14 6,12" fill="none" stroke="#06b6d4" stroke-width="2"/>
              </g>
            </svg>
          `;
          break;
        case 'Peaker':
          icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
              <g transform="translate(12,12)">
                <path d="M-6,6 L0,-8 L6,6 Z" fill="#ef4444"/>
                <rect x="-2" y="2" width="4" height="4" fill="#dc2626"/>
              </g>
            </svg>
          `;
          break;
        default:
          // Fallback circle
          icon.style.cssText += `
            background: #64748b;
            border-radius: 50%;
            border: 2px solid white;
          `;
      }

      el.appendChild(icon);
      const priceStr = project.fixed_price_per_mwh ? `$${Number(project.fixed_price_per_mwh).toFixed(2)}/MWh` : 'Price TBD';

      const popupNode = document.createElement('div');
      popupNode.style.cssText = 'font-family:system-ui,sans-serif;min-width:220px';

      const ribbon = document.createElement('button');
      ribbon.type = 'button';
      ribbon.textContent = '▶ Examine Fit';
      ribbon.style.cssText = [
        'display:block', 'width:100%', 'text-align:left',
        'background:linear-gradient(90deg,#0f766e,#14b8a6)',
        'color:white', 'border:0', 'border-radius:6px',
        'padding:6px 10px', 'font-size:11px', 'font-weight:600',
        'letter-spacing:0.02em', 'cursor:pointer',
        'box-shadow:0 1px 2px rgba(0,0,0,0.2)',
        'margin-bottom:6px',
      ].join(';');

      const status = document.createElement('div');
      status.style.cssText = 'font-size:10.5px;line-height:1.35;margin-bottom:6px;color:#0f766e;';

      ribbon.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cod = project.expected_cod || project.guaranteed_cod;
        const term = project.delivery_term_years;

        if (cod && term) {
          const d = new Date(cod);
          if (!isNaN(d.getTime())) {
            const projEndYear = d.getFullYear() + term;
            const projEndMonth = d.getMonth() + 1;
            const { endYear: ey, endMonth: em, setEndDate: sed } = scopeRef.current;
            const projAfterScope = projEndYear > ey || (projEndYear === ey && projEndMonth > em);
            if (projAfterScope) {
              sed(projEndYear, projEndMonth);
              status.innerHTML =
                `Scope end extended to <strong>${MONTH_ABBR[projEndMonth - 1]} ${projEndYear}</strong> ` +
                `to cover full project term.`;
              status.style.color = '#0f766e';
            } else {
              status.innerHTML =
                `Project term (ends <strong>${MONTH_ABBR[projEndMonth - 1]} ${projEndYear}</strong>) ` +
                `fits within current scope.`;
              status.style.color = '#64748b';
            }
          } else {
            status.textContent = '';
          }
        } else {
          status.textContent = '';
        }
        setTryOnProjectRef.current(project);
      };

      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = 'font-weight:600;font-size:14px;margin-bottom:4px';
      nameDiv.textContent = project.name;

      const typeDiv = document.createElement('div');
      typeDiv.style.cssText = 'color:#64748b;font-size:12px;margin-bottom:2px';
      typeDiv.textContent = `${project.generation_type} · ${project.capacity_mw} MW`;

      const locDiv = document.createElement('div');
      locDiv.style.cssText = 'color:#64748b;font-size:12px;margin-bottom:2px';
      locDiv.textContent = project.location ?? '';

      const priceDiv = document.createElement('div');
      priceDiv.style.cssText = 'font-size:12px;font-weight:500;color:#0d9488';
      priceDiv.textContent = priceStr;

      popupNode.appendChild(ribbon);
      popupNode.appendChild(status);
      popupNode.appendChild(nameDiv);
      popupNode.appendChild(typeDiv);
      popupNode.appendChild(locDiv);
      popupNode.appendChild(priceDiv);

      const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setDOMContent(popupNode);
      const projOffset = getOffset(project.id);
      markers.current.set(project.id,
        new maplibregl.Marker({ element: el }).setLngLat([project.coords[0] + projOffset[0], project.coords[1] + projOffset[1]]).setPopup(popup).addTo(map.current!)
      );
    });

    // Load site markers — with label above. Only render sites in the active scope.
    currentBuyerSites.forEach((site) => {
      if (!site.coords || !map.current) return;
      if (!siteInScope(site.name, currentSelectedSites)) return;

      // Container with label above marker
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;';

      // Label with site name and "Load Site"
      if (currentShowLabels) {
        const label = document.createElement('div');
        label.textContent = `${site.name} · Load Site`;
        label.style.cssText = `
          font-size: 10px;
          font-weight: 600;
          color: #1e293b;
          background: rgba(255,255,255,0.95);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        el.appendChild(label);
      }

      // Marker container
      const markerContainer = document.createElement('div');
      markerContainer.style.cssText = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;';

      const inner = document.createElement('div');
      // Tiny data center icon - building shape with server lines
      inner.style.cssText = `
        width:10px;
        height:12px;
        background:#475569;
        border:1.5px solid white;
        border-radius:1px;
        box-shadow:0 2px 4px rgba(0,0,0,0.4);
        position:relative;
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:center;
        gap:1.5px;
      `;
      // Add server rack lines
      for (let i = 0; i < 3; i++) {
        const line = document.createElement('div');
        line.style.cssText = 'width:6px;height:1px;background:#94a3b8;border-radius:0.5px;';
        inner.appendChild(line);
      }
      markerContainer.appendChild(inner);

      el.appendChild(markerContainer);
      
      // Get capacity data from LOAD_PROFILES (same source as capacity tab)
      // Match by site name since DB names may differ from LOAD_PROFILES keys
      const profile = LOAD_PROFILES.find(p => 
        site.name.toLowerCase().includes(p.siteKey.split('-')[0]) || 
        p.name.toLowerCase().includes(site.name.toLowerCase().split(' ')[0]) ||
        site.name.toLowerCase().replace(/\s+/g, '-') === p.siteKey
      );
      const { startYear: sy, endYear: ey } = scopeRef.current;
      
      // Calculate capacity range across scope years
      let capacityStr = '';
      if (profile) {
        const capacities: number[] = [];
        for (let y = sy; y <= ey; y++) {
          capacities.push(getForecastCapacityForYear(profile, y));
        }
        const minCap = Math.min(...capacities);
        const maxCap = Math.max(...capacities);
        if (minCap === maxCap) {
          capacityStr = `${minCap} MW target`;
        } else {
          capacityStr = `${minCap}–${maxCap} MW target`;
        }
      }
      
      // Calculate suggested BESS size based on minimum unhedged capacity
      const suggestedBessMw = profile ? getSuggestedBessMw(profile, sy, ey) : 75;
      const suggestedMwh = Math.round(suggestedBessMw * 6); // 6-hour duration typical for capacity hedge
      
      // Build popup content with BTM Assets section
      const popupContent = document.createElement('div');
      popupContent.style.cssText = 'font-family:system-ui,sans-serif;min-width:220px;max-width:260px;';
      
      // Site info section
      popupContent.innerHTML = `
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">${site.name}</div>
        <div style="color:#64748b;font-size:12px;margin-bottom:2px">Load Site · ${site.project_type}</div>
        <div style="color:#64748b;font-size:12px;margin-bottom:2px">${site.location}</div>
        ${capacityStr ? `<div style="font-size:12px;font-weight:500;color:#6366f1">${capacityStr}</div>` : ''}
        ${site.settlement_zone ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">LDA: ${site.settlement_zone}</div>` : ''}
      `;
      
      // View Load button — scope to just this data center and open the Plan tab
      if (profile) {
        const viewLoadBtn = document.createElement('button');
        viewLoadBtn.textContent = '▶ View Load';
        viewLoadBtn.style.cssText = 'margin-top:10px;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 10px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
        viewLoadBtn.addEventListener('mouseenter', () => { viewLoadBtn.style.background = '#0f766e'; });
        viewLoadBtn.addEventListener('mouseleave', () => { viewLoadBtn.style.background = '#0d9488'; });
        viewLoadBtn.addEventListener('click', () => viewLoadRef.current(profile.siteKey));
        popupContent.appendChild(viewLoadBtn);
      }

      // BTM Assets Section
      const btmSection = document.createElement('div');
      btmSection.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;';
      
      // Section header with label distinction
      const btmHeader = document.createElement('div');
      btmHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
      btmHeader.innerHTML = `
        <span style="font-size:11px;font-weight:600;color:#0f172a;">BTM Assets</span>
        <span style="font-size:9px;color:#64748b;background:#f1f5f9;padding:2px 6px;border-radius:4px;">Options</span>
      `;
      btmSection.appendChild(btmHeader);
      
      // BTM Asset options container
      const btmOptions = document.createElement('div');
      btmOptions.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      
      // BESS Option Button
      const bessBtn = document.createElement('button');
      bessBtn.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
        cursor:pointer;transition:all 0.15s;font-size:11px;text-align:left;
      `;
      bessBtn.innerHTML = `
        <span style="font-size:14px;">🔋</span>
        <div style="flex:1;">
          <div style="font-weight:500;color:#0f172a;">BESS</div>
          <div style="font-size:10px;color:#64748b;">${suggestedBessMw}MW / ${suggestedMwh}MWh</div>
        </div>
        <span style="color:#10b981;font-size:11px;">+</span>
      `;
      bessBtn.onmouseenter = () => { bessBtn.style.background = '#f1f5f9'; bessBtn.style.borderColor = '#cbd5e1'; };
      bessBtn.onmouseleave = () => { bessBtn.style.background = '#f8fafc'; bessBtn.style.borderColor = '#e2e8f0'; };
      bessBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Create synthetic BESS project for TryOn - cast as MappedProject with coords
        const bessProject: MappedProject = {
          id: `bess-${site.id}`,
          seller_id: 'btm-option',
          name: `${site.name} - BESS`,
          generation_type: 'Battery',
          capacity_mw: suggestedBessMw,
          location: site.location,
          status: 'published',
          expected_cod: new Date(new Date().getFullYear(), 0, 1).toISOString(),
          delivery_term_years: 15,
          coords: site.coords,
          metadata: {
            isBTMOption: true,
            btmAssetType: 'BESS',
            parentSiteId: site.id,
            dischargeHours: [15, 16, 17, 18],
          }
        };
        // Add site to scope if not already present
        // Use the matching LOAD_PROFILES siteKey (not derived from DB name)
        const siteKey = profile ? profile.siteKey : site.name.toLowerCase().replace(/\s+/g, '-');
        addSite(siteKey);
        // Open TryOn overlay scoped to this specific site
        setTryOnSite(siteKey);
        setTryOnProjectRef.current(bessProject);
        popup.remove();
      };
      btmOptions.appendChild(bessBtn);
      
      // NG Peaker Option Button
      const ngPeakerBtn = document.createElement('button');
      ngPeakerBtn.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
        cursor:pointer;transition:all 0.15s;font-size:11px;text-align:left;
      `;
      ngPeakerBtn.innerHTML = `
        <span style="font-size:14px;">🔥</span>
        <div style="flex:1;">
          <div style="font-weight:500;color:#0f172a;">NG Peaker</div>
          <div style="font-size:10px;color:#64748b;">100MW Fast-Start</div>
        </div>
        <span style="color:#10b981;font-size:11px;">+</span>
      `;
      ngPeakerBtn.onmouseenter = () => { ngPeakerBtn.style.background = '#f1f5f9'; ngPeakerBtn.style.borderColor = '#cbd5e1'; };
      ngPeakerBtn.onmouseleave = () => { ngPeakerBtn.style.background = '#f8fafc'; ngPeakerBtn.style.borderColor = '#e2e8f0'; };
      ngPeakerBtn.onclick = () => {
        setSelectedBTMOption({ siteId: site.id, assetType: 'NG_Peaker' });
        console.log('Selected NG Peaker for site:', site.name);
        // TODO: Open BTM asset configuration modal
      };
      btmOptions.appendChild(ngPeakerBtn);
      
      // NG Combined Cycle Option Button
      const ngCCBtn = document.createElement('button');
      ngCCBtn.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
        cursor:pointer;transition:all 0.15s;font-size:11px;text-align:left;
      `;
      ngCCBtn.innerHTML = `
        <span style="font-size:14px;">⚡</span>
        <div style="flex:1;">
          <div style="font-weight:500;color:#0f172a;">NG Combined Cycle</div>
          <div style="font-size:10px;color:#64748b;">500MW Baseload</div>
        </div>
        <span style="color:#10b981;font-size:11px;">+</span>
      `;
      ngCCBtn.onmouseenter = () => { ngCCBtn.style.background = '#f1f5f9'; ngCCBtn.style.borderColor = '#cbd5e1'; };
      ngCCBtn.onmouseleave = () => { ngCCBtn.style.background = '#f8fafc'; ngCCBtn.style.borderColor = '#e2e8f0'; };
      ngCCBtn.onclick = () => {
        setSelectedBTMOption({ siteId: site.id, assetType: 'NG_Combined_Cycle' });
        console.log('Selected NG Combined Cycle for site:', site.name);
        // TODO: Open BTM asset configuration modal
      };
      btmOptions.appendChild(ngCCBtn);
      
      btmSection.appendChild(btmOptions);
      popupContent.appendChild(btmSection);
      
      const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setDOMContent(popupContent);
      const siteOffset = getOffset(site.name);
      markers.current.set(site.id,
        new maplibregl.Marker({ element: el }).setLngLat([site.coords[0] + siteOffset[0], site.coords[1] + siteOffset[1]]).setPopup(popup).addTo(map.current!)
      );
    });
  }, []);

  // When LMP prices load, inject lmp_price into GeoJSON source and toggle visibility
  useEffect(() => {
    if (!map.current) return;
    const src = map.current.getSource('pjm-subs') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    fetch('/PJM_subs_priced.geojson')
      .then((r) => r.json())
      .then((geojson) => {
        const annotated = {
          ...geojson,
          features: geojson.features.map((f: { properties: Record<string, unknown>; [k: string]: unknown }) => ({
            ...f,
            properties: {
              ...f.properties,
              lmp_price: lmpPrices.get(Number(f.properties['pnode_id'])) ?? null,
            },
          })),
        };
        src.setData(annotated);
      })
      .catch(() => {});
  }, [lmpPrices]);

  // Trigger re-render whenever data / filters change, then apply showGenMarkers visibility.
  // We no longer gate on isStyleLoaded() — that caused a race where the
  // effect sometimes fired before the style finished loading and then never
  // retried. MapLibre markers are DOM overlays; adding them before the style
  // loads is safe — they simply snap into position once the map loads.
  useEffect(() => {
    if (!map.current) return;
    renderMarkers();
    // Apply saved gen-marker visibility immediately after (re)render
    markers.current.forEach((marker) => {
      marker.getElement().style.display = showGenMarkers ? '' : 'none';
    });
  }, [projects, buyerSites, visibleGenTypes, visibleIsoZones, selectedSites, showLabels, showGenMarkers, recommendedIds, renderMarkers]);

  // Toggle gen-type project marker visibility (for toggle-only changes)
  useEffect(() => {
    markers.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = showGenMarkers ? '' : 'none';
    });
  }, [showGenMarkers]);

  // Toggle LMP substation dot visibility. LMP nodes for an ISO only show
  // when (a) the LMP dots toggle is ON and (b) that ISO is in scope. Today
  // only PJM has a substation layer; MISO/ERCOT will follow the same rule
  // once their LMP node datasets land.
  useEffect(() => {
    if (!map.current) return;
    const pjmDotsVisible = showLmpDots && visibleIsoZones.has('PJM');
    if (map.current.getLayer('pjm-subs-dots')) {
      map.current.setLayoutProperty(
        'pjm-subs-dots', 'visibility', pjmDotsVisible ? 'visible' : 'none',
      );
    }
  }, [showLmpDots, visibleIsoZones]);

  // Update dot appearance when period type changes
  // historical = amber dashed-style (thicker amber stroke)
  // current    = solid bright green stroke
  // forward    = default white stroke
  useEffect(() => {
    if (!map.current || !map.current.getLayer('pjm-subs-dots')) return;
    const strokeColor = lmpPeriodType === 'historical' ? '#f59e0b' : lmpPeriodType === 'current' ? '#22c55e' : '#ffffff';
    const strokeWidth = lmpPeriodType === 'historical' ? 1.0 : lmpPeriodType === 'current' ? 2 : 0.5;
    const opacity     = lmpPeriodType === 'historical' ? 0.70 : 0.85;
    map.current.setPaintProperty('pjm-subs-dots', 'circle-stroke-color', strokeColor);
    map.current.setPaintProperty('pjm-subs-dots', 'circle-stroke-width', strokeWidth);
    map.current.setPaintProperty('pjm-subs-dots', 'circle-opacity', opacity);
  }, [lmpPeriodType]);

  const flyToProject = (project: MappedProject) => {
    if (!project.coords || !map.current) return;
    setSelectedId(project.id);
    map.current.flyTo({ center: project.coords, zoom: 8, duration: 800 });
    markers.current.get(project.id)?.togglePopup();
  };

  const flyToBuyerSite = (site: BuyerSite) => {
    if (!site.coords || !map.current) return;
    setSelectedId(site.id);
    map.current.flyTo({ center: site.coords, zoom: 8, duration: 800 });
    markers.current.get(site.id)?.togglePopup();
  };

  const visibleProjects = projects.filter(
    (p) => (!recommendedIds || recommendedIds.has(p.id)) && visibleGenTypes.has(p.generation_type),
  );
  // Grouped mapped-then-unmapped, each sorted alphabetically by name.
  const byName = (a: MappedProject, b: MappedProject) => a.name.localeCompare(b.name);
  const mapped = visibleProjects.filter((p) => p.coords).sort(byName);
  const unmapped = visibleProjects.filter((p) => !p.coords).sort(byName);
  // Sites linked to scope: only show buyer sites that match a selected scope key
  const mappedSites = buyerSites.filter((s) => s.coords && siteInScope(s.name, selectedSites));

  const toggleGenType = (type: GenerationType) => {
    setVisibleGenTypes((prev: Set<GenerationType>) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };
  const showAllGenTypes = () => setVisibleGenTypes(new Set(ALL_GEN_TYPES));
  const hideAllGenTypes = () => setVisibleGenTypes(new Set());
  const toggleLabels = () => setShowLabels((prev: boolean) => !prev);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    // standalone: header = 64px nav + 40px ScopeBar = 104px; -my-6 removes layout padding
    <div className="flex overflow-hidden w-full h-full">
      {tryOnProject && (
        <TryOnOverlay
          project={tryOnProject}
          onClose={() => {
            setTryOnProject(null);
            setTryOnSite(undefined);
          }}
          scopeSite={tryOnSite}
        />
      )}
      {/* Sidebar */}
      <aside className={`flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden transition-all duration-200 ${sidebarOpen ? 'w-72' : 'w-0'}`}>

        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900 whitespace-nowrap">Project Locations</h2>
              {!loading && (
                <p className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">
                  {mapped.length} gen · {mappedSites.length} load · {unmapped.length} unmapped
                </p>
              )}
              <label className="mt-1 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recommendedOnly}
                  onChange={(e) => setRecommendedOnly(e.target.checked)}
                  className="h-3 w-3 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-[10px] text-slate-500 whitespace-nowrap">Recommended for my portfolio only</span>
              </label>
              <p className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">Click the Gen Type in the map legend to filter types.</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors mt-0.5"
              title="Hide list"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                <path d="M3 8l4.5-5 .7.6L4.4 8l3.8 4.4-.7.6L3 8z"/>
              </svg>
            </button>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto divide-y divide-slate-100 ${sidebarOpen ? '' : 'hidden'}`}>
          {loading && (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse space-y-1">
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <p className="p-4 text-xs text-red-500">{error}</p>
          )}

          {!loading && !error && mapped.map((project) => (
            <button
              key={project.id}
              onClick={() => flyToProject(project)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                selectedId === project.id ? 'bg-teal-50' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <svg 
                  width="16" 
                  height="16" 
                  className="flex-shrink-0"
                  dangerouslySetInnerHTML={{ __html: getMapIconSvg(project.generation_type) }}
                />
                <span className="text-sm font-medium text-slate-800 truncate">{project.name}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 ml-4.5">
                {project.generation_type} · {project.capacity_mw} MW
              </div>
              <div className="text-xs text-slate-400 ml-4.5 truncate">{project.location}</div>
            </button>
          ))}

          {!loading && !error && mappedSites.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Load Sites</p>
              </div>
              {mappedSites.map((site) => {
                return (
                  <button
                    key={site.id}
                    onClick={() => flyToBuyerSite(site)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                      selectedId === site.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 flex-shrink-0">
                        <span
                          className="inline-block w-2.5 h-2.5 flex-shrink-0"
                          style={{ background: '#6366f1', transform: 'rotate(45deg)' }}
                        />
                      </span>
                      <span className="text-sm font-medium text-slate-800 truncate">{site.name}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 ml-4.5 capitalize">
                      {(() => {
                        const siteKey = site.name.toLowerCase().replace(/\s+/g, '-');
                        const profile = LOAD_PROFILES.find(p => p.siteKey === siteKey);
                        if (profile) {
                          const capacities: number[] = [];
                          for (let y = startYear; y <= endYear; y++) {
                            capacities.push(getForecastCapacityForYear(profile, y));
                          }
                          const minCap = Math.min(...capacities);
                          const maxCap = Math.max(...capacities);
                          if (minCap === maxCap) {
                            return `${site.project_type} · ${minCap} MW target`;
                          } else {
                            return `${site.project_type} · ${minCap}–${maxCap} MW target`;
                          }
                        }
                        return site.project_type;
                      })()}
                    </div>
                    <div className="text-xs text-slate-400 ml-4.5 truncate">{site.location}</div>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && unmapped.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Unmapped</p>
              {unmapped.map((project) => (
                <div key={project.id} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" />
                    <span className="text-sm text-slate-500 truncate">{project.name}</span>
                  </div>
                  <div className="text-xs text-slate-400 ml-4.5">{project.location}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Map */}
      <div ref={mapContainer} className="flex-1 relative">
        {/* Floating re-open tab when sidebar is hidden */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/3 -translate-y-1/2 z-20 flex flex-col items-center justify-center gap-1 bg-white border border-slate-200 border-l-0 rounded-r-md px-1 py-3 shadow-md hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-colors"
            title="Show project list"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M6 8l4.5-5 .7.6L7.4 8l3.8 4.4-.7.6L6 8z" transform="rotate(180 8 8)"/>
            </svg>
            <span className="text-[9px] font-semibold tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Projects</span>
          </button>
        )}
        {/* LMP period type badge — fixed near top-right map controls */}
        {showLmpDots && (
          <div
            className={`absolute top-3 right-16 z-10 pointer-events-none flex items-center gap-2.5 px-4 py-2.5 rounded-lg border-2 ${
              lmpPeriodType === 'historical' ? 'bg-amber-50 border-amber-400 text-amber-900' :
              lmpPeriodType === 'current'    ? 'bg-green-50 border-green-500 text-green-900' :
                                               'bg-sky-50 border-sky-400 text-sky-900'
            }`}
            style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7)' }}
          >
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white ${
              lmpPeriodType === 'historical' ? 'bg-amber-500' :
              lmpPeriodType === 'current'    ? 'bg-green-500' : 'bg-sky-500'
            }`} />
            <span className="text-sm font-bold tracking-wide">
              {lmpPeriodType === 'historical' ? 'Historical Monthly $/MWh' :
               lmpPeriodType === 'current'    ? 'Current Month $/MWh' :
                                                'Forward Monthly $/MWh'}
            </span>
          </div>
        )}
        {/* Legend panel — toggles between Gen Types and LMP Price Scale */}
        <div className="absolute bottom-6 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md text-xs" style={{ minWidth: 192 }}>

          {/* ISO zone overlay toggles — each is independently toggleable. */}
          <div className="px-3 py-2 border-b border-slate-200">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              ISO Zones
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['PJM', 'MISO', 'ERCOT', 'SWPP'] as IsoKey[]).map((iso) => {
                const active = visibleIsoZones.has(iso);
                const color = iso === 'PJM' ? '#0f766e' : ISO_ZONE_OVERLAYS[iso as IsoZoneKey].color;
                const isLast = active && visibleIsoZones.size === 1;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggleIsoZone(iso)}
                    disabled={isLast}
                    title={isLast ? 'At least one ISO must remain visible' : undefined}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                      active
                        ? 'text-white border-transparent'
                        : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                    } ${isLast ? 'cursor-not-allowed opacity-90' : ''}`}
                    style={active ? { background: color } : undefined}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ background: active ? 'rgba(255,255,255,0.85)' : color }}
                    />
                    {iso}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode toggle header */}
          <div className="flex items-stretch border-b border-slate-200">
            <button
              onClick={() => setLegendMode('gen')}
              className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                legendMode === 'gen' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Gen Types
            </button>
            <button
              onClick={() => setLegendMode('lmp')}
              className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                legendMode === 'lmp' ? 'bg-teal-700 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              LMP Prices
            </button>
          </div>

          {legendMode === 'gen' && (
            <div className="px-3 py-2 space-y-1">
              {/* Controls row */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 text-[10px] font-medium">
                  <button onClick={showAllGenTypes} className="text-teal-600 hover:text-teal-700">All</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={hideAllGenTypes} className="text-slate-500 hover:text-slate-700">None</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={toggleLabels} className={`text-[10px] font-medium ${ showLabels ? 'text-teal-600' : 'text-slate-400'}`}>
                    Labels {showLabels ? '✓' : '✗'}
                  </button>
                  <button
                    onClick={() => setShowGenMarkers((v: boolean) => !v)}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                      showGenMarkers ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    {showGenMarkers ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              {(['Wind', 'Hydro', 'Nuclear', 'Solar', 'Combined Cycle', 'Battery', 'Hybrid', 'Peaker'] as GenerationType[]).map((type) => {
                const active = visibleGenTypes.has(type);
                const getIconSvg = (t: string) => {
                  switch (t) {
                    case 'Wind':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="1.5" fill="#0ea5e9"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(45)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(135)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(225)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(315)"/></g></svg>`;
                    case 'Nuclear':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="2" fill="#8b5cf6"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(0)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(60)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(120)"/></g></svg>`;
                    case 'Solar':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><circle r="4" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><line x1="0" y1="-8" x2="0" y2="-6"/><line x1="5.66" y1="-5.66" x2="4.24" y2="-4.24"/><line x1="8" y1="0" x2="6" y2="0"/><line x1="5.66" y1="5.66" x2="4.24" y2="4.24"/><line x1="0" y1="8" x2="0" y2="6"/><line x1="-5.66" y1="5.66" x2="-4.24" y2="4.24"/><line x1="-8" y1="0" x2="-6" y2="0"/><line x1="-5.66" y1="-5.66" x2="-4.24" y2="-4.24"/></g></g></svg>`;
                    case 'Combined Cycle':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-2" y="-8" width="4" height="12" rx="1" fill="#64748b"/><rect x="-6" y="2" width="12" height="4" rx="1" fill="#64748b"/><path d="M-2,-8 L-6,2 M2,-8 L6,2 M-2,4 L-6,2 M2,4 L6,2" stroke="#64748b" stroke-width="1" fill="none"/></g></svg>`;
                    case 'Battery':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><rect x="-8" y="-4" width="16" height="8" rx="1" fill="#10b981"/><rect x="8" y="-2" width="2" height="4" fill="#10b981"/><rect x="-6" y="-2" width="3" height="4" fill="white"/><rect x="-1.5" y="-2" width="3" height="4" fill="white"/><rect x="3" y="-2" width="2" height="4" fill="white"/></g></svg>`;
                    case 'Hybrid':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M0,-8 L3,-2 L8,-3 L2,2 L4,8 L-2,2 L-8,3 L-3,-2 Z" fill="#06b6d4"/><circle r="2" fill="white"/></g></svg>`;
                    case 'Hydro':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-8,4 L-3,4 L-3,-2 L3,-2 L3,4 L8,4 L8,8 L-8,8 Z" fill="#06b6d4"/><path d="M-6,10 Q-3,12 0,10 Q3,12 6,10" fill="none" stroke="#06b6d4" stroke-width="1.5"/><path d="M-6,12 Q-3,14 0,12 Q3,14 6,12" fill="none" stroke="#06b6d4" stroke-width="1.5"/></g></svg>`;
                    case 'Peaker':
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><g transform="translate(12,12)"><path d="M-6,6 L0,-8 L6,6 Z" fill="#ef4444"/><rect x="-2" y="2" width="4" height="4" fill="#dc2626"/></g></svg>`;
                    default:
                      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><circle cx="12" cy="12" r="8" fill="#64748b"/></svg>`;
                  }
                };
                
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleGenType(type)}
                    className={`flex items-center gap-2 w-full text-left rounded px-1 py-0.5 transition-colors hover:bg-slate-100 ${
                      active ? '' : 'opacity-40'
                    }`}
                  >
                    <span
                      dangerouslySetInnerHTML={{ __html: getIconSvg(type) }}
                      className="flex-shrink-0"
                      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
                    />
                    <span className={`text-slate-600 ${active ? '' : 'line-through'}`}>{type}</span>
                  </button>
                );
              })}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-1 px-0.5">
                <span className="inline-block w-2.5 h-3 flex-shrink-0 rounded-sm" style={{ background: '#475569', border: '1.5px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
                <span className="text-slate-500">Load Site (in scope)</span>
              </div>
            </div>
          )}

          {legendMode === 'lmp' && (
            <div className="px-3 pt-2 pb-3 space-y-2">
              {/* Current month/year display + toggle */}
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">
                  {MONTH_ABBR[lmpMonth - 1]} {lmpYear}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{lmpFrameIdx + 1}/{LMP_FRAMES.length}</span>
                  <button
                    onClick={() => setShowLmpDots((v: boolean) => !v)}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                      showLmpDots ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    {showLmpDots ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Time scrubber */}
              <div className="relative flex items-center">
                <div className="absolute inset-x-0 h-px bg-slate-300 pointer-events-none" />
                <input
                  type="range"
                  min={0}
                  max={LMP_FRAMES.length - 1}
                  value={lmpFrameIdx < 0 ? 0 : lmpFrameIdx}
                  onChange={(e) => {
                    const f = LMP_FRAMES[Number(e.target.value)];
                    setLmpMonth(f.month);
                    setLmpYear(f.year);
                  }}
                  className="relative w-full h-1.5 rounded appearance-none cursor-pointer bg-transparent"
                  style={{ accentColor: '#0f766e' }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 -mt-1">
                {LMP_FRAMES.length > 0 && (
                  <>
                    <span>{MONTH_ABBR[LMP_FRAMES[0].month - 1]} {LMP_FRAMES[0].year}</span>
                    <span>{MONTH_ABBR[LMP_FRAMES[LMP_FRAMES.length - 1].month - 1]} {LMP_FRAMES[LMP_FRAMES.length - 1].year}</span>
                  </>
                )}
              </div>

              {/* Gradient colour scale */}
              <div
                className="h-2.5 rounded w-full mt-1"
                style={{ background: 'linear-gradient(to right, #1e40af, #0891b2, #16a34a, #ca8a04, #ea580c, #dc2626)' }}
              />
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>≤$34</span><span>$40</span><span>$48</span><span>$56</span><span>$64</span><span>≥$72</span>
              </div>

              <p className="text-[9px] text-slate-400 border-t border-slate-100 pt-1.5">
                {lmpPrices.size > 0
                  ? <>{lmpPrices.size.toLocaleString()} nodes · hover for price</>
                  : <>Loading prices…</>}
              </p>

              {/* LMP indicator bars — reactive to slider month */}
              {(() => {
                const allPrices = Array.from(lmpPrices.values());
                const isLive = allPrices.length > 0;
                const simPeriod = LMP_PERIODS_ALL.find(p => p.year === lmpYear && p.month === lmpMonth);
                const simAvg = simPeriod ? (simPeriod.onPeak.whAvg + simPeriod.offPeak.whAvg) / 2 : 45;
                const pjmAvg = isLive ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : simAvg;

                // Zone avg — computed from current lmpPrices filtered to selected zone's pnodes
                let zoneAvg: number | null = null;
                if (selectedZoneName && zonePnodesRef.current.size > 0) {
                  const zonePrices: number[] = [];
                  zonePnodesRef.current.forEach(pid => {
                    const price = lmpPrices.get(pid);
                    if (price != null) zonePrices.push(price);
                  });
                  zoneAvg = zonePrices.length > 0
                    ? zonePrices.reduce((a, b) => a + b, 0) / zonePrices.length
                    : null;
                }

                const sliderMin = 20;
                const sliderMax = 90;
                const pct = (v: number) => Math.min(100, Math.max(0, ((v - sliderMin) / (sliderMax - sliderMin)) * 100));
                const lmpColor = (v: number) => v >= 72 ? '#dc2626' : v >= 64 ? '#ea580c' : v >= 56 ? '#ca8a04' : v >= 48 ? '#16a34a' : v >= 40 ? '#0891b2' : '#1e40af';

                const Bar = ({ value, label, sublabel, delta }: { value: number; label: string; sublabel?: string; delta?: number }) => (
                  <div>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">
                        {label}{sublabel && <span className="ml-1 text-[8px] normal-case text-slate-400 font-normal">{sublabel}</span>}
                      </span>
                      <div className="flex items-baseline gap-1">
                        {delta != null && (
                          <span className={`text-[8px] font-semibold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-teal-500' : 'text-slate-400'}`}>
                            {delta > 0 ? `+$${delta.toFixed(2)}` : `-$${Math.abs(delta).toFixed(2)}`}
                          </span>
                        )}
                        <span className="text-[10px] font-bold" style={{ color: lmpColor(value) }}>${value.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="relative h-2 rounded-full bg-slate-100">
                      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300" style={{ width: `${pct(value)}%`, background: lmpColor(value) }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow transition-all duration-300" style={{ left: `calc(${pct(value)}% - 5px)`, background: lmpColor(value) }} />
                    </div>
                  </div>
                );

                // Pnode price — single node lookup
                const pnodePrice = selectedPnode ? lmpPrices.get(selectedPnode.id) ?? null : null;

                return (
                  <div className="space-y-2.5 border-t border-slate-100 pt-2">
                    {selectedPnode && pnodePrice != null && (
                      <Bar
                        value={pnodePrice}
                        label={selectedPnode.name.length > 18 ? selectedPnode.name.slice(0, 17) + '…' : selectedPnode.name}
                        sublabel={!isLive ? '(sim)' : undefined}
                        delta={parseFloat((pnodePrice - pjmAvg).toFixed(2))}
                      />
                    )}
                    {selectedPnode && pnodePrice == null && (
                      <p className="text-[9px] text-slate-400 italic truncate">{selectedPnode.name}: no data</p>
                    )}
                    {selectedZoneName && zoneAvg != null && (
                      <Bar
                        value={zoneAvg}
                        label={`${selectedZoneName} Zone`}
                        sublabel={!isLive ? '(simulated)' : undefined}
                        delta={parseFloat((zoneAvg - pjmAvg).toFixed(2))}
                      />
                    )}
                    {selectedZoneName && zoneAvg == null && (
                      <p className="text-[9px] text-slate-400 italic">{selectedZoneName}: no price data this month</p>
                    )}
                    <Bar
                      value={pjmAvg}
                      label="PJM System"
                      sublabel={!isLive ? '(simulated)' : undefined}
                    />
                    <p className="text-[8px] text-slate-300">$20 ─────────────────── $90</p>
                    {(selectedZoneName || selectedPnode) && (
                      <button
                        onClick={() => { setSelectedPnode(null); zonePnodesRef.current = new Set(); setSelectedZoneName(null); }}
                        className="text-[8px] text-slate-400 hover:text-slate-600 underline"
                      >{selectedPnode ? 'Clear node' : 'Clear zone'}</button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
