// Simulador de DCA: ¿modular el monto de cada compra con una señal abarata el costo promedio?
//
// Diseño para no engañarse:
//  - GASTO IGUALADO: los montos modulados se reescalan para que cada ventana gaste lo mismo que el DCA fijo;
//    así la comparación es costo promedio por unidad, no "gastó más y compró más".
//  - VENTANAS MÓVILES: se evalúan muchos inicios (no una sola fecha afortunada) y se reporta la distribución.
//    Las ventanas se solapan mucho: la cantidad efectiva de muestras independientes es MENOR que `windows`.
//  - PLACEBO por DESPLAZAMIENTO CIRCULAR de toda la secuencia de multiplicadores contra los precios: conserva
//    la autocorrelación de la señal y el solapamiento entre ventanas, y rompe solo la alineación con el precio.
//    (Barajar cada ventana por separado subestima la varianza del nulo y da falsos positivos: se midió.)
//    Si la señal real no le gana a las versiones desalineadas, no hay valor de timing.
//  - La señal en la fecha d usa solo información disponible en d (el precio de compra es el cierre de d).

import { mean, median, quantile, mulberry32 } from './stats.js';

/** m = 1 + dir·k·score, acotado. dir=+1 compra más con score alto (seguir); dir=−1 compra más con score bajo (contrarian). */
export function modulation(score, { k = 1, min = 0.25, max = 2, dir = 1 } = {}) {
  if (!Number.isFinite(score)) return 1;
  return Math.min(max, Math.max(min, 1 + dir * k * score));
}

/** Fechas de compra: una cada `everyDays` filas (≈ semanal con 5). Devuelve [{date, close, m}] con m del scoreFn. */
export function buildSchedule(rows, scoreFn, { everyDays = 5, mod = {} } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += everyDays) {
    const r = rows[i];
    if (!Number.isFinite(r.close)) continue;
    out.push({ date: r.date, close: r.close, m: modulation(scoreFn(r), mod) });
  }
  return out;
}

/** Resultado de una ventana dados montos por compra. */
function runWindow(buys, amounts) {
  let spend = 0, units = 0, worst = 0;
  for (let i = 0; i < buys.length; i++) {
    spend += amounts[i];
    units += amounts[i] / buys[i].close;
    worst = Math.min(worst, (units * buys[i].close) / spend - 1);
  }
  const last = buys[buys.length - 1].close;
  return { spend, units, avgCost: spend / units, finalValue: units * last, ret: (units * last) / spend - 1, worstDrawdown: worst };
}

const scaled = (ms) => { const s = ms.reduce((a, b) => a + b, 0); return ms.map(m => (m * ms.length) / s); };


/**
 * Compara DCA fijo, DCA modulado (mismo gasto), placebo aleatorio y compra única al inicio.
 * @param {Array} schedule  - salida de buildSchedule
 * @param {object} o
 * @param {number} [o.windowBuys=156]  compras por ventana (3 años semanales)
 * @param {number} [o.stepBuys=4]      avance entre inicios de ventana
 * @param {number} [o.placebo=200]     réplicas de multiplicadores barajados
 */
export function compareDCA(schedule, { windowBuys = 156, stepBuys = 4, placebo = 200, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const wins = [];
  for (let s = 0; s + windowBuys <= schedule.length; s += stepBuys) wins.push(schedule.slice(s, s + windowBuys));
  if (wins.length < 5) return { windows: wins.length, insufficient: true };

  const ones = new Array(windowBuys).fill(1);
  const n = schedule.length;
  const starts = [];
  for (let s0 = 0; s0 + windowBuys <= n; s0 += stepBuys) starts.push(s0);
  const fixedCost = wins.map(w => runWindow(w, ones).avgCost);
  const perWin = [];

  wins.forEach((w, k) => {
    const fixed = runWindow(w, ones);
    const mod = runWindow(w, scaled(w.map(b => b.m)));
    perWin.push({
      start: w[0].date, end: w[w.length - 1].date,
      ratio: mod.avgCost / fixed.avgCost, fixedAvgCost: fixed.avgCost, modAvgCost: mod.avgCost,
      fixedRet: fixed.ret, modRet: mod.ret, lumpRet: w[w.length - 1].close / w[0].close - 1,
      fixedWorst: fixed.worstDrawdown, modWorst: mod.worstDrawdown
    });
  });

  // nulo: la misma secuencia de multiplicadores desplazada circularmente respecto de los precios
  const minShift = Math.min(windowBuys, Math.floor(n / 4));
  const placeboMeans = [];
  for (let pIdx = 0; pIdx < placebo; pIdx++) {
    const shift = minShift + Math.floor(rng() * (n - 2 * minShift));
    let acc = 0;
    wins.forEach((w, k) => {
      const s0 = starts[k];
      const ms = scaled(w.map((_, j) => schedule[(s0 + j + shift) % n].m));
      acc += runWindow(w, ms).avgCost / fixedCost[k];
    });
    placeboMeans.push(acc / wins.length);
  }

  const ratios = perWin.map(x => x.ratio);
  const meanRatio = mean(ratios);
  // p unilateral: ¿qué fracción de versiones desalineadas compra al menos tan barato como la señal real?
  const pValue = (placeboMeans.filter(x => x <= meanRatio).length + 1) / (placebo + 1);

  return {
    windows: wins.length, windowBuys, stepBuys,
    meanRatio, medianRatio: median(ratios),
    winRate: ratios.filter(r => r < 1).length / ratios.length,
    ratioP10: quantile(ratios, 0.1), ratioP90: quantile(ratios, 0.9),
    placeboMeanRatio: mean(placeboMeans), placeboSd: Math.sqrt(mean(placeboMeans.map(x => (x - mean(placeboMeans)) ** 2))),
    pValue,
    avgAdvantagePct: (1 - meanRatio) * 100,
    fixed: { meanRet: mean(perWin.map(x => x.fixedRet)), meanWorst: mean(perWin.map(x => x.fixedWorst)) },
    modulated: { meanRet: mean(perWin.map(x => x.modRet)), meanWorst: mean(perWin.map(x => x.modWorst)) },
    lumpSum: { meanRet: mean(perWin.map(x => x.lumpRet)) },
    perWindow: perWin
  };
}
