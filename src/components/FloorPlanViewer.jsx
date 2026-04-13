import { useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

function roomTypeKey(room) {
  const t = String(room?.type || room?.roomType || '').toLowerCase();
  if (t.includes('lab')) return 'lab';
  if (t.includes('class')) return 'classroom';
  if (t.includes('office')) return 'office';
  if (t.includes('wash')) return 'washroom';
  return 'default';
}

function dotColor(typeKey) {
  if (typeKey === 'lab') return '#378ADD';
  if (typeKey === 'classroom') return '#1D9E75';
  if (typeKey === 'office') return '#BA7517';
  if (typeKey === 'washroom') return '#888780';
  return '#7F77DD';
}

function TypeBadge({ room }) {
  const label = (() => {
    const key = roomTypeKey(room);
    if (key === 'lab') return 'Lab';
    if (key === 'classroom') return 'Classroom';
    if (key === 'office') return 'Office';
    if (key === 'washroom') return 'Washroom';
    return room?.type || 'Room';
  })();

  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      {label}
    </span>
  );
}

function normalizeCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return n;
  if (n > 1 && n <= 100) return n / 100;
  return null;
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const x = normalizeCoord(point.x ?? point.planX ?? point.px);
  const y = normalizeCoord(point.y ?? point.planY ?? point.py);
  if (x === null || y === null) return null;
  return { ...point, x, y };
}

export default function FloorPlanViewer({
  floorPlanUrl,
  rooms,
  entryPoints = [],
  corridorWaypoints = [],
  highlightedRoomId,
  onRoomDotClick,
  showRoomsList = true,
  minScale = 1,
  initialScale = 1,
  forceCenterOnInit = false,
  disablePan = false,
  fillHeight = false,
}) {
  const roomTypeKey = (room) => {
    const type = room?.type || room?.roomType || '';
    return type.toLowerCase().replace(/\s+/g, '');
  };

  const dotColor = (room) => {
    const type = roomTypeKey(room);
    const map = {
      classroom: '#378ADD',
      lab: '#D85A30',
      office: '#7F77DD',
      'faculty office': '#7F77DD',
      library: '#1D9E75',
      cafeteria: '#BA7517',
      'common room': '#BA7517',
      'conference room': '#7F77DD',
      'workshop': '#D85A30',
      storage: '#64748b',
      'restroom': '#64748b',
      elevator: '#64748b',
      stairs: '#64748b',
      'electrical room': '#D85A30',
      'mechanical room': '#D85A30',
      'server room': '#D85A30'
    };
    return map[type] || '#64748b';
  };

  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeEntryPoints = Array.isArray(entryPoints) ? entryPoints : [];
  const safeWaypoints = Array.isArray(corridorWaypoints) ? corridorWaypoints : [];
  const normalizedEntryPoints = useMemo(
    () => safeEntryPoints.map(normalizePoint).filter(Boolean),
    [safeEntryPoints]
  );
  const normalizedWaypoints = useMemo(
    () => safeWaypoints.map(normalizePoint).filter(Boolean),
    [safeWaypoints]
  );
  const imageContainerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!fillHeight || !imageContainerRef.current || !window.ResizeObserver) return;
    const el = imageContainerRef.current;
    const ro = new ResizeObserver((entries) => {
      const rect = entries?.[0]?.contentRect;
      if (!rect) return;
      setContainerSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillHeight]);

  const fitRect = useMemo(() => {
    if (!fillHeight) return null;
    const cw = containerSize.width;
    const ch = containerSize.height;
    const iw = naturalSize.width;
    const ih = naturalSize.height;
    if (!cw || !ch || !iw || !ih) return null;

    const scale = Math.min(cw / iw, ch / ih);
    const width = iw * scale;
    const height = ih * scale;
    const left = (cw - width) / 2;
    const top = (ch - height) / 2;
    return { left, top, width, height };
  }, [fillHeight, containerSize.width, containerSize.height, naturalSize.width, naturalSize.height]);

  return (
    <div className={fillHeight ? 'h-full w-full min-h-0' : 'w-full'}>
      <style>{`
        @keyframes roomPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(55, 138, 221, 0.55); }
          100% { box-shadow: 0 0 0 8px rgba(55, 138, 221, 0); }
        }
      `}</style>

      <div className={fillHeight ? 'relative h-full w-full bg-slate-50' : 'relative w-full bg-slate-50'}>
        {floorPlanUrl ? (
          <TransformWrapper
            minScale={minScale}
            initialScale={initialScale}
            centerZoomedOut={true}
            limitToBounds={true}
            centerOnInit={true}
            doubleClick={{ disabled: true }}
            panning={{ disabled: disablePan }}
            onInit={({ centerView }) => {
              if (!forceCenterOnInit) return;
              requestAnimationFrame(() => centerView(initialScale, 0));
              requestAnimationFrame(() => centerView(initialScale, 0));
            }}
          >
            <TransformComponent
              wrapperStyle={fillHeight ? { width: '100%', height: '100%' } : { width: '100%' }}
              contentStyle={fillHeight ? { width: '100%', height: '100%' } : { width: '100%' }}
            >
                <div ref={imageContainerRef} className={fillHeight ? 'relative h-full w-full' : 'relative w-full'}>
                <img
                  src={floorPlanUrl}
                  alt="Floor plan"
                    className={fillHeight ? 'block h-full w-full select-none object-contain' : 'block w-full select-none'}
                    onLoad={(e) => {
                      if (!fillHeight) return;
                      setNaturalSize({
                        width: e.currentTarget.naturalWidth || 0,
                        height: e.currentTarget.naturalHeight || 0,
                      });
                    }}
                  draggable={false}
                />

                {safeRooms
                  .filter(
                    (r) =>
                      typeof r?.planX === 'number' &&
                      typeof r?.planY === 'number' &&
                      r.planX >= 0 &&
                      r.planX <= 1 &&
                      r.planY >= 0 &&
                      r.planY <= 1
                  )
                  .map((room) => {
                    const isHighlighted = highlightedRoomId && room?.id === highlightedRoomId;
                    const size = isHighlighted ? 26 : 22;
                    const typeKey = roomTypeKey(room);
                    const number = room?.number || room?.roomNumber || room?.code || '';

                    return (
                      <div
                        key={room.id}
                        role="button"
                        tabIndex={0}
                        className={[
                          'absolute grid place-items-center rounded-full border-[2.5px] border-white text-[9px] font-extrabold text-white',
                          'cursor-pointer transition-transform duration-150 hover:scale-130'
                        ].join(' ')}
                        style={{
                          left: fillHeight && fitRect
                            ? `${fitRect.left + room.planX * fitRect.width}px`
                            : `${room.planX * 100}%`,
                          top: fillHeight && fitRect
                            ? `${fitRect.top + room.planY * fitRect.height}px`
                            : `${room.planY * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          width: `${size}px`,
                          height: `${size}px`,
                          background: dotColor(typeKey),
                          animation: isHighlighted ? 'roomPulseRing 1.5s ease-out infinite' : 'none'
                        }}
                        onClick={() => {
                          if (typeof onRoomDotClick === 'function') onRoomDotClick(room);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (typeof onRoomDotClick === 'function') onRoomDotClick(room);
                          }
                        }}
                        aria-label={`Select room ${number || room?.name || 'room'}`}
                      >
                        <span className="w-full text-center font-mono leading-none [font-variant-numeric:tabular-nums]">
                          {String(number).slice(0, 6)}
                        </span>
                      </div>
                    );
                  })}

                {normalizedEntryPoints
                  .map((p) => {
                    const isExit = /exit/i.test(String(p?.label || p?.id || ''));
                    return (
                      <div
                        key={`entry-${p.id || `${p.x}-${p.y}`}`}
                        className="absolute grid place-items-center rounded-md border-2 border-white text-[9px] font-extrabold text-white"
                        style={{
                          left: fillHeight && fitRect
                            ? `${fitRect.left + p.x * fitRect.width}px`
                            : `${p.x * 100}%`,
                          top: fillHeight && fitRect
                            ? `${fitRect.top + p.y * fitRect.height}px`
                            : `${p.y * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          width: '20px',
                          height: '20px',
                          background: isExit ? '#D85A30' : '#059669',
                          boxShadow: '0 0 0 2px rgba(255,255,255,0.25)'
                        }}
                        title={p.label || p.id || (isExit ? 'Exit' : 'Entry')}
                      >
                        {isExit ? 'X' : 'E'}
                      </div>
                    );
                  })}

                {normalizedWaypoints
                  .map((p) => (
                    <div
                      key={`waypoint-${p.id || `${p.x}-${p.y}`}`}
                      className="absolute rounded-full border border-white"
                      style={{
                        left: fillHeight && fitRect
                          ? `${fitRect.left + p.x * fitRect.width}px`
                          : `${p.x * 100}%`,
                        top: fillHeight && fitRect
                          ? `${fitRect.top + p.y * fitRect.height}px`
                          : `${p.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '10px',
                        height: '10px',
                        background: '#F59E0B'
                      }}
                      title={p.id || 'Waypoint'}
                    />
                  ))}
              </div>
            </TransformComponent>
          </TransformWrapper>
        ) : (
          <div className="grid aspect-[16/10] w-full place-items-center bg-slate-100">
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-600">Floor plan not uploaded yet</div>
              <div className="mt-1 text-xs text-slate-500">You can still browse rooms below.</div>
            </div>
          </div>
        )}
      </div>

      {showRoomsList && (
        <div className="border-t border-slate-200">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500">Rooms</div>
          <ul className="max-h-64 overflow-auto pb-2">
            {safeRooms.map((room) => {
              const isHighlighted = highlightedRoomId && room?.id === highlightedRoomId;
              const hasPos = typeof room?.planX === 'number' && typeof room?.planY === 'number';
              const typeKey = roomTypeKey(room);
              const number = room?.number || room?.roomNumber || room?.code || '';
              const name = room?.name || room?.displayName || room?.roomName || '';

              return (
                <li key={room.id} className="px-2">
                  <button
                    type="button"
                    className={[
                      'flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left',
                      isHighlighted ? 'bg-[#378ADD]/10' : 'hover:bg-slate-50'
                    ].join(' ')}
                    onClick={() => {
                      if (typeof onRoomDotClick === 'function') onRoomDotClick(room);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-white text-[10px] font-extrabold leading-none text-white font-mono [font-variant-numeric:tabular-nums]"
                        style={{
                          background: hasPos ? dotColor(typeKey) : '#94a3b8'
                        }}
                        aria-hidden="true"
                      >
                        {String(number || '').slice(0, 4) || '—'}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {number ? `${number}${name ? ` · ${name}` : ''}` : name || 'Room'}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <TypeBadge room={room} />
                          {!hasPos && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              Position not set
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {safeRooms.length === 0 && (
              <li className="px-3 pb-3 text-sm text-slate-500">No rooms found for this floor.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

