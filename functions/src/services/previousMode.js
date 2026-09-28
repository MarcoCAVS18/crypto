// Modo de mercado anterior (para la histéresis de determineGoldMarketMode).
// Se toma del último snapshot horario; si es más viejo que `maxAgeMs` (scheduler caído, datos viejos)
// se ignora y rige el umbral simple, para no arrastrar un modo obsoleto.

export const PREVIOUS_MODE_MAX_AGE_MS = 6 * 3600 * 1000;

/** Puro: modo del snapshot más reciente si es lo bastante fresco y válido; si no, null. */
export function previousModeFromSnapshots(snapshots, now = Date.now(), maxAgeMs = PREVIOUS_MODE_MAX_AGE_MS) {
  const s = snapshots?.[0];
  const mode = s?.market?.mode;
  if (!s || !['risk_on', 'risk_off', 'neutral'].includes(mode)) return null;
  if (!Number.isFinite(s.ts) || now - s.ts > maxAgeMs || s.ts > now + 60000) return null;
  return mode;
}

/** Lee el último snapshot. Nunca lanza: sin dato previo la histéresis simplemente no actúa. */
export async function getPreviousMode(symbol, { now = Date.now(), getSnapshots = null } = {}) {
  try {
    const get = getSnapshots ?? (await import('../config/database.js')).getLatestSnapshots;
    return previousModeFromSnapshots(await get(symbol, 1), now);
  } catch (err) {
    console.warn(`[PreviousMode] ${symbol}: ${err.message}`);
    return null;
  }
}
