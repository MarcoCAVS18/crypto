// Autenticación por PIN en el SERVIDOR (antes se hacía en el navegador contra Firestore directo).
//
//  - El hash del PIN nunca sale del servidor y el cliente ya no necesita acceso a Firestore (reglas cerradas).
//  - PIN nuevo: scrypt con sal aleatoria. PIN viejo (SHA-256 de `${pin}:${userId}:crypto-ctx-v1`, creado por la versión
//    anterior de la app): se acepta una vez y se actualiza a scrypt al iniciar sesión (migración transparente).
//  - Bloqueo por intentos fallidos: un PIN de 4 dígitos solo aguanta si se limita el número de intentos.
//  - Sesión = token aleatorio de 32 bytes; en Firestore solo se guarda su SHA-256 (un volcado de la base no da sesiones).

import crypto from 'node:crypto';

export const PIN_RE = /^\d{4,8}$/;
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

const SCRYPT = { N: 16384, r: 8, p: 1 };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Hash del formato anterior (cliente): se mantiene solo para verificar PINs ya creados. */
export const legacyHash = (pin, userId) => sha256(`${pin}:${userId}:crypto-ctx-v1`);

const scryptHex = (pin, saltHex) => crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), 32, SCRYPT).toString('hex');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Credencial nueva para guardar en el perfil. */
export function makeCredential(pin) {
  const pinSalt = crypto.randomBytes(16).toString('hex');
  return { pinAlgo: 'scrypt-v2', pinSalt, pinHash: scryptHex(pin, pinSalt) };
}

/**
 * @returns {{ ok:boolean, upgrade:boolean }} ok = el PIN coincide; upgrade = estaba en formato viejo y conviene reemplazarlo.
 */
export function checkPin(profile, pin, userId) {
  if (!profile?.pinHash || !PIN_RE.test(String(pin))) return { ok: false, upgrade: false };
  if (profile.pinAlgo === 'scrypt-v2' && profile.pinSalt) {
    return { ok: safeEqual(scryptHex(pin, profile.pinSalt), profile.pinHash), upgrade: false };
  }
  const ok = safeEqual(legacyHash(pin, userId), profile.pinHash);
  return { ok, upgrade: ok };
}

/** Estado de bloqueo del perfil. */
export function lockState(profile, now = Date.now()) {
  const until = Number(profile?.lockedUntil ?? 0);
  return until > now ? { locked: true, retryAfterSec: Math.ceil((until - now) / 1000) } : { locked: false, retryAfterSec: 0 };
}

/** Campos a guardar después de un intento. Un éxito reinicia el contador. */
export function afterAttempt(profile, ok, now = Date.now()) {
  if (ok) return { failCount: 0, lockedUntil: 0 };
  const failCount = Number(profile?.failCount ?? 0) + 1;
  return failCount >= MAX_FAILS
    ? { failCount: 0, lockedUntil: now + LOCK_MS }
    : { failCount, lockedUntil: 0 };
}

export const attemptsLeft = (profile, ok) => (ok ? MAX_FAILS : Math.max(0, MAX_FAILS - (Number(profile?.failCount ?? 0) + 1)));

export function newSession(now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, id: sha256(token), createdAt: now, expiresAt: now + SESSION_TTL_MS };
}
export const sessionId = (token) => sha256(String(token ?? ''));
export const sessionValid = (s, now = Date.now()) => !!s && Number(s.expiresAt) > now;
