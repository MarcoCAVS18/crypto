import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planGranularity, aggregateCandles, planWindows, mergeCandles, MAX_CANDLES_PER_REQUEST, GRANULARITY_SECONDS
} from '../src/services/candles.js';
import { fetchCandlesSeconds } from '../src/services/marketData.js';

const H = 3600 * 1000;
const c = (ts, o, h, l, cl, v = 1) => ({ timestamp: ts, open: o, high: h, low: l, close: cl, volume: v });

// ── planGranularity ─────────────────────────────────────────────────────────

test('planGranularity: nativas directo, 4h desde 1h, otras desde la nativa que divide', () => {
  assert.deepEqual(planGranularity(900), { baseSeconds: 900, factor: 1 });
  assert.deepEqual(planGranularity(86400), { baseSeconds: 86400, factor: 1 });
  assert.deepEqual(planGranularity(14400), { baseSeconds: 3600, factor: 4 });   // Coinbase no sirve 4h
  assert.deepEqual(planGranularity(43200), { baseSeconds: 21600, factor: 2 });  // 12h desde 6h
  assert.deepEqual(planGranularity(5400), { baseSeconds: 900, factor: 6 });
  assert.throws(() => planGranularity(7), /no soportada/);
  assert.equal(GRANULARITY_SECONDS['15m'], 900);
});

// ── aggregateCandles ────────────────────────────────────────────────────────

test('aggregateCandles: 4h alineado a UTC, OHLCV correcto', () => {
  const t0 = Date.UTC(2026, 8, 28, 0, 0);                       // 00:00 UTC = inicio de balde 4h
  const hourly = [
    c(t0 + 0 * H, 100, 105, 99, 102, 10),
    c(t0 + 1 * H, 102, 110, 101, 108, 20),
    c(t0 + 2 * H, 108, 109, 95, 96, 30),
    c(t0 + 3 * H, 96, 100, 94, 99, 40),
    c(t0 + 4 * H, 99, 101, 98, 100, 5),                        // siguiente balde (04–08)
  ];
  const now = t0 + 12 * H;
  const out = aggregateCandles(hourly, 14400, now);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { timestamp: t0, open: 100, high: 110, low: 94, close: 99, volume: 100 });
  assert.equal(out[1].timestamp, t0 + 4 * H);
  assert.equal(out[1].volume, 5);
});

test('aggregateCandles: descarta el balde en formación y tolera horas faltantes', () => {
  const t0 = Date.UTC(2026, 8, 28, 0, 0);
  const hourly = [c(t0 + 1 * H, 1, 2, 1, 2), c(t0 + 3 * H, 2, 3, 2, 3),   // faltan la hora 0 y 2
                  c(t0 + 4 * H, 3, 4, 3, 4)];                              // balde 04–08 en curso
  const now = t0 + 5 * H;
  const out = aggregateCandles(hourly, 14400, now);
  assert.equal(out.length, 1);                                            // solo 00–04 (cerrado)
  assert.equal(out[0].open, 1);
  assert.equal(out[0].close, 3);
  assert.deepEqual(aggregateCandles([], 14400, now), []);
});

// ── planWindows / mergeCandles ─────────────────────────────────────────────

test('planWindows: ninguna ventana supera 300 velas, contiguas y cubren lo pedido', () => {
  const end = Date.UTC(2026, 8, 28, 9, 0);
  const w = planWindows(1004, 3600, end);
  assert.equal(w.length, 4);
  for (const x of w) assert.ok((x.end - x.start) / H <= MAX_CANDLES_PER_REQUEST, 'ventana > 300 velas');
  assert.equal(w[0].end, end);
  for (let i = 1; i < w.length; i++) assert.equal(w[i].end, w[i - 1].start);       // contiguas
  assert.ok((w[0].end - w[w.length - 1].start) / H >= 1004);
  assert.equal(planWindows(100, 3600, end).length, 1);
  assert.deepEqual(planWindows(0, 3600, end), []);
});

test('mergeCandles: sin duplicados y ordenado', () => {
  const m = mergeCandles([[c(3, 0, 0, 0, 0), c(1, 0, 0, 0, 0)], [c(2, 0, 0, 0, 0), c(3, 9, 9, 9, 9)]]);
  assert.deepEqual(m.map(x => x.timestamp), [1, 2, 3]);
});

// ── fetchCandlesSeconds con un Coinbase simulado ───────────────────────────

const NOW = Date.UTC(2026, 8, 28, 9, 20);          // 09:20 UTC: la vela de 1h de las 09:00 está en curso

// Hora h (índice desde NOW hacia atrás), con huecos como en un par poco líquido
function coinbaseMock({ gapEvery = 0 } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const start = Date.parse(u.searchParams.get('start'));
    const end   = Date.parse(u.searchParams.get('end'));
    const gran  = Number(u.searchParams.get('granularity'));
    calls.push({ start, end, gran });
    if ((end - start) / (gran * 1000) > MAX_CANDLES_PER_REQUEST) {
      return { ok: false, status: 400, text: async () => 'granularity too small for the requested time range' };
    }
    const rows = [];
    const stepMs = gran * 1000;
    for (let t = Math.floor(end / stepMs) * stepMs; t >= start; t -= stepMs) {
      const idx = Math.round((NOW - t) / stepMs);
      if (gapEvery && idx % gapEvery === 3) continue;                      // hora sin operaciones
      const close = 4000 + (Math.floor(t / stepMs) % 50);
      rows.push([t / 1000, close - 2, close + 3, close - 1, close, 5]);     // [time, low, high, open, close, volume]
    }
    return { ok: true, json: async () => rows };
  };
  return calls;
}

test('P1/B3a: 250 velas de 4h se arman desde 1h con 4 requests, todas dentro del límite de 300', async () => {
  const calls = coinbaseMock();
  const out = await fetchCandlesSeconds('PAXG-USD', 14400, 250, NOW);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(x => x.gran === 3600));
  assert.equal(out.length, 250);
  assert.ok(out.every(x => x.timestamp % (4 * H) === 0), 'velas 4h alineadas a 00/04/08/… UTC');
  assert.ok(out.every((x, i) => i === 0 || x.timestamp > out[i - 1].timestamp));
  assert.ok(out.at(-1).timestamp + 4 * H <= NOW, 'la vela 08–12 está en curso y no debe aparecer');
  assert.equal(out.at(-1).timestamp, Date.UTC(2026, 8, 28, 4, 0));           // 04–08 es la última cerrada
});

test('P1: un par poco líquido con horas sin operaciones igual arma velas de 4h', async () => {
  coinbaseMock({ gapEvery: 5 });
  const out = await fetchCandlesSeconds('PAXG-USD', 14400, 100, NOW);
  assert.equal(out.length, 100);
  assert.ok(out.every(x => Number.isFinite(x.close) && x.volume > 0));
});

test('P1/B15: 15m es nativa (una request, granularity=900) y devuelve velas de 15 minutos', async () => {
  const calls = coinbaseMock();
  const out = await fetchCandlesSeconds('PAXG-USD', 900, 96, NOW);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].gran, 900);
  assert.equal(out.length, 96);
  assert.equal(out[1].timestamp - out[0].timestamp, 15 * 60 * 1000);
});

test('P1: más de 300 velas diarias se paginan; granularidad no servible falla claro', async () => {
  const calls = coinbaseMock();
  const out = await fetchCandlesSeconds('PAXG-USD', 86400, 500, NOW);
  assert.equal(calls.length, 2);
  assert.equal(out.length, 500);
  await assert.rejects(() => fetchCandlesSeconds('PAXG-USD', 7, 10, NOW), /no soportada/);
});

test('P1: si Coinbase no devuelve ninguna vela cerrada, falla (para que el llamador use stale/sintético)', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  await assert.rejects(() => fetchCandlesSeconds('PAXG-USD', 14400, 50, NOW), /No closed candles/);
});
