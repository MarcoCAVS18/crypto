import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRED_SERIES, parseFredObservations, computeSeriesFeatures, fetchFredSeries, getFredMacro, applyFredFallbacks
} from '../src/services/fredService.js';

const DAY = 86400000;
const NOW = Date.parse('2026-09-28T12:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// n observaciones diarias terminando en `lastDate`, valor lineal de v0 a v1
function series(n, v0, v1, lastDate = '2026-09-25') {
  const end = Date.parse(`${lastDate}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    realtime_start: '2026-09-28', realtime_end: '2026-09-28',
    date: iso(end - (n - 1 - i) * DAY), value: String(v0 + ((v1 - v0) * i) / (n - 1))
  }));
}

// ── parseo ──────────────────────────────────────────────────────────────────

test('parseFredObservations: descarta "." y vacíos (Number("") sería 0) y ordena', () => {
  const r = parseFredObservations({ observations: [
    { date: '2026-09-24', value: '1.90' },
    { date: '2026-09-23', value: '.' },
    { date: '2026-09-22', value: '' },
    { date: '2026-09-21', value: '1.85' },
    { date: '2026-09-25', value: 'abc' }
  ] });
  assert.deepEqual(r, [{ date: '2026-09-21', value: 1.85 }, { date: '2026-09-24', value: 1.9 }]);
});

test('parseFredObservations: respuesta sin observations lanza error claro', () => {
  assert.throws(() => parseFredObservations({ error_message: 'x' }), /sin "observations"/);
});

// ── features ────────────────────────────────────────────────────────────────

test('computeSeriesFeatures: último valor, cambios, z-score y edad', () => {
  const obs = parseFredObservations({ observations: series(300, 1, 2) });   // sube linealmente
  const f = computeSeriesFeatures(obs, NOW);
  assert.equal(f.latest.value, 2);
  assert.equal(f.latest.date, '2026-09-25');
  assert.ok(f.change1d > 0 && f.change5d > f.change1d && f.change20d > f.change5d);
  assert.ok(f.zscore1y > 1.5, `z=${f.zscore1y}`);                          // máximo de la ventana
  assert.equal(f.percentile1y, 100);
  assert.equal(f.ageDays, 3.5);                                         // 25-sep 00:00Z → 28-sep 12:00Z
  assert.equal(f.n, 300);
});

test('computeSeriesFeatures: serie corta no inventa z-score; vacía devuelve null', () => {
  const short = computeSeriesFeatures(parseFredObservations({ observations: series(10, 1, 2) }), NOW);
  assert.equal(short.zscore1y, null);
  assert.equal(short.percentile1y, null);
  assert.equal(short.change20d, null);
  assert.equal(computeSeriesFeatures([], NOW), null);
});

test('computeSeriesFeatures: serie plana → z-score null (sin dividir por 0)', () => {
  const f = computeSeriesFeatures(parseFredObservations({ observations: series(120, 4, 4) }), NOW);
  assert.equal(f.zscore1y, null);
});

// ── fetch ───────────────────────────────────────────────────────────────────

test('fetchFredSeries arma la URL correcta y parsea', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = new URL(url); return { ok: true, json: async () => ({ observations: series(3, 1, 2) }) }; };
  const obs = await fetchFredSeries('DFII10', { apiKey: 'K123', startDate: '2025-08-01', fetchImpl });
  assert.equal(seen.searchParams.get('series_id'), 'DFII10');
  assert.equal(seen.searchParams.get('api_key'), 'K123');
  assert.equal(seen.searchParams.get('file_type'), 'json');
  assert.equal(seen.searchParams.get('observation_start'), '2025-08-01');
  assert.equal(obs.length, 3);
});

test('fetchFredSeries: sin clave falla claro; con HTTP 400 el error NO filtra la clave', async () => {
  await assert.rejects(() => fetchFredSeries('DFII10', {}), /FRED_API_KEY no configurada/);
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error_message: 'Bad Request. The api_key SECRETKEY is invalid' }) });
  try {
    await fetchFredSeries('DFII10', { apiKey: 'SECRETKEY', fetchImpl });
    assert.fail('debía rechazar');
  } catch (e) {
    assert.match(e.message, /HTTP 400/);
    assert.ok(!e.message.includes('SECRETKEY'), `la clave se filtró: ${e.message}`);
  }
});

test('fetchFredSeries: errores de red tampoco filtran la clave', async () => {
  const fetchImpl = async (url) => { throw new Error(`fetch failed ${url}`); };
  await assert.rejects(() => fetchFredSeries('DGS10', { apiKey: 'SECRETKEY', fetchImpl }), e => !e.message.includes('SECRETKEY'));
});

// ── getFredMacro ────────────────────────────────────────────────────────────

test('getFredMacro: pide las 7 series, marca ok/stale/failed y available', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    const id = new URL(url).searchParams.get('series_id');
    requested.push(id);
    if (id === 'VIXCLS') return { ok: false, status: 500, json: async () => ({}) };
    if (id === 'DTWEXBGS') return { ok: true, json: async () => ({ observations: series(300, 120, 121, '2026-09-25') }) }; // semanal: ok hasta 12 d
    if (id === 'DGS2')  return { ok: true, json: async () => ({ observations: series(300, 4, 4.2, '2026-09-10') }) };       // 18 días: vencida
    return { ok: true, json: async () => ({ observations: series(300, 1, 2, '2026-09-25') }) };
  };
  const r = await getFredMacro({ apiKey: 'K', now: NOW, fetchImpl });
  assert.equal(requested.length, Object.keys(FRED_SERIES).length);
  assert.equal(r.available, true);
  assert.equal(r.series.realYield10.status, 'ok');
  assert.equal(r.series.dollarBroad.status, 'ok');
  assert.equal(r.series.yield2.status, 'stale');
  assert.equal(r.series.vix.status, 'failed');
  assert.match(r.series.vix.error, /HTTP 500/);
  assert.equal(r.series.realYield10.id, 'DFII10');
});

test('getFredMacro: sin clave no lanza; todo queda "failed" y available=false', async () => {
  const r = await getFredMacro({ apiKey: '', now: NOW });
  assert.equal(r.available, false);
  assert.ok(Object.values(r.series).every(s => s.status === 'failed' && /FRED_API_KEY/.test(s.error)));
});

// ── fallbacks ───────────────────────────────────────────────────────────────

const okSeries = (key, last, prev) => ({
  status: 'ok', latest: { date: '2026-09-25', value: last }, change1d: +(last - prev).toFixed(4),
  change20d: 0.1, zscore1y: 0.5, percentile1y: 60
});

test('applyFredFallbacks: completa GVZ y 10Y cuando Yahoo falló, sin pisar lo que ya hay', () => {
  const fred = { series: { gvz: okSeries('gvz', 20, 19), yield10: okSeries('yield10', 4.2, 4.1) } };
  const out = applyFredFallbacks({ dxy: { value: 100 }, tenYearYield: null, gvz: null, realYield: null }, fred);
  assert.equal(out.gvz.value, 20);
  assert.equal(out.gvz.source, 'fred');
  assert.ok(Math.abs(out.gvz.changePercent - 5.263) < 0.01);               // (20-19)/19
  assert.equal(out.tenYearYield.value, 4.2);
  assert.equal(out.dxy.value, 100);
  // no pisa
  const kept = applyFredFallbacks({ gvz: { value: 15, source: 'yahoo' }, tenYearYield: { value: 4 } }, fred);
  assert.equal(kept.gvz.value, 15);
  assert.equal(kept.tenYearYield.value, 4);
});

test('applyFredFallbacks: enriquece la tasa real con cambio 20d/z-score y no muta la entrada', () => {
  const macro = { realYield: { value: 1.8, sentiment: 'neutral' } };
  const out = applyFredFallbacks(macro, { series: { realYield10: okSeries('realYield10', 1.8, 1.7) } });
  assert.equal(out.realYield.change20d, 0.1);
  assert.equal(out.realYield.zscore1y, 0.5);
  assert.equal(macro.realYield.change20d, undefined);
});

test('applyFredFallbacks: series fallidas no completan nada', () => {
  const out = applyFredFallbacks({ gvz: null }, { series: { gvz: { status: 'failed', error: 'x' } } });
  assert.equal(out.gvz, null);
});

test('applyFredFallbacks: si el CSV de la tasa real falló, la API la provee con su clasificación', () => {
  const out = applyFredFallbacks({ realYield: null }, { series: { realYield10: okSeries('realYield10', -0.2, -0.1) } });
  assert.equal(out.realYield.value, -0.2);
  assert.equal(out.realYield.sentiment, 'very_bullish');
  assert.equal(out.realYield.source, 'fred-api');
  assert.equal(out.realYield.date, '2026-09-25');
});
