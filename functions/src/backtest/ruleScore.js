// Réplica DIARIA del score actual de goldMarketMode, para poder medir su valor histórico.
//
// Reutiliza las mismas funciones de mapeo que producción (dxyScore, yieldScore, gvzAdjustment,
// ratioAdjustment, classifyRealYield): si alguien recalibra un mapeo, la réplica lo hereda.
//
// Diferencias inevitables con el score en vivo (declaradas para no sobrevender el resultado):
//  - Sin componente IA: no existe historia de titulares/sentimiento.
//  - "Técnico": producción usa velas 4h; acá se usan las diarias (precio vs EMA200/EMA50 y RSI). La
//    volatilidad ATR/precio de 4h del oro es siempre < 1.5 %, o sea que suma +1 de forma constante;
//    se replica igual (atr=0) en vez de inventar otra regla. El volumen se asume neutral.
//  - "dailyBias": idéntico en espíritu (EMA20/EMA50 diarias + RSI diario).
//  - COT: reglas idénticas sobre el dato disponible en la fecha (rezago de publicación ya aplicado en features).
//  - Ratio oro/plata: usa el oro futuro en vez de PAXG.

import { dxyScore, yieldScore, gvzAdjustment, ratioAdjustment, MODE_THRESHOLD } from '../services/goldMarketMode.js';
import { determineMarketMode } from '../services/marketMode.js';
import { classifyRealYield } from '../services/macroService.js';

const fin = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * @param {object} raw - `row.raw` del dataset (close, ema20/50/200, rsi, dxyChangePct, tenYear, realYield,
 *                       cotNetSpec, cotWeekChange, gvz, goldSilverRatio)
 * @returns {{ score:number, mode:string, components:object }}
 */
export function ruleScore(raw) {
  const components = {};
  let score = 0;
  const add = (k, v) => { components[k] = v; score += v; };

  if (fin(raw.dxyChangePct)) add('dxy', dxyScore(raw.dxyChangePct) * 0.25);
  if (fin(raw.tenYear)) add('tenYear', yieldScore(raw.tenYear) * 0.20);

  // técnico (diario, ver cabecera)
  const tech = determineMarketMode(raw.close, { ema: { ema200: raw.ema200, ema50: raw.ema50 }, atr: 0, rsi: raw.rsi }, { status: 'normal' });
  add('technical', (tech.mode === 'risk_on' ? 1 : tech.mode === 'risk_off' ? -1 : 0) * 0.15);

  if (fin(raw.cotNetSpec)) {
    const n = raw.cotNetSpec;
    let adj = n > 200000 ? -0.10 : n > 80000 ? 0.05 : n > 0 ? 0 : 0.10;
    if (fin(raw.cotWeekChange)) {
      if (raw.cotWeekChange > 15000) adj = Math.min(adj + 0.03, 0.10);
      else if (raw.cotWeekChange < -15000) adj = Math.max(adj - 0.03, -0.10);
    }
    add('cot', adj);
  }

  if (fin(raw.realYield)) {
    const s = classifyRealYield(raw.realYield);
    add('realYield', s === 'very_bullish' ? 0.10 : s === 'bullish' ? 0.05 : s === 'bearish' ? -0.10 : 0);
  }
  if (fin(raw.gvz)) add('gvz', gvzAdjustment(raw.gvz));
  if (fin(raw.goldSilverRatio)) add('goldSilver', ratioAdjustment(raw.goldSilverRatio));

  if (fin(raw.ema20) && fin(raw.ema50)) {
    const short = raw.close > raw.ema20, med = raw.close > raw.ema50;
    let d = short && med ? 0.10 : !short && !med ? -0.10 : 0;
    if (fin(raw.rsi)) {
      if (raw.rsi > 70) d = Math.max(d - 0.05, -0.15);
      else if (raw.rsi < 35) d = Math.min(d + 0.05, 0.15);
    }
    add('dailyBias', d);
  }

  const final = clamp(score, -1, 1);
  const mode = final > MODE_THRESHOLD ? 'risk_on' : final < -MODE_THRESHOLD ? 'risk_off' : 'neutral';
  return { score: final, mode, components };
}

/** Atajo para evaluateScore / simulador: score numérico de una fila del dataset. */
export const ruleScoreOfRow = (row) => (row.raw ? ruleScore(row.raw).score : NaN);
