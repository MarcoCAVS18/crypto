// Market mode específico para PAXG / oro tokenizado
//
// El oro se mueve por factores distintos al crypto:
//   - DXY (25%): dólar sube → oro baja | dólar baja → oro sube
//   - Bono 10Y (20%): yields altos = mayor costo de oportunidad vs oro
//   - Sentimiento IA noticias (40%): Groq analiza macro y titulares
//   - Técnicos BTC (15%): contexto de mercado cripto
//
// Puntuación final:
//   > +0.25  → risk_on  (entorno favorable para oro)
//   < -0.25  → risk_off (entorno desfavorable)
//   entre    → neutral

import { determineMarketMode } from './marketMode.js';

/**
 * Determina el market mode para PAXG usando inteligencia macro + técnicos.
 *
 * @param {number} currentPrice - Precio actual de PAXG
 * @param {object} indicators   - Indicadores técnicos (ema, rsi, atr…)
 * @param {object} volumeAnalysis
 * @param {object|null} goldContext - Resultado de getGoldContext()
 * @returns {{ mode, score, reasons, goldContext }}
 */
export function determineGoldMarketMode(currentPrice, indicators, volumeAnalysis, goldContext) {
  // Sin contexto macro: fallback a market mode estándar
  if (!goldContext) {
    const fallback = determineMarketMode(currentPrice, indicators, volumeAnalysis);
    return {
      ...fallback,
      goldContext: null
    };
  }

  const { macro, analysis } = goldContext;
  const reasons = [];
  let score = 0;

  // ── 1. Sentimiento IA (40%) ───────────────────────────────────────────────
  const sentimentScore = typeof analysis?.score === 'number' ? analysis.score : 0;
  score += sentimentScore * 0.40;

  const sentimentLabels = { bullish: 'alcista', neutral: 'neutral', bearish: 'bajista' };
  const sentLabel = sentimentLabels[analysis?.sentiment] ?? 'neutral';
  if (analysis?.reasoning) {
    reasons.push(`IA: Sentimiento ${sentLabel} — ${analysis.reasoning}`);
  } else {
    reasons.push(`IA: Sentimiento ${sentLabel} para el oro`);
  }

  // ── 2. DXY (25%) ─────────────────────────────────────────────────────────
  if (macro?.dxy) {
    const { value: dxyVal, changePercent: dxyChg } = macro.dxy;
    let dxyScore = 0;

    if (dxyChg > 0.6) {
      dxyScore = -1;
      reasons.push(`Dólar fuerte (DXY ${dxyVal.toFixed(1)}, +${dxyChg.toFixed(2)}%) → presión bajista en oro`);
    } else if (dxyChg > 0.15) {
      dxyScore = -0.5;
      reasons.push(`Dólar al alza (DXY ${dxyVal.toFixed(1)}, +${dxyChg.toFixed(2)}%)`);
    } else if (dxyChg < -0.6) {
      dxyScore = 1;
      reasons.push(`Dólar débil (DXY ${dxyVal.toFixed(1)}, ${dxyChg.toFixed(2)}%) → soporte para el oro`);
    } else if (dxyChg < -0.15) {
      dxyScore = 0.5;
      reasons.push(`Dólar levemente a la baja (DXY ${dxyVal.toFixed(1)}, ${dxyChg.toFixed(2)}%)`);
    } else {
      reasons.push(`Dólar estable (DXY ${dxyVal.toFixed(1)})`);
    }

    score += dxyScore * 0.25;
  }

  // ── 3. Bono 10Y (20%) ────────────────────────────────────────────────────
  if (macro?.tenYearYield) {
    const { value: yldVal } = macro.tenYearYield;
    let yldScore = 0;

    if (yldVal >= 4.75) {
      yldScore = -1;
      reasons.push(`Yields muy elevados (${yldVal.toFixed(2)}%) → costo de oportunidad alto vs oro`);
    } else if (yldVal >= 4.25) {
      yldScore = -0.5;
      reasons.push(`Yields altos (${yldVal.toFixed(2)}%) → presión moderada sobre el oro`);
    } else if (yldVal < 3.5) {
      yldScore = 1;
      reasons.push(`Yields bajos (${yldVal.toFixed(2)}%) → entorno favorable para el oro`);
    } else if (yldVal < 4.0) {
      yldScore = 0.3;
      reasons.push(`Yields moderados (${yldVal.toFixed(2)}%)`);
    } else {
      reasons.push(`Yields neutrales (${yldVal.toFixed(2)}%)`);
    }

    score += yldScore * 0.20;
  }

  // ── 4. Técnicos (15%) ────────────────────────────────────────────────────
  const techMode = determineMarketMode(currentPrice, indicators, volumeAnalysis);
  const techScore = techMode.mode === 'risk_on' ? 1 : techMode.mode === 'risk_off' ? -1 : 0;
  score += techScore * 0.15;

  if (techMode.mode === 'risk_on') {
    reasons.push(`Técnico: tendencia alcista (EMA, RSI favorables)`);
  } else if (techMode.mode === 'risk_off') {
    reasons.push(`Técnico: tendencia bajista (EMA, RSI desfavorables)`);
  }

  // ── Modo final ────────────────────────────────────────────────────────────
  const finalScore = Math.round(score * 1000) / 1000;
  const mode = finalScore > 0.25 ? 'risk_on' : finalScore < -0.25 ? 'risk_off' : 'neutral';

  return {
    mode,
    score: finalScore,
    reasons,
    goldContext: {
      macro: macro ?? null,
      sentiment: analysis?.sentiment ?? 'neutral',
      sentimentScore: analysis?.score ?? 0,
      reasoning: analysis?.reasoning ?? '',
      keyFactors: analysis?.keyFactors ?? [],
      headlines: goldContext.headlines ?? [],
      fetchedAt: goldContext.fetchedAt,
      fromCache: goldContext.fromCache ?? false
    }
  };
}
