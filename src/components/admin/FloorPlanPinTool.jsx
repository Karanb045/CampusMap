// src/components/admin/FloorPlanPinTool.jsx
// FIXED:
//  1. floorPlanUrl now derived from `floor.planImageUrl` if not passed directly
//     — AdminPage was passing floor={...} but never passing floorPlanUrl, so
//       the image was always blank and clicks did nothing.
//  2. onSaveRoomPosition is handled internally via updateRoom when not provided
//     — AdminPage never passed onSaveRoomPosition, so pins were lost on click.
//     Now the component saves to Firestore itself using updateRoom if no external
//     handler is given. This makes it self-contained regardless of how it's called.
//  3. Rooms list now shows a placeholder when no rooms exist for this floor.

import { useMemo, useRef, useState, useEffect } from 'react';
import { updateRoom } from '../../services/firestoreService';

const MODES = { ROOMS: 'rooms', ENTRIES: 'entries', WAYPOINTS: 'waypoints' };

const C = {
  primary:    '#1B3A6B',
  primaryLt:  '#EEF2FF',
  border:     '#e8edf2',
  text:       '#0f172a',
  textMid:    '#475569',
  textDim:    '#94a3b8',
  success:    '#059669',
  successBg:  '#F0FDF4',
  successBdr: '#A7F3D0',
};

function RoomStatusDot({ room }) {
  const pinned = typeof room?.planX === 'number' && typeof room?.planY === 'number';
  return (
    <span style={{
      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
      background: pinned ? C.success : '#94a3b8', flexShrink: 0,
    }} />
  );
}

export default function FloorPlanPinTool({
  // `floorPlanUrl` may be passed directly OR derived from `floor.planImageUrl`
  floorPlanUrl: floorPlanUrlProp,
  rooms = [],
  floor,
  floorId,
  buildingId,
  // Optional external handlers — if omitted, component saves to Firestore itself
  onSaveRoomPosition,
  onSaveFloorMetadata,
  onSave,       // called after any successful save (e.g. to close the modal)
}) {
  // FIXED: derive the image URL from floor.planImageUrl when prop not passed
  const floorPlanUrl = floorPlanUrlProp || floor?.planImageUrl || '';

  const [mode,           setMode]           = useState(MODES.ROOMS);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [entryPoints,    setEntryPoints]    = useState(floor?.entryPoints    || []);
  const [corridorWps,    setCorridorWps]    = useState(floor?.corridorWaypoints || []);
  const [toast,          setToast]          = useState('');
  const [saving,         setSaving]         = useState(false);
  // Local mirror of planX/planY so UI updates immediately after pinning
  // without waiting for Firestore listener to round-trip
  const [localPins, setLocalPins] = useState({});

  const containerRef = useRef(null);

  // Auto-select first unpinned room
  useEffect(() => {
    if (!rooms.length) return;
    if (selectedRoomId && rooms.find(r => r.id === selectedRoomId)) return;
    const firstUnpinned = rooms.find(
      r => typeof r.planX !== 'number' || typeof r.planY !== 'number'
    );
    setSelectedRoomId(firstUnpinned?.id || rooms[0]?.id || '');
  }, [rooms]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const selectedRoom = useMemo(
    () => rooms.find(r => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  // Merge Firestore room data with locally-saved pins so dots appear instantly
  const roomsWithLocalPins = useMemo(() =>
    rooms.map(r => localPins[r.id]
      ? { ...r, planX: localPins[r.id].x, planY: localPins[r.id].y }
      : r
    ),
    [rooms, localPins]
  );

  async function handleClick(e) {
    if (!containerRef.current || !floorPlanUrl) return;
    if (saving) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left)  / rect.width ).toFixed(3));
    const y = parseFloat(((e.clientY - rect.top)   / rect.height).toFixed(3));

    // ── Rooms mode ──────────────────────────────────────────────────────────
    if (mode === MODES.ROOMS) {
      if (!selectedRoom) { setToast('Select a room first'); return; }
      setSaving(true);
      try {
        if (onSaveRoomPosition) {
          // External handler (legacy path)
          await onSaveRoomPosition(selectedRoom.id, x, y);
        } else {
          // FIXED: self-contained Firestore save — this is the missing piece
          await updateRoom(selectedRoom.id, { planX: x, planY: y });
        }
        // Immediately update local state so the dot appears without waiting
        setLocalPins(prev => ({ ...prev, [selectedRoom.id]: { x, y } }));
        setToast(`📍 ${selectedRoom.name || selectedRoom.roomNumber || 'Room'} pinned!`);

        // Advance to next unpinned room automatically
        const next = rooms.find(r =>
          r.id !== selectedRoom.id &&
          !localPins[r.id] &&
          (typeof r.planX !== 'number' || typeof r.planY !== 'number')
        );
        if (next) setSelectedRoomId(next.id);
      } catch (err) {
        console.error('Pin save error:', err);
        setToast('❌ Failed to save — check console');
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Entries mode ─────────────────────────────────────────────────────────
    if (mode === MODES.ENTRIES) {
      setEntryPoints(prev => [
        ...prev,
        {
          id:    prev.length === 0 ? 'stair_main' : `entry_${prev.length + 1}`,
          label: prev.length === 0 ? 'Main staircase' : `Entry ${prev.length + 1}`,
          x, y,
        }
      ]);
      setToast('Entry point added');
      return;
    }

    // ── Waypoints mode ───────────────────────────────────────────────────────
    if (mode === MODES.WAYPOINTS) {
      setCorridorWps(prev => [
        ...prev,
        { id: `cw${prev.length + 1}`, x, y }
      ]);
      setToast('Waypoint added');
    }
  }

  async function handleSaveMetadata() {
    if (!floorId) { setToast('No floorId — cannot save'); return; }
    setSaving(true);
    try {
      if (onSaveFloorMetadata) {
        await onSaveFloorMetadata(floorId, { entryPoints, corridorWaypoints: corridorWps });
      } else {
        // Self-contained: import updateFloor
        const { updateFloor } = await import('../../services/firestoreService');
        await updateFloor(floorId, { entryPoints, corridorWaypoints: corridorWps });
      }
      setToast(mode === MODES.ENTRIES ? 'Entry points saved ✓' : 'Waypoints saved ✓');
      onSave?.();
    } catch (err) {
      console.error(err);
      setToast('❌ Save failed');
    } finally {
      setSaving(false);
    }
  }

  const placedRooms = roomsWithLocalPins.filter(
    r => typeof r.planX === 'number' && typeof r.planY === 'number'
  );

  // ── Styles (inline, no Tailwind dependency) ─────────────────────────────────
  const modeTabStyle = active => ({
    borderRadius: '20px', padding: '5px 12px', fontSize: '11px', fontWeight: '700',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    background: active ? C.primary : 'transparent',
    color:      active ? 'white'   : C.textMid,
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Mode tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '24px', padding: '3px', gap: '2px' }}>
          {[
            { id: MODES.ROOMS,     label: '📍 Place Rooms'    },
            { id: MODES.ENTRIES,   label: '🚪 Entry Points'   },
            { id: MODES.WAYPOINTS, label: '🔀 Waypoints'      },
          ].map(m => (
            <button key={m.id} type="button"
              style={modeTabStyle(mode === m.id)}
              onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Room selector */}
        {mode === MODES.ROOMS && rooms.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: C.textDim }}>Room</span>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '10px', border: `1.5px solid ${C.border}`, fontSize: '12px', outline: 'none', fontFamily: 'inherit', color: C.text }}>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {(r.roomNumber || r.number || '') + (r.name ? ` · ${r.name}` : '')}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Instruction text ── */}
      <div style={{ fontSize: '11px', color: C.textMid, background: '#f8fafc', borderRadius: '8px', padding: '7px 12px', border: `1px solid ${C.border}` }}>
        {!floorPlanUrl
          ? '⚠️  No floor plan image found. Upload one by editing this floor first.'
          : mode === MODES.ROOMS && selectedRoom
            ? `Click anywhere on the image to pin "${selectedRoom.name || selectedRoom.roomNumber}".`
            : mode === MODES.ENTRIES
              ? 'Click on the image to place entry points (stairs, lifts, main entry).'
              : mode === MODES.WAYPOINTS
                ? 'Click on the image to place corridor waypoints for indoor routing.'
                : 'Select a room above, then click the image.'}
      </div>

      {/* ── Floor plan image canvas ── */}
      <div
        ref={containerRef}
        onClick={handleClick}
        style={{
          position: 'relative', width: '100%', borderRadius: '14px',
          border: `2px solid ${floorPlanUrl ? C.border : '#fca5a5'}`,
          background: '#f1f5f9', overflow: 'hidden',
          cursor: floorPlanUrl && !saving ? 'crosshair' : 'default',
          minHeight: floorPlanUrl ? undefined : '160px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>

        {floorPlanUrl ? (
          <>
            <img
              src={floorPlanUrl}
              alt="Floor plan"
              style={{ display: 'block', width: '100%', userSelect: 'none', pointerEvents: 'none' }}
              draggable={false}
            />
            {/* SVG overlay for pins — pointer-events none so clicks reach the div */}
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none">

              {/* Placed room dots */}
              {placedRooms.map(room => {
                const isSelected = mode === MODES.ROOMS && room.id === selectedRoomId;
                return (
                  <g key={room.id}>
                    <circle
                      cx={room.planX * 100} cy={room.planY * 100}
                      r={2.8} fill={isSelected ? '#EF4444' : '#1B3A6B'}
                      stroke="white" strokeWidth="0.8"
                    />
                    {/* Label */}
                    <text
                      x={room.planX * 100} y={(room.planY * 100) - 3.5}
                      textAnchor="middle" fontSize="2.8"
                      fill={isSelected ? '#EF4444' : '#1B3A6B'}
                      fontWeight="bold" fontFamily="system-ui"
                      stroke="white" strokeWidth="0.5" paintOrder="stroke">
                      {room.roomNumber || room.name || ''}
                    </text>
                  </g>
                );
              })}

              {/* Entry point triangles */}
              {entryPoints.map(ep => (
                <polygon
                  key={ep.id}
                  points={`${ep.x*100},${ep.y*100-2.5} ${ep.x*100+2},${ep.y*100+1.5} ${ep.x*100-2},${ep.y*100+1.5}`}
                  fill="#7C3AED" stroke="white" strokeWidth="0.5"
                />
              ))}

              {/* Waypoint circles */}
              {corridorWps.map(w => (
                <circle
                  key={w.id}
                  cx={w.x*100} cy={w.y*100}
                  r={2} fill="#F97316" stroke="white" strokeWidth="0.5"
                />
              ))}
            </svg>

            {/* Saving overlay */}
            {saving && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '700', color: C.primary,
              }}>Saving…</div>
            )}
          </>
        ) : (
          <div style={{ padding: '32px', textAlign: 'center', color: C.textDim }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺️</div>
            <div style={{ fontSize: '12px', fontWeight: '700' }}>No floor plan image uploaded</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              Edit this floor and upload an image first, then come back to pin rooms.
            </div>
          </div>
        )}
      </div>

      {/* ── Save metadata button for entries/waypoints ── */}
      {(mode === MODES.ENTRIES || mode === MODES.WAYPOINTS) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveMetadata}
            style={{
              padding: '8px 18px', borderRadius: '10px', fontSize: '12px',
              fontWeight: '700', border: 'none', cursor: saving ? 'wait' : 'pointer',
              background: C.primary, color: 'white', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Saving…' : mode === MODES.ENTRIES ? '💾 Save Entry Points' : '💾 Save Waypoints'}
          </button>
        </div>
      )}

      {/* ── Room status list ── */}
      <div style={{ borderRadius: '12px', border: `1px solid ${C.border}`, background: 'white', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, fontSize: '11px', fontWeight: '800', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between' }}>
          <span>Room Status</span>
          <span style={{ color: C.success }}>{placedRooms.length}/{rooms.length} pinned</span>
        </div>

        {rooms.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: C.textDim }}>
            No rooms found for this floor. Add rooms in the Rooms tab first, then come back to pin them.
          </div>
        ) : (
          <ul style={{ maxHeight: '180px', overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0 }}>
            {roomsWithLocalPins.map(room => {
              const pinned = typeof room.planX === 'number' && typeof room.planY === 'number';
              const active = room.id === selectedRoomId && mode === MODES.ROOMS;
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    disabled={mode !== MODES.ROOMS}
                    onClick={() => { if (mode === MODES.ROOMS) setSelectedRoomId(room.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 14px', border: 'none', textAlign: 'left',
                      cursor: mode === MODES.ROOMS ? 'pointer' : 'default',
                      background: active ? '#EEF2FF' : 'transparent',
                      fontFamily: 'inherit',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                    onMouseEnter={e => { if (!active && mode === MODES.ROOMS) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? '#EEF2FF' : 'transparent'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <RoomStatusDot room={room} />
                      <span style={{ fontSize: '12px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(room.roomNumber || room.number || '') + (room.name ? ` · ${room.name}` : '')}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', flexShrink: 0, marginLeft: '8px',
                      background: pinned ? C.successBg   : '#f1f5f9',
                      color:      pinned ? C.success     : C.textDim,
                      border:     `1px solid ${pinned ? C.successBdr : C.border}`,
                    }}>
                      {pinned ? 'Pinned ✓' : 'Not pinned'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#0f172a', color: 'white', fontSize: '12px',
          fontWeight: '700', padding: '9px 20px', borderRadius: '999px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}