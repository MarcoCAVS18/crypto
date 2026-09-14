// Binance USDM Futures API — datos de mercado para perpetuos (XAUUSDT, etc.)

const BINANCE_FUTURES_BASE = 'https://fapi.binance.com/fapi/v1';
const TIMEOUT_MS = 10000;

const cache = {};

async function fetchBinance(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BINANCE_FUTURES_BASE}${path}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Binance Futures API ${res.status}: ${path}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Datos completos de un perpetuo de Binance Futures.
 * @param {string} symbol  e.g. 'XAUUSDT'
 * @returns {object}  price, markPrice, change24h, volume, fundingRate, candles, ...
 */
export async function getFuturesData(symbol) {
  const sym = symbol.toUpperCase();

  // Cache 2 min
  if (cache[sym] && Date.now() - cache[sym].ts < 120_000) {
    return cache[sym].data;
  }

  const [ticker, premium, klines] = await Promise.all([
    fetchBinance(`/ticker/24hr?symbol=${sym}`),
    fetchBinance(`/premiumIndex?symbol=${sym}`),
    fetchBinance(`/klines?symbol=${sym}&interval=1h&limit=250`),
  ]);

  const price      = parseFloat(ticker.lastPrice);
  const markPrice  = parseFloat(premium.markPrice);
  const indexPrice = parseFloat(premium.indexPrice);
  const change24h  = parseFloat(ticker.priceChangePercent);
  const high24h    = parseFloat(ticker.highPrice);
  const low24h     = parseFloat(ticker.lowPrice);
  const volume     = parseFloat(ticker.volume);

  // Funding rate: valor cada 8h (Binance devuelve como decimal, ej: 0.0001 = 0.01%)
  const fundingRate    = parseFloat(premium.lastFundingRate);
  const nextFundingMs  = parseInt(premium.nextFundingTime, 10);
  const fundingRatePct = fundingRate * 100;

  const candles = klines.map(([time, open, high, low, close, vol]) => ({
    timestamp: parseInt(time, 10),
    open:      parseFloat(open),
    high:      parseFloat(high),
    low:       parseFloat(low),
    close:     parseFloat(close),
    volume:    parseFloat(vol),
  }));

  const data = {
    symbol: sym,
    pair: `${sym} Perp`,
    price,
    markPrice,
    indexPrice,
    change24h,
    high24h,
    low24h,
    volume,
    fundingRate: fundingRatePct,       // % cada 8h
    fundingRatePerDay: fundingRatePct * 3, // % por día (3 fundings de 8h)
    nextFundingTime: nextFundingMs,
    candles,
    candlesSource: 'real',
    timestamp: new Date().toISOString(),
    isFutures: true,
  };

  cache[sym] = { ts: Date.now(), data };
  console.log(`[${sym} Futures] Mark: $${markPrice.toFixed(2)} | Funding: ${fundingRatePct.toFixed(4)}%/8h`);
  return data;
}

/**
 * Calcula el precio de liquidación estimado.
 * @param {number} entry    precio de entrada
 * @param {number} leverage apalancamiento
 * @param {'LONG'|'SHORT'} direction
 */
export function calcLiquidationPrice(entry, leverage, direction) {
  // Margen de mantenimiento ~0.5% aprox. (Binance cross-margin)
  const maintMargin = 0.005;
  const initialMarginRate = 1 / leverage;
  if (direction === 'LONG') {
    return entry * (1 - initialMarginRate + maintMargin);
  }
  return entry * (1 + initialMarginRate - maintMargin);
}

/**
 * Calcula el tamaño de posición recomendado.
 * @param {number} capital       capital total en USD
 * @param {number} riskPercent   % del capital a arriesgar (ej: 2)
 * @param {number} stopLossPct   % de SL desde entry (ej: 1.5)
 * @param {number} leverage
 */
export function calcPositionSize(capital, riskPercent, stopLossPct, leverage) {
  const maxLoss      = capital * (riskPercent / 100);
  // Valor de posición = maxLoss / (SL% / 100)
  const positionValue = maxLoss / (stopLossPct / 100);
  // Capital comprometido como margen
  const margin        = positionValue / leverage;
  const capitalPct    = (margin / capital) * 100;
  return {
    positionValue: Math.round(positionValue * 100) / 100,
    margin:        Math.round(margin * 100) / 100,
    capitalPct:    Math.round(capitalPct * 10) / 10,
    maxLoss:       Math.round(maxLoss * 100) / 100,
  };
}
