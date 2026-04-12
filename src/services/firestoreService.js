// src/services/firestoreService.js
// FIXED:
//  1. updateBuilding — removed broken editableBy permission check that silently
//     blocked all saves. Auth is handled by Firestore Security Rules, not here.
//  2. addFloor — fixed signature from (data) to (floorId, data) to match
//     how AdminPage calls it: addFloor('chanakya_F1', { ... })
//  3. addAdmin — fixed signature from (email, name, role) to ({ email, name, role })
//     to match how AdminPage calls it: addAdmin({ email, name, role })
//  4. Removed editStaticBuilding — no longer needed, all buildings are Firestore docs
//  5. logAudit — no longer calls saveAudit separately, writes directly

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { auth, db } from '../services/firebase';

// ─── Collection refs ──────────────────────────────────────────────────────────
const buildingsCol = collection(db, 'buildings');
const floorsCol    = collection(db, 'floors');
const roomsCol     = collection(db, 'rooms');
const auditCol     = collection(db, 'audit');

// ─── Helper ───────────────────────────────────────────────────────────────────
function snapshotToArray(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Real-time subscriptions ──────────────────────────────────────────────────

export function subscribeToBuildings(callback) {
  return onSnapshot(buildingsCol, (snapshot) => {
    if (typeof callback === 'function') callback(snapshotToArray(snapshot));
  });
}

export function subscribeToRooms(callback) {
  return onSnapshot(roomsCol, (snapshot) => {
    if (typeof callback === 'function') callback(snapshotToArray(snapshot));
  });
}

// ─── Floors ───────────────────────────────────────────────────────────────────

export async function getFloorsForBuilding(buildingId) {
  const q    = query(floorsCol, where('buildingId', '==', buildingId));
  const snap = await getDocs(q);
  const floors = snapshotToArray(snap);
  // Sort by floorNumber in JS — avoids needing a Firestore composite index
  return floors.sort((a, b) => (a.floorNumber || 0) - (b.floorNumber || 0));
}

// FIX: signature is (floorId, data) — AdminPage calls addFloor('chanakya_F1', { ... })
export async function addFloor(floorId, data) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    createdBy: auth?.currentUser?.uid ?? null,
  };
  // Use setDoc with the explicit ID so the floor doc ID is predictable
  await setDoc(doc(db, 'floors', floorId), payload);
  return floorId;
}

export async function updateFloor(id, updates) {
  const ref = doc(db, 'floors', id);
  await updateDoc(ref, {
    ...updates,
    lastUpdated:   serverTimestamp(),
    lastUpdatedBy: auth?.currentUser?.uid ?? null,
  });
}

// ─── Buildings ────────────────────────────────────────────────────────────────

export async function addBuilding(data) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    createdBy: auth?.currentUser?.uid ?? null,
  };
  const res = await addDoc(buildingsCol, payload);
  return res.id;
}

// FIX: removed broken editableBy / userRole permission check.
// All buildings in Firestore are editable by admins.
// Permission is enforced by Firestore Security Rules, not by client code.
export async function updateBuilding(buildingId, updates) {
  const ref = doc(db, 'buildings', buildingId);
  await updateDoc(ref, {
    ...updates,
    lastUpdated:   serverTimestamp(),
    lastUpdatedBy: auth?.currentUser?.uid ?? null,
  });
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export async function getRoomsForFloor(floorId) {
  const q    = query(roomsCol, where('floorId', '==', floorId));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function getRoomById(roomId) {
  const snap = await getDoc(doc(db, 'rooms', roomId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addRoom(data) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    createdBy: auth?.currentUser?.uid ?? null,
  };
  const res = await addDoc(roomsCol, payload);
  return res.id;
}

export async function updateRoom(id, updates) {
  const ref = doc(db, 'rooms', id);
  await updateDoc(ref, {
    ...updates,
    lastUpdated:   serverTimestamp(),
    lastUpdatedBy: auth?.currentUser?.uid ?? null,
  });
}

export async function deleteRoom(id) {
  await deleteDoc(doc(db, 'rooms', id));
}

// ─── Admins ───────────────────────────────────────────────────────────────────

export async function getAdmins() {
  const snap = await getDocs(collection(db, 'admins'));
  return snap.docs.map((d) => ({ email: d.id, ...d.data() }));
}

// FIX: signature is ({ email, name, role }) — AdminPage calls addAdmin({ email, name, role })
// Old signature was (email, name, role) which meant name and role were always undefined
export async function addAdmin({ email, name, role }) {
  await setDoc(doc(db, 'admins', email), {
    name,
    role,
    addedAt: serverTimestamp(),
  });
}

export async function removeAdmin(email) {
  await deleteDoc(doc(db, 'admins', email));
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export async function logAudit(action, entityType, entityId) {
  await addDoc(auditCol, {
    action,
    entityType,
    entityId,
    changedBy: auth?.currentUser?.email ?? auth?.currentUser?.uid ?? null,
    timestamp: serverTimestamp(),
  });
}