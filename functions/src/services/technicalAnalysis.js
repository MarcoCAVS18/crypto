import { EMA, RSI, ATR } from 'technicalindicators';

// Calcula EMA (Exponential Moving Average)
export function calculateEMA(candles, period = 200) {
  const closes = candles.map(c => c.close);

  const result = EMA.calculate({
    period: period,
    values: closes
  });

  return result;
}

// Calcula RSI (Relative Strength Index)
export function calculateRSI(candles, period = 14) {
  const closes = candles.map(c => c.close);

  const result = RSI.calculate({
    period: period,
    values: closes
  });

  return result;
}

// Calcula ATR (Average True Range) para volatilidad
export function calculateATR(candles, period = 14) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);

  const result = ATR.calculate({
    period: period,
    high: high,
    low: low,
    close: close
  });

  return result;
}

// Ventana del VWAP: 24 horas REALES, sea cual sea el timeframe de las velas (24 velas de 1h,
// 6 de 4h). Antes eran 24 velas fijas: con velas de 4h serían 4 días.
export const VWAP_WINDOW_MS = 24 * 3600 * 1000;

/** Cantidad de velas que cubren VWAP_WINDOW_MS según el espaciado (mediana de las últimas diferencias). */
export function vwapWindowCandles(candles) {
  const ts = candles.slice(-11).map(c => c.timestamp).filter(Number.isFinite);
  const diffs = [];
  for (let i = 1; i < ts.length; i++) diffs.push(ts[i] - ts[i - 1]);
  diffs.sort((a, b) => a - b);
  const spacing = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
  return spacing > 0 ? Math.max(1, Math.round(VWAP_WINDOW_MS / spacing)) : candles.length;
}

// Calcula VWAP (Volume Weighted Average Price) acumulado sobre las velas dadas
export function calculateVWAP(candles) {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  const vwapValues = [];

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    // Sin volumen acumulado (velas de volumen 0) el VWAP degenera al precio típico
    vwapValues.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice);
  }

  return vwapValues;
}

// Identifica swing highs y swing lows
export function findSwingPoints(candles, lookback = 5) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isSwingHigh = true;
    let isSwingLow = true;

    // Verificar si es swing high
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i) {
        if (candles[j].high >= currentHigh) {
          isSwingHigh = false;
        }
        if (candles[j].low <= currentLow) {
          isSwingLow = false;
        }
      }
    }

    if (isSwingHigh) {
      swingHighs.push({
        index: i,
        price: currentHigh,
        timestamp: candles[i].timestamp
      });
    }

    if (isSwingLow) {
      swingLows.push({
        index: i,
        price: currentLow,
        timestamp: candles[i].timestamp
      });
    }
  }

  return { swingHighs, swingLows };
}

// Calcula todos los indicadores para un set de velas
export function calculateAllIndicators(candles) {
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const ema100 = calculateEMA(candles, 100);
  const ema200 = calculateEMA(candles, 200);
  const rsi = calculateRSI(candles, 14);
  const atr = calculateATR(candles, 14);
  const vwap = calculateVWAP(candles.slice(-vwapWindowCandles(candles)));
  const swingPoints = findSwingPoints(candles, 5);

  // Obtener últimos valores
  const lastIndex = candles.length - 1;
  const currentPrice = candles[lastIndex].close;

  return {
    ema: {
      ema20: ema20[ema20.length - 1],
      ema50: ema50[ema50.length - 1],
      ema100: ema100[ema100.length - 1],
      ema200: ema200[ema200.length - 1]
    },
    rsi: rsi[rsi.length - 1],
    atr: atr[atr.length - 1],
    vwap: vwap[vwap.length - 1],
    swingPoints: swingPoints,
    currentPrice: currentPrice,
    // Tendencia corto plazo (precio vs EMA20)
    trendShort: currentPrice > ema20[ema20.length - 1] ? 'alcista' : 'bajista',
    // Tendencia largo plazo (precio vs EMA200)
    trendLong: ema200.length > 0 && currentPrice > ema200[ema200.length - 1] ? 'alcista' : 'bajista'
  };
}

// Analiza el volumen de la última vela respecto al promedio de las `period` velas
// ANTERIORES (la vela actual no entra en su propio promedio). Se asume que la última
// vela está cerrada (ver normalizeCandles).
export function analyzeVolume(candles, period = 20) {
  const volumes = candles.map(c => c.volume);
  const currentVolume = volumes[volumes.length - 1];
  const previous = volumes.slice(-(period + 1), -1);
  const avgVolume = previous.length > 0
    ? previous.reduce((a, b) => a + b, 0) / previous.length
    : 0;

  if (!(avgVolume > 0) || !Number.isFinite(currentVolume)) {
    return { current: currentVolume, average: avgVolume, ratio: 1, status: 'normal' };
  }

  const ratio = currentVolume / avgVolume;

  let status;
  if (ratio > 1.5) {
    status = 'muy_alto';
  } else if (ratio > 1.1) {
    status = 'creciendo';
  } else if (ratio < 0.5) {
    status = 'muy_bajo';
  } else if (ratio < 0.9) {
    status = 'decreciendo';
  } else {
    status = 'normal';
  }

  return {
    current: currentVolume,
    average: avgVolume,
    ratio: ratio,
    status: status
  };
}
