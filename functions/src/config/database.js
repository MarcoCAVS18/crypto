// Reemplaza better-sqlite3 con Firestore Admin SDK.
// Las funciones de caché son async; las demás mantienen la misma firma.
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = () => getFirestore();

// Sanitiza una clave arbitraria para usarla como ID de documento Firestore
function toDocId(key) {
  return key.replace(/\//g, '_').slice(0, 1500);
}

// ── Historial de decisiones ───────────────────────────────────────────────────

export async function saveDecision(decision) {
  await db().collection('decisions').add({
    symbol:     decision.symbol,
    price:      decision.price,
    marketMode: decision.marketMode,
    decision:   decision.decision,
    cashPercent: decision.cashPercent,
    userMode:   decision.userMode,
    reason:     decision.reason,
    timestamp:  FieldValue.serverTimestamp()
  });
}

export async function getDecisions(limit = 20) {
  const snap = await db()
    .collection('decisions')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Obtiene las últimas N decisiones de un símbolo específico (para contexto de Groq)
export async function getDecisionsBySymbol(symbol, limit = 10) {
  try {
    const snap = await db()
      .collection('decisions')
      .where('symbol', '==', symbol.toUpperCase())
      .limit(limit * 3)
      .get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))
      .slice(0, limit);
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
