// Registro de decisiones: ids idempotentes por hora + snapshot de features.
// Puro (sin firebase) para poder testearlo. La persistencia está en config/database.js.
//
// Antes se guardaba un documento por CADA request de POST /decision (la app pide una decisión
// cada 5 min por pestaña abierta) y no se guardaba nada de lo que la produjo, así que no se podía
// medir ni reproducir. Ahora: a lo sumo una señal por símbolo y hora (la primera de esa hora) con
// las features que la explican. Los snapshots completos y las etiquetas de resultado llegan en P1/P4.

export const DECISION_MODEL_VERSION = 'p0';

/** Balde horario UTC: YYYYMMDDHH */
export function hourBucket(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

/** ID del documento: `PAXG_2026092812`. El orden lexicográfico del ID = orden cronológico. */
export function decisionDocId(symbol, ms) {
  return `${String(symbol).toUpperCase()}_${hourBucket(ms)}`;
}

/** Prefijo para consultar por símbolo: rango [prefix, prefix + '') sobre el ID de documento. */
export function decisionIdPrefix(symbol) {
  return `${String(symbol).toUpperCase()}_`;
}

/** ¿El ID tiene el formato nuevo (símbolo_YYYYMMDDHH)? Los anteriores eran IDs automáticos. */
export function isHourlyDecisionId(id) {
  return /^[A-Z0-9]+_\d{10}$/.test(id);
}

const round = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// Firestore rechaza `undefined`: reemplazar recursivamente por null
function nullify(v) {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(nullify);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nullify(x)]));
  return v;
}

/**
 * Snapshot de la decisión con las features que la produjeron.
 */
export function buildDecisionRecord({ symbol, marketData, marketMode, zones, indicators, userState, decision }) {
  const gc  = marketMode?.goldContext ?? null;
  const atr = indicators?.atr;
  const price = marketData?.price;

  return nullify({
    symbol:       String(symbol).toUpperCase(),
    price,
    marketMode:   marketMode?.mode ?? null,
    modeScore:    round(marketMode?.score, 3),
    zone:         zones?.currentZone ?? null,
    decision:     decision?.action ?? null,
    strength:     decision?.strength ?? null,
    reason:       decision?.reason ?? null,
    opsCount:     decision?.operations?.length ?? 0,
    calendarModulated: !!decision?.calendarRisk,
    cashPercent:  Number(userState?.cashPercent),
    userMode:     userState?.mode ?? null,
    rsi:          round(indicators?.rsi, 1),
    atrPercent:   atr && price ? round((atr / price) * 100, 3) : null,
    trendShort:   indicators?.trendShort ?? null,
    trendLong:    indicators?.trendLong ?? null,
    candlesSource: marketData?.candlesSource ?? null,
    modelVersion: DECISION_MODEL_VERSION,
    gold: gc ? {
      aiSentiment:    gc.sentiment ?? null,
      aiScore:        round(gc.sentimentScore, 3),
      aiError:        !!gc.analysisError,
      cot:            gc.cot?.sentiment ?? null,
      netSpec:        gc.cot?.netSpec ?? null,
      realYield:      round(gc.realYield?.value, 3),
      gvz:            round(gc.gvz?.value, 2),
      dxyChange:      round(gc.macro?.dxy?.changePercent, 3),
      tenYear:        round(gc.macro?.tenYearYield?.value, 3),
      goldSilverRatio: round(gc.goldSilverRatio, 2),
      dailyBias:      gc.dailyBias?.alignment ?? null
    } : null
  });
}
