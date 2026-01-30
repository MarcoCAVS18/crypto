// Coinbase API - realmente gratis sin rate limiting agresivo

const COINBASE_IDS = {
  BTC: 'BTC-USD',
  PAXG: 'PAXG-USD'
};

const cache = {
  BTC: null,
  PAXG: null,
  lastUpdate: null
};

export async function getCryptoData(symbol, timeframe = '4h', limit = 100) {
  if (!COINBASE_IDS[symbol]) {
    throw new Error(`Símbolo no soportado: ${symbol}`);
  }

  // Cache de 2 minutos
  if (cache[symbol] && (Date.now() - new Date(cache[symbol].timestamp).getTime()) < 120000) {
    return cache[symbol];
  }

  try {
    const pair = COINBASE_IDS[symbol];

    // Obtener precio actual
    const tickerRes = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
    const tickerData = await tickerRes.json();

    if (!tickerData?.data?.amount) {
      throw new Error('No price data');
    }

    const price = parseFloat(tickerData.data.amount);

    // Obtener stats 24h
    const statsRes = await fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`);
    const stats = await statsRes.json();

    const high = parseFloat(stats.high) || price * 1.02;
    const low = parseFloat(stats.low) || price * 0.98;
    const volume = parseFloat(stats.volume_30day) || 1000000;
    const open = parseFloat(stats.open) || price;
    const change = ((price - open) / open) * 100;

    // Generar velas sintéticas
    const candles = generateCandles(price, high, low, volume);

    const data = {
      symbol,
      pair: `${symbol}/USDT`,
      price,
      change24h: change,
      volume,
      high24h: high,
      low24h: low,
      candles,
      timestamp: new Date().toISOString()
    };

    cache[symbol] = data;
    cache.lastUpdate = new Date();
    console.log(`${symbol}: $${price.toFixed(2)}`);

    return data;
  } catch (error) {
    console.error(`Error ${symbol}:`, error.message);

    if (cache[symbol]) {
      return cache[symbol];
    }

    throw error;
  }
}

function generateCandles(price, high, low, volume) {
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

export function getCache() {
  return cache;
}

export function isCacheValid() {
  if (!cache.lastUpdate) return false;
  return (Date.now() - cache.lastUpdate) < 300000;
}
