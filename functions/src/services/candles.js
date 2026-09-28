// Utilidades PURAS de velas (sin red): agregado de timeframes, ventanas de paginado, merge.
//
// Coinbase Exchange solo sirve granularidades 1m, 5m, 15m, 1h, 6h y 1d (por confirmar en vivo) y
// máximo 300 velas por request. Para 4h se agregan velas de 1h; para más de 300 velas se pagina.

export const GRANULARITY_SECONDS = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '6h': 21600, '1d': 86400
};

// Granularidades que la API de Coinbase sirve directamente
export const NATIVE_GRANULARITIES = new Set([60, 300, 900, 3600, 21600, 86400]);

// Máximo de velas por request de Coinbase
export const MAX_CANDLES_PER_REQUEST = 300;

/**
 * Elige de dónde sale una granularidad: nativa, o agregada desde la nativa más grande que la divide.
 * @returns {{ baseSeconds: number, factor: number }}
 */
export function planGranularity(seconds) {
  if (NATIVE_GRANULARITIES.has(seconds)) return { baseSeconds: seconds, factor: 1 };
  const bases = [...NATIVE_GRANULARITIES].sort((a, b) => b - a);
  for (const b of bases) {
    if (b < seconds && seconds % b === 0) return { baseSeconds: b, factor: seconds / b };
  }
  throw new Error(`Granularidad no soportada: ${seconds}s`);
}

/**
 * Agrupa velas cerradas y ordenadas en velas de `bucketSeconds`, alineadas a la época UTC
 * (4h → 00,04,08,12,16,20 UTC). Un balde con al menos una vela es válido (Coinbase omite las horas
 * sin operaciones, y PAXG es poco líquido); el balde todavía en curso se descarta.
 *
 * @param {Array<{timestamp,open,high,low,close,volume}>} candles
 * @param {number} bucketSeconds
 * @param {number} now - ms
 */
export function aggregateCandles(candles, bucketSeconds, now = Date.now()) {
  const bucketMs = bucketSeconds * 1000;
  const buckets = new Map();

  for (const c of candles) {
    const start = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const b = buckets.get(start);
    if (!b) {
      buckets.set(start, { timestamp: start, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 });
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;                     // las velas vienen en orden cronológico
      b.volume += c.volume || 0;
    }
  }

  return [...buckets.values()]
    .filter(b => b.timestamp + bucketMs <= now)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Ventanas [start, end] (ms) hacia atrás que cubren `count` velas de `granularitySeconds`,
 * cada una de a lo sumo `maxPerRequest` velas. La ventana más nueva termina en `endMs`.
 * Se pide una vela de más por ventana para no perder la del borde.
 */
export function planWindows(count, granularitySeconds, endMs, maxPerRequest = MAX_CANDLES_PER_REQUEST) {
  const stepMs = granularitySeconds * 1000;
  const windows = [];
  let remaining = count;
  let end = endMs;
  while (remaining > 0) {
    const n = Math.min(remaining, maxPerRequest - 1);
    const start = end - (n + 1) * stepMs;
    windows.push({ start, end });
    remaining -= n;
    end = start;
  }
  return windows;
}

/** Une varias listas de velas: sin duplicados por timestamp y en orden cronológico. */
export function mergeCandles(chunks) {
  const byTs = new Map();
  for (const chunk of chunks) for (const c of chunk) byTs.set(c.timestamp, c);
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}
