// d:\project\ProjectSE\src\components\MapView.jsx
import { MapContainer, TileLayer } from 'react-leaflet';
import { useMemo } from 'react';

export default function MapView() {
  const center = useMemo(() => [30.3969, 78.0743], []); // Dehradun approx (placeholder)

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Campus Map</h2>
        <span className="text-xs text-slate-500">Leaflet</span>
      </div>
      <div className="h-[72vh] w-full">
        <MapContainer center={center} zoom={16} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </MapContainer>
      </div>
    </section>
  );
}

