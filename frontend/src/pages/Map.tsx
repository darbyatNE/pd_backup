import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { supabase } from '../services/supabase';
import Layout from '../components/Layout';
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

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());

  const [projects, setProjects] = useState<MappedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const mapped = (data ?? []).map((p: Project) => ({
        ...p,
        coords: getZoneCoords(p.location ?? ''),
      }));
      setProjects(mapped);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  // fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // init map once container is ready
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: [-82, 38.6],
      zoom: 5.4,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', async () => {
      if (!map.current) return;

      // load PJM zone overlay
      try {
        const res = await fetch('/PJM_zones.geojson');
        const geojson = await res.json();

        map.current.addSource('pjm-zones', { type: 'geojson', data: geojson });

        map.current.addLayer({
          id: 'pjm-zones-fill',
          type: 'fill',
          source: 'pjm-zones',
          paint: {
            'fill-color': '#0d9488',
            'fill-opacity': 0.08,
          },
        });

        map.current.addLayer({
          id: 'pjm-zones-line',
          type: 'line',
          source: 'pjm-zones',
          paint: {
            'line-color': '#0f766e',
            'line-width': 1.5,
            'line-opacity': 0.6,
          },
        });
      } catch {
        // zone overlay is non-critical, continue without it
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // add/update markers whenever projects load
  useEffect(() => {
    if (!map.current) return;

    const addMarkers = () => {
      // remove old markers
      markers.current.forEach((m) => m.remove());
      markers.current.clear();

      projects.forEach((project) => {
        if (!project.coords || !map.current) return;

        const el = document.createElement('div');
        el.className = 'pjm-marker';
        const color = MARKER_COLORS[project.generation_type] ?? '#64748b';
        el.style.cssText = `
          width: 14px; height: 14px; border-radius: 50%;
          background: ${color}; border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: pointer;
        `;

        const priceStr = project.fixed_price_per_mwh
          ? `$${project.fixed_price_per_mwh}/MWh`
          : 'Price TBD';

        const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;min-width:180px">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${project.name}</div>
              <div style="color:#64748b;font-size:12px;margin-bottom:2px">${project.generation_type} · ${project.capacity_mw} MW</div>
              <div style="color:#64748b;font-size:12px;margin-bottom:2px">${project.location}</div>
              <div style="font-size:12px;font-weight:500;color:#0d9488">${priceStr}</div>
            </div>
          `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(project.coords)
          .setPopup(popup)
          .addTo(map.current!);

        markers.current.set(project.id, marker);
      });
    };

    // run after map style has loaded
    if (map.current.isStyleLoaded()) {
      addMarkers();
    } else {
      map.current.once('load', addMarkers);
    }
  }, [projects]);

  const flyToProject = (project: MappedProject) => {
    if (!project.coords || !map.current) return;
    setSelectedId(project.id);
    map.current.flyTo({ center: project.coords, zoom: 8, duration: 800 });
    markers.current.get(project.id)?.togglePopup();
  };

  const mapped = projects.filter((p) => p.coords);
  const unmapped = projects.filter((p) => !p.coords);

  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Project Locations</h2>
            {!loading && (
              <p className="text-xs text-slate-500 mt-0.5">
                {mapped.length} pinned · {unmapped.length} unmapped
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

            {!loading && !error && unmapped.length > 0 && (
              <div className="px-4 py-3">
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
        <div ref={mapContainer} className="flex-1" />
      </div>
    </Layout>
  );
}
