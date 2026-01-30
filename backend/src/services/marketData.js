import { getExchange, SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from '../config/exchange.js';

// Cache para almacenar datos temporalmente
const cache = {
  BTC: null,
  PAXG: null,
  lastUpdate: null
};

// Obtiene datos de mercado para un símbolo específico
export async function getCryptoData(symbol, timeframe = '4h', limit = 100) {
  const exchange = getExchange();
  const pair = SUPPORTED_SYMBOLS[symbol];

  if (!pair) {
    throw new Error(`Símbolo no soportado: ${symbol}`);
  }

  if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`Timeframe no soportado: ${timeframe}`);
  }

  try {
    // Obtener ticker actual
    const ticker = await exchange.fetchTicker(pair);

    // Obtener velas históricas
    const ohlcv = await exchange.fetchOHLCV(pair, timeframe, undefined, limit);

    // Formatear velas
    const candles = ohlcv.map(candle => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    }));

    const data = {
      symbol: symbol,
      pair: pair,
      price: ticker.last,
      change24h: ticker.percentage,
      volume: ticker.quoteVolume,
      high24h: ticker.high,
      low24h: ticker.low,
      candles: candles,
      timestamp: new Date().toISOString()
    };

    // Actualizar cache
    cache[symbol] = data;
    cache.lastUpdate = new Date();

    return data;
  } catch (error) {
    console.error(`Error obteniendo datos de ${symbol}:`, error.message);

    // Retornar cache si existe
    if (cache[symbol]) {
      console.log(`Usando datos en cache para ${symbol}`);
      return cache[symbol];
    }

    throw error;
  }
}

// Obtiene datos de múltiples timeframes para un símbolo
export async function getMultiTimeframeData(symbol) {
  const timeframes = ['1h', '4h', '1d'];
  const data = {};

  for (const tf of timeframes) {
    data[tf] = await getCryptoData(symbol, tf, 100);
  }

  return data;
}

// Obtiene el cache actual
export function getCache() {
  return cache;
}

// Verifica si el cache está actualizado (menos de 5 minutos)
export function isCacheValid() {
  if (!cache.lastUpdate) return false;
  const now = new Date();
  const diff = now - cache.lastUpdate;
  return diff < 5 * 60 * 1000; // 5 minutos
}
