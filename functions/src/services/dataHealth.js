// Estado de los insumos del score de oro: qué llegó, qué está viejo, qué falló.
// Puro (sin red): lo usan getGoldContext, el modo de mercado, la decisión y /api/health/deep.
//
// Antes, si Yahoo/FRED/CFTC/Groq fallaban, el score se calculaba igual sin avisar (la señal
// simplemente "no aportaba") y el bug de la tasa real estuvo meses invisible. Ahora cada insumo
// reporta su estado y la UI/decisión muestran cuándo el resultado es degradado.

const DAY_MS = 24 * 3600 * 1000;

// Insumos que alimentan el score (los demás son informativos)
export const SCORING_INPUTS = ['dxy', 'tenYearYield', 'realYield', 'cot', 'gvz', 'silver', 'dailyRegime', 'aiSentiment'];

export const INPUT_LABELS = {
  dxy: 'DXY', tenYearYield: 'Bono 10Y', realYield: 'Tasa real 10Y', cot: 'COT',
  gvz: 'GVZ', silver: 'Plata (ratio oro/plata)', dailyRegime: 'Tendencia diaria', aiSentiment: 'IA de noticias',
  spot: 'Oro de referencia', headlines: 'Titulares', fred: 'FRED'
};

// Después de cuántos días sin dato nuevo cada insumo se considera vencido
const MAX_AGE_DAYS = { realYield: 5, cot: 10, spot: 6 / 24 };

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// 'YYMMDD' (CFTC as_of_date_in_form_yymmdd) → ms UTC
export function parseYymmdd(s) {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(String(s ?? ''));
  return m ? Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function withAge(base, asOfMs, maxAgeDays, now) {
  if (asOfMs == null) return { status: 'ok', ...base };
  const ageDays = (now - asOfMs) / DAY_MS;
  return { ...base, status: ageDays > maxAgeDays ? 'stale' : 'ok', asOf: new Date(asOfMs).toISOString().slice(0, 10), ageDays: round(ageDays) };
}

const failed = (result, fallbackMsg) => ({
  status: 'failed',
  error: result?.status === 'rejected' ? (result.reason?.message ?? fallbackMsg) : fallbackMsg
});

/**
 * @param {object} p
 * @param {object} p.macro          - macro final (con fallbacks aplicados)
 * @param {object} p.results        - { macro, realYield, cot, volData, spot } resultados de Promise.allSettled
 * @param {object|null} p.dailyBias
 * @param {Array} p.headlines
 * @param {string|null} p.analysisError
 * @param {object|null} p.fred
 * @param {number} [p.now]
 */
export function buildGoldSources({ macro = {}, results = {}, dailyBias = null, headlines = [], analysisError = null, fred = null, now = Date.now() }) {
  const s = {};

  s.dxy = macro.dxy ? { status: 'ok', source: macro.dxy.source ?? 'yahoo' } : failed(results.macro, 'sin dato de DXY (Yahoo)');
  s.tenYearYield = macro.tenYearYield
    ? { status: 'ok', source: macro.tenYearYield.source ?? 'yahoo' }
    : failed(results.macro, 'sin dato del bono 10Y');

  s.realYield = macro.realYield
    ? withAge({ source: macro.realYield.source ?? 'fred-csv' }, macro.realYield.date ? Date.parse(`${macro.realYield.date}T00:00:00Z`) : null, MAX_AGE_DAYS.realYield, now)
    : failed(results.realYield, 'sin dato de tasa real (FRED)');

  s.cot = macro.cot
    ? withAge({ source: 'cftc' }, parseYymmdd(macro.cot.reportDate), MAX_AGE_DAYS.cot, now)
    : failed(results.cot, 'sin dato COT (CFTC)');

  s.gvz = macro.gvz ? { status: 'ok', source: macro.gvz.source ?? 'yahoo' } : failed(results.volData, 'sin dato de GVZ');
  s.silver = macro.silver ? { status: 'ok', source: 'yahoo' } : failed(results.volData, 'sin dato de plata');

  s.spot = macro.spot
    ? withAge({ source: 'yahoo GC=F' }, macro.spot.time ?? null, MAX_AGE_DAYS.spot, now)
    : failed(results.spot, 'sin oro de referencia (GC=F)');
  // El cotizado de futuros es "viejo" el fin de semana: eso es normal y no degrada el score
  if (s.spot.status === 'stale') s.spot.note = 'mercado de futuros cerrado';

  s.dailyRegime = dailyBias
    ? { status: 'ok', source: dailyBias.source ?? 'paxg', ...(dailyBias.source === 'paxg' ? { fallback: true } : {}) }
    : { status: 'failed', error: 'sin velas diarias' };

  s.headlines = headlines.length > 0 ? { status: 'ok', count: headlines.length } : { status: 'failed', error: 'sin titulares recientes' };
  s.aiSentiment = analysisError
    ? { status: 'failed', error: analysisError }
    : headlines.length === 0 ? { status: 'missing', error: 'sin titulares para analizar' } : { status: 'ok' };

  s.fred = fred?.available
    ? {
        status: Object.values(fred.series).some(x => x.status !== 'ok') ? 'stale' : 'ok',
        okCount: Object.values(fred.series).filter(x => x.status === 'ok').length,
        total: Object.keys(fred.series).length
      }
    : { status: 'failed', error: Object.values(fred?.series ?? {})[0]?.error ?? 'FRED no disponible' };

  return s;
}

/**
 * @returns {{ degraded: boolean, level: 'none'|'partial'|'severe', missing: string[], stale: string[], message: string|null }}
 *   missing/stale con las claves de SCORING_INPUTS. severe = sin ambos datos macro centrales (DXY y 10Y)
 *   o 3 o más insumos faltantes.
 */
export function summarizeSources(sources) {
  if (!sources) return null;
  const missing = SCORING_INPUTS.filter(k => ['failed', 'missing'].includes(sources[k]?.status));
  // El cotizado del oro de referencia no está en SCORING_INPUTS; el resto sí
  const stale = SCORING_INPUTS.filter(k => sources[k]?.status === 'stale');
  const degraded = missing.length + stale.length > 0;
  const level = !degraded ? 'none'
    : (missing.includes('dxy') && missing.includes('tenYearYield')) || missing.length >= 3 ? 'severe' : 'partial';

  const names = (arr) => arr.map(k => INPUT_LABELS[k] ?? k).join(', ');
  const parts = [];
  if (missing.length) parts.push(`faltan ${names(missing)}`);
  if (stale.length) parts.push(`desactualizados ${names(stale)}`);

  return {
    degraded, level, missing, stale,
    message: degraded ? `Datos degradados: ${parts.join('; ')}. El score se calculó sin esos insumos.` : null
  };
}

const NOTCH_DOWN = { fuerte: 'moderado', moderado: 'débil', débil: 'débil' };

/**
 * Adjunta la calidad de datos a la decisión. Con degradación SEVERA una compra pierde un escalón de
 * intensidad y lo advierte en la recomendación (no se compra "fuerte" a ciegas).
 */
export function applyDataQuality(decision, health) {
  if (!health?.degraded) return decision;
  const dataQuality = { degraded: true, level: health.level, missing: health.missing, stale: health.stale };
  if (health.level === 'severe' && decision.action === 'BUY') {
    return {
      ...decision,
      strength: NOTCH_DOWN[decision.strength] ?? decision.strength,
      recommendation: `⚠️ ${health.message} ${decision.recommendation ?? ''}`.trim(),
      dataQuality
    };
  }
  return { ...decision, dataQuality };
}
