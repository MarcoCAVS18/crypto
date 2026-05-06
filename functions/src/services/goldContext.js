import { getMacroData, getCOTData, getRealYield }    from './macroService.js';
import { getGoldHeadlines }                          from './newsService.js';
import { analyzeGoldSentiment, translateHeadlines }  from './groqAnalyzer.js';
import { getGoldContextCache, setGoldContextCache }  from '../config/database.js';

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

  const [macroResult, headlinesResult, cotResult, realYieldResult] = await Promise.allSettled([
    getMacroData(),
    getGoldHeadlines(),
    getCOTData(),
    getRealYield()
  ]);

  const baseMacro = macroResult.status === 'fulfilled'
    ? macroResult.value
    : { dxy: null, tenYearYield: null };

  const macro = {
    ...baseMacro,
    cot:       cotResult.status       === 'fulfilled' ? cotResult.value       : null,
    realYield: realYieldResult.status === 'fulfilled' ? realYieldResult.value : null
  };

  const headlines = headlinesResult.status === 'fulfilled'
    ? headlinesResult.value
    : [];

  if (macroResult.status === 'rejected') {
    console.warn('[GoldContext] Macro error:', macroResult.reason?.message);
  }
  if (cotResult.status === 'rejected') {
    console.warn('[GoldContext] COT error:', cotResult.reason?.message);
  }
  if (realYieldResult.status === 'rejected') {
    console.warn('[GoldContext] Real yield error:', realYieldResult.reason?.message);
  }

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

  let translatedHeadlines = headlines.slice(0, 12);
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

  setGoldContextCache(context, 2).catch(e =>
    console.warn('[GoldContext] No se pudo guardar caché:', e.message)
  );

  return context;
}
