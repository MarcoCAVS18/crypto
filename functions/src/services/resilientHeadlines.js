// Titulares "resilientes": si los feeds devuelven poco o nada (bloqueo puntual, feed caído), se completan con los últimos
// titulares buenos guardados (hasta 4 días) en lugar de dejar el panel vacío. Siempre se dice de dónde salen.
//
// Además de la última consulta buena de la propia función, se lee el RELÉ: un job de GitHub Actions
// (news-relay.yml, cada 30 min) trae los feeds desde una IP que no está bloqueada y los deja en Firestore.
// Un relé reciente cuenta como fuente sana ('relay' / 'live+relay'): no dispara reintentos ni avisos en la UI.
//
//   source: 'live' · 'live+relay' · 'relay' · 'live+saved' · 'saved' · 'none'

export const RELAY_FRESH_MS = 2 * 3600 * 1000;
export const relayKeyFor = (key) => key.replace('headlines_last_', 'headlines_relay_');
/** Fuentes que se consideran normales (no degradadas): sirven para elegir el TTL del contexto y avisar en la UI. */
export const isHealthySource = (s) => s === 'live' || s === 'live+relay' || s === 'relay';

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
 * @param {string} [p.relayKey]    clave que escribe el relé (por defecto, derivada de `key`)
 * @param {Array}  p.fresh         titulares recién traídos ({title,url,source,pubDate})
 * @param {Function} p.getCache    async (key) => valor|null
 * @param {Function} p.setCache    async (key, valor, ttlHoras) => void
 * @param {number} [p.now]
 * @param {number} [p.limit]
 */
export async function withLastGood({ key, relayKey = relayKeyFor(key), fresh = [], getCache, setCache, now = Date.now(), limit = 14 }) {
  if (fresh.length >= MIN_LIVE) {
    try { await setCache(key, { headlines: fresh.slice(0, limit), savedAt: now }, SAVED_TTL_H); } catch { /* guardar es opcional */ }
    return { headlines: fresh.slice(0, limit), source: 'live', savedAt: null };
  }
  const read = async (k) => { try { return await getCache(k); } catch { return null; } };
  const [relay, saved] = await Promise.all([read(relayKey), read(key)]);
  const relayItems = (relay?.headlines ?? []).filter(h => ageOk(h, now));
  const relayFresh = relayItems.length > 0 && Number.isFinite(relay?.savedAt) && now - relay.savedAt <= RELAY_FRESH_MS;
  const savedItems = (saved?.headlines ?? []).filter(h => ageOk(h, now));
  if (relayItems.length + savedItems.length === 0) return { headlines: fresh, source: fresh.length ? 'live' : 'none', savedAt: null };

  const seen = new Set(fresh.map(h => h.title));
  const extra = [];
  for (const h of [...relayItems, ...savedItems]) if (!seen.has(h.title)) { seen.add(h.title); extra.push(h); }
  const merged = [...fresh, ...extra]
    .sort((a, b) => (new Date(b.pubDate ?? 0)).getTime() - (new Date(a.pubDate ?? 0)).getTime())
    .slice(0, limit);
  const source = relayFresh ? (fresh.length ? 'live+relay' : 'relay') : (fresh.length ? 'live+saved' : 'saved');
  return { headlines: merged, source, savedAt: (relayFresh ? relay.savedAt : (saved?.savedAt ?? relay?.savedAt)) ?? null };
}
