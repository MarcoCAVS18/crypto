// Niveles de los tramos de compra según la profundidad HISTÓRICA de los retrocesos del propio activo, en vez de
// porcentajes fijos (−1.5 % / −1.5×0.99). Retroceso = caída del cierre desde el máximo de las últimas `lookback`
// velas. Los cuantiles 50 % y 80 % de esa distribución fijan el 2.º y el 3.er tramo.

const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/**
 * @param {Array<{close:number}>} candles
 * @returns {null|{ l2Pct:number, l3Pct:number, samples:number }} profundidades (en %, positivas) o null si no hay datos suficientes
 */
export function pullbackLevels(candles, { lookback = 12, minSamples = 60, floorPct = 0.4, capPct = 8 } = {}) {
  if (!Array.isArray(candles) || candles.length < minSamples + lookback) return null;
  const closes = candles.map(c => c.close).filter(Number.isFinite);
  const depths = [];
  for (let i = lookback; i < closes.length; i++) {
    const hi = Math.max(...closes.slice(i - lookback, i + 1));
    depths.push(((hi - closes[i]) / hi) * 100);
  }
  const positive = depths.filter(d => d > 0).sort((a, b) => a - b);
  if (positive.length < 20) return null;
  const clamp = (x) => Math.min(capPct, Math.max(floorPct, x));
  const l2 = clamp(quantile(positive, 0.5));
  const l3 = Math.max(clamp(quantile(positive, 0.8)), l2 + 0.2);       // el 3.º siempre por debajo del 2.º
  return { l2Pct: Math.round(l2 * 100) / 100, l3Pct: Math.round(l3 * 100) / 100, samples: positive.length };
}
