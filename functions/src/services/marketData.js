// Coinbase API - datos reales de mercado + candles históricos reales

const COINBASE_IDS = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  PAXG: 'PAXG-USD'
};

const cache = {
  BTC: null,
  ETH: null,
  PAXG: null,
  lastUpdate: null
};

export async function getCryptoData(symbol) {
  if (!COINBASE_IDS[symbol]) {
    throw new Error(`Símbolo no soportado: ${symbol}`);
  }

  // Cache de 2 minutos
  if (cache[symbol] && (Date.now() - new Date(cache[symbol].timestamp).getTime()) < 120000) {
    return cache[symbol];
  }

  try {
    const pair = COINBASE_IDS[symbol];

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

    // Obtener velas reales (1h, 250 candles = ~10 días, suficiente para EMA200)
    let candles;
    let candlesSource = 'real';
    try {
      candles = await fetchRealCandles(pair, 3600, 250);
    } catch (candleError) {
      console.warn(`[${symbol}] Falló fetch de candles reales, usando sintéticas:`, candleError.message);
      candles = generateSyntheticCandles(high, low, volume);
      candlesSource = 'synthetic';
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
 * Obtiene velas OHLCV reales desde la API pública de Coinbase Exchange.
 * Devuelve hasta `count` velas de `granularity` segundos cada una.
 * Coinbase limita a 300 velas por request.
 */
async function fetchRealCandles(pair, granularity = 3600, count = 250) {
  const end = new Date();
  const start = new Date(end.getTime() - count * granularity * 1000);

  const url = `https://api.exchange.coinbase.com/products/${pair}/candles` +
    `?start=${start.toISOString()}&end=${end.toISOString()}&granularity=${granularity}`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase candles API ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No candle data received');
  }

  // Coinbase devuelve [time, low, high, open, close, volume] en orden newest-first
  return data
    .reverse()
    .map(([time, low, high, open, close, volume]) => ({
      timestamp: time * 1000,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume)
    }));
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
  const pair = COINBASE_IDS[symbol];
  if (!pair) throw new Error(`Símbolo no soportado: ${symbol}`);
  return fetchRealCandles(pair, 86400, count);
}

export function getCache() {
  return cache;
}

export function isCacheValid() {
  if (!cache.lastUpdate) return false;
  return (Date.now() - cache.lastUpdate) < 300000;
}
