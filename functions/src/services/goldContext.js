// Orquestador del contexto de oro (Firebase Functions — caché Firestore async)

import { getMacroData, getCOTData, getRealYield, getGoldVolatilityData } from './macroService.js';
import { getFredMacro, applyFredFallbacks } from './fredService.js';
import { getGoldSpotDaily, computeRegime } from './spotGold.js';
import { buildGoldSources } from './dataHealth.js';
import { getDailyCandles } from './marketData.js';
import { calculateAllIndicators } from './technicalAnalysis.js';
import { getGoldHeadlines } from './newsService.js';
import { analyzeGoldSentiment, translateHeadlines } from './groqAnalyzer.js';
import { getGoldContextCache, setGoldContextCache } from '../config/database.js';

// TTL del contexto de oro: 2 h si el análisis salió bien; 5 min si falló
export const GOLD_CONTEXT_TTL_HOURS = 2;
export const FAILED_ANALYSIS_TTL_HOURS = 5 / 60;

function computeDailyBias(candles) {
  if (!candles || candles.length < 50) return null;
  try {
    const ind = calculateAllIndicators(candles);
    const ema20 = ind.ema.ema20;
    const ema50 = ind.ema.ema50;
    if (!ema20 || !ema50) return null;

    const trendShort = ind.trendShort;
    const trendMed   = candles[candles.length - 1].close > ema50 ? 'alcista' : 'bajista';

    let alignment;
    if (trendShort === 'alcista' && trendMed === 'alcista')   alignment = 'bull';
    else if (trendShort === 'bajista' && trendMed === 'bajista') alignment = 'bear';
    else alignment = 'mixed';

    return {
      trendShort, trendMed,
      rsi:        ind.rsi,
      ema20:      Math.round(ema20 * 100) / 100,
      ema50:      Math.round(ema50 * 100) / 100,
      alignment,
      source: 'paxg',
      candleCount: candles.length
    };
  } catch (e) {
    console.warn('[GoldContext] computeDailyBias error:', e.message);
    return null;
  }
}

export async function getGoldContext(forceRefresh = false) {
  if (!forceRefresh) {
    try {
      const cached = await getGoldContextCache();
      if (cached) {
        console.log('[GoldContext] Cache hit');
        return { ...cached, fromCache: true };
      }
    } catch (cacheErr) {
      console.warn('[GoldContext] Error leyendo caché:', cacheErr.message);
    }
  }

  console.log('[GoldContext] Fetching fresh gold context...');

  const [
    macroResult,
    headlinesResult,
    cotResult,
    realYieldResult,
    volDataResult,
    dailyCandlesResult,
    fredResult,
    spotResult
  ] = await Promise.allSettled([
    getMacroData(),
    getGoldHeadlines(),
    getCOTData(),
    getRealYield(),
    getGoldVolatilityData(),
    getDailyCandles('PAXG', 120),
    getFredMacro(),
    getGoldSpotDaily()
  ]);

  const baseMacro = macroResult.status === 'fulfilled'
    ? macroResult.value
    : { dxy: null, tenYearYield: null };

  const volData   = volDataResult.status === 'fulfilled' ? volDataResult.value : { gvz: null, silver: null };
  // Régimen diario: preferimos el oro de referencia (GC=F, ~2 años → EMA200 real); si falla,
  // las velas diarias de PAXG (120 → sin EMA200), como antes.
  const spot = spotResult.status === 'fulfilled' ? spotResult.value : null;
  if (spotResult.status === 'rejected') console.warn('[GoldContext] Oro spot (GC=F) error:', spotResult.reason?.message);
  const dailyBias =
    (spot && computeRegime(spot.candles, 'gc-futures')) ||
    (dailyCandlesResult.status === 'fulfilled' ? computeDailyBias(dailyCandlesResult.value) : null);

  const fred = fredResult.status === 'fulfilled' ? fredResult.value : null;
  if (fredResult.status === 'rejected') console.warn('[GoldContext] FRED error:', fredResult.reason?.message);
  if (fred && !fred.available) console.warn('[GoldContext] FRED no disponible (¿falta FRED_API_KEY?)');

  const macroFromSources = {
    ...baseMacro,
    cot:       cotResult.status       === 'fulfilled' ? cotResult.value       : null,
    realYield: realYieldResult.status === 'fulfilled' ? realYieldResult.value : null,
    gvz:       volData.gvz,
    silver:    volData.silver,
    dailyBias,
    spot:      spot ? { ticker: spot.ticker, price: spot.quote.price, time: spot.quote.time } : null
  };

  // Completa insumos que fallaron en su fuente principal con la serie de FRED y adjunta las
  // features normalizadas (cambio 20d, z-score, percentil, frescura) para P2 y los snapshots.
  const macro = { ...applyFredFallbacks(macroFromSources, fred), fred };

  const headlines = headlinesResult.status === 'fulfilled' ? headlinesResult.value : [];

  if (macroResult.status        === 'rejected') console.warn('[GoldContext] Macro error:',        macroResult.reason?.message);
  if (cotResult.status          === 'rejected') console.warn('[GoldContext] COT error:',          cotResult.reason?.message);
  if (realYieldResult.status    === 'rejected') console.warn('[GoldContext] Real yield error:',   realYieldResult.reason?.message);
  if (volDataResult.status      === 'rejected') console.warn('[GoldContext] GVZ/Silver error:',   volDataResult.reason?.message);
  if (dailyCandlesResult.status === 'rejected') console.warn('[GoldContext] Daily candles error:', dailyCandlesResult.reason?.message);
  if (dailyBias) console.log(`[GoldContext] Daily PAXG: ${dailyBias.alignment} (RSI ${dailyBias.rsi?.toFixed(1)})`);

  let analysis = { sentiment: 'neutral', score: 0, reasoning: 'Análisis no disponible.', keyFactors: [] };
  let analysisError = null;
  try {
    analysis = await analyzeGoldSentiment(headlines, macro);
    console.log(`[GoldContext] Groq: ${analysis.sentiment} (${analysis.score})`);
  } catch (groqErr) {
    analysisError = groqErr.message;
    console.warn('[GoldContext] Groq analysis failed:', groqErr.message);
  }

  let translatedHeadlines = headlines.slice(0, 12);
  try {
    translatedHeadlines = await translateHeadlines(translatedHeadlines);
    console.log('[GoldContext] Headlines traducidos');
  } catch (trErr) {
    console.warn('[GoldContext] Traducción fallida, usando inglés:', trErr.message);
  }

  // Estado de cada insumo (ok/stale/failed + fuente + antigüedad) para el modo degradado y /api/health/deep
  const sources = buildGoldSources({
    macro, dailyBias, headlines, analysisError, fred,
    results: { macro: macroResult, realYield: realYieldResult, cot: cotResult, volData: volDataResult, spot: spotResult }
  });

  const context = {
    sources,
    fetchedAt: new Date().toISOString(),
    fromCache:  false,
    macro,
    headlines:  translatedHeadlines,
    analysis,
    analysisError
  };

  // Un análisis fallido no debe quedar cacheado tanto como uno bueno: antes el error de Groq
  // (p. ej. un modelo deprecado) seguía a la vista 2 h aun después de arreglarlo.
  const ttlHours = analysisError ? FAILED_ANALYSIS_TTL_HOURS : GOLD_CONTEXT_TTL_HOURS;
  await setGoldContextCache(context, ttlHours).catch(e =>
    console.warn('[GoldContext] No se pudo guardar caché:', e.message)
  );

  return context;
}
