// Monitor de desacople oro ↔ tasa real.
//
// El score de oro asume que la tasa real 10Y y el oro se mueven en sentido contrario. Esa relación se
// rompió entre 2022 y 2025 (compras de bancos centrales, geopolítica): un modelo que la da por hecha
// sobrepondera una señal que dejó de funcionar. Este monitor mide cuánto se cumple HOY. Es
// INFORMATIVO: no cambia pesos solo (reponderar automáticamente sin backtest sería otro sobreajuste).

import { pearson } from '../backtest/stats.js';

/** Correlación de Pearson entre el retorno log diario del oro y el cambio diario de la tasa real, alineados por fecha. */
export function goldRealYieldCorrelation(goldCandles, ryObs, window = 60) {
  if (!Array.isArray(goldCandles) || !Array.isArray(ryObs)) return null;
  const ryByDate = new Map(ryObs.map(o => [o.date, o.value]));
  const pairs = [];
  let prevGold = null, prevRy = null;
  for (const c of goldCandles) {
    const date = typeof c.date === 'string' ? c.date : new Date(c.timestamp ?? c.time).toISOString().slice(0, 10);
    const ry = ryByDate.get(date);
    if (!(c.close > 0) || ry === undefined) continue;          // solo días con ambos datos: sin rellenar
    if (prevGold !== null) pairs.push([Math.log(c.close / prevGold), ry - prevRy]);
    prevGold = c.close; prevRy = ry;
  }
  if (pairs.length < window) return null;
  const corr = (arr) => pearson(arr.map(p => p[0]), arr.map(p => p[1]));
  return { pairs, corr };
}

/**
 * @returns {{ corr60:number, corr250:number|null, status:'normal'|'weakened'|'decoupled', message:string }|null}
 *   normal: correlación reciente claramente negativa (la relación se cumple);
 *   weakened: negativa pero mucho más débil que su promedio de 1 año;
 *   decoupled: ≥ −0.05 (la tasa real no está explicando al oro).
 */
export function decouplingStatus(goldCandles, ryObs) {
  const g = goldRealYieldCorrelation(goldCandles, ryObs, 60);
  if (!g) return null;
  const { pairs, corr } = g;
  const c60 = corr(pairs.slice(-60));
  const c250 = pairs.length >= 200 ? corr(pairs.slice(-250)) : null;
  if (!Number.isFinite(c60)) return null;
  const r = (x) => Math.round(x * 1000) / 1000;

  let status = 'normal';
  if (c60 >= -0.05) status = 'decoupled';
  else if (c250 !== null && Number.isFinite(c250) && c60 - c250 > 0.25) status = 'weakened';

  const message = {
    normal: `La tasa real explica al oro como se espera (correlación 60d ${r(c60)}).`,
    weakened: `La relación oro–tasa real se debilitó (60d ${r(c60)} vs 1 año ${r(c250)}): el componente de tasa real vale menos ahora.`,
    decoupled: `El oro está desacoplado de la tasa real (correlación 60d ${r(c60)}): no confiar en ese componente del score.`
  }[status];
  return { corr60: r(c60), corr250: c250 !== null && Number.isFinite(c250) ? r(c250) : null, n: pairs.length, status, message };
}
