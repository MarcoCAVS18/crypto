import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFredCsv, classifyRealYield, parseYahooChart } from '../src/services/macroService.js';

// ── B2: FRED ────────────────────────────────────────────────────────────────

test('B2: FRED formato nuevo (faltante vacío) devuelve el último valor válido', () => {
  const csv = 'observation_date,DFII10\n2026-09-22,1.85\n2026-09-23,1.87\n2026-09-24,\n';
  assert.deepEqual(parseFredCsv(csv), { date: '2026-09-23', value: 1.87 });
});

test('B2: FRED formato viejo (faltante ".") devuelve el último valor válido', () => {
  const csv = 'DATE,DFII10\n2026-09-22,1.85\n2026-09-23,1.87\n2026-09-24,.\n';
  assert.deepEqual(parseFredCsv(csv), { date: '2026-09-23', value: 1.87 });
});

test('B2: acepta tasas reales negativas y CRLF', () => {
  const csv = 'observation_date,DFII10\r\n2026-09-22,-0.25\r\n';
  assert.deepEqual(parseFredCsv(csv), { date: '2026-09-22', value: -0.25 });
});

test('B2: sin ningún dato válido lanza error claro', () => {
  assert.throws(() => parseFredCsv('DATE,DFII10\n2026-09-24,.\n2026-09-25,\n'), /Sin datos válidos/);
  assert.throws(() => parseFredCsv(''), /Sin datos válidos/);
});

test('B2: descarta valores absurdos (protección contra CSV corrupto)', () => {
  assert.throws(() => parseFredCsv('DATE,DFII10\n2026-09-24,185\n'), /Sin datos válidos/);
});

test('clasificación de tasa real', () => {
  assert.equal(classifyRealYield(-0.1), 'very_bullish');
  assert.equal(classifyRealYield(0.5), 'bullish');
  assert.equal(classifyRealYield(1.5), 'neutral');
  assert.equal(classifyRealYield(2.4), 'bearish');
});

// ── B12: Yahoo cambio diario ────────────────────────────────────────────────

const DAY = 86400;
// Lunes a viernes de una semana (UTC 21:00 ≈ cierre NY)
const t0 = Date.UTC(2026, 8, 21, 21, 0, 0) / 1000; // lun 21-sep-2026
const stamps = [0, 1, 2, 3, 4].map(i => t0 + i * DAY);

function chart({ closes, price, regularMarketTime, chartPreviousClose, previousClose }) {
  return {
    chart: { result: [{
      meta: { regularMarketPrice: price, regularMarketTime, gmtoffset: -14400, chartPreviousClose, previousClose },
      timestamp: stamps.slice(0, closes.length),
      indicators: { quote: [{ close: closes }] }
    }] }
  };
}

test('B12: sesión en vivo — cambio contra el cierre de AYER, no contra el de hace 5 días', () => {
  // cierres lun..jue = 100,101,102,103; hoy (vie) en curso 103.5 → la barra de hoy es la última
  const r = parseYahooChart(chart({
    closes: [100, 101, 102, 103, 103.5], price: 103.5,
    regularMarketTime: stamps[4] - 3600, chartPreviousClose: 99      // meta = cierre previo a la ventana
  }), 'DX-Y.NYB');
  assert.equal(r.prevClose, 103);
  assert.ok(Math.abs(r.changePercent - 0.485) < 0.01, `changePercent=${r.changePercent}`); // (103.5-103)/103
});

test('B12: fin de semana — la última barra (viernes) contra el jueves', () => {
  const r = parseYahooChart(chart({
    closes: [100, 101, 102, 103, 104], price: 104,
    regularMarketTime: stamps[4], chartPreviousClose: 99
  }));
  assert.equal(r.prevClose, 103);
  assert.ok(Math.abs(r.changePercent - 0.971) < 0.01);
});

test('B12: aún sin barra de hoy — la última barra es el cierre previo', () => {
  const r = parseYahooChart(chart({
    closes: [100, 101, 102, 103], price: 103.4,
    regularMarketTime: stamps[3] + DAY * 0.5, chartPreviousClose: 99
  }));
  assert.equal(r.prevClose, 103);
});

test('B12: ignora cierres nulos', () => {
  const r = parseYahooChart(chart({
    closes: [100, null, 102, 103, 104], price: 104,
    regularMarketTime: stamps[4], chartPreviousClose: 99
  }));
  assert.equal(r.prevClose, 103);
});

test('B12: sin series usa previousClose del meta como último recurso', () => {
  const json = { chart: { result: [{ meta: { regularMarketPrice: 50, previousClose: 49 }, indicators: { quote: [{}] } }] } };
  const r = parseYahooChart(json);
  assert.equal(r.prevClose, 49);
  assert.ok(Math.abs(r.changePercent - 2.041) < 0.01);
});

test('B12: errores claros', () => {
  assert.throws(() => parseYahooChart({ chart: { result: null } }, 'X'), /No data in Yahoo response for X/);
  assert.throws(() => parseYahooChart({ chart: { result: [{ meta: {}, indicators: { quote: [{}] } }] } }, 'X'), /No price for X/);
});
