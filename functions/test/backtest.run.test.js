import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest } from '../src/backtest/run.js';
import { renderReport } from '../src/backtest/report.js';
import { parseFredCsv, parseYahooChart, parseStooqCsv, parseCotRows, yahoo } from '../src/backtest/data.js';
import { makeRaw } from './helpers/synth.js';

// ── parsers ─────────────────────────────────────────────────────────────────

test('parseFredCsv: descarta "." y vacíos (no los convierte en 0) y ordena', () => {
  const r = parseFredCsv('observation_date,DFII10\n2024-01-03,1.9\n2024-01-01,.\n2024-01-02,\n2024-01-04,1.85\nbasura,3\n');
  assert.deepEqual(r, [{ date: '2024-01-03', value: 1.9 }, { date: '2024-01-04', value: 1.85 }]);
});

test('parseYahooChart: filas completas, sin duplicar fechas ni cierres nulos', () => {
  const t = (d) => Date.parse(`${d}T00:00:00Z`) / 1000;
  const json = { chart: { result: [{ timestamp: [t('2024-01-02'), t('2024-01-03'), t('2024-01-03'), t('2024-01-04')],
    indicators: { quote: [{ open: [1, 2, 2, 3], high: [1, 2, 2, 3], low: [1, 2, 2, 3], close: [10, null, 11, 12], volume: [5, 5, 5, 5] }] } }] } };
  const r = parseYahooChart(json);
  assert.deepEqual(r.map(x => [x.date, x.close]), [['2024-01-02', 10], ['2024-01-03', 11], ['2024-01-04', 12]]);
  assert.throws(() => parseYahooChart({}), /sin datos/);
});

test('parseStooqCsv: detecta el formato inesperado en lugar de devolver basura', () => {
  assert.throws(() => parseStooqCsv('Get your apikey: ...'), /formato inesperado/);
  assert.equal(parseStooqCsv('Date,Open,High,Low,Close,Volume\n2024-01-02,1,2,0.5,1.5,10\n').length, 1);
});

test('parseCotRows: neto = largos − cortos, ordenado, ignora filas rotas', () => {
  const r = parseCotRows([
    { report_date_as_yyyy_mm_dd: '2024-01-09T00:00:00.000', noncomm_positions_long_all: '200000', noncomm_positions_short_all: '50000', open_interest_all: '500000' },
    { report_date_as_yyyy_mm_dd: '2024-01-02T00:00:00.000', noncomm_positions_long_all: '180000', noncomm_positions_short_all: '60000', open_interest_all: '490000' },
    { report_date_as_yyyy_mm_dd: 'x', noncomm_positions_long_all: '1', noncomm_positions_short_all: '1' }
  ]);
  assert.deepEqual(r.map(x => [x.date, x.netSpec]), [['2024-01-02', 120000], ['2024-01-09', 150000]]);
});

// ── orquestación completa sobre datos sintéticos ────────────────────────────

test('runBacktest + renderReport: protocolo completo sobre datos sintéticos (ruido) sin declarar evidencia', () => {
  const raw = makeRaw({ seed: 301, n: 2800, beta: 0 });
  const res = runBacktest(raw, { holdoutYears: 2, permB: 60, dcaPlacebo: 40 });
  assert.ok(!res.insufficient);
  assert.equal(res.models.length, 5 * 2);
  assert.equal(res.baseline.length, 2);
  assert.ok(res.dca.length >= 2);
  assert.equal(res.dcaHoldout.length, 2);
  assert.ok(res.meta.comparisons >= 19 * 2 + 10 + 2 + 2);
  assert.ok(res.models.every(m => m.holdout && !m.holdout.coef));                 // hold-out evaluado, sin coeficientes voluminosos
  assert.ok(res.models.every(m => !m.verdict.startsWith('evidencia') || m.oos.icPermP < 0.01));

  const md = renderReport(res, { sources: { gold: { ok: true, n: 10, from: 'a', to: 'b' } }, generatedAt: 'ahora' });
  for (const s of ['Comparaciones realizadas', 'Hold-out', 'DCA', 'Cómo leer esto', 'DCA en el hold-out', 'Compuesto de signos a priori']) assert.ok(md.includes(s), `falta "${s}"`);
});

test('runBacktest declara datos insuficientes en vez de inventar', () => {
  const res = runBacktest(makeRaw({ seed: 1, n: 500 }));
  assert.equal(res.insufficient, true);
  assert.match(renderReport(res), /Datos insuficientes/);
});

test('el hold-out de runBacktest no se usa en las features univariadas (perturbarlo no cambia nada)', () => {
  const raw = makeRaw({ seed: 302, n: 2800, beta: 0 });
  const a = runBacktest(raw, { holdoutYears: 2, permB: 30, dcaPlacebo: 10 });
  const b = structuredClone(raw);
  for (const c of b.gold) if (c.date >= a.meta.holdoutStart) { c.close *= 1.5; c.open = c.high = c.low = c.close; }
  const r2 = runBacktest(b, { holdoutYears: 2, permB: 30, dcaPlacebo: 10 });
  assert.equal(r2.meta.holdoutStart, a.meta.holdoutStart);
  assert.deepEqual(r2.featureICs, a.featureICs);
  assert.deepEqual(r2.models.map(m => m.oos), a.models.map(m => m.oos));
});

test('yahoo(): pide fechas explícitas, prueba el segundo host y rechaza series degradadas', async () => {
  const mk = (n) => ({ chart: { result: [{ timestamp: Array.from({ length: n }, (_, i) => 946684800 + i * 86400),
    indicators: { quote: [{ open: Array(n).fill(1), high: Array(n).fill(1), low: Array(n).fill(1), close: Array(n).fill(2), volume: Array(n).fill(1) }] } }] } });
  const urls = [];
  const fetcher = async (url) => { urls.push(url); return url.includes('query1') ? mk(270) : mk(1500); };
  const rows = await yahoo('GC=F', { fetcher });
  assert.equal(rows.length, 1500);
  assert.ok(urls[0].includes('period1=946684800') && !urls[0].includes('range=max'));
  assert.ok(urls[1].includes('query2'));
  await assert.rejects(() => yahoo('GC=F', { fetcher: async () => mk(270) }), /solo 270 filas/);
});
