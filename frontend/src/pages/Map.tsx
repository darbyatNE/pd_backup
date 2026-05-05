import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { supabase } from '../services/supabase';
import { getZoneCoords } from '../utils/pjmZones';
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

const ISO_CONFIGS = [
  { id: 'pjm',   file: '/PJM_zones.geojson',   label: 'PJM',    color: '#0d9488', lineColor: '#0f766e' },
  { id: 'ercot', file: '/ERCOT_zones.geojson',  label: 'ERCOT',  color: '#d97706', lineColor: '#b45309' },
  { id: 'isone', file: '/ISONE_zones.geojson',  label: 'ISO-NE', color: '#7c3aed', lineColor: '#6d28d9' },
  { id: 'miso',  file: '/MISO_zones.geojson',   label: 'MISO',   color: '#dc2626', lineColor: '#b91c1c' },
  { id: 'nyiso', file: '/NYISO_zones.geojson',  label: 'NYISO',  color: '#2563eb', lineColor: '#1d4ed8' },
] as const;

type IsoId = typeof ISO_CONFIGS[number]['id'];

const MARKER_COLORS: Record<GenerationType, string> = {
  Solar:    '#f59e0b',
  Wind:     '#0ea5e9',
  Nuclear:  '#8b5cf6',
  Battery:  '#10b981',
  Hydrogen: '#06b6d4',
  Hybrid:   '#f97316',
};

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

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const layersReady = useRef(false);

  const [projects, setProjects] = useState<MappedProject[]>([]);
  const [buyerSites, setBuyerSites] = useState<BuyerSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedIsos, setLoadedIsos] = useState<Set<IsoId>>(new Set());
  const [visibleIsos, setVisibleIsos] = useState<Set<IsoId>>(
    new Set(ISO_CONFIGS.map((c) => c.id))
  );

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: genData, error: genErr }, { data: siteData }] =
        await Promise.all([
          supabase.from('projects').select('*').eq('status', 'published').order('created_at', { ascending: false }),
          supabase.from('buyer_projects').select('id,name,location,project_type,target_capacity_mw,settlement_zone').order('created_at', { ascending: false }),
        ]);

      if (genErr) throw genErr;

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
      center: [-88, 38.6],
      zoom: 4.6,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', async () => {
      if (!map.current) return;

      // load all ISO zone overlays in parallel
      await Promise.all(
        ISO_CONFIGS.map(async ({ id, file, color, lineColor }) => {
          try {
            const res = await fetch(file);
            if (!res.ok) return; // file not present — overlay silently omitted
            const geojson = await res.json();

            map.current!.addSource(`${id}-zones`, { type: 'geojson', data: geojson });

            map.current!.addLayer({
              id: `${id}-fill`,
              type: 'fill',
              source: `${id}-zones`,
              paint: { 'fill-color': color, 'fill-opacity': 0.08 },
            });

            map.current!.addLayer({
              id: `${id}-line`,
              type: 'line',
              source: `${id}-zones`,
              paint: { 'line-color': lineColor, 'line-width': 1.5, 'line-opacity': 0.6 },
            });

            setLoadedIsos((prev) => new Set([...prev, id]));
          } catch {
            // non-critical — map renders without this ISO's overlay
          }
        })
      );

      layersReady.current = true;
    });

    return () => {
      layersReady.current = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // sync layer visibility when toggles change
  useEffect(() => {
    if (!map.current || !layersReady.current) return;
    ISO_CONFIGS.forEach(({ id }) => {
      const visibility = visibleIsos.has(id) ? 'visible' : 'none';
      if (map.current!.getLayer(`${id}-fill`)) {
        map.current!.setLayoutProperty(`${id}-fill`, 'visibility', visibility);
        map.current!.setLayoutProperty(`${id}-line`, 'visibility', visibility);
      }
    });
  }, [visibleIsos]);

  // add/update markers whenever projects or buyer sites load
  useEffect(() => {
    if (!map.current) return;

    const addMarkers = () => {
      markers.current.forEach((m) => m.remove());
      markers.current.clear();

      // Generation markers — filled circles
      projects.forEach((project) => {
        if (!project.coords || !map.current) return;
        const el = document.createElement('div');
        const color = MARKER_COLORS[project.generation_type] ?? '#64748b';
        el.style.cssText = `
          width: 8px; height: 8px; border-radius: 50%;
          background: ${color}; border: 1.5px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.35); cursor: pointer;
        `;
        const priceStr = project.fixed_price_per_mwh ? `$${project.fixed_price_per_mwh}/MWh` : 'Price TBD';
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;min-width:180px">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${project.name}</div>
              <div style="color:#64748b;font-size:12px;margin-bottom:2px">${project.generation_type} · ${project.capacity_mw} MW</div>
              <div style="color:#64748b;font-size:12px;margin-bottom:2px">${project.location}</div>
              <div style="font-size:12px;font-weight:500;color:#0d9488">${priceStr}</div>
            </div>
          `);
        markers.current.set(project.id,
          new maplibregl.Marker({ element: el }).setLngLat(project.coords).setPopup(popup).addTo(map.current!)
        );
      });

      // Load site markers — diamonds (squares rotated 45° inside a larger hit-box)
      buyerSites.forEach((site) => {
        if (!site.coords || !map.current) return;
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
    };

    if (map.current.isStyleLoaded()) {
      addMarkers();
    } else {
      map.current.once('load', addMarkers);
    }
  }, [projects, buyerSites]);

  const toggleIso = (id: IsoId) => {
    setVisibleIsos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  const mapped = projects.filter((p) => p.coords);
  const unmapped = projects.filter((p) => !p.coords);
  const mappedSites = buyerSites.filter((s) => s.coords);

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">

        {/* ISO toggles */}
        <div className="px-4 py-3 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Zone Overlays</p>
          <div className="flex flex-wrap gap-1.5">
            {ISO_CONFIGS.filter(({ id }) => loadedIsos.has(id)).map(({ id, label, color }) => {
              const active = visibleIsos.has(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleIso(id)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all"
                  style={active
                    ? { background: color + '20', borderColor: color, color }
                    : { background: '#f1f5f9', borderColor: '#cbd5e1', color: '#94a3b8' }
                  }
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: active ? color : '#cbd5e1' }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Project list header */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Project Locations</h2>
          {!loading && (
            <p className="text-xs text-slate-500 mt-0.5">
              {mapped.length} gen · {mappedSites.length} load · {unmapped.length} unmapped
            </p>
          )}
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
              {mappedSites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => flyToBuyerSite(site)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                    selectedId === site.id ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 flex-shrink-0">
                      <span className="inline-block w-2.5 h-2.5 bg-indigo-500" style={{ transform: 'rotate(45deg)' }} />
                    </span>
                    <span className="text-sm font-medium text-slate-800 truncate">{site.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 ml-4.5 capitalize">
                    {site.project_type}{site.target_capacity_mw ? ` · ${site.target_capacity_mw} MW target` : ''}
                  </div>
                  <div className="text-xs text-slate-400 ml-4.5 truncate">{site.location}</div>
                </button>
              ))}
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
        {/* Legend */}
        <div className="absolute bottom-6 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md px-3 py-2.5 text-xs space-y-1.5">
          <p className="font-semibold text-slate-600 uppercase tracking-wide text-[10px] mb-2">Legend</p>
          {(Object.entries(MARKER_COLORS) as [keyof typeof MARKER_COLORS, string][]).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, border: '1.5px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
              <span className="text-slate-600">{type}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-1">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 flex-shrink-0">
              <span className="inline-block w-2.5 h-2.5 bg-indigo-500 flex-shrink-0" style={{ transform: 'rotate(45deg)', border: '1.5px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
            </span>
            <span className="text-slate-600">Load Site</span>
          </div>
        </div>
      </div>
    </div>
  );
}
