// Señal de un activo para un usuario: UN SOLO camino de cálculo que usan la API (/decision, lo que ve la app) y el job de avisos
// (push con la app cerrada). Antes los avisos salían de otra lógica (solo la zona de precio) y no coincidían con la app.
//
//   mercado → indicadores, zonas y modo (con el contexto macro del oro) → motor de decisión → calidad de datos → riesgo de calendario
//
// Las dependencias que tocan red o base de datos (contexto de oro, modo previo, calendario) se inyectan: así se prueba sin red
// y el job puede cargarlas de forma diferida (firebase-admin).

import { calculateAllIndicators, analyzeVolume } from './technicalAnalysis.js';
import { calculateZones } from './zoneCalculator.js';
import { determineMarketMode } from './marketMode.js';
import { determineGoldMarketMode } from './goldMarketMode.js';
import { makeDecision } from './decisionEngine.js';
import { applyEventRisk } from './eventRisk.js';
import { applyDataQuality } from './dataHealth.js';
import { pullbackLevels } from './pullbacks.js';

/**
 * @param {string} symbol
 * @param {{price:number, candles:Array}} marketData
 * @param {{ getGoldContext?:Function, getPreviousMode?:Function, warn?:Function }} deps
 */
export async function buildMarketContext(symbol, marketData, deps = {}) {
  const indicators = calculateAllIndicators(marketData.candles);
  const volumeAnalysis = analyzeVolume(marketData.candles);
  const zones = calculateZones(marketData.price, marketData.candles, indicators);

  let marketMode;
  if (symbol === 'PAXG') {
    try {
      const goldCtx = await deps.getGoldContext();
      const previousMode = deps.getPreviousMode ? await deps.getPreviousMode('PAXG') : null;
      marketMode = determineGoldMarketMode(marketData.price, indicators, volumeAnalysis, goldCtx, { previousMode });
    } catch (err) {
      deps.warn?.(`[Signal] Gold context fallback: ${err.message}`);
      marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
    }
  } else {
    marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
  }
  return { indicators, volumeAnalysis, zones, marketMode };
}

/**
 * @param {object} o
 * @param {string} o.symbol
 * @param {object} o.marketData       { price, candles, candlesSource }
 * @param {object} o.userState        { cashPercent, mode, totalCapital, installments, costs, target }
 * @param {object|null} o.portfolioContext
 * @param {number} [o.now]
 * @param {{ getGoldContext?:Function, getPreviousMode?:Function, getUpcomingEvents?:Function, warn?:Function }} deps
 * @returns {Promise<{ indicators, volumeAnalysis, zones, marketMode, decision }>}
 */
export async function computeSignal({ symbol, marketData, userState, portfolioContext = null, now = Date.now() }, deps = {}) {
  const ctx = await buildMarketContext(symbol, marketData, deps);

  let decision = makeDecision(
    ctx.marketMode, ctx.zones, marketData.price, userState, ctx.indicators, symbol, portfolioContext,
    { candlesSource: marketData.candlesSource, pullback: symbol === 'PAXG' ? pullbackLevels(marketData.candles) : null, now }
  );

  // Con datos macro degradados (fuentes caídas/viejas) se advierte y una compra pierde intensidad
  decision = applyDataQuality(decision, ctx.marketMode.goldContext?.dataHealth);

  // Riesgo de calendario macro (determinístico, solo compras; ver services/eventRisk.js)
  if (decision.action === 'BUY' && deps.getUpcomingEvents) {
    try {
      decision = applyEventRisk(decision, deps.getUpcomingEvents(2, symbol, now));
    } catch (err) {
      deps.warn?.(`[EventRisk] Error: ${err.message}`);      // no interrumpir la señal principal
    }
  }
  return { ...ctx, decision };
}
