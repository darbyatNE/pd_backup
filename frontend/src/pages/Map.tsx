import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { supabase } from '../services/supabase';
import { getZoneCoords } from '../utils/pjmZones';
import TryOnOverlay from '../components/TryOnOverlay';
import { useScopeContext } from '../contexts/ScopeContext';
import type { Project, GenerationType } from '../types';

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

// Initial view: W edge of COMED → E edge of JCPL, N edge of COMED → S edge of DOM
const PORTFOLIO_BOUNDS: maplibregl.LngLatBoundsLike = [[-91.5, 36.25], [-73.9, 42.25]];

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
    default:
      return `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;"><circle cx="12" cy="12" r="8" fill="#64748b"/></svg>`;
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

export default function MapPage({ inline = false }: { inline?: boolean }) {
  const { selectedSites, startYear, startMonth, endYear, endMonth, setEndDate } = useScopeContext();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pjmLabelMarkers = useRef<maplibregl.Marker[]>([]);

  // Refs for latest data — used by renderMarkers to avoid stale closures
  const projectsRef = useRef<MappedProject[]>([]);
  const buyerSitesRef = useRef<BuyerSite[]>([]);
  const visibleGenTypesRef = useRef<Set<GenerationType>>(new Set());
  const selectedSitesRef = useRef<string[]>([]);
  const setTryOnProjectRef = useRef<(p: MappedProject | null) => void>(() => {});

  // Keep latest scope values reachable from popup click handlers without
  // forcing marker re-creation every time the scope changes.
  const scopeRef = useRef({ endYear, endMonth, setEndDate });
  useEffect(() => {
    scopeRef.current = { endYear, endMonth, setEndDate };
  }, [endYear, endMonth, setEndDate]);

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
  // Load persisted states from localStorage
  const [showLabels, setShowLabels] = useState(() => {
    const saved = localStorage.getItem('map-showLabels');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [lmpPrices, setLmpPrices] = useState<LmpMap>(new Map());
  const [legendMode, setLegendMode] = useState<'gen' | 'lmp'>(() => {
    const saved = localStorage.getItem('map-legendMode');
    return saved !== null ? JSON.parse(saved) : 'gen';
  });
  const [showGenMarkers, setShowGenMarkers] = useState(() => {
    const saved = localStorage.getItem('map-showGenMarkers');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showLmpDots, setShowLmpDots] = useState(() => {
    const saved = localStorage.getItem('map-showLmpDots');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // LMP frames driven by scope dates
  const LMP_FRAMES = useMemo(() => {
    const frames: { month: number; year: number }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 1;
      const mEnd   = y === endYear   ? endMonth   : 12;
      for (let m = mStart; m <= mEnd; m++) frames.push({ month: m, year: y });
    }
    return frames;
  }, [startYear, startMonth, endYear, endMonth]);

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
  const lmpCacheRef = useRef<Map<string, LmpMap>>(new Map());

  // Fetch LMP prices whenever selected month/year changes
  useEffect(() => {
    const key = `${lmpYear}-${lmpMonth}`;
    if (lmpCacheRef.current.has(key)) {
      setLmpPrices(lmpCacheRef.current.get(key)!);
      return;
    }
    supabase
      .schema('planning')
      .from('lmp_forecast')
      .select('pnode_id,total_lmp')
      .eq('month', lmpMonth)
      .eq('year', lmpYear)
      .then(({ data, error: fetchErr }) => {
        if (fetchErr || !data) return;
        const m: LmpMap = new Map();
        (data as { pnode_id: number; total_lmp: number }[]).forEach((r) => m.set(r.pnode_id, r.total_lmp));
        lmpCacheRef.current.set(key, m);
        setLmpPrices(m);
      });
  }, [lmpMonth, lmpYear]);

  // Keep refs in sync so renderMarkers always sees latest data
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { buyerSitesRef.current = buyerSites; }, [buyerSites]);
  useEffect(() => { visibleGenTypesRef.current = visibleGenTypes; }, [visibleGenTypes]);
  useEffect(() => { selectedSitesRef.current = selectedSites; }, [selectedSites]);
  useEffect(() => { setTryOnProjectRef.current = setTryOnProject; }, [setTryOnProject]);

  // Ref for showLabels so renderMarkers can access current value
  const showLabelsRef = useRef(showLabels);
  useEffect(() => { 
    showLabelsRef.current = showLabels;
    // Save to localStorage
    localStorage.setItem('map-showLabels', JSON.stringify(showLabels));
  }, [showLabels]);

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

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: genData, error: genErr }, { data: siteData, error: siteErr }] =
        await Promise.all([
          supabase.from('projects').select('*').in('status', ['published', 'active']).order('created_at', { ascending: false }),
          supabase.from('buyer_projects').select('id,name,location,project_type,target_capacity_mw,settlement_zone').order('created_at', { ascending: false }),
        ]);

      if (genErr) throw genErr;
      if (siteErr) throw siteErr;

      setProjects((genData ?? []).map((p: Project) => ({ ...p, coords: getZoneCoords(p.location ?? '') })));
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

          // Subtle fill for entire PJM region to make it stand out
          map.current!.addLayer({
            id: 'pjm-fill',
            type: 'fill',
            source: 'pjm-zones',
            paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.05 },
          });

          // Zone interior lines (inter-zone boundaries)
          map.current!.addLayer({
            id: 'pjm-line',
            type: 'line',
            source: 'pjm-zones',
            paint: { 'line-color': '#0f766e', 'line-width': 1.2, 'line-opacity': 0.7 },
          });

          // Outer PJM footprint border — thicker, darker line drawn on top
          map.current!.addLayer({
            id: 'pjm-border',
            type: 'line',
            source: 'pjm-zones',
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

          // Zone name labels
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
            pjmLabelMarkers.current.push(
              new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(coords)
                .addTo(map.current!),
            );
          });

          // Fit to PJM footprint on load
          map.current!.fitBounds(PORTFOLIO_BOUNDS, { padding: 30, duration: 500 });

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

      // ── PJM Priced Substations layer ────────────────────────────────────────
      try {
        const subsRes = await fetch('/PJM_subs_priced.geojson');
        if (subsRes.ok) {
          const subsGeoJson = await subsRes.json();

          map.current!.addSource('pjm-subs', { type: 'geojson', data: subsGeoJson });

          // ── LMP colored circle markers — data-driven color by price
          map.current!.addLayer({
            id: 'pjm-subs-dots',
            type: 'circle',
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
              `<div style="color:#64748b;margin-top:1px;font-size:10px">${f['CITY'] ?? ''}, ${f['STATE'] ?? ''}</div>`,
              f['MAX_VOLT'] ? `<div style="color:#94a3b8;margin-top:1px;font-size:10px">${f['MAX_VOLT']} kV · ${f['pnode_subtype'] ?? ''}</div>` : '',
              `<div style="color:#94a3b8;margin-top:1px;font-size:10px">Match: ${Math.round(Number(f['match_score']))}%</div>`,
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

      // Double-click: highlight + zoom to zone bounds if over a zone, otherwise zoom +2 and clear highlight
      map.current!.on('dblclick', (e) => {
        if (!map.current) return;
        const highlightSrc = map.current.getSource('pjm-highlight') as maplibregl.GeoJSONSource | undefined;
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['pjm-fill'] });
        if (features.length > 0 && features[0].geometry) {
          const f = features[0];
          // Outline the selected zone
          highlightSrc?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: f.geometry, properties: f.properties ?? {} }],
          });
          const bounds = featureBounds(f.geometry as { type: string; coordinates: unknown });
          if (bounds) {
            map.current.fitBounds(bounds, { padding: 40, duration: 600 });
            return;
          }
        }
        // Off-zone: clear highlight and zoom in
        highlightSrc?.setData({ type: 'FeatureCollection', features: [] });
        map.current.flyTo({ center: e.lngLat, zoom: map.current.getZoom() + 2, duration: 500 });
      });

      renderMarkers();
    });

    return () => {
      pjmLabelMarkers.current.forEach((m) => m.remove());
      pjmLabelMarkers.current = [];
      map.current?.remove();
      map.current = null;
    };
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
    currentProjects.forEach((p) => {
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
      if (!currentVisible.has(project.generation_type)) return;

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
      const priceStr = project.fixed_price_per_mwh ? `$${project.fixed_price_per_mwh}/MWh` : 'Price TBD';

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
      const capacityStr = site.target_capacity_mw ? `${site.target_capacity_mw} MW target` : '';
      const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
        .setHTML(`
          <div style="font-family:system-ui,sans-serif;min-width:180px">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">${site.name}</div>
            <div style="color:#64748b;font-size:12px;margin-bottom:2px">Load Site · ${site.project_type}</div>
            <div style="color:#64748b;font-size:12px;margin-bottom:2px">${site.location}</div>
            ${capacityStr ? `<div style="font-size:12px;font-weight:500;color:#6366f1">${capacityStr}</div>` : ''}
            ${site.settlement_zone ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${site.settlement_zone}</div>` : ''}
          </div>
        `);
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

  // Trigger re-render whenever data / filters change.
  // We no longer gate on isStyleLoaded() — that caused a race where the
  // effect sometimes fired before the style finished loading and then never
  // retried. MapLibre markers are DOM overlays; adding them before the style
  // loads is safe — they simply snap into position once the map loads.
  useEffect(() => {
    if (!map.current) return;
    renderMarkers();
  }, [projects, buyerSites, visibleGenTypes, selectedSites, showLabels, renderMarkers]);

  // Toggle gen-type project marker visibility
  useEffect(() => {
    markers.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = showGenMarkers ? '' : 'none';
    });
  }, [showGenMarkers]);

  // Toggle LMP substation dot visibility
  useEffect(() => {
    if (!map.current || !map.current.getLayer('pjm-subs-dots')) return;
    map.current.setLayoutProperty('pjm-subs-dots', 'visibility', showLmpDots ? 'visible' : 'none');
  }, [showLmpDots]);

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

  const visibleProjects = projects.filter((p) => visibleGenTypes.has(p.generation_type));
  const mapped = visibleProjects.filter((p) => p.coords);
  const unmapped = visibleProjects.filter((p) => !p.coords);
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

  return (
    // standalone: header = 64px nav + 40px ScopeBar = 104px; -my-6 removes layout padding
    <div className={inline ? 'flex overflow-hidden w-full h-full' : '-mx-4 sm:-mx-6 lg:-mx-8 -my-6 flex overflow-hidden'} style={inline ? undefined : { height: 'calc(100vh - 104px)' }}>
      {tryOnProject && (
        <TryOnOverlay
          project={tryOnProject}
          onClose={() => setTryOnProject(null)}
        />
      )}
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">

        {/* Project list header */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Project Locations</h2>
          {!loading && (
            <p className="text-xs text-slate-500 mt-0.5">
              {mapped.length} gen · {mappedSites.length} load · {unmapped.length} unmapped
            </p>
          )}

          <p className="text-[10px] text-slate-400 mt-1">
            Click types in the map legend to filter generation projects.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
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
                      {site.project_type}{site.target_capacity_mw ? ` · ${site.target_capacity_mw} MW target` : ''}
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
        {/* Legend panel — toggles between Gen Types and LMP Price Scale */}
        <div className="absolute bottom-6 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md text-xs" style={{ minWidth: 192 }}>

          {/* Mode toggle header */}
          <div className="flex items-stretch border-b border-slate-200">
            <button
              onClick={() => setLegendMode('gen')}
              className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-tl-lg transition-colors ${
                legendMode === 'gen' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Gen Types
            </button>
            <button
              onClick={() => setLegendMode('lmp')}
              className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-tr-lg transition-colors ${
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
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
