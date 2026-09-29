// Formato de las métricas reales de señales (endpoint /api/metrics/:symbol) para mostrarlas sin inventar datos.
export const pct = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%` : '—');
export const rate = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');

/** Filas de la tabla para un horizonte: una por acción con datos. Devuelve [] si no hay ninguna señal etiquetada. */
export function metricRows(summary, horizon) {
  if (!summary) return [];
  return ['BUY', 'SELL', 'WAIT']
    .map(action => ({ action, ...(summary[action]?.[horizon] ?? { n: 0 }) }))
    .filter(r => r.n > 0)
    .map(r => ({
      action: r.action, n: r.n,
      hit: r.hitRate === null || r.hitRate === undefined ? '—' : rate(r.hitRate),
      base: r.baseUpRate === null || r.baseUpRate === undefined || r.action === 'WAIT' ? '—' : rate(r.action === 'SELL' ? 1 - r.baseUpRate : r.baseUpRate),
      ret: pct(r.meanRet),
      edge: r.edgeVsBase === null || r.edgeVsBase === undefined ? '—' : pct(r.edgeVsBase),
      // con pocas señales el porcentaje engaña: se marca
      lowSample: r.n < 10
    }));
}
