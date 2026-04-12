// d:\project\ProjectSE\src\components\SidePanel.jsx
import useMapStore from '../store/mapStore.js';

export default function SidePanel() {
  const {
    searchQuery,
    activeFilter,
    selectedBuilding,
    selectedFloor,
    selectedRoom,
    isPanelOpen
  } = useMapStore();

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Explore</h2>
        <span className="text-xs text-slate-500">{isPanelOpen ? 'Open' : 'Closed'}</span>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Search</span>
        <input
          value={searchQuery}
          readOnly
          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
          placeholder="Search buildings, rooms..."
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-slate-500">Filter</div>
          <div className="mt-1 font-semibold">{activeFilter}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-slate-500">Floor</div>
          <div className="mt-1 font-semibold">{selectedFloor}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-slate-500">Building</div>
          <div className="mt-1 font-semibold">{selectedBuilding ?? 'None'}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-slate-500">Room</div>
          <div className="mt-1 font-semibold">{selectedRoom ?? 'None'}</div>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        This is a scaffold panel. Next step: wire search, filters, routing, indoor navigation, and admin tools
        using Firestore + Storage.
      </p>
    </aside>
  );
}

