// d:\project\ProjectSE\src\components\DetailPanel.jsx
import FloorPlanViewer from './FloorPlanViewer';
import { getLiveStatus } from '../utils/statusHelper.js';

function categoryStyles(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'academic') return 'bg-[#378ADD]/15 text-[#378ADD] border-[#378ADD]/20';
  if (c === 'admin') return 'bg-[#7F77DD]/15 text-[#7F77DD] border-[#7F77DD]/20';
  if (c === 'amenity') return 'bg-[#1D9E75]/15 text-[#1D9E75] border-[#1D9E75]/20';
  if (c === 'hostel') return 'bg-[#BA7517]/15 text-[#BA7517] border-[#BA7517]/20';
  if (c === 'sports') return 'bg-[#D85A30]/15 text-[#D85A30] border-[#D85A30]/20';
  return 'bg-slate-200 text-slate-700 border-slate-200';
}

function statusStyles(colour) {
  // WCAG: use dark primary teal (#1D9E75) with white text on white surfaces.
  if (colour === 'green') return 'bg-[#1D9E75] text-white border-[#1D9E75]';
  if (colour === 'amber') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function typeLabel(room) {
  const t = String(room?.type || room?.roomType || '').toLowerCase();
  if (!t) return 'Room';
  if (t.includes('lab')) return 'Lab';
  if (t.includes('class')) return 'Classroom';
  if (t.includes('office')) return 'Office';
  if (t.includes('amenity')) return 'Amenity';
  if (t.includes('wash')) return 'Washroom';
  return room.type || 'Room';
}

function WheelchairIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6a2 2 0 002 2h3l2 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21a6.5 6.5 0 116.2-8.5" />
    </svg>
  );
}

function Thumb({ url, name }) {
  return (
    <div className="h-24 w-24 overflow-hidden rounded-2xl bg-slate-100">
      {url ? (
        <img
          src={url}
          alt={name || 'Building'}
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs text-slate-500">No photo</div>
      )}
    </div>
  );
}

export default function DetailPanel({
  buildingName,
  building,
  floors,
  rooms,
  selectedRoom,
  onRoomSelect,
  onNavigate,
  selectedFloor,
  onFloorChange,
  open,
  onClose
}) {
  const buildingCategory = building?.category || 'academic';
  const buildingDescription = building?.description || '';
  const buildingPhoto =
    building?.photoUrl ||
    building?.photoURL ||
    building?.photoBase64 ||
    building?.thumbnailUrl ||
    building?.imageUrl ||
    null;

  const floorObj = Array.isArray(floors)
    ? floors.find((f) => (typeof f.floorNumber === 'number' ? f.floorNumber : f?.number) === selectedFloor)
    : null;
  const currentFloorPlanUrl = floorObj?.planImageData || floorObj?.planImageUrl || floorObj?.floorPlanUrl || null;

  const aboveGroundFloors = Math.max(0, Number(building?.totalFloors) || 0);
  const groundLabel = String(building?.groundLabel || 'G');
  const floorButtons = Array.from({ length: aboveGroundFloors + 1 }, (_, idx) =>
    idx === 0 ? groundLabel : String(idx)
  );
  const floorValue = (label) => (label === groundLabel ? 0 : Number(label));

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <div className="text-xs font-semibold text-slate-500">Details</div>
        <button
          type="button"
          className="rounded-xl px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          onClick={() => {
            if (typeof onClose === 'function') onClose();
          }}
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!selectedRoom ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              <Thumb url={buildingPhoto} name={buildingName} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-extrabold text-slate-900">{buildingName}</h3>
                  <span
                    className={[
                      'rounded-full border px-2 py-0.5 text-xs font-semibold',
                      categoryStyles(buildingCategory)
                    ].join(' ')}
                  >
                    {String(buildingCategory).toUpperCase()}
                  </span>
                </div>
                {buildingDescription && (
                  <p className="mt-2 text-sm leading-snug text-slate-600">{buildingDescription}</p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Floor</div>
              <div className="flex flex-wrap gap-2">
                {floorButtons.map((label) => {
                  const n = floorValue(label);
                  const active = n === selectedFloor;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active ? 'true' : 'false'}
                      onClick={() => {
                        if (typeof onFloorChange === 'function') {
                          onFloorChange(n);
                        }
                      }}
                      className={[
                        'h-8 rounded-full px-4 text-xs font-extrabold transition',
                        active
                          ? 'bg-primary text-white'
                          : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <FloorPlanViewer
                floorPlanUrl={currentFloorPlanUrl}
                rooms={rooms}
                highlightedRoomId={selectedRoom?.id ?? null}
                onRoomDotClick={onRoomSelect}
              />
            </div>

            <button
              type="button"
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"
              onClick={() => {
                const target = selectedRoom || building;
                if (typeof onNavigate === 'function') {
                  onNavigate(target);
                }
              }}
            >
              Get Directions
            </button>
          </div>
        ) : (
          <RoomView
            buildingName={buildingName}
            room={selectedRoom}
            onBack={() => {
              if (typeof onRoomSelect === 'function') onRoomSelect(null);
            }}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
}

function RoomView({ buildingName, room, onBack, onNavigate }) {
  const roomName = room?.name || room?.displayName || room?.roomName || 'Room';
  const roomNumber = room?.number || room?.roomNumber || room?.code || '';
  const floorNumber =
    typeof room?.floorNumber === 'number' ? room.floorNumber : typeof room?.floor === 'number' ? room.floor : null;

  const live = getLiveStatus(
    room?.hours || {
      weekday: room?.hoursWeekday,
      saturday: room?.hoursSaturday,
      sunday: room?.hoursSunday
    }
  );
  const type = typeLabel(room);
  const equipment = Array.isArray(room?.equipment) ? room.equipment.filter(Boolean) : [];

  return (
    <div className="space-y-4">
      <button
        type="button"
        aria-label={`Back to ${buildingName}`}
        className="text-sm font-semibold text-primary hover:underline"
        onClick={onBack}
      >
        ← Back to {buildingName}
      </button>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-extrabold text-slate-900">{roomName}</h3>
          <span className={['rounded-full border px-2 py-0.5 text-xs font-semibold', statusStyles(live.colour)].join(' ')}>
            {live.label}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {type}
          </span>
          {room?.accessible && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700"
              title="Wheelchair accessible"
            >
              <WheelchairIcon />
              Accessible
            </span>
          )}
        </div>

        <div className="text-sm text-slate-600">
          {roomNumber ? `Room ${roomNumber}` : 'Room'}{floorNumber !== null ? ` · Floor ${floorNumber}` : ''}
        </div>
      </div>

      {room?.temporarilyClosed && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          Temporarily closed
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <InfoRow label="Department" value={room?.department} />
        <InfoRow label="In-Charge" value={room?.inCharge || room?.incharge} />
        <InfoRow label="Contact" value={room?.contact} />
        <InfoRow label="Capacity" value={room?.capacity} />
      </div>

      {equipment.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-500">Equipment</div>
          <div className="flex flex-wrap gap-2">
            {equipment.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"
        onClick={() => {
          if (typeof onNavigate === 'function') onNavigate(room);
        }}
      >
        Get Directions
      </button>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{String(value)}</div>
    </div>
  );
}

