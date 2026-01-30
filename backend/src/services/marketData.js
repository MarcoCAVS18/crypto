// Usa CoinGecko API - endpoint simple (menos rate limiting)

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  PAXG: 'pax-gold'
};

const cache = {
  BTC: null,
  PAXG: null,
  lastUpdate: null
};

// Obtiene datos de mercado usando CoinGecko
export async function getCryptoData(symbol, timeframe = '4h', limit = 100) {
  const coinId = COINGECKO_IDS[symbol];

  if (!coinId) {
    throw new Error(`Símbolo no soportado: ${symbol}`);
  }

  // Usar cache si es válido (2 minutos)
  if (cache[symbol] && (Date.now() - new Date(cache[symbol].timestamp).getTime()) < 120000) {
    console.log(`Usando cache para ${symbol}`);
    return cache[symbol];
  }

  try {
    // Endpoint simple (menos rate limiting)
    const priceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_low=true`
    );
    const priceData = await priceRes.json();

    if (!priceData?.[coinId]?.usd) {
      console.error('CoinGecko response:', JSON.stringify(priceData));
      if (cache[symbol]) return cache[symbol];
      throw new Error(`No se pudo obtener precio para ${symbol}`);
    }

    const coinData = priceData[coinId];
    const price = coinData.usd;

    // Generar velas sintéticas basadas en high/low
    const high = coinData.usd_24h_high || price * 1.02;
    const low = coinData.usd_24h_low || price * 0.98;
    const now = Date.now();

    const candles = Array.from({ length: 50 }, (_, i) => {
      const progress = i / 49;
      const variance = (Math.random() - 0.5) * (high - low) * 0.3;
      const candlePrice = low + (high - low) * progress + variance;
      return {
        timestamp: now - (50 - i) * 3600000,
        open: candlePrice * (1 - Math.random() * 0.005),
        high: candlePrice * (1 + Math.random() * 0.01),
        low: candlePrice * (1 - Math.random() * 0.01),
        close: candlePrice,
        volume: coinData.usd_24h_vol || 1000000
      };
    });

    const data = {
      symbol: symbol,
      pair: `${symbol}/USDT`,
      price: price,
      change24h: coinData.usd_24h_change || 0,
      volume: coinData.usd_24h_vol || 0,
      high24h: high,
      low24h: low,
      candles: candles,
      timestamp: new Date().toISOString()
    };

    cache[symbol] = data;
    cache.lastUpdate = new Date();
    console.log(`Datos actualizados para ${symbol}: $${price}`);

    return data;
  } catch (error) {
    console.error(`Error obteniendo datos de ${symbol}:`, error.message);

    if (cache[symbol]) {
      console.log(`Usando cache para ${symbol} tras error`);
      return cache[symbol];
    }

    throw error;
  }
}

export function getCache() {
  return cache;
}

export function isCacheValid() {
  if (!cache.lastUpdate) return false;
  const diff = new Date() - cache.lastUpdate;
  return diff < 5 * 60 * 1000;
}
