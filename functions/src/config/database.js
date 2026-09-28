// Reemplaza better-sqlite3 con Firestore Admin SDK.
// Las funciones de caché son async; las demás mantienen la misma firma.
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { decisionDocId, decisionIdPrefix, isHourlyDecisionId } from '../services/decisionLog.js';

let _db = null;
const db = () => {
  if (!_db) _db = getFirestore();
  return _db;
};

// Solo para tests: inyecta un Firestore falso
export function _setDbForTests(fake) { _db = fake; }

// Sanitiza una clave arbitraria para usarla como ID de documento Firestore
function toDocId(key) {
  return key.replace(/\//g, '_').slice(0, 1500);
}

// ── Historial de decisiones ───────────────────────────────────────────────────

/**
 * Guarda la decisión con id idempotente por (símbolo, hora UTC): la primera de cada hora gana.
 * `create()` falla con ALREADY_EXISTS si ya hay una, así que repetir la llamada es barato e inocuo.
 * @returns {Promise<boolean>} true si se guardó, false si esa hora ya tenía señal.
 */
export async function saveDecision(record, now = Date.now()) {
  const id = decisionDocId(record.symbol, now);
  try {
    await db().collection('decisions').doc(id).create({
      ...record,
      timestamp: FieldValue.serverTimestamp()
    });
    return true;
  } catch (err) {
    if (err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message ?? '')) return false;
    throw err;
  }
}

export async function getDecisions(limit = 20) {
  const snap = await db()
    .collection('decisions')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Últimas N decisiones de un símbolo, de la más nueva a la más vieja.
// Se consulta por RANGO DE ID de documento (`PAXG_2026092812`): el ID ordena cronológicamente
// y no exige un índice compuesto (deploy.yml no despliega firestore:indexes). Antes se pedía
// `where(symbol).limit(n*3)` SIN orden, que devuelve un subconjunto arbitrario (orden por ID
// automático) y ordenaba solo esa muestra.
export async function getDecisionsBySymbol(symbol, limit = 10) {
  try {
    const prefix = decisionIdPrefix(symbol);
    const docId = FieldPath.documentId();
    const snap = await db()
      .collection('decisions')
      .where(docId, '>=', prefix)
      .where(docId, '<', prefix + '\uf8ff')
      .orderBy(docId, 'desc')
      .limit(limit)
      .get();
    const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (fresh.length >= limit) return fresh;

    // Transición: completar con documentos legacy (IDs automáticos, muestra arbitraria).
    // TODO: eliminar cuando el historial nuevo cubra la ventana que se muestra.
    const legacySnap = await db()
      .collection('decisions')
      .where('symbol', '==', String(symbol).toUpperCase())
      .limit(limit * 3)
      .get();
    const legacy = legacySnap.docs
      .filter(d => !isHourlyDecisionId(d.id))
      .map(d => ({ id: d.id, ...d.data() }));
    const millis = x => x.timestamp?.toMillis?.() ?? 0;
    return [...fresh, ...legacy].sort((a, b) => millis(b) - millis(a)).slice(0, limit);
  } catch (err) {
    console.warn('[DB] getDecisionsBySymbol failed:', err.message);
    return [];
  }
}

// ── Portfolio (stub — el frontend usa el cliente Firestore directamente) ──────

export function getPortfolioSummaryBySymbol(_symbol) {
  // El frontend siempre envía portfolioContext en el body del POST /decision.
  // Este fallback solo existía para desarrollo local con SQLite.
  return null;
}

// ── Caché del contexto de oro (TTL configurable) ──────────────────────────────

export async function getGoldContextCache() {
  const doc = await db().collection('_cache').doc('gold_context').get();
  if (!doc.exists) return null;
  const { data, expiresAt } = doc.data();
  if (new Date() > expiresAt.toDate()) return null;
  return JSON.parse(data);
}

export async function setGoldContextCache(data, ttlHours = 6) {
  await db().collection('_cache').doc('gold_context').set({
    data:      JSON.stringify(data),
    cachedAt:  FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000)
  });
}

// ── Caché genérica para respuestas de IA (calendar risk, etc.) ────────────────

export async function getAiCache(key) {
  const doc = await db().collection('_ai_cache').doc(toDocId(key)).get();
  if (!doc.exists) return null;
  const { data, expiresAt } = doc.data();
  if (new Date() > expiresAt.toDate()) return null;
  return JSON.parse(data);
}

export async function setAiCache(key, data, ttlHours = 4) {
  await db().collection('_ai_cache').doc(toDocId(key)).set({
    data:      JSON.stringify(data),
    cachedAt:  FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000)
  });
}

// ── Push subscriptions ────────────────────────────────────────────────────────

export async function getPushSubscriptions() {
  const snap = await db().collection('push_subscriptions').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function savePushSubscription(userId, subscription) {
  const id = toDocId(`${userId}_${subscription.endpoint.slice(-40)}`);
  await db().collection('push_subscriptions').doc(id).set({
    userId,
    subscription,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

export async function deletePushSubscription(endpoint) {
  const snap = await db().collection('push_subscriptions')
    .where('subscription.endpoint', '==', endpoint).get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

// ── Estado de zona por símbolo (para detección de cambio) ────────────────────

export async function getZoneState(symbol) {
  const doc = await db().collection('_zone_state').doc(symbol.toUpperCase()).get();
  return doc.exists ? doc.data() : null;
}

// `state` = { zone, price, streak, lastPushAt, checkedAt } (ver services/zoneAlert.js)
export async function setZoneState(symbol, state) {
  await db().collection('_zone_state').doc(symbol.toUpperCase()).set({
    ...state, updatedAt: FieldValue.serverTimestamp()
  });
}
