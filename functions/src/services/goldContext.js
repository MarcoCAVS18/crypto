import { getMacroData }                              from './macroService.js';
import { getGoldHeadlines }                          from './newsService.js';
import { analyzeGoldSentiment, translateHeadlines }  from './groqAnalyzer.js';
import { getGoldContextCache, setGoldContextCache }  from '../config/database.js';

export async function getGoldContext(forceRefresh = false) {
  // ── Caché (async en Firestore) ─────────────────────────────────────────────
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
    console.warn('[GoldContext] Macro error:', macroResult.reason?.message);
  }

  // ── Análisis Groq ──────────────────────────────────────────────────────────
  let analysis = {
    sentiment: 'neutral', score: 0,
    reasoning: 'Análisis no disponible.', keyFactors: []
  };
  let analysisError = null;
  try {
    analysis = await analyzeGoldSentiment(headlines, macro);
    console.log(`[GoldContext] Groq: ${analysis.sentiment} (${analysis.score})`);
  } catch (groqErr) {
    analysisError = groqErr.message;
    console.warn('[GoldContext] Groq analysis failed:', groqErr.message);
  }

  // ── Traducción al español ──────────────────────────────────────────────────
  let translatedHeadlines = headlines.slice(0, 10);
  try {
    translatedHeadlines = await translateHeadlines(translatedHeadlines);
    console.log('[GoldContext] Headlines traducidos');
  } catch (trErr) {
    console.warn('[GoldContext] Traducción fallida, usando inglés:', trErr.message);
  }

  const context = {
    fetchedAt: new Date().toISOString(),
    fromCache:  false,
    macro,
    headlines:  translatedHeadlines,
    analysis,
    analysisError
  };

  // ── Guardar en caché (fire-and-forget para no bloquear la respuesta) ────────
  setGoldContextCache(context, 6).catch(e =>
    console.warn('[GoldContext] No se pudo guardar caché:', e.message)
  );

  return context;
}
