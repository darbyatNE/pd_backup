import { useEffect, useRef, useState, useCallback } from 'react';
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
  Hydrogen:         '#06b6d4',
  Hybrid:           '#f97316',
  'Combined Cycle': '#dc2626',
  Peaker:           '#7c2d12',
};

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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MapPage({ inline = false }: { inline?: boolean }) {
  const { selectedSites, endYear, endMonth, setEndDate } = useScopeContext();
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
  const [visibleGenTypes, setVisibleGenTypes] = useState<Set<GenerationType>>(
    () => new Set(ALL_GEN_TYPES)
  );
  const [tryOnProject, setTryOnProject] = useState<MappedProject | null>(null);

  // Keep refs in sync so renderMarkers always sees latest data
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { buyerSitesRef.current = buyerSites; }, [buyerSites]);
  useEffect(() => { visibleGenTypesRef.current = visibleGenTypes; }, [visibleGenTypes]);
  useEffect(() => { selectedSitesRef.current = selectedSites; }, [selectedSites]);
  useEffect(() => { setTryOnProjectRef.current = setTryOnProject; }, [setTryOnProject]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: genData, error: genErr }, { data: siteData, error: siteErr }] =
        await Promise.all([
          supabase.from('projects').select('*').eq('status', 'published').order('created_at', { ascending: false }),
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

    // disable default double-click zoom — we handle it ourselves
    map.current.doubleClickZoom.disable();

    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        const res = await fetch('/PJM_zones.geojson');
        if (res.ok) {
          const geojson = await res.json();

          map.current!.addSource('pjm-zones', { type: 'geojson', data: geojson });

          map.current!.addLayer({
            id: 'pjm-fill',
            type: 'fill',
            source: 'pjm-zones',
            paint: { 'fill-color': '#0d9488', 'fill-opacity': 0.08 },
          });

          map.current!.addLayer({
            id: 'pjm-line',
            type: 'line',
            source: 'pjm-zones',
            paint: { 'line-color': '#0f766e', 'line-width': 1.5, 'line-opacity': 0.6 },
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

    // Generation markers — filled circles
    currentProjects.forEach((project) => {
      if (!project.coords || !map.current) return;
      if (!currentVisible.has(project.generation_type)) return;

      const el = document.createElement('div');
      const color = MARKER_COLORS[project.generation_type] ?? '#64748b';
      el.style.cssText = `
        width: 8px; height: 8px; border-radius: 50%;
        background: ${color}; border: 1.5px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.35); cursor: pointer;
      `;
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
      markers.current.set(project.id,
        new maplibregl.Marker({ element: el }).setLngLat(project.coords).setPopup(popup).addTo(map.current!)
      );
    });

    // Load site markers — diamonds. Only render sites in the active scope.
    currentBuyerSites.forEach((site) => {
      if (!site.coords || !map.current) return;
      if (!siteInScope(site.name, currentSelectedSites)) return;

      const el = document.createElement('div');
      el.style.cssText = 'width:14px;height:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      const inner = document.createElement('div');
      inner.style.cssText = 'width:8px;height:8px;background:#6366f1;border:1.5px solid white;transform:rotate(45deg);box-shadow:0 1px 3px rgba(0,0,0,0.35);flex-shrink:0;';
      el.appendChild(inner);
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
      markers.current.set(site.id,
        new maplibregl.Marker({ element: el }).setLngLat(site.coords).setPopup(popup).addTo(map.current!)
      );
    });
  }, []);

  // Trigger re-render when reactive data changes (map init load handler also calls this)
  useEffect(() => {
    if (!map.current) return;
    if (map.current.isStyleLoaded()) {
      renderMarkers();
    }
  }, [projects, buyerSites, visibleGenTypes, selectedSites, renderMarkers]);

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
    setVisibleGenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };
  const showAllGenTypes = () => setVisibleGenTypes(new Set(ALL_GEN_TYPES));
  const hideAllGenTypes = () => setVisibleGenTypes(new Set());

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
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: MARKER_COLORS[project.generation_type] ?? '#64748b' }}
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
        {/* Legend — clickable per-type filter */}
        <div className="absolute bottom-6 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md px-3 py-2.5 text-xs space-y-1">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className="font-semibold text-slate-600 uppercase tracking-wide text-[10px]">Legend · Filter</p>
            <div className="flex items-center gap-1.5 text-[10px] font-medium">
              <button onClick={showAllGenTypes} className="text-teal-600 hover:text-teal-700">All</button>
              <span className="text-slate-300">·</span>
              <button onClick={hideAllGenTypes} className="text-slate-500 hover:text-slate-700">None</button>
            </div>
          </div>
          {(Object.entries(MARKER_COLORS) as [GenerationType, string][]).map(([type, color]) => {
            const active = visibleGenTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleGenType(type)}
                className={`flex items-center gap-2 w-full text-left rounded px-1 py-0.5 transition-colors hover:bg-slate-100 ${
                  active ? '' : 'opacity-40'
                }`}
                title={active ? `Hide ${type}` : `Show ${type}`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: color, border: '1.5px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
                />
                <span className={`text-slate-600 ${active ? '' : 'line-through'}`}>{type}</span>
              </button>
            );
          })}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-1 px-1">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 flex-shrink-0">
              <span className="inline-block w-2.5 h-2.5 bg-indigo-500 flex-shrink-0" style={{ transform: 'rotate(45deg)', border: '1.5px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
            </span>
            <span className="text-slate-600">Load Site (in scope)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
