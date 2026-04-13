// src/pages/AdminPage.jsx
// Image strategy: compress → base64 → stored directly in Firestore field.
// No Firebase Storage, no external services, works on free Spark plan.
// Max compressed size ≈ 200KB base64 (well under 1MB Firestore doc limit).
//
// FIXES APPLIED:
//  1. openFloorMgr — auto-increments floorNumber so new floors never
//     overwrite the same Firestore doc (_F0 collision).
//  2. saveFloor — uses editFloor.id when editing (not re-derived from
//     floorNumber), adds collision guard for new floors, resets form
//     to next auto-incremented number after save.
//  3. Pin <Btn> — re-fetches fresh floor data before opening pin tool
//     so planImageUrl is always current.
//  4. <FloorPlanPinTool> — now passes floorPlanUrl={pinTool.floor?.planImageUrl}
//     so the image actually renders in the pin tool.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDocs, limit,
  onSnapshot, orderBy, query, serverTimestamp, setDoc
} from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import useAuth from '../hooks/useAuth';
import FloorPlanPinTool from '../components/admin/FloorPlanPinTool';
import ditBuildings from '../data/ditBuildings.json';
import {
  addAdmin, addBuilding, addFloor, addRoom,
  getAdmins, getFloorsForBuilding, logAudit,
  removeAdmin, subscribeToBuildings, subscribeToRooms,
  updateBuilding, updateFloor, updateRoom
} from '../services/firestoreService';

// ─── Image compression helper ─────────────────────────────────────────────────
function compressImageToBase64(file, maxWidth = 800, maxHeight = 600, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth)  { h = Math.round(h * maxWidth  / w); w = maxWidth;  }
        if (h > maxHeight) { w = Math.round(w * maxHeight / h); h = maxHeight; }

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const b64 = canvas.toDataURL('image/jpeg', quality);

        const estimatedBytes = Math.round(b64.length * 0.75);
        if (estimatedBytes > 900_000) {
          reject(new Error(`Image too large after compression (${Math.round(estimatedBytes/1024)}KB). Please use a smaller image.`));
          return;
        }
        resolve(b64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        '#f0f4f8',
  surface:   '#ffffff',
  sidebar:   '#0a0f1e',
  sideHover: 'rgba(255,255,255,0.06)',
  primary:   '#1B3A6B',
  primaryLt: '#EEF2FF',
  border:    '#e8edf2',
  text:      '#0f172a',
  textMid:   '#475569',
  textDim:   '#94a3b8',
  danger:    '#ef4444',
  dangerBg:  '#FFF1F2',
  success:   '#059669',
  successBg: '#F0FDF4',
  warn:      '#d97706',
  warnBg:    '#FFFBEB',
  blue:      '#3730A3',
  blueBg:    '#EEF2FF',
};

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',  icon: '⊞' },
  { id: 'buildings',  label: 'Buildings',  icon: '🏢' },
  { id: 'rooms',      label: 'Rooms',      icon: '🚪' },
  { id: 'directions', label: 'Directions', icon: '🧭' },
  { id: 'admins',     label: 'Admins',     icon: '👤' },
  { id: 'audit',      label: 'Audit Log',  icon: '📋' },
];

const ROOM_TYPES    = ['classroom','lab','office','library','cafeteria','auditorium','other'];
const BUILDING_CATS = ['academic','admin','hostel','sports','medical','amenity','other'];

const EMPTY_BUILDING = {
  name:'', shortName:'', category:'academic', totalFloors:1,
  description:'', lat:'', lng:'',
  photoUrl:'',
  photoBase64:'',
};
const EMPTY_ROOM = {
  buildingId:'', floorId:'', roomNumber:'', name:'',
  type:'classroom', department:'',
  hoursWeekday:'', hoursSaturday:'',
  hoursSunday:'', searchTags:'', accessible:false, temporarilyClosed:false,
};
const EMPTY_FLOOR = {
  floorNumber: 0, label: 'Ground Floor',
  planImageUrl: '',
  planBase64:   '',
  entryPoints: '', corridorWaypoints: '',
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function Pill({ children, color = 'slate' }) {
  const map = {
    slate: { bg:'#f1f5f9',    color:'#475569' },
    blue:  { bg:C.blueBg,     color:C.blue    },
    green: { bg:C.successBg,  color:C.success  },
    rose:  { bg:C.dangerBg,   color:C.danger   },
    amber: { bg:C.warnBg,     color:C.warn     },
    navy:  { bg:C.primaryLt,  color:C.primary  },
  };
  const s = map[color] || map.slate;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:'20px', fontSize:'10px', fontWeight:'800', letterSpacing:'0.04em', background:s.bg, color:s.color }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, variant='primary', disabled=false, size='md', full=false }) {
  const sizes = { sm:{ padding:'6px 13px', fontSize:'11px' }, md:{ padding:'9px 18px', fontSize:'13px' } };
  const vars  = {
    primary: { background:C.primary,     color:'white'    },
    danger:  { background:C.danger,      color:'white'    },
    ghost:   { background:'#f1f5f9',     color:C.text     },
    outline: { background:'transparent', color:C.textMid, border:`1.5px solid ${C.border}` },
  };
  const v = vars[variant] || vars.primary;
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ ...sizes[size], border:'none', borderRadius:'10px', fontWeight:'700', cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1, display:'inline-flex', alignItems:'center', gap:'5px', width:full?'100%':undefined, justifyContent:full?'center':undefined, fontFamily:'inherit', transition:'filter 0.1s', ...(v.border?{border:v.border}:{}), background:v.background, color:v.color }}
      onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.filter='brightness(0.9)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.filter='none'; }}>
      {children}
    </button>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      <label style={{ fontSize:'10px', fontWeight:'800', color:C.textDim, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</label>
      {children}
      {hint  && <span style={{ fontSize:'11px', color:C.textDim }}>{hint}</span>}
      {error && <span style={{ fontSize:'11px', color:C.danger }}>{error}</span>}
    </div>
  );
}

function TInput({ value, onChange, placeholder, type='text', disabled=false }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
      style={{ width:'100%', padding:'9px 12px', borderRadius:'10px', fontSize:'13px', border:`1.5px solid ${C.border}`, outline:'none', color:C.text, background:disabled?'#f8fafc':'white', boxSizing:'border-box', fontFamily:'inherit' }}
      onFocus={e=>e.target.style.borderColor=C.primary}
      onBlur={e =>e.target.style.borderColor=C.border}
    />
  );
}

function TSelect({ value, onChange, children }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width:'100%', padding:'9px 12px', borderRadius:'10px', fontSize:'13px', border:`1.5px solid ${C.border}`, outline:'none', background:'white', color:C.text, boxSizing:'border-box', fontFamily:'inherit' }}>
      {children}
    </select>
  );
}

function TArea({ value, onChange, placeholder, rows=3 }) {
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{ width:'100%', padding:'9px 12px', borderRadius:'10px', fontSize:'13px', border:`1.5px solid ${C.border}`, outline:'none', resize:'vertical', color:C.text, boxSizing:'border-box', fontFamily:'inherit' }}
      onFocus={e=>e.target.style.borderColor=C.primary}
      onBlur={e =>e.target.style.borderColor=C.border}
    />
  );
}

// ─── ImagePickerField ─────────────────────────────────────────────────────────
function ImagePickerField({ label, existingUrl, onBase64, hint, maxWidth=800, maxHeight=600 }) {
  const inputRef = useRef(null);
  const [preview,     setPreview]     = useState(null);
  const [dragOver,    setDragOver]    = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [sizeInfo,    setSizeInfo]    = useState('');
  const [pickError,   setPickError]   = useState('');

  const processFile = async file => {
    if (!file || !file.type.startsWith('image/')) {
      setPickError('Please pick an image file (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPickError('File is too large (max 10 MB before compression).');
      return;
    }
    setPickError('');
    setCompressing(true);
    try {
      const b64 = await compressImageToBase64(file, maxWidth, maxHeight);
      const kb = Math.round(b64.length * 0.75 / 1024);
      setSizeInfo(`${kb} KB compressed`);
      setPreview(b64);
      onBase64(b64);
    } catch (err) {
      setPickError(err.message || 'Compression failed. Try a smaller image.');
    } finally {
      setCompressing(false);
    }
  };

  const handleDrop = e => {
    e.preventDefault(); setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const displayUrl = preview || existingUrl || null;

  return (
    <Field label={label} hint={hint} error={pickError}>
      <div
        onClick={() => !compressing && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? C.primary : C.border}`,
          borderRadius: '12px',
          background: dragOver ? C.primaryLt : '#f8fafc',
          cursor: compressing ? 'wait' : 'pointer',
          transition: 'all 0.15s', overflow: 'hidden',
          minHeight: displayUrl ? undefined : '110px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>

        {compressing ? (
          <div style={{ padding:'28px', display:'flex', flexDirection:'column', alignItems:'center', gap:'10px' }}>
            <Spin size={24} />
            <span style={{ fontSize:'12px', color:C.textMid, fontWeight:'700' }}>Compressing image…</span>
          </div>
        ) : displayUrl ? (
          <div style={{ position:'relative', width:'100%' }}>
            <img src={displayUrl} alt="preview"
              style={{ width:'100%', maxHeight:'200px', objectFit:'cover', display:'block' }} />
            <div style={{
              position:'absolute', inset:0,
              background:'rgba(0,0,0,0)', display:'flex',
              alignItems:'center', justifyContent:'center',
              transition:'background 0.15s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.background='rgba(0,0,0,0.45)';
                e.currentTarget.querySelector('span').style.opacity='1';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background='rgba(0,0,0,0)';
                e.currentTarget.querySelector('span').style.opacity='0';
              }}>
              <span style={{ color:'white', fontSize:'12px', fontWeight:'800', opacity:'0', transition:'opacity 0.15s', background:'rgba(0,0,0,0.5)', padding:'6px 14px', borderRadius:'20px' }}>
                📷 Click to change
              </span>
            </div>
          </div>
        ) : (
          <div style={{ padding:'28px', textAlign:'center' }}>
            <div style={{ fontSize:'32px', marginBottom:'8px' }}>📷</div>
            <div style={{ fontSize:'13px', fontWeight:'700', color:C.textMid }}>Click or drag image here</div>
            <div style={{ fontSize:'11px', color:C.textDim, marginTop:'3px' }}>JPG · PNG · WEBP — auto-compressed</div>
          </div>
        )}
      </div>

      {sizeInfo && !compressing && (
        <div style={{ fontSize:'11px', color:C.success, fontWeight:'700', marginTop:'2px' }}>
          ✓ Ready to save · {sizeInfo}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*"
        style={{ display:'none' }}
        onChange={e => processFile(e.target.files[0])}
      />
    </Field>
  );
}

function HR() { return <div style={{ height:'1px', background:C.border, margin:'16px 0' }} />; }

function Spin({ size=20 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', border:`3px solid ${C.border}`, borderTopColor:C.primary, animation:'spin 0.75s linear infinite', flexShrink:0 }} />
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, open, onClose, children, width=540 }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10,15,30,0.65)', padding:'16px' }} onClick={onClose}>
      <div style={{ width:'100%', maxWidth:width, background:C.surface, borderRadius:'20px', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <span style={{ fontSize:'14px', fontWeight:'800', color:C.text }}>{title}</span>
          <button type="button" onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:'8px', width:'28px', height:'28px', cursor:'pointer', fontSize:'14px', color:C.textMid, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', padding:'20px', flex:1 }}>{children}</div>
      </div>
    </div>
  );
}

function Confirm({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10,15,30,0.75)', padding:'16px' }}>
      <div style={{ width:'100%', maxWidth:360, background:C.surface, borderRadius:'20px', padding:'28px', boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize:'13px', color:C.text, lineHeight:'1.65', marginBottom:'22px' }}>{message}</div>
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <Btn variant="outline" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger"  onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
function Table({ headers, rows, empty }) {
  return (
    <div style={{ borderRadius:'16px', border:`1px solid ${C.border}`, overflow:'hidden', background:C.surface }}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              {headers.map(h => (
                <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'10px', fontWeight:'800', color:C.textDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap', borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        {(!rows || rows.length === 0) && (
          <div style={{ padding:'52px 24px', textAlign:'center' }}>
            <div style={{ fontSize:'28px', opacity:0.2, marginBottom:'8px' }}>◉</div>
            <div style={{ fontSize:'13px', color:C.textDim }}>{empty}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TRow({ cells, actions }) {
  const [hov, setHov] = useState(false);
  return (
    <tr style={{ background:hov?'#f8fafc':C.surface, transition:'background 0.1s' }}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      {cells.map((cell,i) => (
        <td key={i} style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, color:C.text, fontSize:'13px', verticalAlign:'middle' }}>{cell}</td>
      ))}
      {actions && (
        <td style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>
          <div style={{ display:'flex', gap:'6px' }}>{actions}</div>
        </td>
      )}
    </tr>
  );
}

function Stat({ label, value, accent=C.primary, centered=false, valueSize='34px', fullWidth=false }) {
  return (
    <div style={{ background:C.surface, borderRadius:'16px', border:`1px solid ${C.border}`, padding:'20px 22px', textAlign:centered?'center':'left', gridColumn:fullWidth?'span 2':'auto' }}>
      <div style={{ fontSize:'10px', fontWeight:'800', color:C.textDim, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>{label}</div>
      <div style={{ fontSize:valueSize, fontWeight:'900', color:accent, lineHeight:1.15, overflowWrap:'anywhere' }}>{value}</div>
    </div>
  );
}

function SectionHead({ title, count, action }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <span style={{ fontSize:'17px', fontWeight:'900', color:C.text }}>{title}</span>
        {count !== undefined && <Pill color="navy">{count}</Pill>}
      </div>
      {action}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)', zIndex:9999, background:C.sidebar, color:'white', fontSize:'13px', fontWeight:'700', padding:'10px 22px', borderRadius:'999px', boxShadow:'0 4px 20px rgba(0,0,0,0.3)', pointerEvents:'none', whiteSpace:'nowrap' }}>
      {msg}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export default function AdminPage({ onBack }) {
  const { user, adminRole, loading } = useAuth();

  const [activeTab,  setActiveTab]  = useState('dashboard');
  const [mobSidebar, setMobSidebar] = useState(false);
  const [toastMsg,   setToastMsg]   = useState('');
  const [saving,     setSaving]     = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [buildings,    setBuildings]    = useState([]);
  const [buildingsReady, setBuildingsReady] = useState(false);
  const [rooms,        setRooms]        = useState([]);
  const [admins,       setAdmins]       = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [floorsByBldg, setFloorsByBldg] = useState({});

  const [adminsLoading, setAdminsLoading] = useState(false);
  const [auditLoading,  setAuditLoading]  = useState(false);

  // ── Building modal ──────────────────────────────────────────────────────────
  const [bldgModal, setBldgModal] = useState(false);
  const [editBldg,  setEditBldg]  = useState(null);
  const [bldgForm,  setBldgForm]  = useState({...EMPTY_BUILDING});
  const [bldgErrs,  setBldgErrs]  = useState({});
  const [delBldg,   setDelBldg]   = useState(null);

  // ── Floor modal ─────────────────────────────────────────────────────────────
  const [floorModal, setFloorModal] = useState(false);
  const [floorBldg,  setFloorBldg]  = useState(null);
  const [floorForm,  setFloorForm]  = useState({...EMPTY_FLOOR});
  const [editFloor,  setEditFloor]  = useState(null);
  const [floorErrs,  setFloorErrs]  = useState({});

  // ── Pin tool ────────────────────────────────────────────────────────────────
  const [pinTool, setPinTool] = useState({ open:false, floor:null, floorId:null });

  // ── Room modal ──────────────────────────────────────────────────────────────
  const [roomModal, setRoomModal] = useState(false);
  const [editRoom,  setEditRoom]  = useState(null);
  const [roomForm,  setRoomForm]  = useState({...EMPTY_ROOM});
  const [roomErrs,  setRoomErrs]  = useState({});
  const [delRoom,   setDelRoom]   = useState(null);

  // ── Admin modal ─────────────────────────────────────────────────────────────
  const [adminModal, setAdminModal] = useState(false);
  const [adminForm,  setAdminForm]  = useState({ email:'', name:'', role:'editor' });
  const [adminErrs,  setAdminErrs]  = useState({});
  const [delAdmin,   setDelAdmin]   = useState(null);

  // ── Directions ──────────────────────────────────────────────────────────────
  const [dirBldgId,  setDirBldgId]  = useState('');
  const [dirRoomId,  setDirRoomId]  = useState('');
  const [dirDraft,   setDirDraft]   = useState([]);
  const [dirStep,    setDirStep]    = useState('');

  // ── Toast ───────────────────────────────────────────────────────────────────
  const showToast = useCallback(msg => {
    setToastMsg(msg); setTimeout(()=>setToastMsg(''), 3200);
  }, []);

  const staticBuildings = useMemo(() => {
    const features = Array.isArray(ditBuildings?.features) ? ditBuildings.features : [];
    return features
      .map((feature) => {
        const props = feature?.properties || {};
        const id = props.id;
        if (!id) return null;

        const ring = feature?.geometry?.coordinates?.[0] || [];
        const pts = ring.filter((p) => Array.isArray(p) && p.length >= 2);

        let lat = null;
        let lng = null;
        if (pts.length) {
          const sum = pts.reduce((acc, [x, y]) => ({ lng: acc.lng + x, lat: acc.lat + y }), { lat: 0, lng: 0 });
          lat = sum.lat / pts.length;
          lng = sum.lng / pts.length;
        }

        return {
          id,
          name: props.name || id,
          shortName: props.shortName || String(props.name || id).slice(0, 2).toUpperCase(),
          category: props.category || 'academic',
          totalFloors: Number(props.totalFloors) || 1,
          groundLabel: props.groundLabel || 'G',
          description: props.description || '',
          lat,
          lng,
          seededFrom: 'static-json',
          isStaticFallback: true,
        };
      })
      .filter(Boolean);
  }, []);

  const mergeWithStaticBuildings = useCallback((firestoreList = []) => {
    const map = {};
    for (const b of firestoreList) map[b.id] = b;
    for (const b of staticBuildings) {
      if (!map[b.id]) map[b.id] = b;
    }
    return Object.values(map);
  }, [staticBuildings]);

  // ── Subscriptions ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !user) return;

    const seedMissingStaticBuildings = async () => {
      try {
        const existingSnap = await getDocs(collection(db, 'buildings'));
        const existingIds = new Set(existingSnap.docs.map((d) => d.id));
        const features = Array.isArray(ditBuildings?.features) ? ditBuildings.features : [];

        for (const feature of features) {
          const id = feature?.properties?.id;
          if (!id || existingIds.has(id)) continue;

          const props = feature.properties || {};
          const ring = feature?.geometry?.coordinates?.[0] || [];
          const pts = ring.filter((p) => Array.isArray(p) && p.length >= 2);

          let lat = null;
          let lng = null;
          if (pts.length) {
            const sum = pts.reduce((acc, [x, y]) => ({ lng: acc.lng + x, lat: acc.lat + y }), { lat: 0, lng: 0 });
            lat = sum.lat / pts.length;
            lng = sum.lng / pts.length;
          }

          await setDoc(doc(db, 'buildings', id), {
            name: props.name || id,
            shortName: props.shortName || String(props.name || id).slice(0, 2).toUpperCase(),
            category: props.category || 'academic',
            totalFloors: Number(props.totalFloors) || 1,
            groundLabel: props.groundLabel || 'G',
            description: props.description || '',
            lat,
            lng,
            createdAt: serverTimestamp(),
            seededFrom: 'static-json',
          });
        }
      } catch (e) {
        console.error('Failed to seed static buildings into Firestore:', e);
      }
    };

    seedMissingStaticBuildings();
    const u1 = subscribeToBuildings((list) => {
      setBuildings(mergeWithStaticBuildings(list));
      setBuildingsReady(true);
    });
    const u2 = subscribeToRooms(setRooms);
    return () => { u1(); u2(); };
  }, [loading, user, mergeWithStaticBuildings]);

  useEffect(() => {
    if (activeTab !== 'admins') return;
    setAdminsLoading(true);
    getAdmins().then(setAdmins).catch(console.error).finally(()=>setAdminsLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'audit') return;
    setAuditLoading(true);
    const q = query(collection(db,'audit'), orderBy('timestamp','desc'), limit(100));
    const unsub = onSnapshot(q, snap=>{
      setAuditEntries(snap.docs.map(d=>({id:d.id,...d.data()})));
      setAuditLoading(false);
    });
    return ()=>unsub();
  }, [activeTab]);

  const loadFloors = useCallback(async bId => {
    if (!bId) return [];
    try {
      const list = await getFloorsForBuilding(bId);
      setFloorsByBldg(p=>({...p,[bId]:list}));
      return list;
    } catch(e){ console.error(e); return []; }
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalFloors = useMemo(()=>buildings.reduce((s,b)=>s+(Number(b.totalFloors)||0),0),[buildings]);
  const lastUpdated = useMemo(()=>{
    const d=buildings.map(b=>b.lastUpdated?.toDate?.()).filter(Boolean);
    return d.length?new Date(Math.max(...d)).toLocaleDateString():'Never';
  },[buildings]);
  const bldgsById = useMemo(()=>{ const m={}; buildings.forEach(b=>m[b.id]=b); return m; },[buildings]);
  const curFloors = useMemo(()=>floorBldg?(floorsByBldg[floorBldg.id]??[]):[],[floorBldg,floorsByBldg]);

  // Directions derived
  const dirRooms = useMemo(()=>
    dirBldgId ? rooms.filter(r=>r.buildingId===dirBldgId) : rooms
  ,[dirBldgId, rooms]);
  const dirRoom = useMemo(()=>rooms.find(r=>r.id===dirRoomId),[rooms,dirRoomId]);
  useEffect(()=>{ setDirDraft(dirRoom?.directions??[]); },[dirRoomId, dirRoom]);
  useEffect(()=>{ setDirRoomId(''); },[dirBldgId]);

  // ── Building CRUD ────────────────────────────────────────────────────────────
  const openAddBldg  = ()=>{ setEditBldg(null); setBldgForm({...EMPTY_BUILDING}); setBldgErrs({}); setBldgModal(true); };
  const openEditBldg = b =>{ setEditBldg(b); setBldgForm({ name:b.name||'', shortName:b.shortName||'', category:b.category||'academic', totalFloors:b.totalFloors||1, description:b.description||'', lat:b.lat||'', lng:b.lng||'', photoUrl:b.photoUrl||'', photoBase64:'' }); setBldgErrs({}); setBldgModal(true); };
  const valBldg = ()=>{ const e={}; if(!bldgForm.name.trim())e.name='Required'; if(!bldgForm.shortName.trim())e.shortName='Required'; if(isNaN(+bldgForm.lat))e.lat='Required'; if(isNaN(+bldgForm.lng))e.lng='Required'; if(+bldgForm.totalFloors<1)e.totalFloors='Min 1'; setBldgErrs(e); return !Object.keys(e).length; };
  const saveBldg = async ()=>{
    if(!valBldg()) return; setSaving(true);
    try {
      const photoUrl = bldgForm.photoBase64 || bldgForm.photoUrl || '';
      const data={ name:bldgForm.name.trim(), shortName:bldgForm.shortName.trim(), category:bldgForm.category, totalFloors:+bldgForm.totalFloors, description:bldgForm.description.trim(), lat:+bldgForm.lat, lng:+bldgForm.lng, photoUrl };
      if(editBldg){
        if (editBldg.isStaticFallback) {
          await setDoc(doc(db, 'buildings', editBldg.id), {
            ...data,
            groundLabel: editBldg.groundLabel || 'G',
            seededFrom: 'static-json',
            createdAt: serverTimestamp(),
          }, { merge: true });
        } else {
          await updateBuilding(editBldg.id,data);
        }
        await logAudit('update','building',editBldg.id);
        showToast('Building updated ✓');
      }
      else{ const id=await addBuilding(data); await logAudit('create','building',id); showToast('Building added ✓'); }
      setBldgModal(false);
    } catch(e){ console.error(e); showToast('Error saving building'); }
    finally{ setSaving(false); }
  };
  const confirmDelBldg = async ()=>{
    const b=delBldg; if(!b) return; setSaving(true);
    try{ await deleteDoc(doc(db,'buildings',b.id)); await logAudit('delete','building',b.id); showToast('Deleted'); }
    catch(e){ console.error(e); showToast('Error deleting'); }
    finally{ setSaving(false); setDelBldg(null); }
  };

  // ── Floor CRUD ───────────────────────────────────────────────────────────────

  // FIX 1: auto-increment floorNumber so new floors never overwrite _F0
  const openFloorMgr = async b => {
    setFloorBldg(b);
    setEditFloor(null);
    setFloorErrs({});
    const existing = await loadFloors(b.id);
    const nextNum = existing.length > 0
      ? Math.max(...existing.map(f => f.floorNumber ?? 0)) + 1
      : 0;
    setFloorForm({
      ...EMPTY_FLOOR,
      floorNumber: nextNum,
      label: nextNum === 0 ? 'Ground Floor' : `Floor ${nextNum}`,
    });
    setFloorModal(true);
  };

  const startEditFloor = fl => {
    setEditFloor(fl);
    setFloorForm({
      floorNumber: fl.floorNumber ?? 0,
      label: fl.label || '',
      planImageUrl: fl.planImageUrl || '',
      planBase64: '',
      entryPoints: (fl.entryPoints || []).join(', '),
      corridorWaypoints: (fl.corridorWaypoints || []).join(', '),
    });
    setFloorErrs({});
  };

  const valFloor = ()=>{ const e={}; if(!floorForm.label.trim())e.label='Required'; setFloorErrs(e); return !Object.keys(e).length; };

  // FIX 2: use editFloor.id when editing, collision guard when adding,
  //        reset to next auto-incremented number after save
  const saveFloor = async () => {
    if (!valFloor() || !floorBldg) return;
    setSaving(true);
    try {
      const planImageUrl = floorForm.planBase64 || floorForm.planImageUrl || '';
      const data = {
        buildingId:        floorBldg.id,
        floorNumber:       +floorForm.floorNumber,
        label:             floorForm.label.trim(),
        planImageUrl,
        entryPoints:       floorForm.entryPoints.split(',').map(s => s.trim()).filter(Boolean),
        corridorWaypoints: floorForm.corridorWaypoints.split(',').map(s => s.trim()).filter(Boolean),
      };

      if (editFloor) {
        // FIX: always use editFloor.id — never re-derive from floorNumber
        await updateFloor(editFloor.id, data);
        await logAudit('update', 'floor', editFloor.id);
        showToast('Floor updated ✓');
      } else {
        const fid = `${floorBldg.id}_F${data.floorNumber}`;
        // FIX: collision guard — prevent silently overwriting an existing floor
        const existingIds = (floorsByBldg[floorBldg.id] ?? []).map(f => f.id);
        if (existingIds.includes(fid)) {
          showToast(`Floor ${data.floorNumber} already exists — edit it instead`);
          setSaving(false);
          return;
        }
        await addFloor(fid, data);
        await logAudit('create', 'floor', fid);
        showToast('Floor added ✓');
      }

      // Reload and advance form to next available number
      const refreshed = await loadFloors(floorBldg.id);
      setEditFloor(null);
      const nextNum = refreshed.length > 0
        ? Math.max(...refreshed.map(f => f.floorNumber ?? 0)) + 1
        : 0;
      // FIX: reset to next number, not 0
      setFloorForm({
        ...EMPTY_FLOOR,
        floorNumber: nextNum,
        label: nextNum === 0 ? 'Ground Floor' : `Floor ${nextNum}`,
      });

    } catch (e) {
      console.error(e);
      showToast('Error saving floor');
    } finally {
      setSaving(false);
    }
  };

  // ── Room CRUD ────────────────────────────────────────────────────────────────
  const openAddRoom  = ()=>{ setEditRoom(null); setRoomForm({...EMPTY_ROOM}); setRoomErrs({}); setRoomModal(true); };
  const openEditRoom = r=>{ setEditRoom(r); setRoomForm({ buildingId:r.buildingId||'', floorId:r.floorId||'', roomNumber:r.roomNumber||r.number||'', name:r.name||'', type:r.type||'classroom', department:r.department||'', hoursWeekday:r.hoursWeekday||'', hoursSaturday:r.hoursSaturday||'', hoursSunday:r.hoursSunday||'', searchTags:r.searchTags||'', accessible:r.accessible||false, temporarilyClosed:r.temporarilyClosed||false }); setRoomErrs({}); setRoomModal(true); };
  const valRoom = ()=>{ const e={}; if(!roomForm.buildingId)e.buildingId='Required'; if(!roomForm.roomNumber.trim())e.roomNumber='Required'; if(!roomForm.name.trim())e.name='Required'; setRoomErrs(e); return !Object.keys(e).length; };
  const saveRoom = async ()=>{
    if(!valRoom()) return; setSaving(true);
    try{
      const data={ buildingId:roomForm.buildingId, floorId:roomForm.floorId, roomNumber:roomForm.roomNumber.trim(), name:roomForm.name.trim(), type:roomForm.type, department:roomForm.department.trim(), hoursWeekday:roomForm.hoursWeekday.trim(), hoursSaturday:roomForm.hoursSaturday.trim(), hoursSunday:roomForm.hoursSunday.trim(), searchTags:roomForm.searchTags.trim(), accessible:roomForm.accessible, temporarilyClosed:roomForm.temporarilyClosed };
      if(editRoom){ await updateRoom(editRoom.id,data); await logAudit('update','room',editRoom.id); showToast('Room updated ✓'); }
      else{ const id=await addRoom(data); await logAudit('create','room',id); showToast('Room added ✓'); }
      setRoomModal(false);
    } catch(e){ console.error(e); showToast('Error saving room'); }
    finally{ setSaving(false); }
  };
  const confirmDelRoom = async ()=>{
    const r=delRoom; if(!r) return; setSaving(true);
    try{ await deleteDoc(doc(db,'rooms',r.id)); await logAudit('delete','room',r.id); showToast('Deleted'); }
    catch(e){ console.error(e); showToast('Error deleting'); }
    finally{ setSaving(false); setDelRoom(null); }
  };

  // ── Admin CRUD ───────────────────────────────────────────────────────────────
  const valAdmin = ()=>{ const e={}; if(!adminForm.email.includes('@'))e.email='Valid email required'; if(!adminForm.name.trim())e.name='Required'; setAdminErrs(e); return !Object.keys(e).length; };
  const saveAdmin = async ()=>{
    if(!valAdmin()) return; setSaving(true);
    try{ await addAdmin({email:adminForm.email.trim(),name:adminForm.name.trim(),role:adminForm.role}); await logAudit('create','admin',adminForm.email.trim()); showToast('Admin added ✓'); setAdminModal(false); setAdminForm({email:'',name:'',role:'editor'}); const u=await getAdmins(); setAdmins(u); }
    catch(e){ console.error(e); showToast('Error adding admin'); }
    finally{ setSaving(false); }
  };
  const confirmDelAdmin = async ()=>{
    const a=delAdmin; if(!a) return; setSaving(true);
    try{ await removeAdmin(a.email); await logAudit('delete','admin',a.email); showToast('Removed'); const u=await getAdmins(); setAdmins(u); }
    catch(e){ console.error(e); showToast('Error removing'); }
    finally{ setSaving(false); setDelAdmin(null); }
  };

  // ── Directions ───────────────────────────────────────────────────────────────
  const addDirStep    = ()=>{ const s=dirStep.trim(); if(!s) return; setDirDraft(p=>[...p,s]); setDirStep(''); };
  const removeDirStep = i =>setDirDraft(p=>p.filter((_,j)=>j!==i));
  const saveDirSteps  = async ()=>{
    if(!dirRoom) return; setSaving(true);
    try{ await updateRoom(dirRoom.id,{directions:dirDraft}); await logAudit('update','directions',dirRoom.id); showToast('Directions saved ✓'); }
    catch(e){ console.error(e); showToast('Error saving directions'); }
    finally{ setSaving(false); }
  };

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', background:C.bg, flexDirection:'column', gap:'16px' }}>
      <Spin size={32}/><span style={{ fontSize:'14px', color:C.textDim }}>Loading…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  if (!adminRole) return (
    <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', background:C.bg }}>
      <div style={{ background:C.surface, borderRadius:'20px', padding:'44px', textAlign:'center', maxWidth:'340px', border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:'44px', marginBottom:'14px' }}>🔒</div>
        <div style={{ fontSize:'17px', fontWeight:'900', color:C.text, marginBottom:'8px' }}>Access Denied</div>
        <div style={{ fontSize:'13px', color:C.textDim, marginBottom:'22px' }}>Admin role required.</div>
        {onBack && <Btn onClick={onBack} size="sm">← Go Back</Btn>}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  // ── Sidebar tab button ────────────────────────────────────────────────────────
  const STab = ({ tab }) => {
    const active = activeTab===tab.id;
    return (
      <button type="button" onClick={()=>{ setActiveTab(tab.id); setMobSidebar(false); }}
        style={{ display:'flex', alignItems:'center', gap:'10px', width:'100%', padding:'10px 14px', borderRadius:'10px', border:'none', background:active?'rgba(255,255,255,0.11)':'transparent', cursor:'pointer', textAlign:'left', marginBottom:'2px', transition:'background 0.15s', fontFamily:'inherit' }}
        onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=C.sideHover; }}
        onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}>
        <span style={{ fontSize:'15px', lineHeight:1, width:'20px', textAlign:'center' }}>{tab.icon}</span>
        <span style={{ fontSize:'13px', fontWeight:active?'800':'600', color:active?'white':'rgba(255,255,255,0.5)' }}>{tab.label}</span>
        {active && <div style={{ marginLeft:'auto', width:'3px', height:'16px', borderRadius:'2px', background:C.primary }} />}
      </button>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', height:'100vh', background:C.bg, overflow:'hidden', fontFamily:"system-ui,-apple-system,sans-serif" }}>

      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
        @media(min-width:768px){
          .mob-only   { display:none !important; }
          .adm-sidebar{ position:relative !important; transform:translateX(0) !important; }
          .adm-main   { margin-left:0 !important; }
        }
      `}</style>

      <Toast msg={toastMsg} />

      {/* Mobile overlay */}
      {mobSidebar && (
        <div style={{ position:'fixed', inset:0, zIndex:30, background:'rgba(0,0,0,0.5)' }} onClick={()=>setMobSidebar(false)} />
      )}

      {/* ═══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside className="adm-sidebar" style={{ width:'218px', flexShrink:0, background:C.sidebar, display:'flex', flexDirection:'column', position:'fixed', top:0, bottom:0, left:0, zIndex:40, transform:mobSidebar?'translateX(0)':'translateX(-100%)', transition:'transform 0.2s' }}>
        <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'36px', height:'36px', background:C.primary, borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid rgba(255,255,255,0.12)' }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width:'18px', height:'18px' }}>
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" fill="white"/>
              </svg>
            </div>
            <div>
              <div style={{ color:'white', fontSize:'13px', fontWeight:'800', lineHeight:1.2 }}>Admin Console</div>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'10px', marginTop:'2px' }}>DIT Campus Map</div>
            </div>
          </div>
        </div>

        <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
          {TABS.map(tab => <STab key={tab.id} tab={tab} />)}
        </nav>

        <div style={{ padding:'12px 14px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
            <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:C.primary, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'12px', fontWeight:'800', flexShrink:0 }}>
              {user?.displayName?.charAt(0)??user?.email?.charAt(0)??'A'}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ color:'white', fontSize:'12px', fontWeight:'700', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.displayName??'Admin'}</div>
              <div style={{ color:'rgba(255,255,255,0.28)', fontSize:'10px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          <Pill color="navy">{adminRole}</Pill>
          <div style={{ marginTop:'10px', display:'flex', gap:'6px' }}>
            {onBack && (
              <button type="button" onClick={onBack} style={{ flex:1, padding:'7px 0', fontSize:'11px', fontWeight:'700', background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.55)', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
            )}
            <button type="button" onClick={()=>signOut(auth)} style={{ flex:1, padding:'7px 0', fontSize:'11px', fontWeight:'700', background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.55)', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit' }}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* ═══ MAIN ═════════════════════════════════════════════════════════════ */}
      <div className="adm-main" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Top bar */}
        <header style={{ height:'56px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:'12px', padding:'0 20px', flexShrink:0, zIndex:10 }}>
          <button type="button" className="mob-only" onClick={()=>setMobSidebar(true)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:C.textMid, display:'flex', alignItems:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" style={{ width:'20px', height:'20px' }}>
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize:'15px', fontWeight:'800', color:C.text }}>{TABS.find(t=>t.id===activeTab)?.label}</div>
            <div style={{ fontSize:'10px', color:C.textDim }}>DIT University Campus Management</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center' }}>
            {activeTab==='buildings' && <Btn size="sm" onClick={openAddBldg}>+ Building</Btn>}
            {activeTab==='rooms'     && <Btn size="sm" onClick={openAddRoom}>+ Room</Btn>}
            {activeTab==='admins' && adminRole==='superadmin' && (
              <Btn size="sm" onClick={()=>{ setAdminModal(true); setAdminForm({email:'',name:'',role:'editor'}); setAdminErrs({}); }}>+ Admin</Btn>
            )}
          </div>
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main style={{ flex:1, overflowY:'auto', padding:'24px' }}>

          {/* ══ DASHBOARD ═══════════════════════════════════════════════════ */}
          {activeTab==='dashboard' && (
            <div style={{ maxWidth:'880px', margin:'0 auto' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'14px', marginBottom:'24px' }}>
                <Stat label="Buildings"    value={buildings.length} />
                <Stat label="Rooms"        value={rooms.length}    accent={C.success} />
                <Stat label="Floors"       value={totalFloors}     accent={C.blue}    />
                <Stat label="Last Updated" value={lastUpdated}     accent={C.warn} centered valueSize="24px" fullWidth />
              </div>

              <div style={{ background:C.surface, borderRadius:'16px', border:`1px solid ${C.border}`, padding:'20px', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:'800', color:C.text, marginBottom:'14px' }}>Quick Actions</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'10px' }}>
                  <Btn size="sm" onClick={()=>{ setActiveTab('buildings'); openAddBldg(); }}>+ Add Building</Btn>
                  <Btn size="sm" variant="ghost" onClick={()=>{ setActiveTab('rooms'); openAddRoom(); }}>+ Add Room</Btn>
                  <Btn size="sm" variant="ghost" onClick={()=>setActiveTab('audit')}>Audit Log</Btn>
                  <Btn size="sm" variant="ghost" onClick={()=>setActiveTab('admins')}>Manage Admins</Btn>
                </div>
              </div>

              <div style={{ background:C.surface, borderRadius:'16px', border:`1px solid ${C.border}`, padding:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:'800', color:C.text, marginBottom:'14px' }}>All Buildings</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px' }}>
                  {buildings.map(b=>(
                    <div key={b.id} onClick={()=>setActiveTab('buildings')}
                      style={{ borderRadius:'12px', overflow:'hidden', border:`1px solid ${C.border}`, cursor:'pointer', transition:'border-color 0.15s' }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.primary}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt={b.name}
                          style={{ width:'100%', height:'80px', objectFit:'cover', display:'block' }} />
                      ) : (
                        <div style={{ width:'100%', height:'80px', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'28px' }}>🏢</div>
                      )}
                      <div style={{ padding:'10px 12px' }}>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:C.text }}>{b.name}</div>
                        <div style={{ display:'flex', gap:'5px', marginTop:'4px', alignItems:'center' }}>
                          <Pill color={b.category==='academic'?'blue':b.category==='hostel'?'green':'slate'}>{b.category}</Pill>
                          <span style={{ fontSize:'10px', color:C.textDim }}>G+{b.totalFloors??1}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!buildingsReady && (
                    <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'32px', color:C.textDim }}>
                      <Spin size={24}/><div style={{ marginTop:'12px', fontSize:'13px' }}>Loading buildings…</div>
                    </div>
                  )}
                  {buildingsReady && buildings.length===0 && (
                    <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'32px', color:C.textDim, fontSize:'13px' }}>
                      No buildings found in Firestore. Open this page again while logged in as admin to auto-seed static buildings.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ BUILDINGS ═══════════════════════════════════════════════════ */}
          {activeTab==='buildings' && (
            <div style={{ maxWidth:'960px', margin:'0 auto' }}>
              <SectionHead title="Buildings" count={buildings.length} action={<Btn size="sm" onClick={openAddBldg}>+ Add Building</Btn>} />
              <Table
                headers={['Photo','Building','Category','Floors','Actions']}
                empty="No buildings yet. Add one or run scripts/seedFirestore.js"
                rows={buildings.map(b=>(
                  <TRow key={b.id}
                    cells={[
                      b.photoUrl
                        ? <img src={b.photoUrl} alt={b.name} style={{ width:'48px', height:'36px', objectFit:'cover', borderRadius:'6px', display:'block' }}/>
                        : <div style={{ width:'48px', height:'36px', background:'#f1f5f9', borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>🏢</div>,
                      <div>
                        <div style={{ fontWeight:'700', color:C.text }}>{b.name}</div>
                        <div style={{ fontSize:'11px', color:C.textDim, marginTop:'2px' }}>{b.shortName} · {b.id}</div>
                      </div>,
                      <Pill color={b.category==='academic'?'blue':b.category==='hostel'?'green':b.category==='admin'?'navy':'slate'}>{b.category}</Pill>,
                      <span style={{ color:C.textMid }}>{b.totalFloors}</span>,
                    ]}
                    actions={[
                      <Btn key="e" size="sm" variant="ghost"   onClick={()=>openEditBldg(b)}>Edit</Btn>,
                      <Btn key="f" size="sm" variant="outline" onClick={()=>openFloorMgr(b)}>Floors</Btn>,
                      <Btn key="d" size="sm" variant="danger"  onClick={()=>setDelBldg(b)}>Delete</Btn>,
                    ]}
                  />
                ))}
              />
            </div>
          )}

          {/* ══ ROOMS ════════════════════════════════════════════════════════ */}
          {activeTab==='rooms' && (
            <div style={{ maxWidth:'960px', margin:'0 auto' }}>
              <SectionHead title="Rooms" count={rooms.length} action={<Btn size="sm" onClick={openAddRoom}>+ Add Room</Btn>} />
              <Table
                headers={['Room','Building','Floor','Type','Status','Actions']}
                empty="No rooms yet."
                rows={rooms.map(r=>(
                  <TRow key={r.id}
                    cells={[
                      <div><div style={{ fontWeight:'700', color:C.text }}>{r.roomNumber||r.number}</div><div style={{ fontSize:'11px', color:C.textDim }}>{r.name}</div></div>,
                      <span style={{ fontSize:'12px', color:C.textMid }}>{bldgsById[r.buildingId]?.shortName||'—'}</span>,
                      <span style={{ fontSize:'12px', color:C.textMid }}>{r.floorNumber??r.floor??'—'}</span>,
                      <Pill>{r.type}</Pill>,
                      r.temporarilyClosed?<Pill color="rose">Closed</Pill>:r.accessible?<Pill color="green">♿</Pill>:<Pill color="slate">Open</Pill>,
                    ]}
                    actions={[
                      <Btn key="e" size="sm" variant="ghost"  onClick={()=>openEditRoom(r)}>Edit</Btn>,
                      <Btn key="d" size="sm" variant="danger" onClick={()=>setDelRoom(r)}>Delete</Btn>,
                    ]}
                  />
                ))}
              />
            </div>
          )}

          {/* ══ DIRECTIONS ═══════════════════════════════════════════════════ */}
          {activeTab==='directions' && (
            <div style={{ maxWidth:'640px', margin:'0 auto' }}>
              <SectionHead title="Room Directions" />
              <div style={{ background:C.surface, borderRadius:'16px', border:`1px solid ${C.border}`, padding:'24px', display:'flex', flexDirection:'column', gap:'16px' }}>

                <Field label="1 · Select Building">
                  <TSelect value={dirBldgId} onChange={e=>setDirBldgId(e.target.value)}>
                    <option value="">All buildings…</option>
                    {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                  </TSelect>
                </Field>

                <Field label="2 · Select Room">
                  <TSelect value={dirRoomId} onChange={e=>setDirRoomId(e.target.value)}>
                    <option value="">Choose a room…</option>
                    {dirRooms.map(r=>(
                      <option key={r.id} value={r.id}>
                        {bldgsById[r.buildingId]?.shortName||'?'} · {r.roomNumber||r.name}
                      </option>
                    ))}
                  </TSelect>
                  {dirBldgId && dirRooms.length===0 && (
                    <div style={{ fontSize:'11px', color:C.warn, marginTop:'4px' }}>
                      No rooms found for this building. Add rooms first.
                    </div>
                  )}
                </Field>

                {dirRoom && (
                  <>
                    <HR/>
                    <div style={{ fontSize:'11px', fontWeight:'800', color:C.textDim, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Navigation Steps for: <span style={{ color:C.primary }}>{dirRoom.name||dirRoom.roomNumber}</span>
                    </div>

                    {dirDraft.length===0 && (
                      <div style={{ padding:'20px', textAlign:'center', color:C.textDim, fontSize:'13px', background:'#f8fafc', borderRadius:'10px' }}>
                        No steps yet — add the first one below.
                      </div>
                    )}

                    <ol style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'8px' }}>
                      {dirDraft.map((step,i)=>(
                        <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:'10px', background:'#f8fafc', borderRadius:'10px', padding:'10px 14px', border:`1px solid ${C.border}` }}>
                          <span style={{ minWidth:'22px', height:'22px', borderRadius:'50%', background:C.primary, color:'white', fontSize:'10px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:'1px' }}>{i+1}</span>
                          <span style={{ flex:1, fontSize:'13px', color:C.text, lineHeight:'1.5' }}>{step}</span>
                          <button type="button" onClick={()=>removeDirStep(i)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:C.textDim, fontSize:'16px', lineHeight:1, padding:'2px', fontFamily:'inherit' }}>✕</button>
                        </li>
                      ))}
                    </ol>

                    <div style={{ display:'flex', gap:'8px' }}>
                      <input type="text" value={dirStep}
                        onChange={e=>setDirStep(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&addDirStep()}
                        placeholder="Type a step… press Enter or click Add"
                        style={{ flex:1, padding:'9px 12px', borderRadius:'10px', border:`1.5px solid ${C.border}`, fontSize:'13px', outline:'none', fontFamily:'inherit' }}
                        onFocus={e=>e.target.style.borderColor=C.primary}
                        onBlur={e =>e.target.style.borderColor=C.border}
                      />
                      <Btn variant="ghost" onClick={addDirStep}>Add</Btn>
                    </div>

                    <Btn onClick={saveDirSteps} disabled={saving} full>
                      {saving?'Saving…':'💾 Save Directions'}
                    </Btn>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ══ ADMINS ════════════════════════════════════════════════════════ */}
          {activeTab==='admins' && (
            <div style={{ maxWidth:'760px', margin:'0 auto' }}>
              <SectionHead title="Admins" count={admins.length}
                action={adminRole==='superadmin' && (
                  <Btn size="sm" onClick={()=>{ setAdminModal(true); setAdminForm({email:'',name:'',role:'editor'}); setAdminErrs({}); }}>+ Add Admin</Btn>
                )} />
              {adminsLoading
                ? <div style={{ display:'flex', justifyContent:'center', padding:'52px' }}><Spin size={28}/></div>
                : <Table
                    headers={['Email','Name','Role',...(adminRole==='superadmin'?['Actions']:[])]}
                    empty="No admins found."
                    rows={admins.map(a=>(
                      <TRow key={a.email}
                        cells={[
                          <span style={{ fontFamily:'monospace', fontSize:'12px' }}>{a.email}</span>,
                          a.name,
                          <Pill color={a.role==='superadmin'?'amber':'blue'}>{a.role}</Pill>,
                        ]}
                        actions={adminRole==='superadmin'?[
                          <Btn key="d" size="sm" variant="danger" onClick={()=>setDelAdmin(a)}>Remove</Btn>,
                        ]:undefined}
                      />
                    ))}
                  />
              }
            </div>
          )}

          {/* ══ AUDIT LOG ════════════════════════════════════════════════════ */}
          {activeTab==='audit' && (
            <div style={{ maxWidth:'960px', margin:'0 auto' }}>
              <SectionHead title="Audit Log" count={auditEntries.length} />
              {auditLoading
                ? <div style={{ display:'flex', justifyContent:'center', padding:'52px' }}><Spin size={28}/></div>
                : <Table
                    headers={['Action','Entity','ID','User','Time']}
                    empty="No audit entries yet."
                    rows={auditEntries.map(e=>(
                      <TRow key={e.id}
                        cells={[
                          <Pill color={e.action==='delete'?'rose':e.action==='create'?'green':'blue'}>{e.action}</Pill>,
                          <span style={{ fontSize:'12px', color:C.textMid, textTransform:'capitalize' }}>{e.entityType}</span>,
                          <span style={{ fontFamily:'monospace', fontSize:'11px', color:C.textDim }}>{e.entityId}</span>,
                          <span style={{ fontSize:'12px', color:C.textMid }}>{e.changedBy}</span>,
                          <span style={{ fontSize:'11px', color:C.textDim }}>{e.timestamp?.toDate?.()?new Date(e.timestamp.toDate()).toLocaleString():'—'}</span>,
                        ]}
                      />
                    ))}
                  />
              }
            </div>
          )}

        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── Building Modal ────────────────────────────────────────────────── */}
      <Modal title={editBldg?'Edit Building':'Add Building'} open={bldgModal} onClose={()=>setBldgModal(false)}>
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          <Field label="Building Name *" error={bldgErrs.name}>
            <TInput value={bldgForm.name} onChange={e=>setBldgForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Chanakya Block"/>
          </Field>
          <Field label="Short Name *" error={bldgErrs.shortName}>
            <TInput value={bldgForm.shortName} onChange={e=>setBldgForm(p=>({...p,shortName:e.target.value}))} placeholder="e.g. CB"/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Category">
              <TSelect value={bldgForm.category} onChange={e=>setBldgForm(p=>({...p,category:e.target.value}))}>
                {BUILDING_CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </TSelect>
            </Field>
            <Field label="Total Floors *" error={bldgErrs.totalFloors}>
              <TInput type="number" value={bldgForm.totalFloors} onChange={e=>setBldgForm(p=>({...p,totalFloors:e.target.value}))}/>
            </Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Latitude *"  error={bldgErrs.lat}><TInput value={bldgForm.lat} onChange={e=>setBldgForm(p=>({...p,lat:e.target.value}))} placeholder="30.3990"/></Field>
            <Field label="Longitude *" error={bldgErrs.lng}><TInput value={bldgForm.lng} onChange={e=>setBldgForm(p=>({...p,lng:e.target.value}))} placeholder="78.0755"/></Field>
          </div>
          <Field label="Description">
            <TArea value={bldgForm.description} onChange={e=>setBldgForm(p=>({...p,description:e.target.value}))} placeholder="Brief description of this building…"/>
          </Field>
          <ImagePickerField
            label="Building Photo"
            existingUrl={bldgForm.photoUrl}
            hint="Auto-compressed to fit Firestore. Recommended: 800×600 or smaller."
            maxWidth={800} maxHeight={600}
            onBase64={b64=>setBldgForm(p=>({...p,photoBase64:b64}))}
          />
          <HR/>
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
            <Btn variant="outline" onClick={()=>setBldgModal(false)}>Cancel</Btn>
            <Btn onClick={saveBldg} disabled={saving}>{saving?'Saving…':editBldg?'Update Building':'Add Building'}</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Floor Modal ───────────────────────────────────────────────────── */}
      <Modal title={`Manage Floors — ${floorBldg?.name??''}`} open={floorModal} onClose={()=>{ setFloorModal(false); setEditFloor(null); }} width={700}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>

          {/* Left: existing floors list */}
          <div>
            <div style={{ fontSize:'10px', fontWeight:'800', color:C.textDim, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'10px' }}>Existing Floors</div>
            {curFloors.length===0
              ? <div style={{ fontSize:'13px', color:C.textDim, padding:'20px 0', textAlign:'center' }}>No floors yet.</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                  {curFloors.map(fl=>(
                    <div key={fl.id} style={{ borderRadius:'10px', border:`1px solid ${C.border}`, overflow:'hidden' }}>
                      {fl.planImageUrl && (
                        <img src={fl.planImageUrl} alt={fl.label}
                          style={{ width:'100%', height:'60px', objectFit:'cover', display:'block' }}/>
                      )}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'#f8fafc' }}>
                        <div>
                          <div style={{ fontSize:'13px', fontWeight:'700', color:C.text }}>{fl.label}</div>
                          <div style={{ fontSize:'10px', color:C.textDim }}>Floor {fl.floorNumber}</div>
                        </div>
                        <div style={{ display:'flex', gap:'5px' }}>
                          <Btn size="sm" variant="ghost" onClick={()=>startEditFloor(fl)}>Edit</Btn>
                          {/* FIX 3: re-fetch fresh floor so planImageUrl is current */}
                          <Btn size="sm" variant="outline" onClick={async () => {
                            const freshFloors = await loadFloors(floorBldg.id);
                            const freshFloor  = freshFloors.find(f => f.id === fl.id) ?? fl;
                            setPinTool({ open: true, floor: freshFloor, floorId: freshFloor.id });
                          }}>Pin</Btn>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Right: add/edit form */}
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ fontSize:'10px', fontWeight:'800', color:C.textDim, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {editFloor?'Edit Floor':'Add Floor'}
            </div>
            <Field label="Floor Number">
              <TInput type="number" value={floorForm.floorNumber} onChange={e=>setFloorForm(p=>({...p,floorNumber:e.target.value}))}/>
            </Field>
            <Field label="Label *" error={floorErrs.label}>
              <TInput value={floorForm.label} onChange={e=>setFloorForm(p=>({...p,label:e.target.value}))} placeholder="e.g. Ground Floor"/>
            </Field>
            <ImagePickerField
              label="Floor Plan Image"
              existingUrl={floorForm.planImageUrl}
              hint="Upload your floor plan photo. Auto-compressed."
              maxWidth={1200} maxHeight={900}
              onBase64={b64=>setFloorForm(p=>({...p,planBase64:b64}))}
            />
            <Field label="Entry Points (comma-separated)">
              <TInput value={floorForm.entryPoints} onChange={e=>setFloorForm(p=>({...p,entryPoints:e.target.value}))} placeholder="main-entrance, north-door"/>
            </Field>
            <div style={{ display:'flex', gap:'8px' }}>
              {editFloor && (
                <Btn variant="outline" onClick={()=>{
                  setEditFloor(null);
                  const nextNum = curFloors.length > 0
                    ? Math.max(...curFloors.map(f => f.floorNumber ?? 0)) + 1
                    : 0;
                  setFloorForm({ ...EMPTY_FLOOR, floorNumber: nextNum, label: nextNum === 0 ? 'Ground Floor' : `Floor ${nextNum}` });
                }}>Cancel</Btn>
              )}
              <Btn onClick={saveFloor} disabled={saving} full>
                {saving?'Saving…':editFloor?'Update Floor':'Add Floor'}
              </Btn>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Room Modal ────────────────────────────────────────────────────── */}
      <Modal title={editRoom?'Edit Room':'Add Room'} open={roomModal} onClose={()=>setRoomModal(false)} width={620}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
          <Field label="Building *" error={roomErrs.buildingId}>
            <TSelect value={roomForm.buildingId} onChange={e=>{ setRoomForm(p=>({...p,buildingId:e.target.value,floorId:''})); loadFloors(e.target.value); }}>
              <option value="">Select building…</option>
              {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </TSelect>
          </Field>
          <Field label="Floor">
            <TSelect value={roomForm.floorId} onChange={e=>setRoomForm(p=>({...p,floorId:e.target.value}))}>
              <option value="">Select floor…</option>
              {(floorsByBldg[roomForm.buildingId]??[]).map(fl=><option key={fl.id} value={fl.id}>{fl.label}</option>)}
            </TSelect>
          </Field>
          <Field label="Room Number *" error={roomErrs.roomNumber}><TInput value={roomForm.roomNumber} onChange={e=>setRoomForm(p=>({...p,roomNumber:e.target.value}))} placeholder="e.g. 101"/></Field>
          <Field label="Room Name *"   error={roomErrs.name}><TInput value={roomForm.name} onChange={e=>setRoomForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Computer Lab 1"/></Field>
          <Field label="Type">
            <TSelect value={roomForm.type} onChange={e=>setRoomForm(p=>({...p,type:e.target.value}))}>
              {ROOM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </TSelect>
          </Field>
          <Field label="Department"><TInput value={roomForm.department} onChange={e=>setRoomForm(p=>({...p,department:e.target.value}))} placeholder="e.g. CSE"/></Field>
          <Field label="Weekday Hours"><TInput value={roomForm.hoursWeekday} onChange={e=>setRoomForm(p=>({...p,hoursWeekday:e.target.value}))} placeholder="9am–5pm"/></Field>
          <Field label="Saturday Hours"><TInput value={roomForm.hoursSaturday} onChange={e=>setRoomForm(p=>({...p,hoursSaturday:e.target.value}))} placeholder="9am–1pm"/></Field>
          <div style={{ gridColumn:'1/-1' }}>
            <Field label="Search Tags (comma-separated)">
              <TInput value={roomForm.searchTags} onChange={e=>setRoomForm(p=>({...p,searchTags:e.target.value}))} placeholder="lab, computer, cse"/>
            </Field>
          </div>
          <div style={{ gridColumn:'1/-1', display:'flex', gap:'24px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600', color:C.textMid }}>
              <input type="checkbox" checked={roomForm.accessible} onChange={e=>setRoomForm(p=>({...p,accessible:e.target.checked}))} style={{ width:'15px', height:'15px' }}/>
              ♿ Accessible
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600', color:C.textMid }}>
              <input type="checkbox" checked={roomForm.temporarilyClosed} onChange={e=>setRoomForm(p=>({...p,temporarilyClosed:e.target.checked}))} style={{ width:'15px', height:'15px' }}/>
              Temporarily Closed
            </label>
          </div>
        </div>
        <HR/>
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <Btn variant="outline" onClick={()=>setRoomModal(false)}>Cancel</Btn>
          <Btn onClick={saveRoom} disabled={saving}>{saving?'Saving…':editRoom?'Update Room':'Add Room'}</Btn>
        </div>
      </Modal>

      {/* ── Add Admin Modal ───────────────────────────────────────────────── */}
      <Modal title="Add Admin" open={adminModal} onClose={()=>setAdminModal(false)} width={420}>
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          <Field label="Email *" error={adminErrs.email}><TInput value={adminForm.email} onChange={e=>setAdminForm(p=>({...p,email:e.target.value}))} placeholder="admin@example.com"/></Field>
          <Field label="Name *"  error={adminErrs.name}><TInput  value={adminForm.name}  onChange={e=>setAdminForm(p=>({...p,name:e.target.value}))}  placeholder="Full Name"/></Field>
          <Field label="Role">
            <TSelect value={adminForm.role} onChange={e=>setAdminForm(p=>({...p,role:e.target.value}))}>
              <option value="editor">Editor</option>
              <option value="superadmin">Superadmin</option>
            </TSelect>
          </Field>
          <HR/>
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
            <Btn variant="outline" onClick={()=>setAdminModal(false)}>Cancel</Btn>
            <Btn onClick={saveAdmin} disabled={saving}>{saving?'Adding…':'Add Admin'}</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Pin Tool ──────────────────────────────────────────────────────── */}
      {pinTool.open && pinTool.floor && (
        <div style={{ position:'fixed', inset:0, zIndex:1200, background:'rgba(10,15,30,0.8)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ width:'100%', maxWidth:'780px', background:C.surface, borderRadius:'20px', overflow:'hidden', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <span style={{ fontSize:'14px', fontWeight:'800', color:C.text }}>Pin Tool — {pinTool.floor.label}</span>
              <button type="button" onClick={()=>setPinTool({open:false,floor:null,floorId:null})}
                style={{ background:'#f1f5f9', border:'none', borderRadius:'8px', width:'28px', height:'28px', cursor:'pointer', fontSize:'14px', color:C.textMid, fontFamily:'inherit' }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {/* FIX 4: pass floorPlanUrl explicitly so the image renders */}
              <FloorPlanPinTool
                floor={pinTool.floor}
                floorId={pinTool.floorId}
                floorPlanUrl={pinTool.floor?.planImageUrl || ''}
                rooms={rooms.filter(r => r.floorId === pinTool.floorId)}
                onSave={() => {
                  showToast('Room pins saved ✓');
                  setPinTool({ open: false, floor: null, floorId: null });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialogs ───────────────────────────────────────────────── */}
      <Confirm open={!!delBldg}  message={`Delete "${delBldg?.name}"? This cannot be undone.`}                             onConfirm={confirmDelBldg}  onCancel={()=>setDelBldg(null)}  />
      <Confirm open={!!delRoom}  message={`Delete room "${delRoom?.roomNumber||delRoom?.name}"? This cannot be undone.`}    onConfirm={confirmDelRoom}  onCancel={()=>setDelRoom(null)}  />
      <Confirm open={!!delAdmin} message={`Remove admin access for "${delAdmin?.email}"?`}                                  onConfirm={confirmDelAdmin} onCancel={()=>setDelAdmin(null)} />

    </div>
  );
}