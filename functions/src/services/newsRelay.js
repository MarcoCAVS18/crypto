// Relé de noticias: trae los feeds desde FUERA de Google Cloud (GitHub Actions) y los deja en Firestore para que la
// API los use cuando sus propias consultas devuelven poco. Motivo medido: los mismos feeds dan ~14 titulares
// relevantes desde Actions/Render y ~1 desde Cloud Functions (los feeds limitan/bloquean IPs de Google Cloud).
//
// Función pura (sin firebase-admin): recibe los traedores y el guardado. La cablea scripts/newsRelay.mjs.

import { MIN_LIVE, SAVED_TTL_H, relayKeyFor } from './resilientHeadlines.js';

/**
 * @param {object} p
 * @param {Array<{key:string, fetch:Function}>} p.targets  key = 'headlines_last_<x>' (se guarda en su clave de relé)
 * @param {Function} p.setCache   async (key, valor, ttlHoras)
 * @returns {Promise<Array<{key, count, saved, error?}>>}
 */
export async function runRelay({ targets, setCache, now = Date.now(), log = () => {} }) {
  const out = [];
  for (const t of targets) {
    const relayKey = relayKeyFor(t.key);
    try {
      const headlines = await t.fetch();
      // Pocos titulares = feeds fallando: no se pisa un relé bueno con uno pobre.
      const saved = headlines.length >= MIN_LIVE;
      if (saved) await setCache(relayKey, { headlines, savedAt: now, via: 'relay' }, SAVED_TTL_H);
      log(`${relayKey}: ${headlines.length} titulares${saved ? ' (guardado)' : ' (muy pocos: no se guarda)'}`);
      out.push({ key: relayKey, count: headlines.length, saved });
    } catch (e) {
      log(`${relayKey}: FALLÓ — ${e.message}`);
      out.push({ key: relayKey, count: 0, saved: false, error: String(e.message ?? e) });
    }
  }
  return out;
}

/** COT: guarda las filas crudas de la CFTC (la función las usa si no puede pedirlas ella). `cot_relay` en `_ai_cache`. */
export async function relayCot({ fetchRows, setCache, now = Date.now(), log = () => {} }) {
  try {
    const rows = await fetchRows(160);
    const saved = Array.isArray(rows) && rows.length >= 4;
    if (saved) await setCache('cot_relay', { rows, savedAt: now, via: 'relay' }, 24 * 14);   // el dato es semanal: 14 días
    log(`cot_relay: ${rows?.length ?? 0} filas${saved ? ' (guardado)' : ' (muy pocas: no se guarda)'}`);
    return { key: 'cot_relay', count: rows?.length ?? 0, saved };
  } catch (e) {
    log(`cot_relay: FALLÓ — ${e.message}`);
    return { key: 'cot_relay', count: 0, saved: false, error: String(e.message ?? e) };
  }
}
