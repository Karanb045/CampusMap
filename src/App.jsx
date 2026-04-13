// src/App.jsx
// CHANGED: Removed ditBuildings.json import and static merge.
//          Firestore is now the ONLY source of truth for building data.
//          subscribeToBuildings callback now passes Firestore data directly.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import useAuth from './hooks/useAuth';
import useMapStore from './hooks/useMapStore';
import useRoute from './hooks/useRoute';
import CampusMap from './components/CampusMap.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import DirectionsStepper from './components/DirectionsStepper.jsx';
import FloorPlanViewer from './components/FloorPlanViewer.jsx';
import IndoorPathView from './components/IndoorPathView.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import DirectoryPage from './pages/DirectoryPage.jsx';
import SearchBar from './components/SearchBar.jsx';
import FilterChips from './components/FilterChips.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import ditBuildings from './data/ditBuildings.json';
import { buildSearchIndex, filterByCategory } from './services/searchService';
import {
  subscribeToBuildings,
  subscribeToRooms,
  getFloorsForBuilding,
  getRoomsForFloor
} from './services/firestoreService.js';

// Firestore remains the source of truth for editable data.
// Static JSON is used here only as a temporary fallback while Firestore sync is loading.

const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const HOSTEL_ONLY_IDS = new Set(['boys_hostel', 'girls_hostel']);

function getCategoryBg(category) {
  const map = {
    academic: '#EEF2FF', admin: '#EEEDFE', amenity: '#F0FDF4', cafeteria: '#FFF7ED',
    hostel: '#FFF7ED', sports: '#FFF1F2', medical: '#FFF1F2',
    lab: '#EEF2FF', classroom: '#F0FDF4', office: '#FFF7ED',
  };
  return map[category] ?? '#F1F5F9';
}

function getCategoryColor(category) {
  const map = {
    academic: '#3730A3', admin: '#534AB7', amenity: '#15803d', cafeteria: '#c2410c',
    hostel: '#c2410c', sports: '#BE123C', medical: '#BE123C',
    lab: '#3730A3', classroom: '#15803d', office: '#c2410c',
  };
  return map[category] ?? '#475569';
}

function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'white',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '16px', zIndex: 9999
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: '#1B3A6B', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <svg viewBox="0 0 24 24" fill="none" style={{ width: '32px', height: '32px' }}>
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" fill="white" />
          <rect x="9" y="13" width="6" height="8" rx="1" fill="rgba(0,0,0,.25)" />
        </svg>
      </div>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        border: '4px solid #1B3A6B', borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite'
      }} />
      <p style={{ fontSize: '14px', color: '#94a3b8' }}>Loading DIT Campus Map…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '3px', padding: '5px 14px', borderRadius: '10px',
      background: active ? '#EEF2FF' : 'transparent',
      border: 'none', cursor: 'pointer',
    }}>
      {icon}
      <span style={{ fontSize: '11px', fontWeight: '600', color: active ? '#1B3A6B' : '#94a3b8' }}>
        {label}
      </span>
    </button>
  );
}

export default function App() {
  const { user, loading, logout, isAdmin } = useAuth();

  const [isMobileView, setIsMobileView] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : true
  );
  const [guestMode, setGuestMode]             = useState(false);
  const [activeTab, setActiveTab]             = useState(0);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [toastMsg, setToastMsg]               = useState('');
  const [showAllHomeBuildings, setShowAllHomeBuildings] = useState(false);
  const profileMenuRef                        = useRef(null);

  const {
    selectedBuilding, selectedFloor, selectedRoom,
    activeFilter, userLocation, flyTarget,
    isPanelOpen, directionsOpen, indoorPathOpen,
    currentCheckpointFloor
  } = useMapStore();

  const [floorsByBuilding, setFloorsByBuilding] = useState({});
  const [roomsByFloor, setRoomsByFloor]         = useState({});
  const [directionsRoom, setDirectionsRoom]     = useState(null);
  const [dataLoadError, setDataLoadError]       = useState('');
  const [buildings, setBuildings]               = useState([]);
  const [rooms, setRooms]                       = useState([]);
  const [searchIndex, setSearchIndex]           = useState([]);

  const { routePath, calculateRoute, clearRoute } = useRoute();

  const staticBuildingsById = useMemo(() => {
    const features = Array.isArray(ditBuildings?.features) ? ditBuildings.features : [];
    const map = {};

    for (const feature of features) {
      const props = feature?.properties || {};
      const id = props.id;
      if (!id) continue;

      const ring = feature?.geometry?.coordinates?.[0] || [];
      const pts = ring.filter((p) => Array.isArray(p) && p.length >= 2);

      let lat = null;
      let lng = null;
      if (pts.length) {
        const sum = pts.reduce((acc, [x, y]) => ({ lng: acc.lng + x, lat: acc.lat + y }), { lat: 0, lng: 0 });
        lat = sum.lat / pts.length;
        lng = sum.lng / pts.length;
      }

      map[id] = {
        id,
        name: props.name || id,
        shortName: props.shortName || '',
        category: props.category || 'academic',
        totalFloors: Number(props.totalFloors) || 1,
        description: props.description || '',
        groundLabel: props.groundLabel || 'G',
        lat,
        lng,
      };
    }

    return map;
  }, []);

  const filteredPois = useMemo(() => {
    try {
      const basePois = filterByCategory(
        (buildings ?? [])
          .filter(b => typeof b.lat === 'number' && typeof b.lng === 'number')
          .map(b => ({
            id: b.id, lat: b.lat, lng: b.lng,
            category: b.category || 'academic', name: b.name
          })),
        activeFilter
      );

      if (String(activeFilter || '').toLowerCase() === 'hostel') {
        return basePois.filter((p) => HOSTEL_ONLY_IDS.has(p.id));
      }

      return basePois;
    } catch { return []; }
  }, [buildings, activeFilter]);

  const filteredBuildings = useMemo(() => {
    try {
      const key = String(activeFilter || 'all').toLowerCase();
      if (key === 'all') return buildings;

      let list = buildings.filter((b) => String(b?.category || '').toLowerCase() === key);
      if (key === 'hostel') {
        list = list.filter((b) => HOSTEL_ONLY_IDS.has(b.id));
      }
      return list;
    } catch {
      return buildings;
    }
  }, [buildings, activeFilter]);

  const totalFloors = useMemo(() =>
    buildings.reduce((s, b) => s + (b.totalFloors || 0), 0), [buildings]);

  useEffect(() => {
    const fn = () => setIsMobileView(window.innerWidth < 1024);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  useEffect(() => {
    const fn = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target))
        setShowProfileMenu(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // CHANGED: subscribeToBuildings now uses Firestore data directly.
  // No JSON import, no static merge, no duplicates.
  // Firestore is the single source of truth.
  useEffect(() => {
    let unsubB = null;
    let unsubR = null;
    try {
      unsubB = subscribeToBuildings(firestoreBuildings => {
        // CHANGED: use firestoreBuildings directly — no JSON merge
        setBuildings(firestoreBuildings);
        useMapStore.setState({ buildings: firestoreBuildings });
      });
      unsubR = subscribeToRooms(r => {
        setRooms(r);
        useMapStore.setState({ rooms: r });
      });
    } catch (error) {
      setDataLoadError('Could not load campus data. Check your connection.');
    }
    return () => { unsubB?.(); unsubR?.(); };
  }, []);

  useEffect(() => {
    if (buildings.length > 0 || rooms.length > 0)
      setSearchIndex(buildSearchIndex(rooms ?? [], buildings ?? []));
  }, [buildings, rooms]);

  useEffect(() => {
    const getLocation = async () => {
      if (!navigator.geolocation) {
        showToast('Location not supported on this device');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          useMapStore.setState({
            userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude }
          });
          showToast('Location found!');
        },
        error => {
          let message = 'Location access denied';
          if (error.code === 1) message = 'Location permission denied. Please enable location access.';
          else if (error.code === 2) message = 'Location unavailable. Try again later.';
          else if (error.code === 3) message = 'Location request timed out.';
          showToast(message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    };
    getLocation();
  }, []);

  async function ensureFloorsLoaded(buildingId) {
    if (floorsByBuilding[buildingId]) return floorsByBuilding[buildingId];
    const list = await getFloorsForBuilding(buildingId);
    setFloorsByBuilding(prev => ({ ...prev, [buildingId]: list }));
    return list;
  }

  async function ensureRoomsForFloor(floorId) {
    if (roomsByFloor[floorId]) return roomsByFloor[floorId];
    const list = await getRoomsForFloor(floorId);
    setRoomsByFloor(prev => ({ ...prev, [floorId]: list }));
    return list;
  }

  const currentBuildingFloors = useMemo(() =>
    selectedBuilding ? (floorsByBuilding[selectedBuilding.id] ?? []) : [],
    [selectedBuilding, floorsByBuilding]
  );

  const currentFloorObj = useMemo(() =>
    currentBuildingFloors.find(f => (f.floorNumber ?? f.number ?? 0) === selectedFloor) ?? null,
    [currentBuildingFloors, selectedFloor]
  );

  const currentFloorRooms = useMemo(() =>
    currentFloorObj ? (roomsByFloor[currentFloorObj.id] ?? []) : [],
    [currentFloorObj, roomsByFloor]
  );

  const directionsSteps = directionsRoom?.directions ?? [];
  const indoorStep = directionsSteps.find(s => s?.type === 'indoor') ?? directionsSteps[directionsSteps.length - 1] ?? null;
  const isMapVisible = !isMobileView || activeTab === 1;
  const shouldRenderMap = !isMobileView || activeTab === 1;
  const showMapLiveUi = activeTab === 1 && !isPanelOpen && !directionsOpen && !indoorPathOpen;

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

  function openBuilding(building) {
    if (!building) return;
    useMapStore.setState({
      selectedBuilding: building,
      selectedFloor: 0,
      selectedRoom: null,
      isPanelOpen: true,
      flyTarget: {
        lat: building.lat ?? 30.3990,
        lng: building.lng ?? 78.0755,
        zoom: 19
      }
    });
    ensureFloorsLoaded(building.id).then(floors => {
      const floor = floors.find(f => (f.floorNumber ?? f.number ?? 0) === 0) ?? null;
      if (floor) ensureRoomsForFloor(floor.id);
    });

    // Show outdoor route immediately when location is available.
    if (userLocation) {
      calculateRoute(userLocation, building);
    }
  }

  // CHANGED: handleBuildingClick only receives { id } from CampusMap.
  // It looks up the full building object from Firestore buildings array.
  function handleBuildingClick(props) {
    const building =
      buildings.find(b => b.id === props?.id) ??
      staticBuildingsById[props?.id] ??
      null;
    if (!building) {
      showToast('Building data not loaded yet. Try again.');
      return;
    }
    openBuilding(building);
    if (isMobileView) setActiveTab(1);
  }

  function handleBuildingSidebarClick(building) {
    openBuilding(building);
    if (isMobileView) setActiveTab(1);
  }

  function handleSearchResultSelect(result) {
    if (!result) return;
    if (result.type === 'room') {
      const building = buildings.find(b => b.id === result.buildingId);
      if (!building) return;
      useMapStore.setState({
        selectedBuilding: building,
        selectedFloor: typeof result.floorNumber === 'number' ? result.floorNumber : 0,
        selectedRoom: rooms.find(r => r.id === result.id) ?? null,
        isPanelOpen: true,
        flyTarget: { lat: building.lat, lng: building.lng, zoom: 19 }
      });
      ensureFloorsLoaded(building.id).then(floors => {
        const floor = floors.find(f => {
          const numberMatch = typeof result.floorNumber === 'number'
            ? (f.floorNumber ?? f.number ?? 0) === result.floorNumber
            : false;
          const idMatch = result.floorId ? f.id === result.floorId : false;
          return numberMatch || idMatch;
        });
        const resolvedFloorNumber =
          floor
            ? (floor.floorNumber ?? floor.number ?? (typeof result.floorNumber === 'number' ? result.floorNumber : 0))
            : (typeof result.floorNumber === 'number' ? result.floorNumber : 0);

        useMapStore.setState({ selectedFloor: resolvedFloorNumber });
        if (floor) ensureRoomsForFloor(floor.id);
      });
    } else {
      const building = buildings.find(b => b.id === result.id);
      if (building) openBuilding(building);
    }
    if (isMobileView) setActiveTab(1);
  }

  function handleFloorChange(n) {
    if (!selectedBuilding) return;
    useMapStore.setState({ selectedFloor: n });
    ensureFloorsLoaded(selectedBuilding.id).then(floors => {
      const floor = floors.find(f => (f.floorNumber ?? f.number ?? 0) === n) ?? null;
      if (floor) ensureRoomsForFloor(floor.id);
    });
  }

  function handleRoomSelect(room) { useMapStore.setState({ selectedRoom: room }); }

  function handleFilterChange(categoryId) {
    useMapStore.setState({ activeFilter: categoryId || 'all' });
  }

  function handleGetDirections(room) {
    const target = room ?? selectedBuilding;
    if (!target || !selectedBuilding) return;

    const rawDirections = Array.isArray(target.directions) ? target.directions : [];
    const existing = rawDirections
      .map((item, idx) => {
        if (typeof item === 'string') {
          const instruction = item.trim();
          if (!instruction) return null;
          return {
            step: idx + 1,
            type: 'indoor',
            instruction,
          };
        }

        if (item && typeof item === 'object') {
          const instruction =
            typeof item.instruction === 'string' ? item.instruction.trim()
              : typeof item.text === 'string' ? item.text.trim()
                : '';
          if (!instruction) return null;
          return {
            step: typeof item.step === 'number' ? item.step : idx + 1,
            type: item.type || 'indoor',
            instruction,
            hint: item.hint || '',
            landmark: item.landmark || '',
            targetFloor: typeof item.targetFloor === 'number' ? item.targetFloor : undefined,
            confirmText: item.confirmText || '',
            confirmSub: item.confirmSub || '',
          };
        }

        return null;
      })
      .filter(Boolean);
    const floorNum = target.floorNumber ?? target.floor ?? selectedFloor ?? 0;

    const directions = existing.length > 0 ? existing : [
      { step: 1, type: 'outdoor', instruction: `Walk to ${selectedBuilding.name}`, hint: 'Follow the campus path', landmark: 'Main gate' },
      { step: 2, type: 'building_entry', instruction: `Enter ${selectedBuilding.name}`, hint: 'Through the main entrance', landmark: 'Reception' },
      { step: 3, type: 'checkpoint', instruction: `Go to Floor ${floorNum}`, hint: 'Use the staircase or lift', landmark: 'Staircase', targetFloor: floorNum, confirmText: `Have you reached Floor ${floorNum}?`, confirmSub: `Tap Yes when you are on Floor ${floorNum}` },
      { step: 4, type: 'indoor', instruction: target.name ? `Find ${target.name}` : 'Find your destination', hint: 'Check room numbers on doors', landmark: 'Corridor' },
    ];

    setDirectionsRoom({ ...target, directions });
    useMapStore.setState({ directionsOpen: true, isPanelOpen: false });

    if (userLocation && selectedBuilding) calculateRoute(userLocation, selectedBuilding);
  }

  function handleDirectionsFloorChange(targetFloor) {
    if (!selectedBuilding) return;
    handleFloorChange(targetFloor);
    useMapStore.setState({ currentCheckpointFloor: targetFloor, indoorPathOpen: true });
  }

  function handleIndoorDone() {
    useMapStore.setState({ indoorPathOpen: false, directionsOpen: true });
  }

  function handleClosePanel() {
    useMapStore.setState({
      selectedBuilding: null, selectedRoom: null,
      isPanelOpen: false, directionsOpen: false, indoorPathOpen: false
    });
    clearRoute();
    setDirectionsRoom(null);
  }

  if (loading) return <LoadingScreen />;

  if (user === null && !guestMode) {
    return (
      <AuthScreen
        onSuccess={() => setGuestMode(false)}
        onGuest={() => setGuestMode(true)}
      />
    );
  }

  const profileAvatarButton = (isDesktop = false) => (
    <button onClick={() => setShowProfileMenu(v => !v)} style={{
      width: isDesktop ? '28px' : '34px',
      height: isDesktop ? '28px' : '34px',
      background: '#1e293b', borderRadius: '50%',
      border: '1.5px solid #334155',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', overflow: 'hidden', padding: 0,
    }}>
      {user?.photoURL ? (
        <img src={user.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : user ? (
        <div style={{
          width: '100%', height: '100%', background: '#1B3A6B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: isDesktop ? '10px' : '14px', fontWeight: '700'
        }}>
          {user.displayName?.charAt(0) ?? user.email?.charAt(0) ?? 'U'}
        </div>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" style={{ width: '14px', height: '14px' }}>
          <circle cx="12" cy="8" r="4" stroke="#475569" strokeWidth="2" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#475569" strokeWidth="2" />
        </svg>
      )}
    </button>
  );

  const BuildingCard = ({ building }) => (
    <div onClick={() => handleBuildingSidebarClick(building)} style={{
      background: 'white', borderRadius: '14px', border: '1px solid #eef2f7',
      padding: '12px', marginBottom: '8px', display: 'flex', gap: '10px',
      alignItems: 'center', cursor: 'pointer'
    }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
      onMouseLeave={e => e.currentTarget.style.background = 'white'}
    >
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: getCategoryBg(building.category),
        overflow: 'hidden'
      }}>
        {building.photoUrl ? (
          <img src={building.photoUrl} alt={building.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <svg viewBox="0 0 24 24" fill="none"
            style={{ width: '20px', height: '20px', color: getCategoryColor(building.category) }}>
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
              stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{building.name}</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center' }}>
          <span style={{
            fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '8px',
            background: getCategoryBg(building.category), color: getCategoryColor(building.category)
          }}>{building.category}</span>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>G+{building.totalFloors ?? 1}</span>
        </div>
      </div>
      <span style={{ color: '#d1d5db', fontSize: '16px' }}>›</span>
    </div>
  );

  const EmptyBuildings = () => (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%',
        border: '3px solid #1B3A6B', borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
      }} />
      <p style={{ fontSize: '13px', color: '#94a3b8' }}>Loading campus data...</p>
    </div>
  );

  return (
    <main id="main" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#f0f4f8' }}>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .bg-primary { background-color: #1B3A6B; }
        .text-primary { color: #1B3A6B; }
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
        .leaflet-container { width: 100% !important; height: 100% !important; z-index: 1 !important; }
      `}</style>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#1B3A6B', color: 'white', fontSize: '14px',
          fontWeight: '600', padding: '8px 20px', borderRadius: '999px',
          boxShadow: '0 4px 12px rgba(0,0,0,.15)', pointerEvents: 'none', whiteSpace: 'nowrap'
        }}>
          {toastMsg}
        </div>
      )}

      <OfflineBanner />

      {dataLoadError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1200,
          display: 'flex', justifyContent: 'center', padding: '8px 16px'
        }}>
          <div style={{
            background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px',
            padding: '10px 16px', fontSize: '12px', fontWeight: '600', color: '#92400E'
          }}>
            {dataLoadError}
          </div>
        </div>
      )}

      {/* ── DESKTOP TOP NAV ── */}
      <nav style={{
        display: 'none', alignItems: 'center', gap: '16px', padding: '0 24px',
        height: '52px', background: '#0a0f1e', flexShrink: 0, zIndex: 100
      }} className="lg-flex">
        <style>{`.lg-flex { display: none; } @media(min-width:1024px){.lg-flex{display:flex!important;} .lg-hidden{display:none!important;} .lg-block{display:block!important;}}`}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', background: '#1B3A6B', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden'
          }}>
            <img src="/icons/dit_logo.jpg" alt="DIT Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ color: 'white', fontSize: '16px', fontWeight: '800' }}>DIT Campus Map</div>
            <div style={{ color: '#475569', fontSize: '11px' }}>Dehradun, Uttarakhand</div>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: '420px', marginLeft: '8px' }}>
          <SearchBar index={searchIndex} onResultSelect={handleSearchResultSelect}
            placeholder="Search labs, rooms, departments..." />
        </div>

        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          {['Explore'].map((label, i) => (
            <button key={label} onClick={() => setActiveTab(i)} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
              border: 'none', cursor: 'pointer',
              background: activeTab === i ? '#1B3A6B' : 'transparent',
              color: activeTab === i ? 'white' : '#94a3b8'
            }}>{label}</button>
          ))}
          {isAdmin && (
            <button onClick={() => setActiveTab(3)} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
              border: 'none', cursor: 'pointer',
              background: activeTab === 3 ? '#1B3A6B' : 'transparent',
              color: activeTab === 3 ? 'white' : '#94a3b8'
            }}>Admin</button>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={profileMenuRef}>
          {profileAvatarButton(true)}
        </div>
      </nav>

      {/* ── BODY ROW ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT SIDEBAR — desktop only */}
        <aside className="lg-flex" style={{
          flexDirection: 'column', width: '300px', flexShrink: 0,
          background: 'white', borderRight: '1px solid #e8edf2',
          overflow: 'hidden', display: 'none'
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', scrollbarWidth: 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
              {[
                { n: buildings.length, l: 'Buildings' },
                { n: rooms.length,     l: 'Rooms'     },
                { n: totalFloors,      l: 'Floors'    }
              ].map(s => (
                <div key={s.l} style={{
                  background: '#f8fafc', borderRadius: '8px',
                  padding: '8px 10px', border: '1px solid #eef2f7'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{s.n}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#0f172a' }}>Buildings</span>
              <span style={{ fontSize: '10px', color: '#1B3A6B', fontWeight: '600' }}>Showing {filteredBuildings.length}</span>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <FilterChips activeCategory={activeFilter} onFilterChange={handleFilterChange} />
            </div>

            {filteredBuildings.length === 0
              ? <EmptyBuildings />
              : filteredBuildings.map(building => (
                  <div key={building.id} onClick={() => handleBuildingSidebarClick(building)} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px',
                    borderRadius: '10px',
                    border: `1px solid ${selectedBuilding?.id === building.id ? '#E0E7FF' : '#eef2f7'}`,
                    background: selectedBuilding?.id === building.id ? '#F5F3FF' : 'white',
                    marginBottom: '6px', cursor: 'pointer'
                  }}
                    onMouseEnter={e => { if (selectedBuilding?.id !== building.id) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (selectedBuilding?.id !== building.id) e.currentTarget.style.background = 'white'; }}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: getCategoryBg(building.category), overflow: 'hidden'
                    }}>
                      {building.photoUrl ? (
                        <img src={building.photoUrl} alt={building.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none"
                          style={{ width: '18px', height: '18px', color: getCategoryColor(building.category) }}>
                          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
                            stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{building.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: getCategoryBg(building.category), color: getCategoryColor(building.category) }}>{building.category}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>G+{building.totalFloors ?? 1}</span>
                      </div>
                    </div>
                    <span style={{ color: '#d1d5db', fontSize: '16px' }}>›</span>
                  </div>
                ))
            }
          </div>
        </aside>

        {/* ── MAP + CONTENT AREA ── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

          {/* MOBILE HOME — tab 0 */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            ...(activeTab !== 0 ? { display: 'none' } : {})
          }} className="lg-hidden">
            <div style={{ background: '#0a0f1e', padding: '16px 18px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{
                    width: '36px', height: '36px', background: '#1B3A6B', borderRadius: '10px',
                    border: '1.5px solid rgba(255,255,255,.15)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                  }}>
                    <img src="/icons/dit_logo.jpg" alt="DIT Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div style={{ color: 'white', fontSize: '15px', fontWeight: '800' }}>DIT Campus Map</div>
                    <div style={{ color: '#475569', fontSize: '10px' }}>Dehradun, Uttarakhand</div>
                  </div>
                </div>
                {profileAvatarButton(false)}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <SearchBar index={searchIndex} onResultSelect={handleSearchResultSelect}
                  placeholder="Search labs, rooms, buildings..." />
              </div>

              <div style={{ display: 'flex', gap: '6px', paddingBottom: '18px' }}>
                {[
                  { n: buildings.length, l: 'Buildings' },
                  { n: rooms.length,     l: 'Rooms'     },
                  { n: totalFloors,      l: 'Floors'    }
                ].map(s => (
                  <div key={s.l} style={{
                    background: '#111827', borderRadius: '10px',
                    border: '1px solid #1e293b', padding: '9px 10px', flex: 1
                  }}>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '800' }}>{s.n}</div>
                    <div style={{ color: '#475569', fontSize: '9px', marginTop: '1px' }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, background: '#f0f4f8', padding: '14px 16px', overflowY: 'auto', scrollbarWidth: 'none' }}>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>Campus map</span>
                  <button onClick={() => setActiveTab(1)} style={{ fontSize: '11px', color: '#1B3A6B', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer' }}>Open full →</button>
                </div>
                <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e8edf2', overflow: 'hidden' }}>
                  <div style={{ height: '100px', background: '#dceadc', position: 'relative' }}>
                    {[{ t: '20px', l: '30px', c: '#3730A3' }, { t: '60px', l: '70px', c: '#15803d' }, { t: '30px', l: '120px', c: '#c2410c' }, { t: '70px', l: '160px', c: '#BE123C' }, { t: '40px', l: '200px', c: '#534AB7' }].map((d, i) => (
                      <div key={i} style={{ position: 'absolute', top: d.t, left: d.l, width: '10px', height: '10px', borderRadius: '50%', background: d.c, border: '2px solid white' }} />
                    ))}
                    <button onClick={() => setActiveTab(1)} style={{ position: 'absolute', bottom: '8px', right: '8px', background: '#1B3A6B', color: 'white', fontSize: '10px', fontWeight: '700', padding: '5px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer' }}>
                      Open interactive map
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>Buildings</span>
                <button
                  type="button"
                  onClick={() => setShowAllHomeBuildings((v) => !v)}
                  style={{
                    fontSize: '11px', color: '#1B3A6B', fontWeight: '600',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0
                  }}
                >
                  {showAllHomeBuildings ? 'Show less' : `See all ${filteredBuildings.length} →`}
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <FilterChips activeCategory={activeFilter} onFilterChange={handleFilterChange} />
              </div>

              {filteredBuildings.length === 0
                ? <EmptyBuildings />
                : (showAllHomeBuildings ? filteredBuildings : filteredBuildings.slice(0, 6)).map(b => <BuildingCard key={b.id} building={b} />)
              }
            </div>
          </div>

          {/* MAP — always on desktop, tab 1 on mobile */}
          <div style={{
            position: 'absolute', inset: 0,
            display: activeTab === 1 ? 'block' : 'none'
          }} className={activeTab !== 1 ? 'lg-block' : ''}>
            <style>{`@media(min-width:1024px){.force-map-visible{display:block!important;}}`}</style>
            <div className="force-map-visible" style={{ position: 'absolute', inset: 0, display: activeTab === 1 ? 'block' : 'none' }}>
              {shouldRenderMap && (
                <CampusMap
                  pois={filteredPois}
                  activeFilter={activeFilter}
                  routePath={routePath}
                  showRoute={false}
                  userLocation={userLocation}
                  showUserLocation={showMapLiveUi}
                  showLocationButton={showMapLiveUi}
                  flyTarget={flyTarget}
                  isVisible={isMapVisible}
                  onBuildingClick={handleBuildingClick}
                  onPOIClick={(poi) => {
                    if (poi?.type === 'location') {
                      useMapStore.setState({
                        userLocation: { lat: poi.lat, lng: poi.lng },
                        flyTarget: { lat: poi.lat, lng: poi.lng, zoom: 18 }
                      });
                      showToast('Location updated!');
                      if (selectedBuilding?.id) {
                        calculateRoute({ lat: poi.lat, lng: poi.lng }, selectedBuilding);
                      }
                    }
                  }}
                  buildings={buildings}
                />
              )}
            </div>

            <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', zIndex: 1001, display: 'flex', gap: '8px' }} className="lg-hidden">
              <button onClick={() => setActiveTab(0)} style={{
                width: '34px', height: '34px', background: 'white', borderRadius: '8px',
                border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, cursor: 'pointer'
              }}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: '16px', height: '16px' }}>
                  <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <div style={{ flex: 1 }}>
                <SearchBar index={searchIndex} onResultSelect={handleSearchResultSelect} placeholder="Search buildings, rooms..." />
              </div>
            </div>

          </div>

          {/* DIRECTORY — mobile tab 2 */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'white', display: activeTab === 2 ? 'block' : 'none' }} className="lg-hidden">
            <DirectoryPage buildings={buildings} rooms={rooms} onBuildingSelect={b => { handleBuildingSidebarClick(b); setActiveTab(1); }} />
          </div>

          {/* PROFILE/ADMIN — mobile tab 3 */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'white', display: activeTab === 3 ? 'block' : 'none' }} className="lg-hidden">
            {isAdmin ? (
              <Suspense fallback={<div style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>Loading…</div>}>
                <AdminPage onBack={() => setActiveTab(0)} user={user} />
              </Suspense>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px', padding: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>Admin access required</h3>
                <p style={{ fontSize: '14px', color: '#94a3b8' }}>You need admin privileges.</p>
                <button onClick={() => setActiveTab(0)} style={{ padding: '8px 16px', background: '#1B3A6B', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px' }}>Back to Home</button>
              </div>
            )}
          </div>

          {/* DESKTOP HOME — tab 0 */}
          {activeTab === 0 && (
            <div className="lg-block" style={{ display: 'none', position: 'absolute', inset: 0, background: '#f0f4f8', overflowY: 'auto' }}>
              <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#1B3A6B', marginBottom: '8px' }}>DIT Campus Map</h1>
                  <p style={{ color: '#64748b' }}>DIT University, Dehradun — Interactive Campus Navigation</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '32px' }}>
                  {[
                    { n: buildings.length, l: 'Buildings', e: '🏢' },
                    { n: rooms.length,     l: 'Rooms',     e: '🚪' },
                    { n: totalFloors,      l: 'Floors',    e: '📐' }
                  ].map(s => (
                    <div key={s.l} style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e8edf2', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{s.e}</div>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: '#1B3A6B' }}>{s.n}</div>
                      <div style={{ fontSize: '14px', color: '#94a3b8' }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e8edf2' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1B3A6B', marginBottom: '16px' }}>Quick Actions</h2>
                    {[
                      ...(isAdmin ? [{ label: '⚙️  Admin Panel', tab: 3 }] : [])
                    ].map(a => (
                      <button key={a.tab} onClick={() => setActiveTab(a.tab)} style={{
                        width: '100%', textAlign: 'left', padding: '12px 16px', background: '#f8fafc',
                        borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px',
                        fontWeight: '500', color: '#0f172a', marginBottom: '8px', display: 'block'
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8edf2'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                      >{a.label}</button>
                    ))}
                    {!isAdmin && (
                      <div style={{ fontSize: '14px', color: '#64748b' }}>
                        Use the left building list to explore campus locations.
                      </div>
                    )}
                  </div>

                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e8edf2' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1B3A6B', marginBottom: '16px' }}>Categories</h2>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      Category tags are hidden on desktop Home. Use search, the left building list, or open a building from the map.
                    </div>
                  </div>
                </div>

                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e8edf2' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1B3A6B', marginBottom: '16px' }}>All Buildings</h2>
                  {buildings.length === 0
                    ? <EmptyBuildings />
                    : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
                        {buildings.map(b => (
                          <div key={b.id} onClick={() => { handleBuildingSidebarClick(b); setActiveTab(1); }} style={{
                            background: '#f8fafc', borderRadius: '8px',
                            overflow: 'hidden', cursor: 'pointer', border: '1px solid #e8edf2'
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = '#e8edf2'}
                            onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                          >
                            {b.photoUrl && (
                              <img src={b.photoUrl} alt={b.name}
                                style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }} />
                            )}
                            <div style={{ padding: '12px' }}>
                              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1B3A6B' }}>{b.name}</div>
                              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', textTransform: 'capitalize' }}>{b.category}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              </div>
            </div>
          )}
        </div>

        {/* DESKTOP ADMIN */}
        {activeTab === 3 && (
          <div className="lg-block" style={{
            display: 'none', position: 'fixed', inset: 0, top: '52px',
            background: 'white', zIndex: 200
          }}>
            {isAdmin ? (
              <Suspense fallback={<div style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>Loading…</div>}>
                <AdminPage onBack={() => setActiveTab(0)} user={user} />
              </Suspense>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>Admin access required</h3>
                <button onClick={() => setActiveTab(0)} style={{ padding: '8px 16px', background: '#1B3A6B', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Back to Home</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav style={{
        flexShrink: 0, height: '58px', background: 'white',
        borderTop: '1px solid #f1f5f9', display: 'flex',
        alignItems: 'center', justifyContent: 'space-around', padding: '0 8px',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }} className="lg-hidden">
        <NavButton active={activeTab === 0} label="Home" onClick={() => setActiveTab(0)}
          icon={<svg viewBox="0 0 24 24" fill={activeTab === 0 ? '#1B3A6B' : 'none'} stroke={activeTab === 0 ? 'none' : '#94a3b8'} strokeWidth="2" style={{ width: '22px', height: '22px' }}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /></svg>} />
        <NavButton active={activeTab === 1} label="Map" onClick={() => setActiveTab(1)}
          icon={<svg viewBox="0 0 24 24" fill={activeTab === 1 ? '#1B3A6B' : 'none'} stroke={activeTab === 1 ? 'none' : '#94a3b8'} strokeWidth="2" style={{ width: '22px', height: '22px' }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>} />
        <NavButton active={activeTab === 3} label={user ? (isAdmin ? 'Admin' : 'Profile') : 'Sign in'}
          onClick={() => { if (!user) { setGuestMode(false); return; } setShowProfileMenu(v => !v); }}
          icon={user?.photoURL
            ? <img src={user.photoURL} alt="Profile" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
            : <svg viewBox="0 0 24 24" fill="none" stroke={activeTab === 3 ? '#1B3A6B' : '#94a3b8'} strokeWidth="2" style={{ width: '22px', height: '22px' }}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
          } />
      </nav>

      {/* ── PROFILE MENU ── */}
      {showProfileMenu && user && (
        <div ref={profileMenuRef} style={{
          position: 'fixed', bottom: '70px', right: '8px', zIndex: 9999,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px',
          minWidth: '220px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,.12)'
        }}>
          <div style={{ padding: '14px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {user.photoURL
                ? <img src={user.photoURL} alt="Profile" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: '40px', height: '40px', background: '#1B3A6B', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontWeight: '700' }}>{user.displayName?.charAt(0) ?? user.email?.charAt(0) ?? 'U'}</div>
              }
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{user.displayName ?? 'User'}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{user.email}</div>
                {isAdmin && <div style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', fontSize: '9px', fontWeight: '700', borderRadius: '12px', background: '#1B3A6B', color: 'white' }}>Admin</div>}
              </div>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => { setActiveTab(3); setShowProfileMenu(false); }} style={{ width: '100%', height: '44px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 14px', fontSize: '13px', color: '#0f172a', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              ⚙️ Admin panel
            </button>
          )}
          <button onClick={() => { logout(); setActiveTab(0); setShowProfileMenu(false); setGuestMode(false); }} style={{ width: '100%', height: '44px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 14px', fontSize: '13px', color: '#0f172a', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            🚪 Sign out
          </button>
        </div>
      )}

      {/* ── DETAIL PANEL ── */}
      {isPanelOpen && selectedBuilding && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'transparent' }} onClick={handleClosePanel} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500,
            margin: '0 auto', width: '100%', maxWidth: '768px',
            borderRadius: '24px 24px 0 0', background: 'white',
            boxShadow: '0 -4px 24px rgba(0,0,0,.15)', height: '85vh', overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
              <div style={{ width: '48px', height: '6px', borderRadius: '3px', background: '#e2e8f0' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 22px)', padding: '8px 16px 16px', overflow: 'auto' }}>
              <DetailPanel
                buildingName={selectedBuilding?.name || selectedBuilding?.shortName || 'Building'}
                building={selectedBuilding}
                floors={currentBuildingFloors}
                rooms={currentFloorRooms}
                selectedFloor={selectedFloor}
                selectedRoom={selectedRoom}
                onFloorChange={handleFloorChange}
                onRoomSelect={handleRoomSelect}
                onClose={handleClosePanel}
                onNavigate={handleGetDirections}
              />
            </div>
          </div>
        </>
      )}

      {/* ── DIRECTIONS STEPPER ── */}
      {directionsOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'transparent' }} onClick={handleClosePanel} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 700, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '100%', maxWidth: '768px', pointerEvents: 'auto' }}>
              <DirectionsStepper
                directions={directionsSteps}
                destinationName={directionsRoom?.name ?? selectedBuilding?.name ?? 'Destination'}
                buildingName={selectedBuilding?.name}
                targetFloorNumber={directionsRoom?.floorNumber ?? selectedFloor ?? 0}
                onFloorChange={handleDirectionsFloorChange}
                onClose={handleClosePanel}
                onArrive={handleClosePanel}
              />
            </div>
          </div>
        </>
      )}

      {/* ── INDOOR PATH VIEW ── */}
      {indoorPathOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 750, background: 'transparent' }} onClick={handleIndoorDone} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 760, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '100%', maxWidth: '920px', height: '74vh', padding: '0 10px 10px', pointerEvents: 'auto' }}>
              <div style={{ height: '100%', overflow: 'hidden', borderRadius: '24px 24px 0 0', border: '1px solid #dbe4ef', background: 'white', boxShadow: '0 -6px 30px rgba(0,0,0,0.18)' }}>
                <IndoorPathView
                  building={selectedBuilding}
                  floor={currentFloorObj}
                  targetFloor={currentFloorObj}
                  destination={directionsRoom}
                  targetRoom={directionsRoom}
                  rooms={currentFloorRooms}
                  instructionStep={indoorStep}
                  floorPlanUrl={currentFloorObj?.planImageUrl || currentFloorObj?.planImageData || currentFloorObj?.floorPlanUrl || ''}
                  entryPointId={currentFloorObj?.entryPoints?.[0]?.id || 'main_gate'}
                  onDone={handleIndoorDone}
                  onClose={handleIndoorDone}
                />
              </div>
            </div>
          </div>
        </>
      )}

    </main>
  );
}