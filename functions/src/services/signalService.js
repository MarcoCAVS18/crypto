// Señal de un activo para un usuario: UN SOLO camino de cálculo que usan la API (/decision, lo que ve la app) y el job de avisos
// (push con la app cerrada). Antes los avisos salían de otra lógica (solo la zona de precio) y no coincidían con la app.
//
//   mercado → indicadores, zonas y modo (con el contexto macro del oro) → motor de decisión (la REGLA)
//           → capa de IA (solo si la regla propone comprar: esperar o comprar, tamaño y tramos, con límites duros)
//           → calidad de datos → riesgo de calendario
//
// Las dependencias que tocan red o base de datos (contexto de oro, modo previo, calendario, IA y su caché) se inyectan: así se
// prueba sin red y el job puede cargarlas de forma diferida (firebase-admin).

import { calculateAllIndicators, analyzeVolume } from './technicalAnalysis.js';
import { calculateZones } from './zoneCalculator.js';
import { determineMarketMode } from './marketMode.js';
import { determineGoldMarketMode } from './goldMarketMode.js';
import { makeDecision } from './decisionEngine.js';
import { applyEventRisk } from './eventRisk.js';
import { applyDataQuality } from './dataHealth.js';
import { pullbackLevels } from './pullbacks.js';
import { buildAiFacts, decideWithAI, AI_DECISION } from './aiDecision.js';

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

const buyTotals = (ops = []) => {
  const buys = ops.filter(o => o?.type === 'BUY' && Number.isFinite(o.usdAmount) && o.usdAmount > 0);
  return { totalUsd: Math.round(buys.reduce((a, o) => a + o.usdAmount, 0) * 100) / 100, tranches: buys.length };
};
const firstSentence = (t, max = 140) => {
  const s = String(t ?? '').split(/(?<=[.!?])\s/)[0].trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};
const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
};

/** Resumen serializable de la participación de la IA (va en `decision.ai`: lo muestra la app y lo guarda el historial). */
function aiSummary(r, extra = {}) {
  const { ai, final, record } = r;
  return {
    version: AI_DECISION.version, used: true, cached: r.cached, decidedAt: record.decidedAt, model: record.model,
    action: final.action, rawAction: ai.action, confidence: ai.confidence,
    sizeMultiplier: ai.sizeMultiplier, tranches: ai.tranches, waitDays: final.waitDays, waitUntil: final.waitUntil,
    reasoning: ai.reasoning, keyFactors: ai.keyFactors, followedRule: final.followedRule, capped: final.capped,
    notes: final.notes, ...(record.clamped?.length ? { clamped: record.clamped } : {}), ...extra
  };
}

/** La IA pidió esperar: la compra queda pendiente (sin órdenes), con la fecha para volver a mirar. */
function aiWaitDecision(proposal, summary, rule) {
  const day = fmtDay(summary.waitUntil);
  return {
    action: 'WAIT', strength: 'moderado',
    reason: `La IA recomienda esperar: ${firstSentence(summary.reasoning)}`,
    recommendation: `${summary.reasoning} La compra queda pendiente${day ? ` hasta el ${day}` : ''}: la regla tenía lista ${rule.totalUsd ? `$${Math.round(rule.totalUsd)}` : 'la cuota'}${rule.tranches ? ` en ${rule.tranches} ${rule.tranches === 1 ? 'tramo' : 'tramos'}` : ''}; si el contexto cambia antes, la señal se actualiza.`,
    operations: [],
    ...(proposal.policy ? { policy: proposal.policy } : {}),
    ...(proposal.cadence ? { cadence: proposal.cadence } : {}),
    ai: summary
  };
}

/**
 * Paso de IA sobre una compra que la regla ya propone. Devuelve la decisión final (con `ai`) o la propuesta de la regla
 * (con `ai.used=false` y el motivo) si la IA no está disponible. Nunca lanza.
 */
async function applyAi({ proposal, symbol, marketData, ctx, userState, portfolioContext, events, calendar, scope, now }, deps, rerun) {
  const rule = buyTotals(proposal.operations);
  try {
    let news = null;
    if (symbol !== 'PAXG' && deps.ai.getNews) news = await deps.ai.getNews(symbol).catch(() => null);
    const facts = buildAiFacts({
      symbol, price: marketData.price, change24hPct: marketData.change24h ?? null, indicators: ctx.indicators, zones: ctx.zones,
      marketMode: ctx.marketMode, news, events, portfolioContext, userState, proposal, cadence: proposal.cadence ?? null, calendar, now
    });
    const r = await decideWithAI({ facts, cadence: proposal.cadence ?? null, scope, now }, deps.ai);
    if (!r.used) return { ...proposal, ai: { version: AI_DECISION.version, used: false, reason: r.reason, message: r.message } };

    if (r.final.action === 'WAIT') return aiWaitDecision(proposal, aiSummary(r), { totalUsd: rule.totalUsd, tranches: rule.tranches });

    if (!r.final.sizing) return { ...proposal, ai: aiSummary(r, { applied: { ...rule, ruleTotalUsd: rule.totalUsd, ruleTranches: rule.tranches } }) };

    // Se vuelve a correr el motor con el ajuste: así costos, mínimos por orden, niveles ya ejecutados y textos quedan consistentes
    const adjusted = rerun(r.final.sizing);
    const after = buyTotals(adjusted.operations);
    if (adjusted.action !== 'BUY' || !after.tranches) {
      return { ...proposal, ai: aiSummary(r, { followedRule: true, notes: [...r.final.notes, 'El ajuste de la IA no era aplicable (monto mínimo): se sigue la regla.'] }) };
    }
    return { ...adjusted, ai: aiSummary(r, { applied: { ...after, ruleTotalUsd: rule.totalUsd, ruleTranches: rule.tranches } }) };
  } catch (err) {
    deps.warn?.(`[AIDecision] ${symbol}: ${err.message}`);
    return { ...proposal, ai: { version: AI_DECISION.version, used: false, reason: 'error', message: 'La IA no pudo evaluar esta compra; decide la regla.' } };
  }
}

/**
 * @param {object} o
 * @param {string} o.symbol
 * @param {object} o.marketData       { price, candles, candlesSource, change24h? }
 * @param {object} o.userState        { cashPercent, mode, totalCapital, installments, costs, target }
 * @param {object|null} o.portfolioContext
 * @param {number} [o.now]
 * @param {string} [o.scope]          usuario (para compartir la decisión de la IA entre la app y los avisos)
 * @param {{ getGoldContext?:Function, getPreviousMode?:Function, getUpcomingEvents?:Function, warn?:Function,
 *           ai?:{ chat:Function, cacheGet:Function, cacheSet:Function, getNews?:Function, model?:string, warn?:Function } }} deps
 * @returns {Promise<{ indicators, volumeAnalysis, zones, marketMode, decision }>}
 */
export async function computeSignal({ symbol, marketData, userState, portfolioContext = null, now = Date.now(), scope = 'anon' }, deps = {}) {
  const ctx = await buildMarketContext(symbol, marketData, deps);

  const meta = { candlesSource: marketData.candlesSource, pullback: symbol === 'PAXG' ? pullbackLevels(marketData.candles) : null, now };
  const run = (sizing = null) => makeDecision(
    ctx.marketMode, ctx.zones, marketData.price, userState, ctx.indicators, symbol, portfolioContext,
    sizing ? { ...meta, sizing } : meta
  );

  // Cobertura del calendario macro: si se acabó, "sin eventos" no es un dato (el riesgo de calendario no puede actuar y la IA no lo sabe)
  let calendar = null;
  try { calendar = deps.calendarCovers ? deps.calendarCovers(5, now) : null; } catch { /* sin dato de cobertura */ }

  // 1) La REGLA propone
  let decision = run();

  // 2) La IA afina el momento y el tamaño de una compra que la regla ya permite (nunca fuerza compras ni toca ventas)
  if (deps.ai && decision.action === 'BUY' && userState?.mode === 'inversion' && buyTotals(decision.operations).tranches > 0) {
    let events = [];
    try { events = deps.getUpcomingEvents ? deps.getUpcomingEvents(5, symbol, now) : []; } catch { /* sin calendario: la IA decide sin eventos */ }
    decision = await applyAi({ proposal: decision, symbol, marketData, ctx, userState, portfolioContext, events, calendar, scope, now }, deps, run);
  }

  // 3) Con datos macro degradados (fuentes caídas/viejas) se advierte y una compra pierde intensidad
  decision = applyDataQuality(decision, ctx.marketMode.goldContext?.dataHealth);

  // 4) Riesgo de calendario macro (determinístico, solo compras; ver services/eventRisk.js)
  if (decision.action === 'BUY' && deps.getUpcomingEvents) {
    try {
      decision = applyEventRisk(decision, deps.getUpcomingEvents(2, symbol, now));
    } catch (err) {
      deps.warn?.(`[EventRisk] Error: ${err.message}`);      // no interrumpir la señal principal
    }
  }
  // El hueco del calendario se muestra (campana y detalles): sin él, el aviso de FOMC/CPI no puede salir
  if (calendar && calendar.covered === false) decision = { ...decision, calendarCoverage: { covered: false, daysCovered: calendar.daysCovered, lastEventDate: calendar.lastEventDate } };
  return { ...ctx, decision };
}
