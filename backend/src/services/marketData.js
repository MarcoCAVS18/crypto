// Usa CoinGecko API (sin restricciones geográficas)

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  PAXG: 'pax-gold'
};

// Delay para evitar rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

  try {
    // Obtener precio actual y datos de mercado
    // Usar cache si existe y es válido (evita rate limiting)
    if (cache[symbol] && (Date.now() - new Date(cache[symbol].timestamp).getTime()) < 60000) {
      return cache[symbol];
    }

    const marketRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
    const marketData = await marketRes.json();

    if (!marketData?.market_data?.current_price?.usd) {
      console.error('CoinGecko response:', JSON.stringify(marketData));
      if (cache[symbol]) return cache[symbol];
      throw new Error(`No se pudo obtener precio para ${symbol}`);
    }

    await delay(500); // Evitar rate limit

    // Obtener datos históricos para velas
    const days = timeframe === '1d' ? 90 : timeframe === '4h' ? 30 : 7;
    const historyRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
    );
    const ohlcData = await historyRes.json();

    // Formatear velas (validar que sea array)
    let candles = (Array.isArray(ohlcData) ? ohlcData : []).map(c => ({
      timestamp: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: marketData.market_data?.total_volume?.usd || 0
    }));

    // Si no hay velas, crear sintéticas con precio actual
    if (candles.length === 0) {
      const price = marketData.market_data.current_price.usd;
      const now = Date.now();
      candles = Array.from({ length: 50 }, (_, i) => ({
        timestamp: now - (50 - i) * 3600000,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: marketData.market_data?.total_volume?.usd || 0
      }));
    }

    const data = {
      symbol: symbol,
      pair: `${symbol}/USDT`,
      price: marketData.market_data.current_price.usd,
      change24h: marketData.market_data.price_change_percentage_24h,
      volume: marketData.market_data.total_volume.usd,
      high24h: marketData.market_data.high_24h.usd,
      low24h: marketData.market_data.low_24h.usd,
      candles: candles.slice(-limit),
      timestamp: new Date().toISOString()
    };

    cache[symbol] = data;
    cache.lastUpdate = new Date();

    return data;
  } catch (error) {
    console.error(`Error obteniendo datos de ${symbol}:`, error.message);

    if (cache[symbol]) {
      console.log(`Usando datos en cache para ${symbol}`);
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
