import { useEffect, useState } from 'react';
import { subscribeToBuildings, subscribeToRooms } from '../services/firestoreService';

export default function DirectoryPage({ buildings = [], rooms = [], onBuildingSelect }) {
  const [loading, setLoading] = useState(true);
  const [localBuildings, setLocalBuildings] = useState(buildings);
  const [localRooms, setLocalRooms] = useState(rooms);

  // If props are provided, use them instead of fetching
  useEffect(() => {
    if (buildings.length > 0 || rooms.length > 0) {
      setLocalBuildings(buildings);
      setLocalRooms(rooms);
      setLoading(false);
      return;
    }

    // Fallback to fetching if no props provided
    let unsubB = null;
    let unsubR = null;
    try {
      unsubB = subscribeToBuildings(setLocalBuildings);
      unsubR = subscribeToRooms(setLocalRooms);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }

    return () => {
      if (typeof unsubB === 'function') unsubB();
      if (typeof unsubR === 'function') unsubR();
    };
  }, [buildings, rooms]);

  useEffect(() => {
    if (localBuildings.length > 0 || localRooms.length > 0) setLoading(false);
  }, [localBuildings.length, localRooms.length]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <h1 className="text-lg font-extrabold text-slate-900">Directory</h1>
        <div className="mt-4 space-y-3">
          <div className="h-14 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-14 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-14 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (localBuildings.length === 0 && localRooms.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <h1 className="text-lg font-extrabold text-slate-900">Directory</h1>
        <div className="mt-8 text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-gray-400">
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No campus data yet</h3>
          <p className="text-gray-600">Admin needs to add buildings and rooms to the campus map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="text-lg font-extrabold text-slate-900">Directory</h1>
      <p className="mt-1 text-sm text-slate-600">
        {localBuildings.length} buildings, {localRooms.length} rooms.
      </p>

      {/* Buildings Section */}
      <div className="mt-6">
        <h2 className="text-base font-bold text-slate-900 mb-3">Buildings</h2>
        <div className="space-y-3">
          {localBuildings.map((building) => (
            <div
              key={building.id}
              onClick={() => {
                if (onBuildingSelect) {
                  onBuildingSelect(building);
                }
              }}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{building.name}</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {building.category} • {building.totalFloors || 1} floors
                  </p>
                  {building.description && (
                    <p className="text-sm text-slate-500 mt-1">{building.description}</p>
                  )}
                </div>
                <div className="text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rooms Section */}
      {localRooms.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-bold text-slate-900 mb-3">Rooms</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {localRooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold text-slate-900">{room.name}</h3>
                <p className="text-sm text-slate-600 mt-1">
                  {room.type} • {room.buildingName || 'Unknown Building'}
                </p>
                {room.inCharge && (
                  <p className="text-sm text-slate-500 mt-1">In charge: {room.inCharge}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

