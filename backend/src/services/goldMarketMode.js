// Market mode específico para PAXG / oro tokenizado
//
// Factores base (suman al 100%):
//   - Sentimiento IA noticias (40%): Groq analiza macro y titulares
//   - DXY (25%):     dólar sube → oro baja | dólar baja → oro sube
//   - Bono 10Y (20%): yields altos = mayor costo de oportunidad vs oro
//   - Técnicos (15%): contexto de mercado cripto
//
// Señales aditivas (no reemplazan los anteriores; clampean al rango [-1, 1]):
//   - COT CFTC (±0.10): posición neta especulativa en futuros de oro
//   - Rendimiento real 10Y TIPS (±0.10): tasa real negativa → muy favorable para oro
//
// Umbral de modo final:
//   score > +0.25  → risk_on  (entorno favorable para oro)
//   score < -0.25  → risk_off (entorno desfavorable)
//   entre          → neutral

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

  // ── 5. COT CFTC — posición neta especulativa (aditivo ±0.10) ─────────────
  if (macro?.cot) {
    const { netSpec, weekChange, sentiment: cotSent } = macro.cot;
    let cotAdj = 0;

    if (cotSent === 'contrarian_bull') {
      cotAdj = 0.10;
      reasons.push(`COT: especuladores net short (${(netSpec / 1000).toFixed(0)}k contratos) → señal contraria alcista`);
    } else if (cotSent === 'crowded_long') {
      cotAdj = -0.10;
      reasons.push(`COT: posición especulativa muy larga (${(netSpec / 1000).toFixed(0)}k) → riesgo de corrección`);
    } else if (cotSent === 'bullish') {
      cotAdj = 0.05;
      reasons.push(`COT: especuladores net long moderados (${(netSpec / 1000).toFixed(0)}k contratos)`);
    } else {
      reasons.push(`COT: posición neta neutral (${(netSpec / 1000).toFixed(0)}k contratos)`);
    }

    // Momentum semanal: ajuste adicional pequeño
    if (weekChange > 15000) {
      cotAdj = Math.min(cotAdj + 0.03, 0.10);
    } else if (weekChange < -15000) {
      cotAdj = Math.max(cotAdj - 0.03, -0.10);
    }

    score += cotAdj;
  }

  // ── 6. Rendimiento real 10Y TIPS (aditivo ±0.10) ─────────────────────────
  if (macro?.realYield) {
    const { value: ry, sentiment: rySent } = macro.realYield;
    let ryAdj = 0;

    if (rySent === 'very_bullish') {
      ryAdj = 0.10;
      reasons.push(`Rendimiento real 10Y: ${ry.toFixed(2)}% (negativo → entorno muy favorable para el oro)`);
    } else if (rySent === 'bullish') {
      ryAdj = 0.05;
      reasons.push(`Rendimiento real 10Y: ${ry.toFixed(2)}% (bajo → soporte para el oro)`);
    } else if (rySent === 'bearish') {
      ryAdj = -0.10;
      reasons.push(`Rendimiento real 10Y: ${ry.toFixed(2)}% (elevado → presión sobre el oro)`);
    } else {
      reasons.push(`Rendimiento real 10Y: ${ry.toFixed(2)}% (neutral)`);
    }

    score += ryAdj;
  }

  // ── 7. GVZ — Índice de volatilidad del oro (aditivo ±0.08) ──────────────────
  if (macro?.gvz) {
    const gvzVal = macro.gvz.value;
    let gvzAdj = 0;

    if (gvzVal > 25) {
      gvzAdj = -0.08;
      reasons.push(`GVZ: volatilidad muy alta (${gvzVal.toFixed(1)}) → entradas de alto riesgo, reducir exposición`);
    } else if (gvzVal > 20) {
      gvzAdj = -0.04;
      reasons.push(`GVZ: volatilidad elevada (${gvzVal.toFixed(1)}) → precaución en entradas`);
    } else if (gvzVal < 15) {
      gvzAdj = 0.05;
      reasons.push(`GVZ: volatilidad baja (${gvzVal.toFixed(1)}) → tendencia estable, entorno favorable`);
    } else {
      reasons.push(`GVZ: volatilidad normal (${gvzVal.toFixed(1)})`);
    }
    score += gvzAdj;
  }

  // ── 8. Ratio Oro/Plata (aditivo ±0.07) ──────────────────────────────────────
  if (macro?.silver?.value) {
    const goldSilverRatio = currentPrice / macro.silver.value;
    const ratio = Math.round(goldSilverRatio * 10) / 10;
    let ratioAdj = 0;

    if (goldSilverRatio > 90) {
      ratioAdj = -0.07;
      reasons.push(`Ratio Oro/Plata: ${ratio} (elevado → oro caro vs plata, riesgo de corrección)`);
    } else if (goldSilverRatio > 80) {
      ratioAdj = -0.03;
      reasons.push(`Ratio Oro/Plata: ${ratio} (alto → cautela en nuevas entradas)`);
    } else if (goldSilverRatio < 70) {
      ratioAdj = 0.07;
      reasons.push(`Ratio Oro/Plata: ${ratio} (bajo → rally en ambos metales, señal muy alcista)`);
    } else if (goldSilverRatio < 80) {
      ratioAdj = 0.03;
      reasons.push(`Ratio Oro/Plata: ${ratio} (moderado → contexto positivo para el oro)`);
    } else {
      reasons.push(`Ratio Oro/Plata: ${ratio} (neutral)`);
    }
    score += ratioAdj;
  }

  // ── 9. Tendencia diaria PAXG (aditivo ±0.10) ────────────────────────────────
  if (macro?.dailyBias) {
    const { alignment, trendShort: dt, rsi: dRsi } = macro.dailyBias;
    let dailyAdj = 0;

    if (alignment === 'bull') {
      dailyAdj = 0.10;
      reasons.push(`Tendencia diaria: alcista (EMA20 y EMA50) → confluencia multi-timeframe`);
    } else if (alignment === 'bear') {
      dailyAdj = -0.10;
      reasons.push(`Tendencia diaria: bajista → señal 4h contra la tendencia mayor`);
    } else {
      reasons.push(`Tendencia diaria: mixta (corto ${dt}) → sin confirmación multi-timeframe`);
    }

    if (dRsi != null) {
      if (dRsi > 70) {
        dailyAdj = Math.max(dailyAdj - 0.05, -0.15);
        reasons.push(`RSI diario sobrecomprado (${dRsi.toFixed(1)}) → precaución`);
      } else if (dRsi < 35) {
        dailyAdj = Math.min(dailyAdj + 0.05, 0.15);
        reasons.push(`RSI diario sobrevendido (${dRsi.toFixed(1)}) → potencial rebote`);
      }
    }
    score += dailyAdj;
  }

  // ── Modo final (score se clampea a [-1, 1]) ───────────────────────────────
  const finalScore = Math.round(Math.max(-1, Math.min(1, score)) * 1000) / 1000;
  const mode = finalScore > 0.25 ? 'risk_on' : finalScore < -0.25 ? 'risk_off' : 'neutral';

  return {
    mode,
    score: finalScore,
    reasons,
    goldContext: {
      macro:         macro ?? null,
      sentiment:     analysis?.sentiment ?? 'neutral',
      sentimentScore: analysis?.score ?? 0,
      reasoning:     analysis?.reasoning ?? '',
      keyFactors:    analysis?.keyFactors ?? [],
      headlines:     goldContext.headlines ?? [],
      fetchedAt:     goldContext.fetchedAt,
      fromCache:     goldContext.fromCache ?? false,
      analysisError: goldContext.analysisError ?? null,
      cot:           macro?.cot       ?? null,
      realYield:     macro?.realYield ?? null,
      gvz:           macro?.gvz       ?? null,
      silver:        macro?.silver    ?? null,
      goldSilverRatio: macro?.silver?.value
        ? Math.round(currentPrice / macro.silver.value * 10) / 10
        : null,
      dailyBias:     macro?.dailyBias ?? null
    }
  };
}
