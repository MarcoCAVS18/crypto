// Datos de mercado para XAUUSDT Perp
// Precio y velas: Yahoo Finance GC=F (gold futures, accesible desde GCP)
// Funding rate: Binance fapi (opcional — puede estar bloqueado según el proveedor)

import https from 'https';

const TIMEOUT_MS   = 10000;
const CACHE_MS     = 120_000; // 2 min
const cache        = {};

// ── Yahoo Finance (fuente principal) ────────────────────────────────────────

function fetchYahoo(path) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'application/json',
      },
      timeout: TIMEOUT_MS,
    };
    const req = https.get(`https://query1.finance.yahoo.com${path}`, options, (res) => {
      if ([301, 302].includes(res.statusCode) && res.headers.location) {
        return fetchYahoo(res.headers.location.replace('https://query1.finance.yahoo.com', ''))
          .then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Yahoo JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Yahoo timeout')); });
  });
}

async function getYahooFuturesData(ticker = 'GC=F') {
  const encoded = encodeURIComponent(ticker);

  // Quote: precio actual, cambio 24h, high/low
  const quoteJson = await fetchYahoo(
    `/v8/finance/chart/${encoded}?interval=1d&range=2d&includePrePost=false`
  );
  const result   = quoteJson.chart?.result?.[0];
  if (!result) throw new Error(`No Yahoo data for ${ticker}`);

  const meta      = result.meta;
  const price     = meta.regularMarketPrice ?? meta.price;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  if (price == null) throw new Error(`No price for ${ticker}`);

  const change24h = prevClose && prevClose > 0
    ? ((price - prevClose) / prevClose) * 100
    : 0;
  const high24h   = meta.regularMarketDayHigh  ?? price;
  const low24h    = meta.regularMarketDayLow   ?? price;

  // Velas 1d — sin auth (intraday requiere crumb en GCP)
  const klinesJson = await fetchYahoo(
    `/v8/finance/chart/${encoded}?interval=1d&range=60d&includePrePost=false`
  );
  const kResult = klinesJson.chart?.result?.[0];
  if (!kResult) throw new Error(`No klines for ${ticker}`);

  const timestamps = kResult.timestamp ?? [];
  const ohlcv      = kResult.indicators?.quote?.[0] ?? {};
  const opens      = ohlcv.open   ?? [];
  const highs      = ohlcv.high   ?? [];
  const lows       = ohlcv.low    ?? [];
  const closes     = ohlcv.close  ?? [];
  const volumes    = ohlcv.volume ?? [];

  const candles = timestamps.map((t, i) => ({
    timestamp: t * 1000,
    open:      opens[i]   ?? closes[i] ?? price,
    high:      highs[i]   ?? closes[i] ?? price,
    low:       lows[i]    ?? closes[i] ?? price,
    close:     closes[i]  ?? price,
    volume:    volumes[i] ?? 0,
  })).filter(c => c.close != null && !isNaN(c.close));

  return { price, change24h, high24h, low24h, candles };
}

// ── Binance fapi (opcional — solo para funding rate) ────────────────────────

async function getBinanceFundingRate(symbol = 'XAUUSDT') {
  return new Promise((resolve) => {
    const options = {
      headers: { 'Accept': 'application/json' },
      timeout: 8000,
    };
    const req = https.get(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
      options,
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const rate = parseFloat(json.lastFundingRate);
            const next = parseInt(json.nextFundingTime, 10);
            resolve(isNaN(rate) ? null : { rate: rate * 100, nextFundingTime: next });
          } catch { resolve(null); }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Datos completos de XAUUSDT Perp.
 * Usa Yahoo Finance (GC=F) para precio/velas; Binance para funding rate (opcional).
 */
export async function getFuturesData(symbol = 'XAUUSDT') {
  const cacheKey = symbol;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_MS) {
    return cache[cacheKey].data;
  }

  // GC=F = gold futures front-month (equivalent del perpetual de oro en Binance)
  const [yahooData, fundingData] = await Promise.all([
    getYahooFuturesData('GC=F'),
    getBinanceFundingRate(symbol),
  ]);

  const { price, change24h, high24h, low24h, candles } = yahooData;
  const fundingRate    = fundingData?.rate    ?? 0;
  const nextFundingTime = fundingData?.nextFundingTime ?? null;

  const data = {
    symbol,
    pair:             'XAUUSDT Perp',
    price,
    markPrice:        price,  // GC=F ≈ mark price (futuros front-month)
    indexPrice:       price,
    change24h,
    high24h,
    low24h,
    volume:           0,      // Yahoo v8 no da volumen confiable en 24h
    fundingRate:      fundingData ? fundingRate    : null,   // null si Binance no responde
    fundingRatePerDay: fundingData ? fundingRate * 3 : null,
    nextFundingTime,
    candles,
    candlesSource:    'yahoo-gcf',
    timestamp:        new Date().toISOString(),
    isFutures:        true,
    fundingAvailable: fundingData !== null,
  };

  cache[cacheKey] = { ts: Date.now(), data };
  console.log(`[XAUUSDT Futures] Price: $${price?.toFixed(2)} | Funding: ${fundingData ? `${fundingRate.toFixed(4)}%/8h` : 'N/A'}`);
  return data;
}

/**
 * Calcula el precio de liquidación estimado.
 */
export function calcLiquidationPrice(entry, leverage, direction) {
  const maintMargin      = 0.005;
  const initialMarginRate = 1 / leverage;
  if (direction === 'LONG') {
    return entry * (1 - initialMarginRate + maintMargin);
  }
  return entry * (1 + initialMarginRate - maintMargin);
}

/**
 * Calcula el tamaño de posición recomendado.
 */
export function calcPositionSize(capital, riskPercent, stopLossPct, leverage) {
  const maxLoss       = capital * (riskPercent / 100);
  const positionValue = maxLoss / (stopLossPct / 100);
  const margin        = positionValue / leverage;
  const capitalPct    = (margin / capital) * 100;
  return {
    positionValue: Math.round(positionValue * 100) / 100,
    margin:        Math.round(margin * 100) / 100,
    capitalPct:    Math.round(capitalPct * 10) / 10,
    maxLoss:       Math.round(maxLoss * 100) / 100,
  };
}
