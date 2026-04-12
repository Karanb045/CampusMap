// src/components/CampusMap.jsx

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, TileLayer, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import ditBuildings from '../data/ditBuildings.json';

// IDs of buildings that have a GeoJSON polygon
const GEOJSON_BUILDING_IDS = new Set(
  (ditBuildings?.features ?? []).map(f => f?.properties?.id).filter(Boolean)
);

const CATEGORY_COLORS = {
  academic: '#378ADD',
  admin:    '#7F77DD',
  amenity:  '#1D9E75',
  hostel:   '#BA7517',
  sports:   '#D85A30',
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#64748b';
}

function createPoiIcon(color, label = '') {
  const svg = `
    <div style="position:relative;text-align:center;width:28px;height:36px;">
      <svg width="28" height="36" viewBox="0 0 28 36"
        xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 35c6.8-9.3 10.2-15.6 10.2-20.2C24.2 7
          19.6 2.5 14 2.5S3.8 7 3.8 14.8C3.8 19.4 7.2 25.7
          14 35z" fill="${color}"/>
        <circle cx="14" cy="14.4" r="5.2" fill="white"
          fill-opacity="0.92"/>
      </svg>
      ${label ? `<div style="position:absolute;top:40px;
        left:50%;transform:translateX(-50%);background:white;
        padding:2px 6px;border-radius:4px;font-size:11px;
        font-weight:bold;color:#1f2937;white-space:nowrap;
        box-shadow:0 2px 4px rgba(0,0,0,0.1);
        border:1px solid #e5e7eb;">${label}</div>` : ''}
    </div>
  `.trim();

  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
}

const BuildingsGeoJSON = memo(function BuildingsGeoJSON({ data, style, onEachFeature }) {
  return <GeoJSON data={data} style={style} onEachFeature={onEachFeature} />;
});

export default function CampusMap({
  pois        = [],
  routePath   = [],   // FIX: default [] not null — was crashing at routePath.length
  userLocation = null,
  flyTarget    = null,
  isVisible    = true,
  showRoute    = true,
  showUserLocation = true,
  showLocationButton = true,
  onBuildingClick,
  onPOIClick,
  buildings   = [],
}) {
  const mapRef              = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  // FIX: locationError state so we can show feedback without calling undefined showToast
  const [locationError, setLocationError] = useState('');

  // Global label click handler for inline HTML onclick
  useEffect(() => {
    // CHANGED: pass only { id } so App.jsx looks up full building from Firestore
    window.labelClick = (id) => {
      if (typeof onBuildingClick === 'function') {
        onBuildingClick({ id });
      }
    };
    return () => { delete window.labelClick; };
  }, [onBuildingClick]);

  // Derive center + bounds from GeoJSON polygons
  const { center, bounds } = useMemo(() => {
    let minLat = Infinity, minLng = Infinity;
    let maxLat = -Infinity, maxLng = -Infinity;

    for (const f of ditBuildings?.features ?? []) {
      const ring = f?.geometry?.coordinates?.[0];
      if (!Array.isArray(ring)) continue;
      for (const [lng, lat] of ring) {
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        minLat = Math.min(minLat, lat);
        minLng = Math.min(minLng, lng);
        maxLat = Math.max(maxLat, lat);
        maxLng = Math.max(maxLng, lng);
      }
    }

    if (!Number.isFinite(minLat)) {
      minLat = 30.3960;
      minLng = 78.0730;
      maxLat = 30.4020;
      maxLng = 78.0790;
    }

    if (
      userLocation &&
      typeof userLocation.lat === 'number' &&
      typeof userLocation.lng === 'number'
    ) {
      minLat = Math.min(minLat, userLocation.lat);
      minLng = Math.min(minLng, userLocation.lng);
      maxLat = Math.max(maxLat, userLocation.lat);
      maxLng = Math.max(maxLng, userLocation.lng);
    }

    const pad = 0.002;
    return {
      center: [30.3990, 78.0755],
      bounds: [[minLat - pad, minLng - pad], [maxLat + pad, maxLng + pad]],
    };
  }, [userLocation]);

  // Reliable resize after map is ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const doResize = () => map.invalidateSize({ animate: false });

    doResize();
    requestAnimationFrame(doResize);
    const t1 = setTimeout(doResize, 100);
    const t2 = setTimeout(doResize, 400);

    let ro;
    const container = map.getContainer();
    if (container && window.ResizeObserver) {
      ro = new ResizeObserver(() => requestAnimationFrame(doResize));
      ro.observe(container);
    }

    const onVisible = () => { if (!document.hidden) doResize(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mapReady]);

  // Fly to target
  useEffect(() => {
    if (!flyTarget || !mapRef.current) return;
    mapRef.current.flyTo(
      [flyTarget.lat, flyTarget.lng],
      flyTarget.zoom ?? 19,
      { animate: true, duration: 1.2 }
    );
  }, [flyTarget]);

  // When map tab becomes visible on mobile, force Leaflet to recalculate tile sizes.
  useEffect(() => {
    if (!isVisible || !mapRef.current) return;
    const map = mapRef.current;
    const doResize = () => map.invalidateSize({ animate: false });

    requestAnimationFrame(doResize);
    const t1 = setTimeout(doResize, 80);
    const t2 = setTimeout(doResize, 220);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isVisible]);

  // Building polygon style
  const buildingStyle = useMemo(() => () => ({
    color:       '#ffffff',
    weight:      2,
    opacity:     1,
    fillColor:   '#378ADD',
    fillOpacity: 0.35,
  }), []);

  // Per-feature style using feature's own category
  const buildingStyleFn = useMemo(() => (feature) => ({
    color:       '#ffffff',
    weight:      2,
    opacity:     1,
    fillColor:   getCategoryColor(feature?.properties?.category),
    fillOpacity: 0.4,
  }), []);

  // Per-feature event handlers + labels
  // CHANGED: onBuildingClick now passes only { id } — App.jsx looks up Firestore data
  const onEachBuilding = useMemo(() => (feature, layer) => {
    const buildingName = feature?.properties?.name ?? '';
    const buildingId   = feature?.properties?.id   ?? '';

    // Compute polygon centre for label placement
    const ring = feature?.geometry?.coordinates?.[0];
    if (Array.isArray(ring) && ring.length > 0 && buildingName) {
      const sumLat = ring.reduce((s, c) => s + (c[1] ?? 0), 0);
      const sumLng = ring.reduce((s, c) => s + (c[0] ?? 0), 0);
      layer._buildingLabel = {
        name:   buildingName,
        id:     buildingId,
        center: [sumLat / ring.length, sumLng / ring.length],
      };
    }

    layer.on({
      mouseover: () => { layer.setStyle({ fillOpacity: 0.65 }); layer.bringToFront?.(); },
      mouseout:  () =>   layer.setStyle({ fillOpacity: 0.4  }),

      // CHANGED: pass only { id } not full feature.properties
      click: () => onBuildingClick?.({ id: buildingId }),

      add: () => {
        if (!layer._buildingLabel || !layer._map) return;
        const { name, id, center } = layer._buildingLabel;

        const labelIcon = L.divIcon({
          className: 'building-label',
          html: `<div
            style="
              background: rgba(255,255,255,0.95);
              border: 2px solid #1B3A6B;
              border-radius: 6px;
              padding: 4px 10px;
              font-size: 11px;
              font-weight: 700;
              color: #1B3A6B;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(0,0,0,0.25);
              cursor: pointer;
              pointer-events: all;
              display: inline-block;
              transform: translateX(-50%);
            "
            onclick="window.labelClick && window.labelClick('${id}')"
            onmouseover="this.style.background='#1B3A6B';this.style.color='white';"
            onmouseout="this.style.background='rgba(255,255,255,0.95)';this.style.color='#1B3A6B';"
          >${name}</div>`,
          // iconSize null = Leaflet does not clip — content determines size
          // iconAnchor [0,0] because we use translateX(-50%) in CSS to center
          iconSize:   null,
          iconAnchor: [0, 10],
        });

        const labelMarker = L.marker(center, { icon: labelIcon });
        labelMarker.on('click', (e) => {
          e.originalEvent?.stopPropagation();
          onBuildingClick?.({ id });
        });
        labelMarker.addTo(layer._map);
        layer._labelMarker = labelMarker;
      },

      remove: () => {
        if (layer._labelMarker && layer._map) {
          layer._map.removeLayer(layer._labelMarker);
        }
      },
    });
  }, [onBuildingClick]);

  // FIX: safe routePath — guard against null/undefined from useRoute
  const safeRoutePath = Array.isArray(routePath) ? routePath : [];

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: '#f0f4f8' }}
      role="application"
      aria-label="DIT University campus map"
    >
      <style>{`
        .campus-route-line {
          animation: campus-route-dash 1.1s linear infinite;
        }
        @keyframes campus-route-dash {
          to { stroke-dashoffset: -32; }
        }
        .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          background: #f0f4f8 !important;
          z-index: 1 !important;
        }
        .building-label {
          background: transparent !important;
          border: none !important;
        }
      `}</style>

      <MapContainer
        center={center}
        zoom={17}
        zoomControl={false}
        minZoom={16}
        maxZoom={20}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        whenCreated={(map) => { mapRef.current = map; setMapReady(true); }}
      >
        <ZoomControl position="bottomright" />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />

        {/* Building polygons — GeoJSON for outlines, Firestore for data */}
        {ditBuildings && (
          <BuildingsGeoJSON
            data={ditBuildings}
            style={buildingStyleFn}
            onEachFeature={onEachBuilding}
          />
        )}

        {/* ── Pin markers for admin-added buildings (no GeoJSON polygon) ── */}
        {(pois ?? [])
          .filter(poi => !GEOJSON_BUILDING_IDS.has(poi.id))
          .map((poi) => {
            const { lat, lng } = poi ?? {};
            if (typeof lat !== 'number' || typeof lng !== 'number') return null;
            return (
              <Marker
                key={poi.id ?? `${lat},${lng}`}
                position={[lat, lng]}
                icon={createPoiIcon(getCategoryColor(poi.category), poi.name ?? '')}
                eventHandlers={{
                  click: () => {
                    navigator.vibrate?.(10);
                    onPOIClick?.(poi);
                  },
                }}
              />
            );
          })
        }

        {/* FIX: use safeRoutePath — never null, always array */}
        {showRoute && safeRoutePath.length >= 2 && (
          <Polyline
            positions={safeRoutePath}
            pathOptions={{
              color:     '#D85A30',
              weight:    4,
              dashArray: '10 6',
              lineCap:   'round',
              lineJoin:  'round',
            }}
            className="campus-route-line"
          />
        )}

        {/* User location dot */}
        {showUserLocation && userLocation &&
          typeof userLocation.lat === 'number' &&
          typeof userLocation.lng === 'number' && (
            <>
              <CircleMarker
                center={[userLocation.lat, userLocation.lng]}
                radius={14}
                pathOptions={{
                  color:       '#378ADD',
                  fillColor:   '#378ADD',
                  fillOpacity: 0.2,
                  weight:      0,
                }}
              />
              <CircleMarker
                center={[userLocation.lat, userLocation.lng]}
                radius={7}
                pathOptions={{
                  color:       '#ffffff',
                  fillColor:   '#1B3A6B',
                  fillOpacity: 1,
                  weight:      3,
                }}
              />
            </>
          )}
      </MapContainer>

      {/* Location button */}
      {/* FIX: removed call to undefined showToast — uses local locationError state */}
      {showLocationButton && (
      <button
        onClick={() => {
          setLocationError('');
          if (!navigator.geolocation) {
            setLocationError('Location not supported on this device');
            return;
          }
          navigator.geolocation.getCurrentPosition(
            pos => {
              const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              onPOIClick?.({ type: 'location', ...location });
            },
            error => {
              const msgs = {
                1: 'Location permission denied.',
                2: 'Location unavailable. Try again.',
                3: 'Location request timed out.',
              };
              setLocationError(msgs[error.code] || 'Location access denied');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
          );
        }}
        style={{
          position: 'absolute', bottom: '20px', left: '14px',
          width: '44px', height: '44px', background: 'white',
          border: '2px solid #1B3A6B', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        title="Get my location"
      >
        <svg viewBox="0 0 24 24" fill="none" style={{ width: '20px', height: '20px' }}>
          <circle cx="12" cy="12" r="3"  stroke="#1B3A6B" strokeWidth="2" fill="none" />
          <circle cx="12" cy="12" r="8"  stroke="#1B3A6B" strokeWidth="2" fill="none" opacity="0.5" />
          <circle cx="12" cy="12" r="1"  fill="#1B3A6B" />
        </svg>
      </button>
      )}

      {/* Location error toast */}
      {showLocationButton && locationError && (
        <div style={{
          position: 'absolute', bottom: '72px', left: '12px', zIndex: 1001,
          background: '#1B3A6B', color: 'white', fontSize: '12px',
          fontWeight: '600', padding: '8px 14px', borderRadius: '10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)', maxWidth: '220px',
        }}>
          {locationError}
        </div>
      )}
    </div>
  );
}