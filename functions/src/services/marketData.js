// Coinbase API - datos reales de mercado + candles históricos reales
import { planGranularity, planWindows, mergeCandles, aggregateCandles } from './candles.js';

// Timeframe del análisis técnico (indicadores, zonas, market mode): velas de 4h cerradas.
// Antes eran velas de 1h × 250 (~10 días: la "EMA200" era de ~8 días). 250 velas de 4h ≈ 41 días.
export const ANALYSIS_TIMEFRAME_SECONDS = 14400;
export const ANALYSIS_CANDLE_COUNT = 250;

const KNOWN_PAIRS = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  PAXG: 'PAXG-USD'
};

const cache = {};

// Velas reales de hasta 30 min se consideran aceptables si Coinbase falla un instante
const STALE_CANDLES_MAX_MS = 30 * 60 * 1000;

function getPair(symbol) {
  return KNOWN_PAIRS[symbol] ?? `${symbol}-USD`;
}

export async function getCryptoData(symbol) {
  // Cache de 2 minutos
  if (cache[symbol] && (Date.now() - new Date(cache[symbol].timestamp).getTime()) < 120000) {
    return cache[symbol];
  }

  try {
    const pair = getPair(symbol);

    // Obtener precio actual y stats 24h en paralelo
    const [tickerRes, statsRes] = await Promise.all([
      fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`),
      fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`)
    ]);

    const tickerData = await tickerRes.json();
    if (!tickerData?.data?.amount) throw new Error('No price data');
    const price = parseFloat(tickerData.data.amount);

    const stats = await statsRes.json();
    const high = parseFloat(stats.high) || price * 1.02;
    const low = parseFloat(stats.low) || price * 0.98;
    const volume = parseFloat(stats.volume_30day) || 1000000;
    const open = parseFloat(stats.open) || price;
    const change = ((price - open) / open) * 100;

    // Obtener velas reales (4h × 250 ≈ 41 días; agregadas desde 1h). Solo velas CERRADAS.
    // Si Coinbase falla: 1) reutilizar las últimas velas reales (< 30 min) como 'stale';
    // 2) recién entonces sintéticas, que el motor de decisión NUNCA usa para operar.
    let candles;
    let candlesSource = 'real';
    try {
      candles = await fetchCandlesSeconds(pair, ANALYSIS_TIMEFRAME_SECONDS, ANALYSIS_CANDLE_COUNT);
    } catch (candleError) {
      const prev = cache[symbol];
      const prevAgeMs = prev ? Date.now() - new Date(prev.timestamp).getTime() : Infinity;
      if (prev && prev.candlesSource !== 'synthetic' && prevAgeMs < STALE_CANDLES_MAX_MS) {
        console.warn(`[${symbol}] Falló fetch de candles, reutilizando velas reales de hace ${Math.round(prevAgeMs / 60000)} min:`, candleError.message);
        candles = prev.candles;
        candlesSource = 'stale';
      } else {
        console.warn(`[${symbol}] Falló fetch de candles reales, usando sintéticas:`, candleError.message);
        candles = generateSyntheticCandles(high, low, volume);
        candlesSource = 'synthetic';
      }
    }

    const data = {
      symbol,
      pair: `${symbol}/USD`,
      price,
      change24h: change,
      volume,
      high24h: high,
      low24h: low,
      candles,
      candlesSource,
      timestamp: new Date().toISOString()
    };

    cache[symbol] = data;
    cache.lastUpdate = new Date();
    console.log(`[${symbol}] $${price.toFixed(2)} | Candles: ${candles.length} (${candlesSource})`);

    return data;
  } catch (error) {
    console.error(`Error ${symbol}:`, error.message);
    if (cache[symbol]) return cache[symbol];
    throw error;
  }
}

/**
 * Convierte filas de Coinbase `[time, low, high, open, close, volume]` (newest-first)
 * en velas ordenadas cronológicamente, descartando la vela EN FORMACIÓN.
 * Una vela en curso tiene volumen parcial y sesga RSI/ATR/volumen (p. ej. los primeros
 * minutos de cada hora parecían "volumen muy bajo").
 *
 * @param {Array} rows
 * @param {number} granularity - segundos por vela
 * @param {number} now         - ms; inyectable para tests
 */
export function normalizeCandles(rows, granularity, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  const gMs = granularity * 1000;
  return rows
    .map(([time, low, high, open, close, volume]) => ({
      timestamp: time * 1000,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume)
    }))
    .filter(c => Number.isFinite(c.timestamp) && Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low))
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter(c => c.timestamp + gMs <= now);
}

/**
 * Una request de velas a Coinbase (máx. 300 velas). Devuelve las filas crudas (puede ser []).
 */
async function fetchRows(pair, granularity, startMs, endMs) {
  const url = `https://api.exchange.coinbase.com/products/${pair}/candles` +
    `?start=${new Date(startMs).toISOString()}&end=${new Date(endMs).toISOString()}&granularity=${granularity}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase candles API ${res.status}: ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Velas OHLCV CERRADAS de cualquier granularidad múltiplo de una nativa de Coinbase:
 * - nativas (1m, 5m, 15m, 1h, 6h, 1d): directo;
 * - otras (p. ej. 4h): se agregan desde la nativa más grande que las divide (1h);
 * - más de 300 velas: se pagina en ventanas pedidas en paralelo.
 * Devuelve hasta `count` velas, de la más vieja a la más nueva.
 */
export async function fetchCandlesSeconds(pair, seconds, count, now = Date.now()) {
  const { baseSeconds, factor } = planGranularity(seconds);
  // +factor: margen por el balde agregado que todavía está en formación y se descarta
  const baseCount = factor === 1 ? count : count * factor + factor;
  const windows = planWindows(baseCount, baseSeconds, now);

  const chunks = await Promise.all(windows.map(w => fetchRows(pair, baseSeconds, w.start, w.end)));
  const base = mergeCandles(chunks.map(rows => normalizeCandles(rows, baseSeconds, now)));
  if (base.length === 0) throw new Error('No closed candles received');

  const out = factor === 1 ? base : aggregateCandles(base, seconds, now);
  if (out.length === 0) throw new Error('No closed candles received');
  return out.slice(-count);
}

/**
 * Fallback: velas sintéticas basadas en el rango 24h.
 * Sólo se usa si la API de candles falla.
 */
function generateSyntheticCandles(high, low, volume) {
  const now = Date.now();
  return Array.from({ length: 50 }, (_, i) => {
    const progress = i / 49;
    const variance = (Math.random() - 0.5) * (high - low) * 0.3;
    const candlePrice = low + (high - low) * progress + variance;
    return {
      timestamp: now - (50 - i) * 3600000,
      open: candlePrice * (1 - Math.random() * 0.005),
      high: candlePrice * (1 + Math.random() * 0.01),
      low: candlePrice * (1 - Math.random() * 0.01),
      close: candlePrice,
      volume: volume / 50
    };
  });
}

/**
 * Obtiene velas diarias (granularidad 86400s) desde Coinbase.
 * Usado para análisis multi-timeframe: detectar tendencia diaria del oro.
 * @param {string} symbol - 'BTC' | 'ETH' | 'PAXG'
 * @param {number} count  - cantidad de velas (máx 300 por limitación Coinbase)
 */
export async function getDailyCandles(symbol, count = 120) {
  return fetchCandlesSeconds(getPair(symbol), 86400, count);
}

// Caché corto: los gráficos piden varias veces las mismas velas al cambiar de rango
const historyCache = new Map();
const HISTORY_TTL_MS = 60 * 1000;

/**
 * @param {string} symbol
 * @param {number} granularity - segundos (900, 3600, 14400, 86400, ...)
 * @param {number} count
 */
export async function getHistoricalCandles(symbol, granularity = ANALYSIS_TIMEFRAME_SECONDS, count = 100) {
  const key = `${symbol}|${granularity}|${count}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.candles;

  const candles = await fetchCandlesSeconds(getPair(symbol), granularity, count);
  historyCache.set(key, { at: Date.now(), candles });
  if (historyCache.size > 50) historyCache.delete(historyCache.keys().next().value);
  return candles;
}

export function getCache() {
  return cache;
}

export function isCacheValid() {
  if (!cache.lastUpdate) return false;
  return (Date.now() - cache.lastUpdate) < 300000;
}
