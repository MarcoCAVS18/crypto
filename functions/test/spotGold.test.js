import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYahooDaily, getGoldSpotDaily, computeRegime, computePremium, SPOT_STALE_MS } from '../src/services/spotGold.js';

const DAY = 86400;

// Velas diarias sintéticas: precio por día vía `f(i)`
function candlesFrom(n, f, t0 = Date.UTC(2025, 0, 1) / 1000) {
  return Array.from({ length: n }, (_, i) => {
    const c = f(i);
    return { timestamp: (t0 + i * DAY) * 1000, open: c * 0.999, high: c * 1.004, low: c * 0.996, close: c, volume: 100 };
  });
}

function yahooJson(candles, { price, time } = {}) {
  return { chart: { result: [{
    meta: { regularMarketPrice: price ?? candles.at(-1).close, regularMarketTime: time ?? candles.at(-1).timestamp / 1000 },
    timestamp: candles.map(c => c.timestamp / 1000),
    indicators: { quote: [{
      open: candles.map(c => c.open), high: candles.map(c => c.high), low: candles.map(c => c.low),
      close: candles.map(c => c.close), volume: candles.map(c => c.volume)
    }] }
  }] } };
}

// ── parseo ──────────────────────────────────────────────────────────────────

test('parseYahooDaily: descarta días con nulos, ordena y toma el cotizado del meta', () => {
  const cs = candlesFrom(5, i => 2000 + i);
  const json = yahooJson(cs, { price: 2010.5, time: 1_800_000_000 });
  json.chart.result[0].indicators.quote[0].close[2] = null;               // día sin datos (feriado)
  const r = parseYahooDaily(json);
  assert.equal(r.candles.length, 4);
  assert.ok(r.candles.every((c, i) => i === 0 || c.timestamp > r.candles[i - 1].timestamp));
  assert.deepEqual(r.quote, { price: 2010.5, time: 1_800_000_000_000 });
});

test('parseYahooDaily: respuesta vacía o sin velas lanza error claro', () => {
  assert.throws(() => parseYahooDaily({ chart: { result: null } }), /sin datos/);
  assert.throws(() => parseYahooDaily({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{}] } }] } }), /sin velas válidas/);
});

test('getGoldSpotDaily: pide GC=F diario, tolera HTTP de error', async () => {
  let seen;
  const cs = candlesFrom(300, i => 2000 + i);
  const ok = async (url) => { seen = String(url); return { ok: true, json: async () => yahooJson(cs) }; };
  const r = await getGoldSpotDaily({ range: '2y', fetchImpl: ok });
  assert.match(seen, /GC%3DF/);
  assert.match(seen, /interval=1d/);
  assert.match(seen, /range=2y/);
  assert.equal(r.ticker, 'GC=F');
  assert.equal(r.candles.length, 300);
  await assert.rejects(() => getGoldSpotDaily({ fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
});

// ── régimen ─────────────────────────────────────────────────────────────────

test('computeRegime: tendencia alcista sostenida → bull en corto y largo plazo, EMA200 disponible', () => {
  const r = computeRegime(candlesFrom(300, i => 1800 + i * 3));
  assert.equal(r.alignment, 'bull');
  assert.equal(r.longAlignment, 'bull');
  assert.equal(r.trendLong, 'alcista');
  assert.ok(r.ema200 && r.ema20 > r.ema50 && r.ema50 > r.ema200);
  assert.ok(r.extension200Pct > 0);
  assert.ok(r.rsi > 60);
  assert.ok(r.atrPercent > 0);
  assert.equal(r.source, 'gc-futures');
  assert.equal(r.candleCount, 300);
});

test('computeRegime: tendencia bajista → bear', () => {
  const r = computeRegime(candlesFrom(300, i => 3000 - i * 3), 'paxg');
  assert.equal(r.alignment, 'bear');
  assert.equal(r.longAlignment, 'bear');
  assert.ok(r.extension200Pct < 0);
  assert.equal(r.source, 'paxg');
});

test('computeRegime: rebote corto dentro de una tendencia larga bajista → alineación mixta', () => {
  // 250 días cayendo y 25 días de rebote fuerte: sobre EMA20/50 pero aún bajo la EMA200
  const r = computeRegime(candlesFrom(275, i => (i < 250 ? 3000 - i * 4 : 2000 + (i - 250) * 12)));
  assert.equal(r.alignment, 'bull');
  assert.equal(r.trendLong, 'bajista');
  assert.notEqual(r.longAlignment, 'bull');
});

test('computeRegime: entre 50 y 199 velas no hay EMA200 (sin inventarla); <50 devuelve null', () => {
  const r = computeRegime(candlesFrom(120, i => 2000 + i));
  assert.equal(r.ema200, null);
  assert.equal(r.trendLong, null);
  assert.equal(r.longAlignment, null);
  assert.equal(r.extension200Pct, null);
  assert.ok(r.alignment);                                    // la regla histórica sigue funcionando
  assert.equal(computeRegime(candlesFrom(30, i => 2000 + i)), null);
  assert.equal(computeRegime(null), null);
});

// ── prima ───────────────────────────────────────────────────────────────────

test('computePremium: prima positiva/negativa y marca de referencia vieja', () => {
  const now = Date.parse('2026-09-28T15:00:00Z');
  const fresh = { price: 4000, time: now - 30 * 60 * 1000 };
  const p = computePremium(4012, fresh, now);
  assert.equal(p.premiumPct, 0.3);
  assert.equal(p.stale, false);
  assert.match(p.reference, /futuros/);
  assert.equal(computePremium(3980, fresh, now).premiumPct, -0.5);

  const weekend = { price: 4000, time: now - SPOT_STALE_MS - 1 };
  assert.equal(computePremium(4012, weekend, now).stale, true);
  assert.equal(computePremium(4012, { price: 4000 }, now).stale, true);       // sin hora → no confiable
});

test('computePremium: entradas inválidas devuelven null', () => {
  assert.equal(computePremium(0, { price: 4000 }), null);
  assert.equal(computePremium(4000, null), null);
  assert.equal(computePremium(4000, { price: 0 }), null);
});
