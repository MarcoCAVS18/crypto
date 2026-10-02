// Reemplaza better-sqlite3 con Firestore Admin SDK.
// Las funciones de caché son async; las demás mantienen la misma firma.
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { decisionDocId, decisionIdPrefix, isHourlyDecisionId, hourBucket } from '../services/decisionLog.js';

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


// Las N más recientes de una colección cuyos IDs son `PREFIJO_YYYYMMDDHH`, de la más nueva a la más vieja.
// OJO: `where(id rango).orderBy(id, 'desc')` exige un índice (en producción: 9 FAILED_PRECONDITION) que el deploy no crea y
// que el Firestore falso de los tests no puede detectar. Se consulta en orden ASCENDENTE (no necesita índice) sobre una
// ventana de tiempo reciente y se invierte acá; si la ventana trae menos de N, se agranda ×4 hasta ~1 año.
const MAX_WINDOW_HOURS = 24 * 400;
export async function newestByIdRange(collection, prefix, limit, now = Date.now()) {
  const docId = FieldPath.documentId();
  let hours = Math.max(limit * 2, 48);
  let docs = [];
  for (;;) {
    const snap = await db().collection(collection)
      .where(docId, '>=', prefix + hourBucket(now - hours * 3600 * 1000))
      .where(docId, '<', prefix + '\uf8ff')
      .orderBy(docId)
      .get();
    docs = snap.docs;
    if (docs.length >= limit || hours >= MAX_WINDOW_HOURS) break;
    hours *= 4;
  }
  return docs.slice(-limit).reverse().map(d => ({ id: d.id, ...d.data() }));
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
      ts: now,                                  // ms explícitos: los resultados se miden desde este instante
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
// `throwOnError`: el endpoint del historial necesita distinguir "sin señales" de "falló la lectura" (antes ambos
// llegaban como lista vacía y la UI mostraba "sin señales" sin decir que algo estaba roto).
export async function getDecisionsBySymbol(symbol, limit = 10, { throwOnError = false } = {}) {
  try {
    const fresh = await newestByIdRange('decisions', decisionIdPrefix(symbol), limit);
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
    if (throwOnError) throw err;
    return [];
  }
}

// ── Perfiles, sesiones y portfolio (auth por PIN en el servidor) ───────────────

export async function getProfile(userId) {
  const doc = await db().collection('user_profiles').doc(userId).get();
  return doc.exists ? doc.data() : null;
}
/** Crea el perfil; false si ya existía (nunca pisa un PIN). */
export async function createProfile(userId, data) {
  try {
    await db().collection('user_profiles').doc(userId).create({ ...data, createdAt: FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    if (err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message ?? '')) return false;
    throw err;
  }
}
export async function updateProfile(userId, patch) {
  await db().collection('user_profiles').doc(userId).set(patch, { merge: true });
}
export async function saveSession(id, data) { await db().collection('_sessions').doc(id).set(data); }
export async function getSession(id) {
  const doc = await db().collection('_sessions').doc(id).get();
  return doc.exists ? doc.data() : null;
}
export async function deleteSession(id) { await db().collection('_sessions').doc(id).delete(); }

const isOwn = (op, userId) => (userId === 'marco' ? (!op.userId || op.userId === 'marco') : op.userId === userId);

/** Operaciones del usuario (las de Marco incluyen las viejas sin userId). Más nuevas primero. */
export async function listUserOperations(userId, { symbol = null, limit = 500 } = {}) {
  const col = db().collection('portfolio_operations');
  const snap = userId === 'marco'
    ? await col.orderBy('date', 'desc').limit(limit).get()
    : await col.where('userId', '==', userId).limit(limit).get();
  let ops = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => isOwn(o, userId));
  if (symbol) ops = ops.filter(o => o.symbol === String(symbol).toUpperCase());
  return ops.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}
export async function addUserOperation(op) {
  const ref = await db().collection('portfolio_operations').add({ ...op, created_at: FieldValue.serverTimestamp() });
  return ref.id;
}
/** Borra solo si la operación es del usuario. @returns {'deleted'|'not_found'|'forbidden'} */
export async function deleteUserOperation(userId, id) {
  const ref = db().collection('portfolio_operations').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return 'not_found';
  if (!isOwn(doc.data(), userId)) return 'forbidden';
  await ref.delete();
  return 'deleted';
}

// ── Resultados de las señales (P4) ────────────────────────────────────────────

/** Guarda/actualiza el resultado etiquetado de una decisión (mismo ID que la decisión). */
export async function saveOutcome(id, data) {
  await db().collection('outcomes').doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Resultados de un símbolo (más nuevo primero), por rango de ID en orden ascendente: sin índice. */
export async function getOutcomes(symbol, limit = 300) {
  return newestByIdRange('outcomes', decisionIdPrefix(symbol), limit);
}

/** Operaciones registradas por el usuario para un símbolo (lectura con Admin SDK). `ts` en ms desde `date`. */
export async function getOperationsForSymbol(symbol, userId = null, limit = 500) {
  const snap = await db().collection('portfolio_operations').where('symbol', '==', String(symbol).toUpperCase()).limit(limit).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => !userId || (o.userId ?? 'marco') === userId)
    .map(o => ({ type: o.type, symbol: o.symbol, ts: Date.parse(`${String(o.date).slice(0, 10)}T12:00:00Z`) || null }))
    .filter(o => o.ts);
}

// ── Snapshots horarios del mercado (features point-in-time) ───────────────────

/**
 * Guarda la foto de la hora (id `SYMBOL_YYYYMMDDHH`); la primera de cada hora gana.
 * @returns {Promise<boolean>} true si se guardó, false si esa hora ya tenía snapshot.
 */
export async function saveSnapshot(record) {
  const { id, ...data } = record;
  try {
    await db().collection('snapshots').doc(id).create({ ...data, createdAt: FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    if (err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message ?? '')) return false;
    throw err;
  }
}

/** Últimos N snapshots de un símbolo (más nuevo primero), por rango de ID: sin índice compuesto. */
export async function getLatestSnapshots(symbol, limit = 1) {
  return newestByIdRange('snapshots', `${String(symbol).toUpperCase()}_`, limit);
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
