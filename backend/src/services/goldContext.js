// Orquestador del contexto de oro:
// 1. Verifica caché (TTL 6h en SQLite)
// 2. Fetcha datos macro (DXY, bono 10Y) y noticias en paralelo
// 3. Analiza con Groq Llama 3.1 70B
// 4. Guarda en caché y retorna

import { getMacroData } from './macroService.js';
import { getGoldHeadlines } from './newsService.js';
import { analyzeGoldSentiment } from './groqAnalyzer.js';
import { getGoldContextCache, setGoldContextCache } from '../config/database.js';

/**
 * Obtiene el contexto completo de oro (macro + noticias + análisis IA).
 * Usa caché SQLite de 6 horas para no exceder el free tier de Groq.
 *
 * @param {boolean} forceRefresh - Ignorar caché y forzar actualización
 * @returns {Promise<object>} Contexto de oro con macro, headlines y análisis
 */
export async function getGoldContext(forceRefresh = false) {
  // ── Check cache ────────────────────────────────────────────────────────────
  if (!forceRefresh) {
    try {
      const cached = getGoldContextCache();
      if (cached) {
        console.log('[GoldContext] Cache hit — omitiendo fetch');
        return { ...cached, fromCache: true };
      }
    } catch (cacheErr) {
      console.warn('[GoldContext] Error leyendo caché:', cacheErr.message);
    }
  }

  console.log('[GoldContext] Fetching fresh gold context...');

  // ── Fetch macro + headlines in parallel ────────────────────────────────────
  const [macroResult, headlinesResult] = await Promise.allSettled([
    getMacroData(),
    getGoldHeadlines()
  ]);

  const macro = macroResult.status === 'fulfilled'
    ? macroResult.value
    : { dxy: null, tenYearYield: null };

  const headlines = headlinesResult.status === 'fulfilled'
    ? headlinesResult.value
    : [];

  if (macroResult.status === 'rejected') {
    console.warn('[GoldContext] Macro fetch error:', macroResult.reason?.message);
  }

  // ── Groq sentiment analysis ────────────────────────────────────────────────
  let analysis = {
    sentiment: 'neutral',
    score: 0,
    reasoning: 'Análisis no disponible (Groq no configurado o error temporal).',
    keyFactors: []
  };

  try {
    analysis = await analyzeGoldSentiment(headlines, macro);
    console.log(`[GoldContext] Groq: ${analysis.sentiment} (score: ${analysis.score})`);
  } catch (groqErr) {
    console.warn('[GoldContext] Groq analysis failed:', groqErr.message);
  }

  const context = {
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    macro,
    headlines: headlines.slice(0, 10),
    analysis
  };

  // ── Persist to cache ───────────────────────────────────────────────────────
  try {
    setGoldContextCache(context, 6);
    console.log('[GoldContext] Saved to cache (TTL 6h)');
  } catch (cacheErr) {
    console.warn('[GoldContext] Could not save to cache:', cacheErr.message);
  }

  return context;
}
