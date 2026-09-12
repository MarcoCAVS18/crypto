// Contexto de noticias + sentimiento IA para BTC y ETH (caché SQLite 2h)

import { getMacroData } from './macroService.js';
import { getAssetHeadlines } from './newsService.js';
import { analyzeAssetSentiment, translateHeadlines } from './groqAnalyzer.js';
import { getAiCache, setAiCache } from '../config/database.js';

const CACHE_TTL_H = 2;

/**
 * Obtiene el contexto de noticias + sentimiento para BTC o ETH.
 * Cachea 2h en SQLite con clave `crypto_news_ctx_<symbol>`.
 *
 * @param {'BTC'|'ETH'} symbol
 * @param {boolean} forceRefresh
 * @returns {{ symbol, sentiment, score, reasoning, keyFactors, headlines, macro, fetchedAt, fromCache, analysisError }}
 */
export async function getCryptoNewsContext(symbol, forceRefresh = false) {
  const cacheKey = `crypto_news_ctx_${symbol.toLowerCase()}`;

  if (!forceRefresh) {
    try {
      const cached = getAiCache(cacheKey);
      if (cached) {
        console.log(`[CryptoNews:${symbol}] Cache hit`);
        return { ...cached, fromCache: true };
      }
    } catch (cacheErr) {
      console.warn(`[CryptoNews:${symbol}] Cache read error:`, cacheErr.message);
    }
  }

  console.log(`[CryptoNews:${symbol}] Fetching fresh context...`);

  const [headlinesResult, macroResult] = await Promise.allSettled([
    getAssetHeadlines(symbol),
    getMacroData(),
  ]);

  const rawHeadlines = headlinesResult.status === 'fulfilled' ? headlinesResult.value : [];
  const macro        = macroResult.status === 'fulfilled' ? macroResult.value : null;

  let headlines = rawHeadlines;
  if (rawHeadlines.length > 0 && process.env.GROQ_API_KEY) {
    try {
      headlines = await translateHeadlines(rawHeadlines);
    } catch (tErr) {
      console.warn(`[CryptoNews:${symbol}] Translation failed:`, tErr.message);
    }
  }

  let sentiment     = 'neutral';
  let score         = 0;
  let reasoning     = '';
  let keyFactors    = [];
  let analysisError = null;

  if (process.env.GROQ_API_KEY) {
    try {
      const result = await analyzeAssetSentiment(symbol, rawHeadlines, macro);
      sentiment  = result.sentiment;
      score      = result.score;
      reasoning  = result.reasoning;
      keyFactors = result.keyFactors;
    } catch (groqErr) {
      console.warn(`[CryptoNews:${symbol}] Groq error:`, groqErr.message);
      analysisError = groqErr.message;
    }
  } else {
    analysisError = 'GROQ_API_KEY no configurada';
  }

  const ctx = {
    symbol,
    sentiment,
    score,
    reasoning,
    keyFactors,
    headlines,
    macro: macro ? { dxy: macro.dxy, tenYearYield: macro.tenYearYield } : null,
    fetchedAt:  new Date().toISOString(),
    fromCache:  false,
    ...(analysisError && { analysisError }),
  };

  try {
    setAiCache(cacheKey, ctx, CACHE_TTL_H);
  } catch (e) {
    console.warn(`[CryptoNews:${symbol}] Cache write failed:`, e.message);
  }

  return ctx;
}
