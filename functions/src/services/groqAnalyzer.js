// Análisis con Groq (openai/gpt-oss-120b — modelo nativo Groq, activo 2026)
// 1. analyzeGoldSentiment     — sentimiento macro para oro/PAXG (caché 2h)
// 2. translateHeadlines       — traducción de titulares al español (caché 2h)
// (el riesgo de calendario ya no lo decide el LLM: ver services/eventRisk.js)
// 4. generatePortfolioInsight — nota personalizada según posición del usuario (caché 1h)

import { chatJson } from './groqChat.js';
import { labelOutcome } from './aiHelpers.js';

/** Prompt de sentimiento de noticias (solo titulares; sin datos macro). Exportado para tests. */
export function buildGoldSentimentPrompt(headlines, now = Date.now()) {
  function headlineAge(h) {
    if (!h.pubDate) return '';
    const min = Math.floor((now - new Date(h.pubDate).getTime()) / 60000);
    if (min < 60)  return ` [hace ${min}m]`;
    if (min < 1440) return ` [hace ${Math.floor(min/60)}h]`;
    return ` [hace ${Math.floor(min/1440)}d]`;
  }

  const headlinesText = headlines.length > 0
    ? headlines.map((h, i) => {
        const title = typeof h === 'string' ? h : h.title;
        const age   = typeof h === 'object' ? headlineAge(h) : '';
        return `${i + 1}.${age} ${title}`;
      }).join('\n')
    : 'Sin titulares disponibles';

  const prompt = `Sos un analista especializado en oro físico y PAXG (oro tokenizado).

TITULARES RECIENTES (los más nuevos primero; la antigüedad aparece entre corchetes):
${headlinesText}

Determiná el sentimiento de ESTAS NOTICIAS para el precio del oro/PAXG en el corto plazo (24-72h).
Reglas:
- Basate solo en lo que dicen los titulares (Fed, bancos centrales, geopolítica, inflación, demanda de oro).
- NO evalúes dólar, rendimientos de bonos, posicionamiento COT ni volatilidad: el sistema los puntúa por separado.
- Noticias recientes (< 6h) pesan más que las antiguas (> 48h).
- Si los titulares no son concluyentes, devolvé "neutral" con score cercano a 0.

Respondé SOLO con un objeto JSON válido (sin markdown, sin texto extra). Etiquetá cada dimensión con -1, 0 o 1
(0 si los titulares no dicen nada al respecto; NO inventes):
{
  "labels": {
    "monetaryPolicy": <-1 Fed/bancos centrales restrictivos (suba de tasas, "higher for longer") | 0 | 1 giro expansivo (recortes, pausa)>,
    "geopolitics": <-1 distensión / baja aversión al riesgo | 0 | 1 escalada, sanciones, guerra, aversión al riesgo>,
    "inflation": <-1 inflación cediendo | 0 | 1 inflación sorprendiendo al alza>,
    "goldDemand": <-1 ventas de ETFs/bancos centrales, demanda débil | 0 | 1 compras de bancos centrales, flujos a ETFs de oro>
  },
  "reasoning": "<1-2 oraciones en español explicando el análisis>",
  "keyFactors": ["<factor 1 en español>", "<factor 2 en español>", "<factor 3 en español>"]
}`;
  return prompt;
}

/**
 * Sentimiento de NOTICIAS para el oro (24-72 h). Recibe SOLO titulares.
 *
 * `macroData` se conserva en la firma por compatibilidad pero ya NO se envía al modelo:
 * DXY, 10Y, tasa real y COT los puntúa goldMarketMode de forma determinística. Pasárselos
 * al LLM hacía que esas señales entraran dos veces al score (una vía IA y otra directa).
 */
export async function analyzeGoldSentiment(headlines, _macroData) {
  // Sin noticias no hay nada que analizar: evitar una llamada y una opinión inventada
  if (!headlines || headlines.length === 0) {
    return { sentiment: 'neutral', score: 0, reasoning: 'Sin titulares recientes para analizar.', keyFactors: [] };
  }

  const prompt = buildGoldSentimentPrompt(headlines);

  const parsed = await chatJson({ prompt, temperature: 0.2, maxTokens: 600, expect: 'object', label: 'goldSentiment' });
  return parseGoldSentiment(parsed);
}

export const LABEL_KEYS = ['monetaryPolicy', 'geopolitics', 'inflation', 'goldDemand'];

/** Etiquetas del LLM → { labels, score } DETERMINÍSTICO (media de las etiquetas válidas; el LLM no pone el número). */
export function labelsToScore(labels) {
  const vals = LABEL_KEYS.map(k => labels?.[k]).filter(v => v === -1 || v === 0 || v === 1);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000;
}

/**
 * El LLM actúa como ETIQUETADOR estructurado: devuelve etiquetas discretas y el score sale de una regla fija
 * (reproducible y auditable). Si el modelo no devuelve etiquetas válidas se cae a su `score` numérico (recortado).
 */
export function parseGoldSentiment(parsed) {
  const validSentiments = ['bullish', 'neutral', 'bearish'];
  const labels = Object.fromEntries(LABEL_KEYS.map(k => [k, [-1, 0, 1].includes(parsed?.labels?.[k]) ? parsed.labels[k] : null]));
  const fromLabels = labelsToScore(labels);
  const legacy = typeof parsed?.score === 'number' ? Math.max(-1, Math.min(1, parsed.score)) : 0;
  const score = fromLabels ?? legacy;
  const sentiment = fromLabels !== null
    ? (score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral')
    : (validSentiments.includes(parsed?.sentiment) ? parsed.sentiment : 'neutral');
  return {
    sentiment, score, labels: fromLabels !== null ? labels : null,
    reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning : '',
    keyFactors: Array.isArray(parsed?.keyFactors) ? parsed.keyFactors.slice(0, 3) : []
  };
}

export async function translateHeadlines(headlines) {
  if (!headlines.length) return headlines;

  const numbered = headlines.map((h, i) => `${i + 1}. ${h.title}`).join('\n');
  const prompt = `Traducí al español rioplatense (Argentina) cada uno de estos titulares financieros.
Mantené nombres propios, siglas (Fed, DXY, CPI, NFP) y cifras tal como están.
Respondé ÚNICAMENTE con un array JSON de strings, en el mismo orden, sin texto extra:
["traducción 1", "traducción 2", ...]

TITULARES:
${numbered}`;

  const translated = await chatJson({ prompt, temperature: 0.1, maxTokens: 600, expect: 'array', label: 'translateHeadlines' });
  if (!Array.isArray(translated) || translated.length !== headlines.length) throw new Error('Translation array length mismatch');

  return headlines.map((h, i) => ({
    ...h,
    title: typeof translated[i] === 'string' && translated[i].trim() ? translated[i].trim() : h.title
  }));
}

export async function generatePortfolioInsight(asset, currentPrice, indicators, portfolioCtx, userState, decision, recentDecisions = []) {

  const { units = 0, avgBuyPrice = 0, allBuys = [] } = portfolioCtx;
  const netInvested = portfolioCtx.costBasis ?? portfolioCtx.netInvested ?? 0;
  const { totalCapital = 0 } = userState;

  const unrealizedPnl    = (currentPrice - avgBuyPrice) * units;
  const unrealizedPnlPct = avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;
  const deployedPct      = totalCapital > 0 ? (netInvested / totalCapital) * 100 : null;
  const firstBuy         = allBuys[0] ?? null;
  const daysSinceFirst   = firstBuy ? Math.floor((Date.now() - new Date(firstBuy.date).getTime()) / 86400000) : null;
  const assetName        = asset === 'PAXG' ? 'PAXG (oro tokenizado)' : asset === 'ETH' ? 'Ethereum (ETH)' : 'Bitcoin (BTC)';

  const buysText = allBuys.length > 0
    ? allBuys.map((b, i) => {
        const pnlPct = avgBuyPrice > 0 ? ((currentPrice - b.price) / b.price) * 100 : 0;
        const sign   = pnlPct >= 0 ? '+' : '';
        return `  ${i + 1}. ${b.date} · @ $${b.price.toLocaleString('en-US', { maximumFractionDigits: 0 })} · $${Math.round(b.amount_usd).toLocaleString('en-US')} USD (${sign}${pnlPct.toFixed(1)}% hoy)`;
      }).join('\n')
    : '  Sin historial disponible';

  const pnlSign  = unrealizedPnl >= 0 ? '+' : '';
  const pnlColor = unrealizedPnl >= 0 ? 'GANANCIA' : 'PÉRDIDA';
  const deployed = deployedPct != null
    ? `$${Math.round(netInvested).toLocaleString('en-US')} de $${Math.round(totalCapital).toLocaleString('en-US')} totales (${deployedPct.toFixed(1)}% invertido · ${(100 - deployedPct).toFixed(1)}% libre en cash)`
    : `$${Math.round(netInvested).toLocaleString('en-US')} USD invertidos`;

  const decisionsText = recentDecisions.length > 0
    ? recentDecisions.map(d => {
        const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
        const daysAgo = Math.floor((Date.now() - ts.getTime()) / 86400000);
        const timeLabel = daysAgo === 0 ? 'hoy' : daysAgo === 1 ? 'ayer' : `hace ${daysAgo}d`;
        const priceAtDecision = d.price ?? 0;
        const pnlPct = priceAtDecision > 0 ? ((currentPrice - priceAtDecision) / priceAtDecision) * 100 : null;
        const outcome = labelOutcome(d.decision, pnlPct);
        return `  [${timeLabel}] ${d.decision} @ $${Math.round(priceAtDecision).toLocaleString('en-US')} ${outcome}`;
      }).join('\n')
    : '  Sin historial disponible';

  const prompt = `Sos un asesor de inversiones personal especializado en criptoactivos y oro.

ACTIVO: ${assetName}

MERCADO AHORA:
- Precio actual: $${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
- Tendencia corta: ${indicators.trendShort ?? 'N/A'}
- RSI: ${indicators.rsi != null ? indicators.rsi.toFixed(1) : 'N/A'}

POSICIÓN DEL USUARIO:
- Unidades: ${units.toFixed(8)} ${asset}
- Precio promedio de entrada: $${avgBuyPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
- ${pnlColor} no realizada: ${pnlSign}$${Math.abs(unrealizedPnl).toFixed(2)} (${pnlSign}${unrealizedPnlPct.toFixed(2)}%)
- Capital: ${deployed}
${daysSinceFirst != null ? `- Acumulando desde hace ${daysSinceFirst} días (primera compra: ${firstBuy.date})` : ''}
- Historial de compras (${allBuys.length} operaciones de compra):
${buysText}

SEÑAL TÉCNICA DEL SISTEMA: ${decision.action} ${decision.strength}
RECOMENDACIÓN GENERAL: ${decision.recommendation}

HISTORIAL DE SEÑALES RECIENTES DEL SISTEMA (${asset}):
${decisionsText}

Escribí UNA nota personalizada (máximo 3 oraciones cortas) en español rioplatense que:
1. Mencione el estado real de la posición (P&L, tiempo acumulando, distribución de compras)
2. Diga si la señal tiene sentido para ESTE usuario específicamente o si conviene esperar
3. Sea concreta, no genérica — nombré el activo, el P&L real, el porcentaje de cash libre
4. Sé honesto con el historial: si las señales recientes acertaron, decilo sin exagerar; si fallaron, decilo también. No infles la confianza en el sistema.
5. No inventes precios de entrada ni niveles: usá solo los números que aparecen arriba.

Respondé SOLO con JSON válido (sin markdown):
{
  "insight": "..."
}`;

  const parsed = await chatJson({ prompt, temperature: 0.3, maxTokens: 450, expect: 'object', label: 'portfolioInsight' });
  return {
    insight: typeof parsed.insight === 'string' ? parsed.insight.trim() : ''
  };
}

export async function analyzeAssetSentiment(symbol, headlines, macroData) {

  const assetDesc = symbol === 'ETH'
    ? 'Ethereum (ETH) — sensible a actividad DeFi, staking, upgrades de red y flujo de capital cripto'
    : symbol === 'BTC'
    ? 'Bitcoin (BTC) — sensible a adopción institucional, ETFs spot, ciclo de halvings y liquidez global'
    : `${symbol} — criptomoneda; analizá adopción, liquidez, regulación y factores propios del proyecto`;

  const macroLines = [];
  if (macroData?.dxy) {
    const sign = macroData.dxy.changePercent >= 0 ? '+' : '';
    macroLines.push(`- DXY: ${macroData.dxy.value.toFixed(2)} (${sign}${macroData.dxy.changePercent.toFixed(2)}% hoy)`);
  }
  if (macroData?.tenYearYield) {
    const sign = macroData.tenYearYield.changePercent >= 0 ? '+' : '';
    macroLines.push(`- Bono 10Y: ${macroData.tenYearYield.value.toFixed(2)}% (${sign}${macroData.tenYearYield.changePercent.toFixed(2)}% hoy)`);
  }
  const macroText = macroLines.length > 0 ? macroLines.join('\n') : 'Sin datos macro disponibles';

  function headlineAge(h) {
    if (!h.pubDate) return '';
    const min = Math.floor((Date.now() - new Date(h.pubDate).getTime()) / 60000);
    if (min < 60)   return ` [hace ${min}m]`;
    if (min < 1440) return ` [hace ${Math.floor(min/60)}h]`;
    return ` [hace ${Math.floor(min/1440)}d]`;
  }

  const headlinesText = headlines.length > 0
    ? headlines.map((h, i) => {
        const title = typeof h === 'string' ? h : h.title;
        const age   = typeof h === 'object' ? headlineAge(h) : '';
        return `${i + 1}.${age} ${title}`;
      }).join('\n')
    : 'Sin titulares disponibles';

  const prompt = `Sos un analista de mercados cripto especializado en ${assetDesc}.

DATOS MACRO:
${macroText}

TITULARES RECIENTES (más nuevos primero; antigüedad entre corchetes):
${headlinesText}

Respondé SOLO con JSON válido (sin markdown):
{
  "sentiment": "bullish" | "neutral" | "bearish",
  "score": <número entre -1.0 y 1.0>,
  "reasoning": "<1-2 oraciones en español>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"]
}`;

  const parsed = await chatJson({ prompt, temperature: 0.2, maxTokens: 800, expect: 'object', label: 'assetSentiment' });
  const validSentiments = ['bullish', 'neutral', 'bearish'];
  return {
    sentiment:  validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
    score:      typeof parsed.score === 'number' ? Math.max(-1, Math.min(1, parsed.score)) : 0,
    reasoning:  typeof parsed.reasoning  === 'string' ? parsed.reasoning  : '',
    keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 3) : [],
  };
}

export async function analyzeFuturesDirection(technicals, goldContext, fundingRate, maxLeverage = 10, portfolioContext = null) {
  const fr = fundingRate ?? 0;

  const techLines = [
    `- Tendencia corta: ${technicals.trendShort ?? 'N/A'}`,
    `- Tendencia larga: ${technicals.trendLong ?? 'N/A'}`,
    `- RSI (14): ${technicals.rsi?.toFixed(1) ?? 'N/A'}`,
    `- ATR: $${technicals.atr?.toFixed(2) ?? 'N/A'} (${technicals.atrPercent?.toFixed(2) ?? 'N/A'}% del precio)`,
    `- Zona actual: ${technicals.currentZone ?? 'N/A'}`,
  ].join('\n');

  const macroLines = [];
  if (goldContext?.macro?.dxy) {
    const sign = goldContext.macro.dxy.changePercent >= 0 ? '+' : '';
    macroLines.push(`- DXY: ${goldContext.macro.dxy.value?.toFixed(2)} (${sign}${goldContext.macro.dxy.changePercent?.toFixed(2)}% hoy)`);
  }
  if (goldContext?.macro?.tenYearYield) {
    macroLines.push(`- Bono 10Y: ${goldContext.macro.tenYearYield.value?.toFixed(2)}%`);
  }
  const macroText = macroLines.length > 0 ? macroLines.join('\n') : 'Sin datos macro';

  const headlinesText = goldContext?.headlines?.length > 0
    ? goldContext.headlines.slice(0, 8).map((h, i) => `${i + 1}. ${typeof h === 'string' ? h : h.title}`).join('\n')
    : 'Sin titulares';

  const fundingDir = fr > 0.02
    ? 'positivo alto — longs pagan a shorts'
    : fr < -0.02
    ? 'negativo alto — shorts pagan a longs'
    : 'neutro';

  let portfolioBlock = '';
  let availableCashUsd = 0;
  if (portfolioContext) {
    const { totalCapital = 0, cashPercent = 100, paxgUnits = 0, paxgAvgPrice = 0, paxgCurrentPrice = 0 } = portfolioContext;
    availableCashUsd = totalCapital * (cashPercent / 100);
    const paxgValue = paxgUnits * (paxgCurrentPrice || paxgAvgPrice);
    portfolioBlock = `
PORTFOLIO DEL USUARIO:
- Capital total: $${totalCapital.toFixed(2)}
- Cash disponible (${cashPercent}%): $${availableCashUsd.toFixed(2)}
- Posición PAXG/Oro spot: ${paxgUnits > 0 ? `${paxgUnits.toFixed(6)} oz · valor $${paxgValue.toFixed(2)} · precio promedio $${paxgAvgPrice.toFixed(2)}` : 'Sin posición'}
`;
  }

  const positionSizeInstruction = availableCashUsd > 0
    ? `- "positionUsd": <monto en USD a destinar a esta operación, entre $10 y $${availableCashUsd.toFixed(2)} según confianza — usá el cash disponible del usuario>`
    : `- "positionUsd": null`;

  const prompt = `Sos un trader institucional en futuros perpetuos de oro (XAUUSDT).

TÉCNICOS:
${techLines}

MACRO:
${macroText}

TITULARES ORO:
${headlinesText}

FUNDING: ${fr.toFixed(4)}%/8h → ${fundingDir}
SENTIMIENTO ORO: ${goldContext?.sentiment ?? 'N/A'} (score: ${goldContext?.score ?? 'N/A'})
LEVERAGE MÁXIMO PERMITIDO: ${maxLeverage}x
${portfolioBlock}
Respondé SOLO con JSON válido (sin markdown):
{
  "direction": "LONG" | "SHORT" | "NEUTRAL",
  "leverage": <entero entre 1 y ${maxLeverage}>,
  "stopLossPercent": <número, ej: 1.2>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<2-3 oraciones en español>",
  "keyRisks": ["<riesgo 1>", "<riesgo 2>"],
  "fundingImpact": "positive" | "negative" | "neutral",
  ${positionSizeInstruction}
}`;

  const parsed = await chatJson({ prompt, temperature: 0.15, maxTokens: 800, expect: 'object', label: 'futuresDirection' });
  const validDirections  = ['LONG', 'SHORT', 'NEUTRAL'];
  const validConfidences = ['high', 'medium', 'low'];

  return {
    direction:       validDirections.includes(parsed.direction)   ? parsed.direction  : 'NEUTRAL',
    leverage:        typeof parsed.leverage === 'number'          ? Math.max(1, Math.min(maxLeverage, Math.round(parsed.leverage))) : 1,
    stopLossPercent: typeof parsed.stopLossPercent === 'number'   ? Math.max(0.3, Math.min(3, parsed.stopLossPercent)) : 1.5,
    confidence:      validConfidences.includes(parsed.confidence) ? parsed.confidence : 'low',
    reasoning:       typeof parsed.reasoning  === 'string'        ? parsed.reasoning  : '',
    keyRisks:        Array.isArray(parsed.keyRisks)               ? parsed.keyRisks.slice(0, 3) : [],
    fundingImpact:   ['positive','negative','neutral'].includes(parsed.fundingImpact) ? parsed.fundingImpact : 'neutral',
    positionUsd:     typeof parsed.positionUsd === 'number' && availableCashUsd > 0
                       ? Math.max(10, Math.min(availableCashUsd, Math.round(parsed.positionUsd)))
                       : null,
  };
}
