// Explicación de la señal para la pantalla: qué pesó en el score, cómo se decidió el tamaño y qué datos faltan.
// Pura y testeada: arma una estructura a partir de lo que YA devuelve la API (marketMode.components, decision.policy,
// decision.calendarRisk, decision.dataQuality, marketMode.goldContext.sources). No inventa nada: si un dato no viene, no se muestra.

export const COMPONENT_LABELS = {
  ai: 'Noticias (IA)', dxy: 'Dólar (DXY)', tenYear: 'Bono 10Y', technical: 'Técnico (velas 4h)',
  cot: 'Posición de especuladores (COT)', realYield: 'Tasa real 10Y', gvz: 'Volatilidad del oro (GVZ)',
  goldSilver: 'Ratio oro/plata', dailyBias: 'Tendencia diaria'
};

export const COMPONENT_HINTS = {
  ai: 'Etiquetas de las noticias recientes (peso máximo ±0.10).',
  dxy: 'Si el dólar baja suma; si sube resta.',
  tenYear: 'Rendimiento alto del bono 10Y resta (el oro no paga cupón); bajo suma.',
  technical: 'Precio frente a EMA200/EMA50, RSI y volatilidad.',
  cot: 'Especuladores muy largos restan (riesgo de corrección); netos cortos suman.',
  realYield: 'Tasa real alta resta; baja suma.',
  gvz: 'Volatilidad baja del oro suma; alta resta.',
  goldSilver: 'Ratio alto (oro caro frente a la plata) resta.',
  dailyBias: 'Cruce de medias diarias y RSI diario.'
};

// Insumos del score (mismos nombres que dataHealth.js del servidor)
export const INPUT_LABELS = {
  dxy: 'Dólar (DXY)', tenYearYield: 'Bono 10Y', realYield: 'Tasa real 10Y', cot: 'COT', gvz: 'GVZ',
  silver: 'Plata', dailyRegime: 'Tendencia diaria', aiSentiment: 'IA de noticias'
};
const SCORING_INPUTS = Object.keys(INPUT_LABELS);

const ACTION_LABEL = { BUY: 'Comprar', SELL: 'Vender', WAIT: 'Esperar', HOLD: 'Mantener' };
const BAR_FULL = 0.25;   // aporte para el que la barra se llena (el mayor peso individual es 0.25)

const fin = Number.isFinite;
const pctText = (x) => `${Math.round(x * 100)} %`;

/** Aporte de cada componente al score, ordenado por peso absoluto. */
export function scoreFactors(components) {
  if (!components || typeof components !== 'object') return [];
  return Object.entries(components)
    .filter(([, v]) => fin(v))
    .map(([key, value]) => ({
      key, label: COMPONENT_LABELS[key] ?? key, hint: COMPONENT_HINTS[key] ?? null, value,
      direction: value > 0.005 ? 'favor' : value < -0.005 ? 'contra' : 'neutral',
      barPct: Math.min(100, Math.round((Math.abs(value) / BAR_FULL) * 100))
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** Datos que faltan, están viejos o vienen de un respaldo. Primero lo que más afecta. */
export function dataIssues({ sources = null, dataQuality = null, headlinesSource = null, analysisError = null } = {}) {
  const items = [];
  const seen = new Set();
  const push = (level, key, label, text) => { if (!seen.has(key)) { seen.add(key); items.push({ level, key, label, text }); } };

  if (sources) {
    for (const key of SCORING_INPUTS) {
      const s = sources[key];
      if (!s) continue;
      const label = INPUT_LABELS[key];
      if (s.status === 'failed' || s.status === 'missing') {
        push('error', key, label, `No llegó el dato${s.error ? ` (${s.error})` : ''}. El score se calculó sin este insumo.`);
      } else if (s.status === 'stale') {
        const age = fin(s.ageDays) ? `${s.ageDays.toFixed(0)} días` : 'varios días';
        push('warn', key, label, `Dato desactualizado (${s.asOf ? `del ${s.asOf}, ` : ''}${age}).`);
      } else if (s.fallback) {
        push('info', key, label, 'Se usó un respaldo (PAXG) en lugar de la fuente principal.');
      }
    }
    if (sources.spot?.status === 'stale') push('info', 'spot', 'Oro de referencia', sources.spot.note ? `Mercado de futuros cerrado: se muestra el último cierre.` : 'Cotización de referencia desactualizada.');
  } else if (dataQuality) {
    for (const key of dataQuality.missing ?? []) push('error', key, INPUT_LABELS[key] ?? key, 'No llegó el dato. El score se calculó sin este insumo.');
    for (const key of dataQuality.stale ?? []) push('warn', key, INPUT_LABELS[key] ?? key, 'Dato desactualizado.');
  }

  if (analysisError) push('error', 'aiError', 'IA de noticias', 'El análisis no respondió; el score no incluye el aporte de las noticias.');
  if (headlinesSource === 'saved') push('warn', 'headlines', 'Noticias', 'Las fuentes no respondieron: se muestran las últimas noticias guardadas.');
  else if (headlinesSource === 'live+saved') push('info', 'headlines', 'Noticias', 'Parte de los titulares son de una consulta anterior.');

  const order = { error: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * @param {{ decision?: object|null, marketMode?: object|null, symbol?: string }} p
 */
export function buildExplanation({ decision = null, marketMode = null, symbol = '' } = {}) {
  if (!decision && !marketMode) return null;
  const isGold = String(symbol).toUpperCase() === 'PAXG';
  const gc = marketMode?.goldContext ?? null;

  const headline = decision ? {
    action: decision.action, actionLabel: ACTION_LABEL[decision.action] ?? decision.action ?? '—',
    strength: decision.strength ?? null, reason: decision.reason ?? null
  } : null;

  const score = marketMode && fin(marketMode.score) ? {
    value: marketMode.score, mode: marketMode.mode ?? 'neutral',
    heldByHysteresis: !!marketMode.hysteresis?.held
  } : null;

  const factors = isGold ? scoreFactors(marketMode?.components) : [];

  // Tamaño: política de DCA (solo oro) + ajustes posteriores
  const sizing = [];
  const p = decision?.policy;
  if (p && fin(p.capFraction)) {
    const adj = fin(p.multiplier) && Math.abs(p.multiplier - 1) >= 0.02
      ? ` (ajuste ×${p.multiplier.toFixed(2)} por el score: ${p.multiplier > 1 ? 'algo más' : 'algo menos'} de peso a ${p.multiplier > 1 ? 'comprar la debilidad' : 'comprar con el contexto fuerte'})`
      : ' (sin ajuste: score neutro)';
    sizing.push(`Se despliega hasta el ${pctText(p.capFraction)} del efectivo asignado${adj}.`);
  }
  const adjustments = [];
  const cr = decision?.calendarRisk;
  if (cr) {
    adjustments.push({ kind: 'calendar', text: cr.calendarNote ?? cr.reasoning ?? 'Evento macro cercano.', fraction: fin(cr.capitalFraction) ? cr.capitalFraction : null });
  }
  const costs = (decision?.operations ?? []).reduce((s, o) => s + (fin(o.estCostUsd) ? o.estCostUsd : 0), 0);
  if (costs > 0) adjustments.push({ kind: 'costs', text: `Costo estimado de operar ≈ $${costs.toFixed(2)} (comisión + spread).` });
  if (decision?.dataQuality?.level === 'severe' && decision.action === 'BUY') adjustments.push({ kind: 'quality', text: 'Faltan varios insumos: la señal se bajó un escalón de fuerza.' });

  const issues = dataIssues({
    sources: gc?.sources ?? null, dataQuality: decision?.dataQuality ?? gc?.dataHealth ?? null,
    headlinesSource: gc?.headlinesSource ?? null, analysisError: gc?.analysisError ?? null
  });

  return {
    isGold, headline, score, factors, sizing, adjustments, issues,
    reasons: Array.isArray(marketMode?.reasons) ? marketMode.reasons.slice(0, 6) : [],
    caveat: isGold
      ? 'El score es contexto, no una predicción: en 25 años de datos no anticipó el precio del oro. Por eso no decide si comprar; solo ajusta el tamaño de la compra de forma acotada (×0.5 a ×1.5).'
      : null
  };
}
