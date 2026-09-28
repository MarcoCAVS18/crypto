// Oro "spot" de referencia (futuros COMEX GC=F, Yahoo) para:
//   1. Régimen de tendencia con historia larga: PAXG solo aporta ~120 velas diarias (sin EMA200);
//      GC=F da años. PAXG sigue al oro, así que el régimen del oro es el régimen de PAXG.
//   2. Prima/descuento de PAXG vs el oro (costo de entrada real; PAXG cotiza 24/7 y ilíquido).
//
// Aclaración honesta: GC=F es un FUTURO (contrato del mes más líquido) y su precio incluye la
// base de futuros (contango de unas décimas de %), así que la "prima" de PAXG vs GC=F queda
// sesgada a la baja esa cantidad. Es una referencia, no el spot exacto.
//
// Endpoint no oficial de Yahoo: si falla, el llamador cae a las velas diarias de PAXG.

import { EMA, RSI, ATR } from 'technicalindicators';

const TICKER = 'GC=F';
const TIMEOUT_MS = 10000;

// El cotizado del futuro se considera "viejo" si tiene más de 6 h (mercado cerrado / fin de semana)
export const SPOT_STALE_MS = 6 * 3600 * 1000;

/**
 * Respuesta de Yahoo chart → { candles diarias ascendentes, quote }.
 * quote = último precio (`regularMarketPrice`) y su hora.
 */
export function parseYahooDaily(json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${TICKER}: sin datos`);

  const ts = result.timestamp ?? [];
  const q  = result.indicators?.quote?.[0] ?? {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
      candles.push({ timestamp: ts[i] * 1000, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
  }
  candles.sort((a, b) => a.timestamp - b.timestamp);

  const meta = result.meta ?? {};
  const price = meta.regularMarketPrice ?? candles.at(-1)?.close ?? null;
  const time  = meta.regularMarketTime ? meta.regularMarketTime * 1000 : candles.at(-1)?.timestamp ?? null;
  if (candles.length === 0 || price == null) throw new Error(`Yahoo ${TICKER}: sin velas válidas`);

  return { candles, quote: { price, time } };
}

/**
 * Velas diarias de GC=F (~2 años por defecto).
 * @returns {Promise<{ ticker, candles, quote, fetchedAt }>}
 */
export async function getGoldSpotDaily({ range = '2y', fetchImpl = fetch } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(TICKER)}?interval=1d&range=${range}&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Yahoo ${TICKER} HTTP ${res.status}`);
    const parsed = parseYahooDaily(await res.json());
    return { ticker: TICKER, ...parsed, fetchedAt: new Date().toISOString() };
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? `Yahoo ${TICKER}: timeout` : err.message);
  } finally {
    clearTimeout(timer);
  }
}

const last = (a) => a[a.length - 1];
const round = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/**
 * Régimen de tendencia diario. `alignment` conserva la regla histórica (precio vs EMA20 y EMA50) para
 * no cambiar el score; se agregan la tendencia larga (EMA200), la extensión sobre ella y el ATR%.
 *
 * @param {Array} candles - diarias ascendentes
 * @param {string} source - 'gc-futures' | 'paxg'
 * @returns {object|null} null con menos de 50 velas
 */
export function computeRegime(candles, source = 'gc-futures') {
  if (!candles || candles.length < 50) return null;
  const closes = candles.map(c => c.close);
  const price = last(closes);

  const ema20  = last(EMA.calculate({ period: 20,  values: closes }));
  const ema50  = last(EMA.calculate({ period: 50,  values: closes }));
  const e200   = candles.length >= 200 ? EMA.calculate({ period: 200, values: closes }) : [];
  const ema200 = e200.length ? last(e200) : null;
  const rsi    = last(RSI.calculate({ period: 14, values: closes })) ?? null;
  const atr    = last(ATR.calculate({ period: 14, high: candles.map(c => c.high), low: candles.map(c => c.low), close: closes })) ?? null;

  const trendShort = price > ema20 ? 'alcista' : 'bajista';
  const trendMed   = price > ema50 ? 'alcista' : 'bajista';
  const alignment  = trendShort === 'alcista' && trendMed === 'alcista' ? 'bull'
                   : trendShort === 'bajista' && trendMed === 'bajista' ? 'bear' : 'mixed';

  let trendLong = null, longAlignment = null;
  if (ema200 != null) {
    trendLong = price > ema200 ? 'alcista' : 'bajista';
    longAlignment = price > ema200 && ema50 > ema200 ? 'bull'
                  : price < ema200 && ema50 < ema200 ? 'bear' : 'mixed';
  }

  return {
    source,
    trendShort, trendMed, trendLong,
    rsi: round(rsi, 1),
    ema20: round(ema20), ema50: round(ema50), ema200: round(ema200),
    alignment,
    longAlignment,                                                   // régimen de largo plazo (necesita ≥200 velas)
    extension200Pct: ema200 ? round((price / ema200 - 1) * 100, 2) : null,   // qué tan estirado está sobre la EMA200
    atrPercent: atr ? round((atr / price) * 100, 3) : null,
    candleCount: candles.length
  };
}

/**
 * Prima (+) o descuento (−) de PAXG contra el oro de referencia, en %.
 * `stale` = el cotizado de referencia es viejo (mercado cerrado): la prima del fin de semana es ruido.
 */
export function computePremium(paxgPrice, quote, now = Date.now()) {
  if (!(paxgPrice > 0) || !(quote?.price > 0)) return null;
  return {
    premiumPct: round(((paxgPrice - quote.price) / quote.price) * 100, 3),
    referencePrice: round(quote.price),
    referenceTime: quote.time ? new Date(quote.time).toISOString() : null,
    stale: quote.time ? now - quote.time > SPOT_STALE_MS : true,
    reference: 'GC=F (futuros COMEX, incluye base de futuros)'
  };
}
