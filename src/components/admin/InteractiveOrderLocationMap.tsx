import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import {
  Globe,
  MapPin,
  Home,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Layers,
  X,
  Building2,
  ShoppingBag,
  IndianRupee,
  Users,
  TrendingUp,
  Truck,
  ChevronRight,
  Award,
} from 'lucide-react';
import { formatINR } from '../../utils/priceCalculator';
import {
  canonicalStateKey,
  INDIA_STATE_COORDINATES,
  resolveCityCoordinates,
} from '../../data/locationCoordinates';

export interface MapStateStat {
  state: string;
  orderCount: number;
  totalRevenue: number;
  uniqueCustomers: number;
  averageOrderValue: number;
  orderShare: number;
  revenueShare: number;
  topCities: Array<{ city: string; count: number }>;
  latestOrderAt: string;
}

export interface MapCityStat {
  city: string;
  state: string;
  orderCount: number;
  totalRevenue: number;
  uniqueCustomers: number;
  averageOrderValue: number;
  orderShare: number;
  revenueShare: number;
  isSurat: boolean;
  latestOrderAt: string;
}

export interface MapLocationSummary {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalStates: number;
  totalCities: number;
  topState: MapStateStat | null;
  topCity: MapCityStat | null;
  suratOrders: number;
  suratRevenue: number;
  otherCitiesOrders: number;
  otherCitiesRevenue: number;
  averageOrderValue: number;
}

export interface MapFocusTarget {
  type: 'state' | 'city';
  name: string;
  state?: string;
  ts: number;
}

interface SelectedInspection {
  kind: 'state' | 'city' | 'country';
  title: string;
  subtitle: string;
  rank: number | null;
  orderCount: number;
  totalRevenue: number;
  uniqueCustomers: number;
  averageOrderValue: number;
  orderShare: number;
  revenueShare: number;
  isSurat?: boolean;
  topCities?: Array<{ city: string; count: number }>;
  latestOrderAt?: string;
}

type TileMode = 'atlas' | 'light' | 'satellite' | 'vector';
type ViewPreset = 'india' | 'world' | 'surat';

const CARTO_API_KEY =
  import.meta.env.VITE_CARTO_API_KEY || 'cb1_5fvn_1_0841bf606d2869bbb5137c3a';

const TILE_CONFIGS: Record<
  Exclude<TileMode, 'vector'>,
  { url: string; attribution: string; maxZoom: number }
> = {
  atlas: {
    url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 18,
  },
  light: {
    url: `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 18,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18,
  },
};

interface InteractiveOrderLocationMapProps {
  states: MapStateStat[];
  cities: MapCityStat[];
  summary: MapLocationSummary | null;
  focusedLocation?: MapFocusTarget | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export default function InteractiveOrderLocationMap({
  states,
  cities,
  summary,
  focusedLocation,
  isExpanded = false,
  onToggleExpand,
}: InteractiveOrderLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const worldLayerRef = useRef<L.GeoJSON | null>(null);
  const indiaLayerRef = useRef<L.GeoJSON | null>(null);
  const cityLayerRef = useRef<L.LayerGroup | null>(null);
  const stateLayersByKeyRef = useRef<Map<string, L.Layer>>(new Map());

  const [tileMode, setTileMode] = useState<TileMode>('atlas');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('india');
  const [indiaGeo, setIndiaGeo] = useState<any>(null);
  const [selected, setSelected] = useState<SelectedInspection | null>(null);
  const [showCities, setShowCities] = useState(true);

  // Lookup maps for quick matching
  const stateLookup = useMemo(() => {
    const map = new Map<string, { stat: MapStateStat; rank: number }>();
    states.forEach((st, idx) => {
      map.set(canonicalStateKey(st.state), { stat: st, rank: idx + 1 });
    });
    return map;
  }, [states]);

  const cityRankMap = useMemo(() => {
    const map = new Map<string, number>();
    cities.forEach((ct, idx) => {
      map.set(`${ct.city.toLowerCase()}::${canonicalStateKey(ct.state)}`, idx + 1);
    });
    return map;
  }, [cities]);

  const maxStateOrders = useMemo(
    () => (states.length > 0 ? Math.max(...states.map(s => s.orderCount), 1) : 1),
    [states]
  );

  const maxCityOrders = useMemo(
    () => (cities.length > 0 ? Math.max(...cities.map(c => c.orderCount), 1) : 1),
    [cities]
  );

  // Convert World Atlas TopoJSON once
  const worldGeo = useMemo(() => {
    try {
      const atlas = worldAtlas as any;
      const geo = feature(atlas, atlas.objects.countries) as any;
      return {
        ...geo,
        features: (geo.features || []).filter(
          (f: any) => String(f?.properties?.name || '').toLowerCase() !== 'india'
        ),
      };
    } catch {
      return null;
    }
  }, []);

  // Lazily load detailed 36-state Indian GeoJSON
  useEffect(() => {
    let active = true;
    import('../../data/indiaStatesGeo.json')
      .then(mod => {
        if (active) setIndiaGeo(mod.default || mod);
      })
      .catch(() => {
        // Ignore if missing
      });
    return () => {
      active = false;
    };
  }, []);

  const hasAutoSelectedRef = useRef(false);

  // Auto-select top state once on first data arrival
  useEffect(() => {
    if (!hasAutoSelectedRef.current && summary?.topState) {
      hasAutoSelectedRef.current = true;
      const top = summary.topState;
      setSelected({
        kind: 'state',
        title: top.state,
        subtitle: 'Indian State • #1 Demand Region',
        rank: 1,
        orderCount: top.orderCount,
        totalRevenue: top.totalRevenue,
        uniqueCustomers: top.uniqueCustomers,
        averageOrderValue: top.averageOrderValue,
        orderShare: top.orderShare,
        revenueShare: top.revenueShare,
        topCities: top.topCities,
        latestOrderAt: top.latestOrderAt,
      });
    }
  }, [summary]);

  // Initialize Leaflet map instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [22.8, 79.0],
      zoom: 4.4,
      minZoom: 2,
      maxZoom: 16,
      zoomControl: false,
      worldCopyJump: true,
      attributionControl: true,
    });

    mapRef.current = map;

    // Create dedicated layer panes so City markers stay above State borders
    map.createPane('worldPane');
    map.getPane('worldPane')!.style.zIndex = '350';
    map.createPane('indiaPane');
    map.getPane('indiaPane')!.style.zIndex = '400';
    map.createPane('cityPane');
    map.getPane('cityPane')!.style.zIndex = '500';

    cityLayerRef.current = L.layerGroup([], { pane: 'cityPane' }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      worldLayerRef.current = null;
      indiaLayerRef.current = null;
      cityLayerRef.current = null;
      stateLayersByKeyRef.current.clear();
    };
  }, []);

  // Handle container resize cleanly when expanded/collapsed
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      map.invalidateSize({ animate: true });
    }, 180);
    return () => clearTimeout(t);
  }, [isExpanded]);

  // Update Base Tile Layer when tileMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (tileMode !== 'vector') {
      const cfg = TILE_CONFIGS[tileMode];
      const tl = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
      });
      tl.addTo(map);
      tileLayerRef.current = tl;
    }
  }, [tileMode]);

  // Render World Countries GeoJSON Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !worldGeo) return;

    if (worldLayerRef.current) {
      map.removeLayer(worldLayerRef.current);
      worldLayerRef.current = null;
    }

    const layer = L.geoJSON(worldGeo, {
      pane: 'worldPane',
      style: featureItem => {
        const name = String(featureItem?.properties?.name || '');
        const match = stateLookup.get(canonicalStateKey(name));
        if (match) {
          return {
            fillColor: '#183D32',
            fillOpacity: tileMode === 'satellite' ? 0.45 : 0.6,
            color: '#C8A96B',
            weight: 1.5,
          };
        }
        return {
          fillColor: tileMode === 'vector' ? '#EFECE4' : '#E2DDD2',
          fillOpacity: tileMode === 'vector' ? 0.85 : tileMode === 'satellite' ? 0.05 : 0.14,
          color: tileMode === 'satellite' ? '#C8A96B' : '#B8B3A6',
          weight: tileMode === 'vector' ? 0.8 : 0.6,
        };
      },
      onEachFeature: (featureItem, lyr) => {
        const name = String(featureItem?.properties?.name || 'Country');
        const match = stateLookup.get(canonicalStateKey(name));

        const tooltipHtml = match
          ? `<div style="min-width:170px">
              <div style="font-weight:700;color:#C8A96B;font-size:12px;margin-bottom:3px">${name} <span style="background:#C8A96B;color:#183D32;padding:1px 5px;border-radius:99px;font-size:9px;margin-left:4px">#${match.rank}</span></div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Orders:</span><strong>${match.stat.orderCount}</strong></div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Revenue:</span><strong>${formatINR(match.stat.totalRevenue)}</strong></div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Customers:</span><strong>${match.stat.uniqueCustomers}</strong></div>
            </div>`
          : `<div style="font-size:11px"><strong style="color:#C8A96B">${name}</strong><div style="color:#D1D5DB;font-size:10px">No orders recorded yet</div></div>`;

        lyr.bindTooltip(tooltipHtml, {
          sticky: true,
          className: 'rh-map-tooltip',
          direction: 'top',
          offset: [0, -6],
        });

        lyr.on({
          mouseover: e => {
            const target = e.target as L.Path;
            target.setStyle({
              weight: 1.8,
              color: '#C8A96B',
              fillOpacity: match ? 0.72 : 0.35,
            });
          },
          mouseout: e => {
            layer.resetStyle(e.target);
          },
          click: () => {
            if ('getBounds' in lyr && typeof (lyr as any).getBounds === 'function') {
              map.fitBounds((lyr as any).getBounds(), { padding: [30, 30], maxZoom: 6 });
            }
            setSelected({
              kind: 'country',
              title: name,
              subtitle: match ? `International Market • #${match.rank} Region` : 'International Region (0 Orders)',
              rank: match ? match.rank : null,
              orderCount: match?.stat.orderCount || 0,
              totalRevenue: match?.stat.totalRevenue || 0,
              uniqueCustomers: match?.stat.uniqueCustomers || 0,
              averageOrderValue: match?.stat.averageOrderValue || 0,
              orderShare: match?.stat.orderShare || 0,
              revenueShare: match?.stat.revenueShare || 0,
              topCities: match?.stat.topCities || [],
              latestOrderAt: match?.stat.latestOrderAt,
            });
          },
        });
      },
    });

    layer.addTo(map);
    worldLayerRef.current = layer;
  }, [worldGeo, stateLookup, tileMode]);

  // Render Indian States & UTs Choropleth GeoJSON Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !indiaGeo) return;

    if (indiaLayerRef.current) {
      map.removeLayer(indiaLayerRef.current);
      indiaLayerRef.current = null;
    }
    stateLayersByKeyRef.current.clear();

    const layer = L.geoJSON(indiaGeo, {
      pane: 'indiaPane',
      style: featureItem => {
        const rawName = String(featureItem?.properties?.ST_NM || '');
        const key = canonicalStateKey(rawName);
        const match = stateLookup.get(key);
        const isSelected = selected?.kind === 'state' && canonicalStateKey(selected.title) === key;

        if (match) {
          const ratio = match.stat.orderCount / maxStateOrders;
          let fillColor = '#4B8B73';
          if (match.rank === 1) fillColor = '#183D32';
          else if (ratio >= 0.55) fillColor = '#1F4E3F';
          else if (ratio >= 0.25) fillColor = '#2E6B56';

          return {
            fillColor,
            fillOpacity: isSelected ? 0.78 : tileMode === 'satellite' ? 0.55 : 0.65,
            color: isSelected || match.rank === 1 ? '#C8A96B' : '#F8F6F0',
            weight: isSelected ? 2.8 : match.rank === 1 ? 2.2 : 1.4,
          };
        }

        return {
          fillColor: tileMode === 'vector' ? '#FAF8F3' : '#EFECE4',
          fillOpacity: isSelected ? 0.55 : tileMode === 'vector' ? 0.92 : tileMode === 'satellite' ? 0.12 : 0.3,
          color: isSelected ? '#C8A96B' : tileMode === 'satellite' ? '#E5DEC9' : '#6B7280',
          weight: isSelected ? 2.2 : 0.9,
          dashArray: isSelected ? undefined : '2,2',
        };
      },
      onEachFeature: (featureItem, lyr) => {
        const rawName = String(featureItem?.properties?.ST_NM || 'State');
        const key = canonicalStateKey(rawName);
        stateLayersByKeyRef.current.set(key, lyr);
        const match = stateLookup.get(key);

        const topCitiesHtml =
          match && match.stat.topCities.length > 0
            ? `<div style="margin-top:5px;padding-top:4px;border-top:1px solid rgba(200,169,107,0.3);font-size:10px;color:#E8D5A7">
                Top Cities: ${match.stat.topCities.map(c => `${c.city} (${c.count})`).join(', ')}
              </div>`
            : '';

        const tooltipHtml = match
          ? `<div style="min-width:190px">
              <div style="font-weight:700;color:#C8A96B;font-size:12px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span>${match.stat.state}</span>
                <span style="background:#C8A96B;color:#183D32;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:800">#${match.rank}</span>
              </div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Orders:</span><strong>${match.stat.orderCount} (${match.stat.orderShare}%)</strong></div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Revenue:</span><strong style="color:#FDE68A">${formatINR(match.stat.totalRevenue)}</strong></div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Customers:</span><strong>${match.stat.uniqueCustomers}</strong></div>
              <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Avg Order Value:</span><strong>${formatINR(match.stat.averageOrderValue)}</strong></div>
              ${topCitiesHtml}
            </div>`
          : `<div style="min-width:150px">
              <div style="font-weight:700;color:#C8A96B;font-size:12px">${rawName}</div>
              <div style="color:#E5E7EB;font-size:10px;margin-top:2px">Indian State / UT • 0 Orders yet</div>
              <div style="color:#9CA3AF;font-size:9px;margin-top:2px">Click to inspect region</div>
            </div>`;

        lyr.bindTooltip(tooltipHtml, {
          sticky: true,
          className: 'rh-map-tooltip',
          direction: 'top',
          offset: [0, -8],
        });

        lyr.on({
          mouseover: e => {
            const target = e.target as L.Path;
            target.setStyle({
              weight: 2.5,
              color: '#C8A96B',
              fillOpacity: match ? 0.82 : 0.45,
              dashArray: undefined,
            });
            if (!L.Browser.ie && !L.Browser.edge) {
              target.bringToFront();
            }
          },
          mouseout: e => {
            layer.resetStyle(e.target);
          },
          click: () => {
            if ('getBounds' in lyr && typeof (lyr as any).getBounds === 'function') {
              map.fitBounds((lyr as any).getBounds(), { padding: [36, 36], maxZoom: 7 });
            }
            setSelected({
              kind: 'state',
              title: match?.stat.state || rawName,
              subtitle: match ? `Indian State • #${match.rank} Demand Region` : 'Indian State / UT • Expansion Opportunity',
              rank: match ? match.rank : null,
              orderCount: match?.stat.orderCount || 0,
              totalRevenue: match?.stat.totalRevenue || 0,
              uniqueCustomers: match?.stat.uniqueCustomers || 0,
              averageOrderValue: match?.stat.averageOrderValue || 0,
              orderShare: match?.stat.orderShare || 0,
              revenueShare: match?.stat.revenueShare || 0,
              topCities: match?.stat.topCities || [],
              latestOrderAt: match?.stat.latestOrderAt,
            });
          },
        });
      },
    });

    layer.addTo(map);
    indiaLayerRef.current = layer;
  }, [indiaGeo, stateLookup, maxStateOrders, tileMode, selected]);

  // Render City Markers on City Pane
  useEffect(() => {
    const map = mapRef.current;
    const group = cityLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    if (!showCities) return;

    cities.forEach(ct => {
      const coords = resolveCityCoordinates(ct.city, ct.state);
      if (!coords) return;

      const rank = cityRankMap.get(`${ct.city.toLowerCase()}::${canonicalStateKey(ct.state)}`) || null;
      const ratio = ct.orderCount / maxCityOrders;
      const radius = Math.max(7, Math.min(18, Math.round(7 + ratio * 11)));

      // Pulsing outer halo for Home Mandi (Surat) or #1 City
      if (ct.isSurat || rank === 1) {
        const pulseIcon = L.divIcon({
          className: 'rh-city-pulse',
          html: `<div style="width:${radius * 2 + 12}px;height:${radius * 2 + 12}px;border-radius:9999px;border:2px solid #C8A96B;background:rgba(200,169,107,0.22);animation:ping 2.2s cubic-bezier(0,0,0.2,1) infinite;"></div>`,
          iconSize: [radius * 2 + 12, radius * 2 + 12],
          iconAnchor: [radius + 6, radius + 6],
        });
        L.marker(coords, { icon: pulseIcon, interactive: false, pane: 'cityPane' }).addTo(group);
      }

      const circle = L.circleMarker(coords, {
        pane: 'cityPane',
        radius,
        fillColor: ct.isSurat ? '#C8A96B' : '#183D32',
        color: '#FFFFFF',
        weight: 2.2,
        opacity: 1,
        fillOpacity: 0.95,
      });

      const tooltipHtml = `<div style="min-width:185px">
        <div style="font-weight:700;color:#C8A96B;font-size:12px;margin-bottom:3px;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${ct.city}, ${ct.state}</span>
          ${rank ? `<span style="background:#C8A96B;color:#183D32;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:800">#${rank}</span>` : ''}
        </div>
        ${ct.isSurat ? '<div style="font-size:10px;color:#86EFAC;font-weight:600;margin-bottom:4px">🏠 Home Mandi • ₹0 Free Shipping</div>' : '<div style="font-size:10px;color:#D1D5DB;margin-bottom:4px">🚚 Interstate Delivery Hub</div>'}
        <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Orders:</span><strong>${ct.orderCount} (${ct.orderShare}%)</strong></div>
        <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Revenue:</span><strong style="color:#FDE68A">${formatINR(ct.totalRevenue)}</strong></div>
        <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Customers:</span><strong>${ct.uniqueCustomers}</strong></div>
        <div style="font-size:11px;display:flex;justify-content:space-between;gap:12px"><span>Avg Order Value:</span><strong>${formatINR(ct.averageOrderValue)}</strong></div>
      </div>`;

      circle.bindTooltip(tooltipHtml, {
        className: 'rh-map-tooltip',
        direction: 'top',
        offset: [0, -radius],
      });

      circle.on('click', () => {
        map.flyTo(coords, 8, { duration: 0.7 });
        setSelected({
          kind: 'city',
          title: ct.city,
          subtitle: `${ct.state}${ct.isSurat ? ' • Home Mandi Hub' : ' • City Hub'}`,
          rank,
          orderCount: ct.orderCount,
          totalRevenue: ct.totalRevenue,
          uniqueCustomers: ct.uniqueCustomers,
          averageOrderValue: ct.averageOrderValue,
          orderShare: ct.orderShare,
          revenueShare: ct.revenueShare,
          isSurat: ct.isSurat,
          latestOrderAt: ct.latestOrderAt,
        });
      });

      circle.addTo(group);

      // Permanent subtle city label
      const labelIcon = L.divIcon({
        className: 'rh-city-label',
        html: `<div style="white-space:nowrap;font-size:10px;font-weight:700;color:#183D32;background:rgba(255,255,255,0.92);border:1px solid ${
          ct.isSurat ? '#C8A96B' : '#E9E4D9'
        };padding:1px 6px;border-radius:99px;box-shadow:0 1px 4px rgba(0,0,0,0.12);transform:translate(-50%, ${
          radius + 4
        }px);display:inline-flex;align-items:center;gap:4px;"><span>${ct.city}</span><span style="color:#8F6C2B;font-weight:800">${
          ct.orderCount
        }</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(coords, { icon: labelIcon, interactive: false, pane: 'cityPane' }).addTo(group);
    });
  }, [cities, cityRankMap, maxCityOrders, showCities]);

  // Handle external focus trigger (e.g., clicking a State or City in Rankings table below)
  useEffect(() => {
    if (!focusedLocation || !mapRef.current) return;
    const map = mapRef.current;

    if (focusedLocation.type === 'state') {
      const key = canonicalStateKey(focusedLocation.name);
      const lyr = stateLayersByKeyRef.current.get(key);
      const match = stateLookup.get(key);
      if (lyr && 'getBounds' in lyr && typeof (lyr as any).getBounds === 'function') {
        map.fitBounds((lyr as any).getBounds(), { padding: [36, 36], maxZoom: 7 });
      } else if (INDIA_STATE_COORDINATES[key]) {
        map.flyTo(INDIA_STATE_COORDINATES[key], 6.5, { duration: 0.7 });
      }
      setSelected({
        kind: 'state',
        title: match?.stat.state || focusedLocation.name,
        subtitle: match ? `Indian State • #${match.rank} Demand Region` : 'Indian State / UT',
        rank: match ? match.rank : null,
        orderCount: match?.stat.orderCount || 0,
        totalRevenue: match?.stat.totalRevenue || 0,
        uniqueCustomers: match?.stat.uniqueCustomers || 0,
        averageOrderValue: match?.stat.averageOrderValue || 0,
        orderShare: match?.stat.orderShare || 0,
        revenueShare: match?.stat.revenueShare || 0,
        topCities: match?.stat.topCities || [],
        latestOrderAt: match?.stat.latestOrderAt,
      });
    } else if (focusedLocation.type === 'city') {
      const coords = resolveCityCoordinates(focusedLocation.name, focusedLocation.state || '');
      if (coords) {
        map.flyTo(coords, 8, { duration: 0.7 });
      }
      const ct = cities.find(
        c =>
          c.city.toLowerCase() === focusedLocation.name.toLowerCase() &&
          (!focusedLocation.state || canonicalStateKey(c.state) === canonicalStateKey(focusedLocation.state))
      );
      if (ct) {
        const rank = cityRankMap.get(`${ct.city.toLowerCase()}::${canonicalStateKey(ct.state)}`) || null;
        setSelected({
          kind: 'city',
          title: ct.city,
          subtitle: `${ct.state}${ct.isSurat ? ' • Home Mandi Hub' : ' • City Hub'}`,
          rank,
          orderCount: ct.orderCount,
          totalRevenue: ct.totalRevenue,
          uniqueCustomers: ct.uniqueCustomers,
          averageOrderValue: ct.averageOrderValue,
          orderShare: ct.orderShare,
          revenueShare: ct.revenueShare,
          isSurat: ct.isSurat,
          latestOrderAt: ct.latestOrderAt,
        });
      }
    }
  }, [focusedLocation, stateLookup, cities, cityRankMap]);

  const handlePresetView = (preset: ViewPreset) => {
    setViewPreset(preset);
    const map = mapRef.current;
    if (!map) return;

    if (preset === 'india') {
      map.flyTo([22.8, 79.0], 4.4, { duration: 0.7 });
    } else if (preset === 'world') {
      map.flyTo([20.0, 15.0], 2, { duration: 0.7 });
    } else if (preset === 'surat') {
      map.flyTo([21.1702, 72.8311], 9, { duration: 0.8 });
      const suratCity = cities.find(c => c.isSurat);
      if (suratCity) {
        setSelected({
          kind: 'city',
          title: suratCity.city,
          subtitle: `${suratCity.state} • Home Mandi Hub`,
          rank: cityRankMap.get(`${suratCity.city.toLowerCase()}::${canonicalStateKey(suratCity.state)}`) || 1,
          orderCount: suratCity.orderCount,
          totalRevenue: suratCity.totalRevenue,
          uniqueCustomers: suratCity.uniqueCustomers,
          averageOrderValue: suratCity.averageOrderValue,
          orderShare: suratCity.orderShare,
          revenueShare: suratCity.revenueShare,
          isSurat: true,
          latestOrderAt: suratCity.latestOrderAt,
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <style>{`
        .rh-map-tooltip {
          background-color: #183D32 !important;
          color: #F8F6F0 !important;
          border: 1px solid #C8A96B !important;
          border-radius: 12px !important;
          padding: 8px 11px !important;
          box-shadow: 0 10px 25px rgba(24, 61, 50, 0.25) !important;
          font-family: inherit !important;
        }
        .rh-map-tooltip::before {
          border-top-color: #C8A96B !important;
        }
        .leaflet-container {
          font-family: inherit !important;
          background: ${tileMode === 'vector' ? '#EAF2FA' : '#F3F1EC'} !important;
        }
      `}</style>

      {/* Top Interactive Map Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#183D32]">
              Interactive World &amp; Indian States Order Map
            </h3>
            <span className="text-[11px] text-[#8F6C2B] font-semibold bg-[#FAF3E3] px-2.5 py-0.5 rounded-full border border-[#E8D5A7]">
              {states.length} Active {states.length === 1 ? 'State' : 'States'} &bull; {cities.length}{' '}
              {cities.length === 1 ? 'City' : 'Cities'}
            </span>
          </div>
          <p className="text-xs text-[#888B83] mt-0.5">
            Pan, zoom, hover, or click any Indian State, Country, or City pin for live order &amp; revenue telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Presets */}
          <div className="inline-flex items-center gap-1 bg-[#F8F6F0] border border-[#E9E4D9] rounded-xl p-1 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => handlePresetView('india')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                viewPreset === 'india'
                  ? 'bg-[#183D32] text-white shadow-xs'
                  : 'text-[#5C6058] hover:text-[#183D32]'
              }`}
              title="Focus on Indian States"
            >
              <MapPin className="w-3 h-3 text-[#C8A96B]" />
              <span>India States</span>
            </button>
            <button
              type="button"
              onClick={() => handlePresetView('world')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                viewPreset === 'world'
                  ? 'bg-[#183D32] text-white shadow-xs'
                  : 'text-[#5C6058] hover:text-[#183D32]'
              }`}
              title="Zoom out to full World Map"
            >
              <Globe className="w-3 h-3 text-[#C8A96B]" />
              <span>World</span>
            </button>
            <button
              type="button"
              onClick={() => handlePresetView('surat')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                viewPreset === 'surat'
                  ? 'bg-[#183D32] text-white shadow-xs'
                  : 'text-[#5C6058] hover:text-[#183D32]'
              }`}
              title="Fly to Surat Home Mandi"
            >
              <Home className="w-3 h-3 text-[#C8A96B]" />
              <span>Surat Hub</span>
            </button>
          </div>

          {/* Map Layer Switcher */}
          <div className="inline-flex items-center gap-1 bg-[#F8F6F0] border border-[#E9E4D9] rounded-xl p-1 text-[11px]">
            <Layers className="w-3.5 h-3.5 text-[#8F6C2B] ml-1.5 mr-0.5" />
            {(
              [
                { id: 'atlas', label: 'Atlas' },
                { id: 'light', label: 'Light' },
                { id: 'satellite', label: 'Satellite' },
                { id: 'vector', label: 'Vector' },
              ] as const
            ).map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTileMode(m.id)}
                className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                  tileMode === m.id
                    ? 'bg-white text-[#183D32] font-semibold shadow-xs border border-[#E9E4D9]'
                    : 'text-[#5C6058] hover:text-[#183D32]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Toggle City Pins */}
          <button
            type="button"
            onClick={() => setShowCities(v => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border cursor-pointer transition-colors ${
              showCities
                ? 'bg-[#E7F3EE] text-[#183D32] border-[#B7DEC9]'
                : 'bg-white text-[#5C6058] border-[#E9E4D9]'
            }`}
            title="Show or hide City Hub Pins"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>City Pins</span>
          </button>

          {/* Expand Width Toggle */}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="p-1.5 rounded-xl border border-[#E9E4D9] bg-white text-[#5C6058] hover:text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer transition-colors"
              title={isExpanded ? 'Compact Map Width' : 'Expand Map Full Width'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Main Map Container + Inspector Drawer */}
      <div className="relative flex-1 min-h-[430px] sm:min-h-[480px] rounded-2xl overflow-hidden border border-[#E9E4D9] bg-[#EAF2FA] shadow-inner">
        <div ref={containerRef} className="w-full h-full min-h-[430px] sm:min-h-[480px] z-0" />

        {/* Custom Zoom Controls (Top Left) */}
        <div className="absolute top-3 left-3 z-[600] flex flex-col bg-white/95 backdrop-blur-sm border border-[#E9E4D9] rounded-xl shadow-md overflow-hidden">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="p-2 text-[#183D32] hover:bg-[#F8F6F0] border-b border-[#E9E4D9] cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="p-2 text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Choropleth Legend (Bottom Left) */}
        <div className="absolute bottom-3 left-3 z-[600] hidden sm:flex items-center gap-3 px-3 py-2 rounded-xl bg-white/95 backdrop-blur-sm border border-[#E9E4D9] shadow-md text-[10px] text-[#5C6058]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#183D32] border border-[#C8A96B]" />
            <span className="font-semibold text-[#183D32]">#1 Top State</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#2E6B56]" />
            <span>Active Orders</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#EFECE4] border border-[#9CA3AF]" />
            <span>0 Orders</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#C8A96B] border border-white shadow-xs" />
            <span>Home Mandi</span>
          </div>
        </div>

        {/* Selected Region / State / City Proper Details Panel (Top Right / Bottom Right) */}
        {selected && (
          <div
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            className="absolute top-3 right-3 z-[600] w-72 sm:w-80 max-w-[calc(100%-1.5rem)] rounded-2xl bg-white/95 backdrop-blur-md border border-[#C8A96B]/60 shadow-xl p-4 text-xs"
          >
            <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#E9E4D9]">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {selected.rank ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#183D32] text-[#C8A96B]">
                      <Award className="w-2.5 h-2.5" /> #{selected.rank}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F3F1EC] text-[#5C6058]">
                      Untapped
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-[#888B83] uppercase tracking-wider truncate">
                    {selected.kind === 'city'
                      ? 'City Hub'
                      : selected.kind === 'country'
                        ? 'Country'
                        : 'Indian State'}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#183D32] truncate mt-1">{selected.title}</h4>
                <p className="text-[11px] text-[#5C6058] truncate">{selected.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setSelected(null);
                }}
                className="p-1.5 rounded-lg text-[#888B83] hover:text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer transition-colors"
                title="Close details panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4 Key Telemetry Tiles */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]/80">
                <div className="flex items-center gap-1 text-[10px] text-[#888B83]">
                  <ShoppingBag className="w-3 h-3 text-[#183D32]" />
                  <span>Orders</span>
                </div>
                <div className="text-sm font-bold text-[#183D32] mt-0.5">
                  {selected.orderCount}{' '}
                  <span className="text-[10px] font-medium text-[#8F6C2B]">({selected.orderShare}%)</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#FAF3E3]/70 border border-[#E8D5A7]/80">
                <div className="flex items-center gap-1 text-[10px] text-[#888B83]">
                  <IndianRupee className="w-3 h-3 text-[#8F6C2B]" />
                  <span>Revenue</span>
                </div>
                <div className="text-sm font-bold text-[#8F6C2B] mt-0.5">
                  {formatINR(selected.totalRevenue)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]/80">
                <div className="flex items-center gap-1 text-[10px] text-[#888B83]">
                  <Users className="w-3 h-3 text-[#183D32]" />
                  <span>Customers</span>
                </div>
                <div className="text-sm font-bold text-[#183D32] mt-0.5">{selected.uniqueCustomers}</div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]/80">
                <div className="flex items-center gap-1 text-[10px] text-[#888B83]">
                  <TrendingUp className="w-3 h-3 text-[#245746]" />
                  <span>Avg Order Value</span>
                </div>
                <div className="text-sm font-bold text-[#183D32] mt-0.5">
                  {formatINR(selected.averageOrderValue)}
                </div>
              </div>
            </div>

            {/* Shipping Zone Badge for City */}
            {selected.kind === 'city' && (
              <div className="mt-2.5 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#E7F3EE]/70 border border-[#B7DEC9]/60 text-[11px]">
                <span className="text-[#5C6058] font-medium">Shipping Zone</span>
                {selected.isSurat ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#183D32]">
                    <Truck className="w-3 h-3" /> Surat ₹0 Free
                  </span>
                ) : (
                  <span className="font-semibold text-[#5C6058]">Interstate / ₹158</span>
                )}
              </div>
            )}

            {/* Top Cities in Selected State */}
            {selected.topCities && selected.topCities.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-[#E9E4D9]">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#888B83] mb-1.5">
                  Top Cities in {selected.title}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.topCities.map(c => (
                    <button
                      key={c.city}
                      type="button"
                      onClick={() => {
                        const coords = resolveCityCoordinates(c.city, selected.title);
                        if (coords && mapRef.current) {
                          mapRef.current.flyTo(coords, 8.5, { duration: 0.7 });
                        }
                        const ctMatch = cities.find(
                          ct =>
                            ct.city.toLowerCase() === c.city.toLowerCase() &&
                            canonicalStateKey(ct.state) === canonicalStateKey(selected.title)
                        );
                        if (ctMatch) {
                          setSelected({
                            kind: 'city',
                            title: ctMatch.city,
                            subtitle: `${ctMatch.state}${ctMatch.isSurat ? ' • Home Mandi Hub' : ' • City Hub'}`,
                            rank:
                              cityRankMap.get(
                                `${ctMatch.city.toLowerCase()}::${canonicalStateKey(ctMatch.state)}`
                              ) || null,
                            orderCount: ctMatch.orderCount,
                            totalRevenue: ctMatch.totalRevenue,
                            uniqueCustomers: ctMatch.uniqueCustomers,
                            averageOrderValue: ctMatch.averageOrderValue,
                            orderShare: ctMatch.orderShare,
                            revenueShare: ctMatch.revenueShare,
                            isSurat: ctMatch.isSurat,
                            latestOrderAt: ctMatch.latestOrderAt,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F8F6F0] hover:bg-[#E7F3EE] border border-[#E9E4D9] hover:border-[#B7DEC9] text-[11px] text-[#183D32] font-medium cursor-pointer transition-colors"
                    >
                      <MapPin className="w-3 h-3 text-[#C8A96B]" />
                      <span>{c.city}</span>
                      <span className="font-bold text-[#8F6C2B]">({c.count})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Link */}
            <div className="mt-3 pt-2.5 border-t border-[#E9E4D9] flex items-center justify-between text-[11px]">
              <span className="text-[#888B83]">
                {selected.latestOrderAt
                  ? `Latest: ${new Date(selected.latestOrderAt).toLocaleDateString('en-IN')}`
                  : 'Click any region to explore'}
              </span>
              {selected.orderCount > 0 && (
                <Link
                  to="/admin/orders"
                  className="inline-flex items-center gap-0.5 font-semibold text-[#183D32] hover:text-[#8F6C2B] transition-colors"
                >
                  <span>Inspect Orders</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
