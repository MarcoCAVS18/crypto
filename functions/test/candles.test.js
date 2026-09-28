import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandles, getCryptoData, getCache } from '../src/services/marketData.js';
import { analyzeVolume, calculateAllIndicators, calculateVWAP, VWAP_WINDOW } from '../src/services/technicalAnalysis.js';
import { makeDecision } from '../src/services/decisionEngine.js';

const H = 3600;

// Coinbase: [time(s), low, high, open, close, volume], newest-first
const row = (tsSec, close = 100, vol = 10) => [tsSec, close - 1, close + 1, close, close, vol];

// ── B3b: vela en formación ─────────────────────────────────────────────────

test('B3: normalizeCandles ordena cronológicamente y descarta la vela en formación', () => {
  const now = Date.UTC(2026, 8, 28, 12, 20, 0);             // 12:20
  const hourStart = Math.floor(now / 1000 / H) * H;          // 12:00 (vela en curso)
  const rows = [row(hourStart), row(hourStart - H), row(hourStart - 2 * H)];   // newest-first
  const out = normalizeCandles(rows, H, now);
  assert.equal(out.length, 2);
  assert.equal(out[0].timestamp, (hourStart - 2 * H) * 1000);
  assert.equal(out[1].timestamp, (hourStart - H) * 1000);
  assert.ok(out[0].timestamp < out[1].timestamp);
});

test('B3: una vela cerrada exactamente ahora SÍ se incluye', () => {
  const now = Date.UTC(2026, 8, 28, 12, 0, 0);
  const rows = [row(now / 1000 - H)];                        // 11:00–12:00 cerró justo
  assert.equal(normalizeCandles(rows, H, now).length, 1);
});

test('B3: filas corruptas se descartan y entrada inválida devuelve []', () => {
  const now = Date.UTC(2026, 8, 28, 12, 20, 0);
  const good = row(Math.floor(now / 1000 / H) * H - H);
  assert.equal(normalizeCandles([good, ['x', null, null, null, 'NaN', null]], H, now).length, 1);
  assert.deepEqual(normalizeCandles(null, H, now), []);
});

// ── B3: volumen sin la vela actual ─────────────────────────────────────────

const flat = (n, vol) => Array.from({ length: n }, (_, i) => ({ timestamp: i, open: 100, high: 101, low: 99, close: 100, volume: vol }));

test('B3: el volumen de la última vela se compara con el promedio de las ANTERIORES', () => {
  const candles = [...flat(30, 100), { timestamp: 31, open: 100, high: 101, low: 99, close: 100, volume: 200 }];
  const v = analyzeVolume(candles);
  assert.equal(v.average, 100);
  assert.equal(v.ratio, 2);                 // antes: 200 / ((19*100+200)/20) = 1.90
  assert.equal(v.status, 'muy_alto');
});

test('B3: volumen igual al promedio es "normal"', () => {
  assert.equal(analyzeVolume(flat(40, 50)).status, 'normal');
});

test('B3: sin historial o volumen cero no produce NaN', () => {
  const one = analyzeVolume(flat(1, 10));
  assert.equal(one.status, 'normal');
  assert.equal(one.ratio, 1);
  const zero = analyzeVolume(flat(30, 0));
  assert.equal(zero.status, 'normal');
  assert.ok(Number.isFinite(zero.ratio));
});

// ── B3e: VWAP ──────────────────────────────────────────────────────────────

test('B3: el VWAP de los indicadores usa solo las últimas 24 velas', () => {
  // 260 velas: las primeras 236 a 1000, las últimas 24 a 2000 (mismo volumen)
  const candles = Array.from({ length: 260 }, (_, i) => {
    const p = i < 236 ? 1000 : 2000;
    return { timestamp: i, open: p, high: p, low: p, close: p, volume: 10 };
  });
  const ind = calculateAllIndicators(candles);
  assert.equal(VWAP_WINDOW, 24);
  assert.ok(Math.abs(ind.vwap - 2000) < 1e-9, `vwap=${ind.vwap}`);
});

test('B3: VWAP con volumen 0 degrada al precio típico (sin NaN)', () => {
  const v = calculateVWAP([{ high: 12, low: 8, close: 10, volume: 0 }]);
  assert.equal(v[0], 10);
});

// ── B3c: nunca decidir con velas sintéticas ────────────────────────────────

const zones = { buy: { min: 3900, max: 3950 }, neutral: { min: 3950, max: 4050 }, sell: { min: 4050, max: 4100 }, currentZone: 'buy' };
const risk_on = { mode: 'risk_on', score: 0.6, reasons: [] };
const state = { cashPercent: 70, mode: 'inversion', totalCapital: 10000 };

test('B3: con velas sintéticas el motor devuelve WAIT aunque todo sea BUY', () => {
  const real = makeDecision(risk_on, zones, 3940, state, { rsi: 40 }, 'PAXG', null, { candlesSource: 'real' });
  assert.equal(real.action, 'BUY');
  const synth = makeDecision(risk_on, zones, 3940, state, { rsi: 40 }, 'PAXG', null, { candlesSource: 'synthetic' });
  assert.equal(synth.action, 'WAIT');
  assert.deepEqual(synth.operations, []);
  assert.match(synth.reason, /sintéticas/);
});

test('B3: velas "stale" (reales, algo viejas) sí permiten decidir', () => {
  const d = makeDecision(risk_on, zones, 3940, state, { rsi: 40 }, 'PAXG', null, { candlesSource: 'stale' });
  assert.equal(d.action, 'BUY');
});

// ── getCryptoData: fallback stale antes que sintético ──────────────────────

const realRows = (nowMs, n = 60) => Array.from({ length: n }, (_, i) => {
  const t = Math.floor(nowMs / 1000 / H) * H - (i + 1) * H;   // newest-first, todas cerradas
  return row(t, 4000 + i, 10);
});

function mockFetch({ candlesOk }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/spot'))   return { ok: true, json: async () => ({ data: { amount: '4000.5' } }) };
    if (u.includes('/stats'))  return { ok: true, json: async () => ({ high: '4050', low: '3950', open: '3990', volume_30day: '1000' }) };
    if (u.includes('/candles')) {
      if (!candlesOk) return { ok: false, status: 500, text: async () => 'boom' };
      return { ok: true, json: async () => realRows(Date.now()) };
    }
    throw new Error('url inesperada ' + u);
  };
}

const realFetch = globalThis.fetch;
beforeEach(() => { for (const k of Object.keys(getCache())) delete getCache()[k]; });

test('B3: si fallan las velas y no hay respaldo real → sintéticas (marcadas)', async () => {
  mockFetch({ candlesOk: false });
  const d = await getCryptoData('PAXG');
  assert.equal(d.candlesSource, 'synthetic');
  globalThis.fetch = realFetch;
});

test('B3: si fallan las velas pero hay velas reales recientes → "stale", nunca sintéticas', async () => {
  mockFetch({ candlesOk: true });
  const first = await getCryptoData('PAXG');
  assert.equal(first.candlesSource, 'real');
  assert.ok(first.candles.length > 0);
  // Vencer el TTL de 2 min del caché para forzar un nuevo fetch
  getCache().PAXG.timestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  mockFetch({ candlesOk: false });
  const second = await getCryptoData('PAXG');
  assert.equal(second.candlesSource, 'stale');
  assert.equal(second.candles.length, first.candles.length);
  globalThis.fetch = realFetch;
});
