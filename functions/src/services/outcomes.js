// Etiquetado de resultados de las señales: ¿qué pasó DESPUÉS de cada decisión?
// Para cada señal se mide, a 1/5/20/60 días: retorno, peor caída (MAE) y mejor suba (MFE) respecto del precio de la señal.
// Solo se calcula un horizonte cuando ya transcurrió por completo (no hay resultados parciales presentados como finales).

const DAY = 86400000;
export const HORIZON_DAYS = [1, 5, 20, 60];

const r4 = (x) => Math.round(x * 10000) / 10000;

/**
 * @param {{ ts:number, price:number }} signal - ms y precio de la señal
 * @param {Array<{timestamp:number,high:number,low:number,close:number}>} daily - velas DIARIAS ascendentes (timestamp = apertura, UTC)
 * @param {number} now
 * @returns {Record<string, {ret:number, mae:number, mfe:number}|null>} claves h1, h5, h20, h60
 */
export function computeOutcome(signal, daily, now = Date.now()) {
  const out = Object.fromEntries(HORIZON_DAYS.map(h => [`h${h}`, null]));
  if (!signal || !Number.isFinite(signal.ts) || !(signal.price > 0) || !Array.isArray(daily)) return out;

  // solo velas ya cerradas y posteriores al inicio del día de la señal
  const closed = daily.filter(c => Number.isFinite(c.close) && c.timestamp + DAY <= now && c.timestamp + DAY > signal.ts);
  for (const h of HORIZON_DAYS) {
    const target = signal.ts + h * DAY;
    const idx = closed.findIndex(c => c.timestamp + DAY >= target);
    if (idx < 0) continue;                                   // el horizonte todavía no terminó
    const window = closed.slice(0, idx + 1);
    out[`h${h}`] = {
      ret: r4(closed[idx].close / signal.price - 1),
      mae: r4(Math.min(...window.map(c => c.low)) / signal.price - 1),
      mfe: r4(Math.max(...window.map(c => c.high)) / signal.price - 1)
    };
  }
  return out;
}

export const isComplete = (o) => HORIZON_DAYS.every(h => o?.[`h${h}`]);

/** Retorno medio y tasa de subidas de TODAS las ventanas de h días (línea base: "comprar cualquier día"). */
export function baselineReturns(daily, h) {
  const c = (daily ?? []).filter(x => Number.isFinite(x.close));
  const rets = [];
  for (let i = 0; i + h < c.length; i++) rets.push(c[i + h].close / c[i].close - 1);
  if (rets.length < 10) return null;
  return { n: rets.length, meanRet: r4(rets.reduce((a, b) => a + b, 0) / rets.length), upRate: r4(rets.filter(x => x > 0).length / rets.length) };
}
