// scripts/seedFirestore.js
//
// Merges your existing seed logic with fixes:
//   1. Reads ditBuildings.json (not .geojson)
//   2. Uses polygon centroid for accurate lat/lng (your polygonCentroidLatLng)
//   3. Seeds floors for ALL 6 buildings (not just chanakya)
//   4. Seeds sample rooms for Chanakya Floor 1 (your existing rooms)
//   5. Uses writeDocIfMissing — never overwrites admin edits
//
// Usage:
//   npm install firebase-admin
//   node scripts/seedFirestore.js
//
// Auth (pick one):
//   • Set FIREBASE_SERVICE_ACCOUNT env var to the JSON string of your service account key
//   • OR place serviceAccount.json in the project root

import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// ─── Service account loader (your pattern) ────────────────────────────────────
function loadServiceAccount() {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (env) return JSON.parse(env);

  const fallbackPath = path.resolve(process.cwd(), 'serviceAccount.json');
  if (fs.existsSync(fallbackPath)) {
    return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  }

  throw new Error(
    'Missing service account.\n' +
    'Set FIREBASE_SERVICE_ACCOUNT env var (JSON string) OR create ./serviceAccount.json'
  );
}

// ─── Firestore helper: skip if doc already exists ────────────────────────────
async function writeDocIfMissing(db, colName, docId, data) {
  const ref = db.collection(colName).doc(docId);
  const snap = await ref.get();
  if (snap.exists) return { written: false, skipped: true, id: docId };
  await ref.set(data);
  return { written: true, skipped: false, id: docId };
}

// ─── Polygon centroid (your accurate implementation) ─────────────────────────
function polygonCentroidLatLng(feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return [30.3990, 78.0755];

  let sumLat = 0, sumLng = 0, n = 0;
  for (const pair of ring) {
    const lng = pair?.[0];
    const lat = pair?.[1];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    sumLat += lat; sumLng += lng; n++;
  }
  if (n === 0) return [30.3990, 78.0755];
  return [sumLat / n, sumLng / n];
}

// ─── Load buildings from ditBuildings.json ────────────────────────────────────
// FIX: file is .json not .geojson
function loadBuildingsFromJSON() {
  const jsonPath = path.resolve(process.cwd(), 'src', 'data', 'ditBuildings.json');
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const geojson = JSON.parse(raw);
  const features = (geojson?.features || []).slice(0, 10);

  return features.map(f => {
    const props = f?.properties || {};
    const [lat, lng] = polygonCentroidLatLng(f);
    return {
      id:          props.id,
      name:        props.name,
      shortName:   props.shortName  || props.name?.split(' ')[0] || props.id,
      category:    props.category   || 'academic',
      totalFloors: props.totalFloors ?? 3,
      groundLabel: props.groundLabel || 'Ground Floor',
      description: props.description || '',
      photoUrl:    '',
      lat,
      lng,
    };
  });
}

// ─── Floor definitions for all 6 buildings ───────────────────────────────────
// Format: buildingId → array of floor defs
// FIX: your seed only did chanakya. All 6 buildings need floors.
function getFloorDefs() {
  const make = (buildingId, totalFloors, labels) =>
    Array.from({ length: totalFloors + 1 }, (_, i) => ({
      id:          `${buildingId}_F${i}`,
      buildingId,
      floorNumber: i,
      label:       labels?.[i] || (i === 0 ? 'Ground Floor' : `Floor ${i}`),
      planImageUrl: '',
      planWidth:   1200,
      planHeight:  800,
      entryPoints: [],
      corridorWaypoints: [],
    }));

  return [
    // chanakya — 4 floors above ground (F0–F4)
    ...make('chanakya', 4, {
      0: 'Ground Floor',
      1: 'Floor 1',
      2: 'Floor 2',
      3: 'Floor 3',
      4: 'Floor 4',
    }),
    // vedanta — 3 floors (F0–F3)
    ...make('vedanta', 3, {
      0: 'Ground Floor',
      1: 'Floor 1',
      2: 'Floor 2',
      3: 'Floor 3',
    }),
    // civil — 3 floors (F0–F3)
    ...make('civil', 3, {
      0: 'Ground Floor',
      1: 'Floor 1',
      2: 'Floor 2',
      3: 'Floor 3',
    }),
    // vivekananda — 3 floors (F0–F3)
    ...make('vivekananda', 3, {
      0: 'Ground Floor',
      1: 'Floor 1',
      2: 'Floor 2',
      3: 'Floor 3',
    }),
    // boys_hostel — 3 floors (F0–F3)
    ...make('boys_hostel', 3, {
      0: 'Ground Floor',
      1: 'Floor 1',
      2: 'Floor 2',
      3: 'Floor 3',
    }),
    // girls_hostel — 3 floors (F0–F3)
    ...make('girls_hostel', 3, {
      0: 'Ground Floor',
      1: 'Floor 1',
      2: 'Floor 2',
      3: 'Floor 3',
    }),
  ];
}

// ─── Sample rooms for Chanakya Floor 1 (your existing rooms, unchanged) ──────
function getChanakhyaF1Rooms() {
  const hours = {
    weekday: '8:00-18:00',
    saturday: '9:00-14:00',
    sunday: 'Closed',
  };

  const commonBase = {
    buildingId: 'chanakya',
    floorId: 'chanakya_F1',
    floorNumber: 1,
    planX: null,
    planY: null,
    nearestWaypoint: null,
    accessible: true,
    temporarilyClosed: false,
    hours,
  };

  // Shared outdoor steps to Chanakya Floor 1
  const outdoorSteps = [
    {
      step: 1, type: 'outdoor',
      instruction: 'Enter DIT main gate and walk straight',
      hint: 'Keep basketball court on your left',
      landmark: 'Main gate security cabin',
    },
    {
      step: 2, type: 'outdoor',
      instruction: 'Take the left fork after the Open Air Theatre',
      hint: 'Chanakya Block visible ahead',
      landmark: 'Open Air Theatre on right',
    },
    {
      step: 3, type: 'building_entry',
      instruction: 'Enter Chanakya Block through main door',
      hint: 'Go past reception to the staircase',
      landmark: 'Notice board near entrance',
    },
    {
      step: 4, type: 'checkpoint',
      instruction: 'Climb one flight of stairs to Floor 1',
      hint: 'Take the staircase straight ahead',
      landmark: 'Staircase landing',
      confirmText: 'Have you reached Floor 1?',
      confirmSub: 'Tap Yes when you are standing on Floor 1',
      targetFloor: 1,
    },
  ];

  return [
    {
      id: 'chanakya_F1_101',
      ...commonBase,
      roomNumber: 101,
      name: 'Data Structures Lab',
      type: 'lab',
      department: 'CSE',
      capacity: 40,
      equipment: ['40 computers', 'projector', 'AC', 'whiteboard'],
      searchTags: ['dsa', 'data structures', 'algorithms', 'programming lab', 'cse lab', 'lab 101'],
      directions: [
        ...outdoorSteps,
        { step: 5, type: 'indoor', instruction: 'Turn left — second door on your right', hint: 'Blue nameplate on the door', landmark: 'Faculty room 104 is opposite' },
      ],
    },
    {
      id: 'chanakya_F1_102',
      ...commonBase,
      roomNumber: 102,
      name: 'Networks Lab',
      type: 'lab',
      department: 'CSE',
      capacity: 40,
      equipment: ['networking kits', 'projector', 'AC', 'whiteboard'],
      searchTags: ['networks', 'networking', 'cn lab', 'computer networks', 'lab 102'],
      directions: [
        ...outdoorSteps,
        { step: 5, type: 'indoor', instruction: 'Turn right — lab door at the end of the corridor', hint: 'Look for the "Networks Lab" board', landmark: 'Lab 102 signboard' },
      ],
    },
    {
      id: 'chanakya_F1_103',
      ...commonBase,
      roomNumber: 103,
      name: 'Operating Systems Lab',
      type: 'lab',
      department: 'CSE',
      capacity: 40,
      equipment: ['systems PCs', 'projector', 'AC', 'whiteboard'],
      searchTags: ['os lab', 'operating systems', 'linux lab', 'lab 103'],
      directions: [],
    },
    {
      id: 'chanakya_F1_104',
      ...commonBase,
      roomNumber: 104,
      name: 'Faculty Room',
      type: 'office',
      department: 'CSE',
      capacity: 10,
      equipment: [],
      searchTags: ['faculty', 'professor', 'cse office', 'staff room'],
      directions: [],
    },
  ];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const serviceAccount = loadServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const ts = admin.firestore.FieldValue.serverTimestamp();

  let written = 0;
  let skipped = 0;

  const track = result => {
    if (result.written) written++;
    if (result.skipped) skipped++;
    console.log(`  ${result.written ? '✔ Seeded ' : '– Skipped'}: ${result.id}`);
  };

  // ── 1. Buildings ─────────────────────────────────────────────────────────
  console.log('\n━━━ /buildings ━━━');
  const buildings = loadBuildingsFromJSON();
  console.log(`Found ${buildings.length} buildings in ditBuildings.json`);

  for (const b of buildings) {
    if (!b?.id) { console.log('  ⚠ Skipping feature with no id'); continue; }
    track(await writeDocIfMissing(db, 'buildings', b.id, {
      ...b,
      createdAt: ts,
    }));
  }

  // ── 2. Floors (all 6 buildings) ───────────────────────────────────────────
  console.log('\n━━━ /floors (all buildings) ━━━');
  const floors = getFloorDefs();
  console.log(`Seeding ${floors.length} floor docs across all buildings`);

  for (const f of floors) {
    track(await writeDocIfMissing(db, 'floors', f.id, {
      buildingId:        f.buildingId,
      floorNumber:       f.floorNumber,
      label:             f.label,
      planImageUrl:      f.planImageUrl,
      planWidth:         f.planWidth,
      planHeight:        f.planHeight,
      entryPoints:       f.entryPoints,
      corridorWaypoints: f.corridorWaypoints,
      createdAt:         ts,
    }));
  }

  // ── 3. Sample rooms — Chanakya Floor 1 ───────────────────────────────────
  console.log('\n━━━ /rooms (Chanakya Floor 1) ━━━');
  const rooms = getChanakhyaF1Rooms();

  for (const r of rooms) {
    track(await writeDocIfMissing(db, 'rooms', r.id, {
      ...r,
      createdAt: ts,
      updatedAt: ts,
    }));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n━━━ Done ━━━`);
  console.log(`  ✔ Written : ${written}`);
  console.log(`  – Skipped : ${skipped} (already exist — not overwritten)`);
  console.log(`\n✅ Seed complete. All buildings, floors and sample rooms are in Firestore.\n`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Seed failed:', err.message, '\n', err.stack);
    process.exit(1);
  });