// Autenticación por PIN usando Firestore + Web Crypto API (sin librerías externas)
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const COL = 'user_profiles';

// ── Helper: hash SHA-256 con salt usando Web Crypto API ──────────────────────

async function hashPin(pin, userId) {
  const salt = `${pin}:${userId}:crypto-ctx-v1`;
  const encoder = new TextEncoder();
  const data = encoder.encode(salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Verifica si el perfil ya tiene PIN configurado ───────────────────────────

export async function hasProfile(userId) {
  const ref = doc(db, COL, userId);
  const snap = await getDoc(ref);
  return snap.exists();
}

// ── Crea el documento con el hash del PIN ────────────────────────────────────

export async function setupPin(userId, pin) {
  const pinHash = await hashPin(pin, userId);
  const ref = doc(db, COL, userId);
  await setDoc(ref, {
    pinHash,
    createdAt: serverTimestamp(),
  });
}

// ── Verifica el PIN comparando el hash ───────────────────────────────────────

export async function verifyPin(userId, pin) {
  const ref = doc(db, COL, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const { pinHash } = snap.data();
  const attemptHash = await hashPin(pin, userId);
  return attemptHash === pinHash;
}
