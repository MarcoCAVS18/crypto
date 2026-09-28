// Market mode específico para PAXG / oro tokenizado
//
// Componentes del score (rango final recortado a [-1, 1]). Los pesos NO están calibrados
// contra historia (ver docs/PAXG_AUDIT.md, fase P2); son criterio experto provisional:
//   - Sentimiento IA de titulares (±0.15): solo NOTICIAS. Antes pesaba 40 % y recibía además
//     DXY/10Y/COT/tasa real como input, con lo que esas señales se contaban dos veces y la IA
//     sola podía cambiar el modo. Ahora no puede cruzar el umbral por sí sola.
//   - DXY (±0.25):     dólar sube → oro baja | dólar baja → oro sube
//   - Bono 10Y (±0.20): yields altos = mayor costo de oportunidad vs oro
//   - Técnicos (±0.15): contexto de mercado técnico
//   - COT CFTC (±0.10), tasa real 10Y TIPS (±0.10), GVZ (±0.08), oro/plata (±0.07),
//     tendencia diaria (±0.10, hasta ±0.15 con RSI diario)
// Suma de máximos = 1.25 (se recorta a ±1).
//
// Los mapeos numéricos (DXY, 10Y, GVZ, oro/plata) son CONTINUOS: un cambio mínimo en el
// dato no puede mover el score de golpe (antes DXY +0.149 % → +0.151 % movía −0.125).
//
// Umbral de modo final:
//   score > +0.25  → risk_on  (entorno favorable para oro)
//   score < -0.25  → risk_off (entorno desfavorable)
//   entre          → neutral

import { determineMarketMode } from './marketMode.js';
import { computePremium } from './spotGold.js';
import { summarizeSources } from './dataHealth.js';

// Peso máximo de la IA en el score. Debe ser < umbral de modo (0.25) para que la IA nunca
// decida sola un cambio de régimen.
export const AI_WEIGHT = 0.15;
export const MODE_THRESHOLD = 0.25;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Interpolación lineal por tramos. `knots` = [[x0,y0],[x1,y1],...] con x crecientes; fuera de rango se satura. */
export function interpolate(knots, x) {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i];
    if (x <= x1) {
      const [x0, y0] = knots[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1][1];
}

// Puntaje −1..1 según cambio % diario del DXY (lineal: ±0.6 % satura)
export const dxyScore = (changePercent) => clamp(-changePercent / 0.6, -1, 1);
// Puntaje −1..1 según el nivel del bono 10Y
export const yieldScore = (v) => interpolate([[3.5, 1], [4.0, 0.3], [4.25, 0], [4.75, -1]], v);
// Ajuste aditivo según GVZ (volatilidad del oro)
export const gvzAdjustment = (v) => interpolate([[15, 0.05], [18, 0], [22, -0.04], [26, -0.08]], v);
// Ajuste aditivo según ratio oro/plata
export const ratioAdjustment = (r) => interpolate([[70, 0.07], [80, 0], [90, -0.07]], r);

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
  // Aporte firmado de cada componente al score (para snapshots y para auditar el modelo)
  const components = {};
  const add = (key, value) => { components[key] = Math.round(value * 10000) / 10000; score += value; };

  // ── 1. Sentimiento IA de titulares (±AI_WEIGHT) ───────────────────────────
  const sentimentLabels = { bullish: 'alcista', neutral: 'neutral', bearish: 'bajista' };
  const sentLabel = sentimentLabels[analysis?.sentiment] ?? 'neutral';
  if (goldContext.analysisError) {
    // Si la IA falló, el análisis por defecto es "neutral 0": no debe presentarse como opinión
    reasons.push('IA no disponible — sin aporte al score (el resto de las señales sigue activo)');
  } else {
    const sentimentScore = typeof analysis?.score === 'number' ? clamp(analysis.score, -1, 1) : 0;
    add('ai', sentimentScore * AI_WEIGHT);
    if (analysis?.reasoning) {
      reasons.push(`IA: Sentimiento ${sentLabel} — ${analysis.reasoning}`);
    } else {
      reasons.push(`IA: Sentimiento ${sentLabel} para el oro`);
    }
  }

  // ── 2. DXY (±0.25, continuo) ─────────────────────────────────────────────
  if (macro?.dxy) {
    const { value: dxyVal, changePercent: dxyChg } = macro.dxy;

    if (dxyChg > 0.6) {
      reasons.push(`Dólar fuerte (DXY ${dxyVal.toFixed(1)}, +${dxyChg.toFixed(2)}%) → presión bajista en oro`);
    } else if (dxyChg > 0.15) {
      reasons.push(`Dólar al alza (DXY ${dxyVal.toFixed(1)}, +${dxyChg.toFixed(2)}%)`);
    } else if (dxyChg < -0.6) {
      reasons.push(`Dólar débil (DXY ${dxyVal.toFixed(1)}, ${dxyChg.toFixed(2)}%) → soporte para el oro`);
    } else if (dxyChg < -0.15) {
      reasons.push(`Dólar levemente a la baja (DXY ${dxyVal.toFixed(1)}, ${dxyChg.toFixed(2)}%)`);
    } else {
      reasons.push(`Dólar estable (DXY ${dxyVal.toFixed(1)})`);
    }

    add('dxy', dxyScore(dxyChg) * 0.25);
  }

  // ── 3. Bono 10Y (±0.20, continuo) ────────────────────────────────────────
  if (macro?.tenYearYield) {
    const { value: yldVal } = macro.tenYearYield;

    if (yldVal >= 4.75) {
      reasons.push(`Yields muy elevados (${yldVal.toFixed(2)}%) → costo de oportunidad alto vs oro`);
    } else if (yldVal >= 4.25) {
      reasons.push(`Yields altos (${yldVal.toFixed(2)}%) → presión moderada sobre el oro`);
    } else if (yldVal < 3.5) {
      reasons.push(`Yields bajos (${yldVal.toFixed(2)}%) → entorno favorable para el oro`);
    } else if (yldVal < 4.0) {
      reasons.push(`Yields moderados (${yldVal.toFixed(2)}%)`);
    } else {
      reasons.push(`Yields neutrales (${yldVal.toFixed(2)}%)`);
    }

    add('tenYear', yieldScore(yldVal) * 0.20);
  }

  // ── 4. Técnicos (±0.15) ────────────────────────────────────────────────────
  const techMode = determineMarketMode(currentPrice, indicators, volumeAnalysis);
  const techScore = techMode.mode === 'risk_on' ? 1 : techMode.mode === 'risk_off' ? -1 : 0;
  add('technical', techScore * 0.15);

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

    add('cot', cotAdj);
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

    add('realYield', ryAdj);
  }

  // ── 7. GVZ — Índice de volatilidad del oro (aditivo ±0.08, continuo) ─────────
  if (macro?.gvz) {
    const gvzVal = macro.gvz.value;

    if (gvzVal > 25) {
      reasons.push(`GVZ: volatilidad muy alta (${gvzVal.toFixed(1)}) → entradas de alto riesgo, reducir exposición`);
    } else if (gvzVal > 20) {
      reasons.push(`GVZ: volatilidad elevada (${gvzVal.toFixed(1)}) → precaución en entradas`);
    } else if (gvzVal < 15) {
      reasons.push(`GVZ: volatilidad baja (${gvzVal.toFixed(1)}) → tendencia estable, entorno favorable`);
    } else {
      reasons.push(`GVZ: volatilidad normal (${gvzVal.toFixed(1)})`);
    }
    add('gvz', gvzAdjustment(gvzVal));
  }

  // ── 8. Ratio Oro/Plata (aditivo ±0.07, continuo) ──────────────────────────
  if (macro?.silver?.value) {
    const goldSilverRatio = currentPrice / macro.silver.value;
    const ratio = Math.round(goldSilverRatio * 10) / 10;

    if (goldSilverRatio > 90) {
      reasons.push(`Ratio Oro/Plata: ${ratio} (elevado → oro caro vs plata, riesgo de corrección)`);
    } else if (goldSilverRatio > 80) {
      reasons.push(`Ratio Oro/Plata: ${ratio} (alto → cautela en nuevas entradas)`);
    } else if (goldSilverRatio < 70) {
      reasons.push(`Ratio Oro/Plata: ${ratio} (bajo → rally en ambos metales, señal muy alcista)`);
    } else if (goldSilverRatio < 80) {
      reasons.push(`Ratio Oro/Plata: ${ratio} (moderado → contexto positivo para el oro)`);
    } else {
      reasons.push(`Ratio Oro/Plata: ${ratio} (neutral)`);
    }
    add('goldSilver', ratioAdjustment(goldSilverRatio));
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
    add('dailyBias', dailyAdj);

    // Régimen de largo plazo (EMA200 diaria del oro): informativo, todavía no entra al score (P2)
    const { longAlignment, extension200Pct } = macro.dailyBias;
    if (longAlignment) {
      const lbl = { bull: 'alcista', bear: 'bajista', mixed: 'mixto' }[longAlignment];
      reasons.push(`Régimen largo (EMA200 diaria del oro): ${lbl}${extension200Pct != null ? `, ${extension200Pct >= 0 ? '+' : ''}${extension200Pct}% sobre la EMA200` : ''}`);
    }
  }

  // ── Calidad de datos: si algún insumo falló o está viejo, decirlo primero ──────
  const dataHealth = summarizeSources(goldContext.sources);
  if (dataHealth?.degraded) reasons.unshift(dataHealth.message);

  // ── Modo final (score se clampea a [-1, 1]) ───────────────────────────────
  const finalScore = Math.round(Math.max(-1, Math.min(1, score)) * 1000) / 1000;
  const mode = finalScore > MODE_THRESHOLD ? 'risk_on' : finalScore < -MODE_THRESHOLD ? 'risk_off' : 'neutral';

  return {
    mode,
    score: finalScore,
    reasons,
    components,            // aporte de cada insumo al score (suma = score antes del recorte a ±1)
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
      dailyBias:     macro?.dailyBias ?? null,
      spot:          macro?.spot ?? null,
      sources:       goldContext.sources ?? null,
      dataHealth,
      premium:       computePremium(currentPrice, macro?.spot)
    }
  };
}
