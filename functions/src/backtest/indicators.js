// Indicadores causales sobre arrays de cierres: el valor en el índice i usa SOLO datos ≤ i.
// (Implementación propia y mínima para no depender del alineamiento de `technicalindicators`.)

/** EMA con semilla en el primer valor; alpha = 2/(period+1). Devuelve array del mismo largo. */
export function emaSeries(values, period) {
  const alpha = 2 / (period + 1);
  const out = new Array(values.length);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    prev = prev === null ? values[i] : alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder. Los primeros `period` valores son null. */
export function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** Retornos logarítmicos diarios; el índice 0 es null. */
export function logReturns(closes) {
  return closes.map((c, i) => (i === 0 ? null : Math.log(c / closes[i - 1])));
}

/** Volatilidad realizada anualizada de los últimos `window` retornos que terminan en i (o null). */
export function realizedVol(returns, i, window = 20, periodsPerYear = 252) {
  if (i < window) return null;
  const r = returns.slice(i - window + 1, i + 1);
  if (r.some(x => x === null)) return null;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(periodsPerYear);
}
