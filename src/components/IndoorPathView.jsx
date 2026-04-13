import { useMemo } from 'react';
import FloorPlanViewer from './FloorPlanViewer';

function resolveFloorLabel(floor) {
  const n =
    typeof floor?.floorNumber === 'number'
      ? floor.floorNumber
      : typeof floor?.number === 'number'
        ? floor.number
        : null;
  const building = floor?.buildingName || floor?.building || '';
  return {
    floorNumber: n,
    buildingName: building
  };
}

function computePathPoints(floor, targetRoom, entryPointId) {
  if (!floor || !targetRoom) return null;

  const entry = Array.isArray(floor.entryPoints)
    ? floor.entryPoints.find((e) => e.id === entryPointId)
    : null;
  const waypoint = Array.isArray(floor.corridorWaypoints)
    ? floor.corridorWaypoints.find((w) => w.id === targetRoom.nearestWaypoint)
    : null;

  if (!entry || !waypoint) return null;
  if (
    typeof entry.x !== 'number' ||
    typeof entry.y !== 'number' ||
    typeof waypoint.x !== 'number' ||
    typeof waypoint.y !== 'number' ||
    typeof targetRoom.planX !== 'number' ||
    typeof targetRoom.planY !== 'number'
  ) {
    return null;
  }

  const entryPt = { x: entry.x * 100, y: entry.y * 100 };
  const wayptPt = { x: waypoint.x * 100, y: waypoint.y * 100 };
  const roomPt = { x: targetRoom.planX * 100, y: targetRoom.planY * 100 };

  const seg1 = Math.hypot(wayptPt.x - entryPt.x, wayptPt.y - entryPt.y);
  const seg2 = Math.hypot(roomPt.x - wayptPt.x, roomPt.y - wayptPt.y);
  const totalPx = seg1 + seg2;
  const metres = Math.round(totalPx * 0.5);

  const mid = {
    x: (entryPt.x + roomPt.x) / 2,
    y: (entryPt.y + roomPt.y) / 2
  };

  // Arrowhead near room, pointing from corridor toward room
  const arrowBase = {
    x: (wayptPt.x * 0.7 + roomPt.x * 0.3),
    y: (wayptPt.y * 0.7 + roomPt.y * 0.3)
  };
  const dir = {
    x: roomPt.x - wayptPt.x,
    y: roomPt.y - wayptPt.y
  };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const size = 3;
  const perpX = -uy;
  const perpY = ux;
  const p1 = {
    x: arrowBase.x + ux * size,
    y: arrowBase.y + uy * size
  };
  const p2 = {
    x: arrowBase.x - ux * size + perpX * (size * 0.6),
    y: arrowBase.y - uy * size + perpY * (size * 0.6)
  };
  const p3 = {
    x: arrowBase.x - ux * size - perpX * (size * 0.6),
    y: arrowBase.y - uy * size - perpY * (size * 0.6)
  };

  return {
    entryPt,
    wayptPt,
    roomPt,
    metres,
    mid,
    arrowPoints: `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`
  };
}

export default function IndoorPathView({
  floor,
  targetRoom,
  entryPointId,
  floorPlanUrl,
  building,
  targetFloor,
  destination,
  rooms,
  instructionStep,
  onDone,
  onClose,
}) {
  const resolvedFloor = floor || (targetFloor && typeof targetFloor === 'object' ? targetFloor : {}) || {};
  const resolvedTargetRoom = targetRoom || destination || null;
  const resolvedDone = onDone || onClose;
  const { floorNumber, buildingName } = resolveFloorLabel(resolvedFloor);
  const planUrl = floorPlanUrl || resolvedFloor.planImageData || resolvedFloor.planImageUrl || resolvedFloor.floorPlanUrl || '';
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeEntryPoints = Array.isArray(resolvedFloor?.entryPoints) ? resolvedFloor.entryPoints : [];
  const safeWaypoints = Array.isArray(resolvedFloor?.corridorWaypoints) ? resolvedFloor.corridorWaypoints : [];

  const pathData = useMemo(
    () => computePathPoints(resolvedFloor, resolvedTargetRoom, entryPointId),
    [resolvedFloor, resolvedTargetRoom, entryPointId]
  );

  const roomName =
    resolvedTargetRoom?.name || resolvedTargetRoom?.displayName || resolvedTargetRoom?.roomName || resolvedTargetRoom?.roomNumber || 'Destination';
  const distanceText = pathData ? `~${pathData.metres} metres` : '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <style>{`
        @keyframes indoorTargetPulse {
          0% { r: 3; opacity: 0.9; }
          50% { r: 6; opacity: 0.2; }
          100% { r: 3; opacity: 0.9; }
        }
      `}</style>

      <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1 text-xs">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>
            Floor {floorNumber ?? '?'}
            {(buildingName || building?.name) ? ` — ${buildingName || building?.name}` : ''}
          </span>
        </div>
        <div className="mr-1 max-w-[42%] truncate text-[11px] font-semibold text-slate-600">
          → {roomName}
        </div>
      </div>

      {instructionStep && (
        <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Instruction
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {instructionStep.instruction || 'Check room numbers on doors'}
          </div>
          {(instructionStep.hint || instructionStep.landmark) && (
            <div className="mt-1 text-xs text-slate-600">
              {instructionStep.hint || ''}
              {instructionStep.hint && instructionStep.landmark ? ' · ' : ''}
              {instructionStep.landmark || ''}
            </div>
          )}
        </div>
      )}

      <div className="relative w-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {planUrl ? (
          <FloorPlanViewer
            floorPlanUrl={planUrl}
            rooms={safeRooms}
            entryPoints={safeEntryPoints}
            corridorWaypoints={safeWaypoints}
            highlightedRoomId={resolvedTargetRoom?.id ?? null}
            onRoomDotClick={() => {}}
            showRoomsList={false}
            minScale={0.6}
            initialScale={0.9}
            forceCenterOnInit={true}
            disablePan={true}
            fillHeight={true}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-slate-100">
            <div className="text-center text-sm text-slate-600">
              Floor plan not available for this level.
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="mt-3 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"
        onClick={() => {
          if (typeof resolvedDone === 'function') resolvedDone();
        }}
      >
        I found it ✓
      </button>
    </div>
  );
}

