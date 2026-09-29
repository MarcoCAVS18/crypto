// Titulares "resilientes": si los feeds devuelven poco o nada (bloqueo puntual, feed caído), se completan con los últimos
// titulares buenos guardados (hasta 4 días) en lugar de dejar el panel vacío. Siempre se dice de dónde salen.
//
//   source: 'live' (todo fresco) · 'live+saved' (fresco completado con guardados) · 'saved' (solo guardados) · 'none'

export const MIN_LIVE = 3;
export const SAVED_MAX_AGE_MS = 96 * 3600 * 1000;
export const SAVED_TTL_H = 96;

const ageOk = (h, now) => {
  const t = h?.pubDate ? new Date(h.pubDate).getTime() : NaN;
  return Number.isFinite(t) && now - t <= SAVED_MAX_AGE_MS;
};

/**
 * @param {object} p
 * @param {string} p.key           clave de caché (p. ej. headlines_last_paxg)
 * @param {Array}  p.fresh         titulares recién traídos ({title,url,source,pubDate})
 * @param {Function} p.getCache    async (key) => valor|null
 * @param {Function} p.setCache    async (key, valor, ttlHoras) => void
 * @param {number} [p.now]
 * @param {number} [p.limit]
 */
export async function withLastGood({ key, fresh = [], getCache, setCache, now = Date.now(), limit = 14 }) {
  if (fresh.length >= MIN_LIVE) {
    try { await setCache(key, { headlines: fresh.slice(0, limit), savedAt: now }, SAVED_TTL_H); } catch { /* guardar es opcional */ }
    return { headlines: fresh.slice(0, limit), source: 'live', savedAt: null };
  }
  let saved = null;
  try { saved = await getCache(key); } catch { /* sin caché */ }
  const old = (saved?.headlines ?? []).filter(h => ageOk(h, now));
  if (old.length === 0) return { headlines: fresh, source: fresh.length ? 'live' : 'none', savedAt: null };

  const seen = new Set(fresh.map(h => h.title));
  const merged = [...fresh, ...old.filter(h => !seen.has(h.title))]
    .sort((a, b) => (new Date(b.pubDate ?? 0)).getTime() - (new Date(a.pubDate ?? 0)).getTime())
    .slice(0, limit);
  return { headlines: merged, source: fresh.length ? 'live+saved' : 'saved', savedAt: saved.savedAt ?? null };
}
