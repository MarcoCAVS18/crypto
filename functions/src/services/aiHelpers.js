// Utilidades puras de la capa de IA (sin red ni SDK): testeables.

/**
 * Resultado retrospectivo de una señal pasada, según su TIPO.
 * Antes se marcaba ✓ si el precio subió, sin importar si la señal era BUY, SELL o WAIT
 * (un SELL seguido de un rally aparecía como acierto).
 *
 * @param {'BUY'|'SELL'|'WAIT'} decision
 * @param {number} pctChange - cambio % del precio desde la señal hasta hoy
 * @returns {string} texto para el prompt, p. ej. "→ desde entonces +1.2% ✓"
 */
export function labelOutcome(decision, pctChange) {
  if (pctChange == null || !Number.isFinite(pctChange)) return '';
  const sign = pctChange >= 0 ? '+' : '';
  const base = `→ desde entonces ${sign}${pctChange.toFixed(1)}%`;
  if (decision === 'BUY')  return `${base} ${pctChange >= 0 ? '✓' : '✗'}`;
  if (decision === 'SELL') return `${base} ${pctChange <= 0 ? '✓' : '✗'}`;   // vender antes de una baja acierta
  return base;                                                              // WAIT: sin veredicto
}

// Balde logarítmico: cambia solo cuando el valor se mueve ~`pct` %, sea cual sea su escala
const logBucket = (x, pct) => (x > 0 ? Math.round(Math.log(x) / Math.log(1 + pct)) : 0);

/**
 * Clave de caché del insight de portfolio.
 * Antes usaba baldes de $500 sobre el precio (pensados para BTC): en PAXG el insight casi nunca
 * se refrescaba y podía mostrar un P&L viejo. Ahora los baldes son relativos (precio ~0.5 %,
 * promedio ~1 %) e incluye la acción, porque el texto la menciona.
 */
export function insightCacheKey(symbol, price, portfolioContext, action) {
  const pb = logBucket(price, 0.005);
  const ab = logBucket(portfolioContext?.avgBuyPrice ?? 0, 0.01);
  const cb = Math.round((portfolioContext?.costBasis ?? portfolioContext?.netInvested ?? 0) / 100);
  return `portinsight_${String(symbol).toUpperCase()}_${action ?? 'NA'}_${pb}_${ab}_${cb}`;
}
