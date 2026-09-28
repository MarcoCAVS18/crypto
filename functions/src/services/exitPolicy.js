// Salidas parciales por régimen (solo PAXG, solo con ganancia). Complementan la toma de ganancias por zona de
// venta del motor: no dependen de que el precio esté en la zona, sino de que el régimen se rompa o el precio se
// sobre-extienda. Recortes chicos y nunca completos (el oro es reserva de valor: se conserva un núcleo).
//
// Sin respaldo de backtest todavía (declarado): son reglas de gestión de riesgo con umbrales conservadores.

export const EXIT_RULES = Object.freeze({
  trendBreak: { minProfitPct: 15, trimPct: 20 },        // tendencia larga bajista + macro adverso
  overExtension: { minProfitPct: 25, extensionPct: 25, dailyRsi: 70, trimPct: 15 }   // muy por encima de la EMA200 y RSI diario alto
});

/**
 * @param {object} p
 * @param {number|null} p.pnlPercent
 * @param {number} p.score            - score de mercado (−1…1)
 * @param {object|null} p.dailyBias   - { longAlignment, extension200Pct, rsi }
 * @returns {null|{ kind:'trendBreak'|'overExtension', pct:number, strength:string, reason:string }}
 */
export function evaluateExit({ pnlPercent, score, dailyBias }) {
  if (pnlPercent == null || !dailyBias) return null;
  const t = EXIT_RULES.trendBreak;
  if (dailyBias.longAlignment === 'bear' && score <= -0.25 && pnlPercent >= t.minProfitPct) {
    return { kind: 'trendBreak', pct: t.trimPct, strength: 'moderado',
      reason: `Rotura de tendencia larga (bajo la EMA200) con macro adverso y ganancia de ${pnlPercent.toFixed(1)} %` };
  }
  const o = EXIT_RULES.overExtension;
  if (Number.isFinite(dailyBias.extension200Pct) && dailyBias.extension200Pct >= o.extensionPct
      && Number.isFinite(dailyBias.rsi) && dailyBias.rsi >= o.dailyRsi && pnlPercent >= o.minProfitPct) {
    return { kind: 'overExtension', pct: o.trimPct, strength: 'débil',
      reason: `Precio ${dailyBias.extension200Pct.toFixed(0)} % sobre la EMA200 con RSI diario ${dailyBias.rsi.toFixed(0)} (sobre-extensión) y ganancia de ${pnlPercent.toFixed(1)} %` };
  }
  return null;
}
