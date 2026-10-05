// Métricas REALES de las señales (reemplazan al viejo "AI Signal History", que solo contaba señales).
// Puro: recibe resultados ya etiquetados (outcomes.js) y, opcionalmente, líneas base y operaciones del usuario.

import { HORIZON_DAYS } from './outcomes.js';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r = (x, d = 4) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Una señal "acertó" si un BUY subió, un SELL bajó. WAIT no tiene veredicto (se mide aparte). */
export function isHit(action, ret) {
  if (action === 'BUY') return ret > 0;
  if (action === 'SELL') return ret < 0;
  return null;
}

/**
 * @param {Array<{action:string,strength?:string, h1?:object,h5?:object,h20?:object,h60?:object}>} records
 * @param {Record<number,{meanRet:number,upRate:number}|null>} baselines - por horizonte (días)
 */
export function summarizeOutcomes(records = [], baselines = {}) {
  const out = {};
  for (const action of ['BUY', 'WAIT', 'SELL']) {
    out[action] = {};
    for (const h of HORIZON_DAYS) {
      const rs = records.filter(x => x.action === action && x[`h${h}`]);
      if (!rs.length) { out[action][h] = { n: 0 }; continue; }
      const rets = rs.map(x => x[`h${h}`].ret);
      const hits = action === 'WAIT' ? null : rets.filter(v => isHit(action, v)).length / rets.length;
      const base = baselines[h] ?? null;
      out[action][h] = {
        n: rs.length,
        meanRet: r(mean(rets)),
        meanMae: r(mean(rs.map(x => x[`h${h}`].mae))),
        meanMfe: r(mean(rs.map(x => x[`h${h}`].mfe))),
        hitRate: hits === null ? null : r(hits),
        // referencia: en un activo que sube, "subió" ocurre solo por azar una fracción de las veces
        baseUpRate: base ? base.upRate : null,
        baseMeanRet: base ? base.meanRet : null,
        // ventaja sobre "comprar cualquier día" (BUY) o "vender cualquier día" (SELL); WAIT: qué se evitó/perdió
        edgeVsBase: base ? r(action === 'SELL' ? base.meanRet - mean(rets) : mean(rets) - base.meanRet) : null
      };
    }
  }
  return out;
}

/** Resultado por intensidad (¿las señales "fuertes" rinden distinto a las "débiles"?) para BUY a `h` días. */
export function byStrength(records = [], h = 20) {
  const out = {};
  for (const s of ['fuerte', 'moderado', 'débil']) {
    const rs = records.filter(x => x.action === 'BUY' && x.strength === s && x[`h${h}`]);
    out[s] = rs.length ? { n: rs.length, meanRet: r(mean(rs.map(x => x[`h${h}`].ret))), hitRate: r(rs.filter(x => x[`h${h}`].ret > 0).length / rs.length) } : { n: 0 };
  }
  return out;
}

const DAY_MS = 86400000;
const GAP_MS = 12 * 3600 * 1000;   // dos avisos seguidos del mismo tipo con menos de 12 h de diferencia son UNA señal
const dayOf = (ms) => Math.floor(ms / DAY_MS);

/**
 * Agrupa los avisos horarios en señales distintas: una compra que la app repite cada hora durante días es UNA señal, no
 * cientos (antes cada hora contaba aparte y el "% seguido" no significaba nada). Por tipo (BUY/SELL), huecos ≤ 12 h.
 * @returns {Array<{ action, start, end, first }>} `first` = el primer aviso del episodio (para el resultado a 20 d)
 */
export function signalEpisodes(records = []) {
  const out = [];
  for (const action of ['BUY', 'SELL']) {
    const rs = records.filter(x => x.action === action && Number.isFinite(x.ts)).sort((a, b) => a.ts - b.ts);
    let cur = null;
    for (const x of rs) {
      if (cur && x.ts - cur.end <= GAP_MS) cur.end = x.ts;
      else { cur = { action, start: x.ts, end: x.ts, first: x }; out.push(cur); }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * ¿Una operación corresponde a una señal? Las operaciones se guardan con FECHA (sin hora), así que se compara por DÍA, no
 * por hora: mismo tipo y símbolo, el día de la señal o el siguiente (la operación del mismo día tampoco "llega después":
 * antes se la descartaba si el aviso había salido a la tarde). Si el aviso salió en las primeras horas UTC (noche en
 * América), también vale el día anterior.
 */
export function opMatchesEpisode(op, ep) {
  if (op.type !== ep.action || !Number.isFinite(Number(op.ts))) return false;
  const day = dayOf(Number(op.ts));
  const earliest = dayOf(ep.start) - (new Date(ep.start).getUTCHours() < 6 ? 1 : 0);
  return day >= earliest && day <= dayOf(ep.end) + 1;
}

/**
 * ¿Seguiste la señal? Por señal distinta (episodio), no por aviso horario. Devuelve también las operaciones que hiciste SIN
 * señal y el resultado medio a 20 d de las seguidas vs no seguidas.
 * @param {Array} records     avisos con { ts, action, h20? } (de las decisiones guardadas, con el resultado si ya está etiquetado)
 * @param {Array} operations  operaciones del usuario { type, ts }
 */
export function followStats(records = [], operations = [], _legacyWindowH = 24, h = 20) {
  const episodes = signalEpisodes(records);
  const ops = operations.filter(o => (o.type === 'BUY' || o.type === 'SELL') && Number.isFinite(Number(o.ts)));
  const followed = (ep) => ops.some(op => opMatchesEpisode(op, ep));
  const f = episodes.filter(followed), nf = episodes.filter(ep => !followed(ep));
  const avg = (eps) => r(mean(eps.map(e => e.first[`h${h}`]).filter(Boolean).map(x => x.ret)));
  const withoutSignal = ops.filter(op => !episodes.some(ep => opMatchesEpisode(op, ep)));
  return {
    signals: episodes.length, followed: f.length, followRate: episodes.length ? r(f.length / episodes.length) : null,
    operations: ops.length, operationsWithoutSignal: withoutSignal.length,
    meanRetFollowed: avg(f), meanRetNotFollowed: avg(nf),
    recent: episodes.slice(-5).reverse().map(ep => ({ action: ep.action, from: ep.start, to: ep.end, followed: followed(ep) }))
  };
}

/** Campeón vs sombra (DCA fijo): retorno medio a h días de las compras que cada uno habría hecho. */
export function compareShadow(records = [], h = 20) {
  const withShadow = records.filter(x => x.shadow && x[`h${h}`]);
  const champ = withShadow.filter(x => x.action === 'BUY').map(x => x[`h${h}`].ret);
  const shadow = withShadow.filter(x => x.shadow.action === 'BUY').map(x => x[`h${h}`].ret);
  return {
    horizon: h, n: withShadow.length,
    champion: { buys: champ.length, meanRet: r(mean(champ)) },
    shadow:   { id: withShadow[0]?.shadow?.id ?? 'fixed_dca', buys: shadow.length, meanRet: r(mean(shadow)) }
  };
}
