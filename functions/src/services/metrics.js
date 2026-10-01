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

/**
 * ¿Seguiste la señal? Un BUY/SELL se considera seguido si hay una operación del mismo tipo y símbolo
 * dentro de las `windowH` horas posteriores. Devuelve tasa de seguimiento y resultado medio seguido vs no seguido (h20).
 */
export function followStats(records = [], operations = [], windowH = 24, h = 20) {
  const acted = records.filter(x => x.action === 'BUY' || x.action === 'SELL');
  const followed = (rec) => operations.some(op => op.type === rec.action && Number(op.ts) >= rec.ts && Number(op.ts) <= rec.ts + windowH * 3600000);
  const f = acted.filter(followed), nf = acted.filter(x => !followed(x));
  const avg = (rs) => r(mean(rs.filter(x => x[`h${h}`]).map(x => x[`h${h}`].ret)));
  return { signals: acted.length, followed: f.length, followRate: acted.length ? r(f.length / acted.length) : null,
    meanRetFollowed: avg(f), meanRetNotFollowed: avg(nf) };
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
