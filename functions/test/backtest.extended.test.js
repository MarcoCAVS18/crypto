import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXT_COMPONENTS, EXT_VARIANTS, EXT_WEIGHT, extendedScoreOfRow, partsCoverage } from '../src/backtest/extendedScore.js';
import { parseCotMmRows } from '../src/backtest/data.js';
import { buildDataset, FEATURE_NAMES, EXTRA_FEATURE_NAMES } from '../src/backtest/features.js';
import { AVAILABILITY_LAG_DAYS } from '../src/backtest/timeseries.js';
import { ruleScoreOfRow } from '../src/backtest/ruleScore.js';
import { runBacktest } from '../src/backtest/run.js';
import { renderReport } from '../src/backtest/report.js';
import { makeRaw, clone } from './helpers/synth.js';

test('parseCotMmRows: managed money neto = largos − cortos, ordenado, ignora filas rotas', () => {
  const r = parseCotMmRows([
    { report_date_as_yyyy_mm_dd: '2024-01-09T00:00:00.000', m_money_positions_long_all: '150000', m_money_positions_short_all: '30000', open_interest_all: '500000' },
    { report_date_as_yyyy_mm_dd: '2024-01-02T00:00:00.000', m_money_positions_long_all: '140000', m_money_positions_short_all: '40000', open_interest_all: '490000' },
    { report_date_as_yyyy_mm_dd: 'x', m_money_positions_long_all: '1', m_money_positions_short_all: '1' },
    { report_date_as_yyyy_mm_dd: '2024-01-16T00:00:00.000' }
  ]);
  assert.deepEqual(r.map(x => [x.date, x.mmNet, x.openInterest]), [['2024-01-02', 100000, 490000], ['2024-01-09', 120000, 500000]]);
  assert.throws(() => parseCotMmRows({}), /inesperada/);
});

test('componentes: signos a priori, acotados a ±1 y null si falta el dato', () => {
  const C = EXT_COMPONENTS;
  assert.equal(C.breakeven({ be_chg20: 0.5 }), 1);  assert.equal(C.breakeven({ be_chg20: -0.5 }), -1);   // inflación esperada ↑ → +
  assert.equal(C.dollar({ usd_chg20: 0.06 }), -1);  assert.equal(C.dollar({ usd_chg20: -0.06 }), 1);       // dólar ↑ → −
  assert.equal(C.vix({ vix_z: 3 }), 1);             assert.equal(C.vix({ vix_z: -3 }), -1);                 // VIX ↑ → +
  assert.equal(C.managedMoney({ mm_pct: 100 }), -1); assert.equal(C.managedMoney({ mm_pct: 0 }), 1);       // fondos muy largos → − (contrarian)
  assert.equal(C.managedMoney({ mm_pct: 50 }), 0);
  for (const k of Object.keys(C)) assert.equal(C[k]({}), null);
});

test('extendedScoreOfRow: suma ±0.10 por componente al score actual, acotado, y dato faltante = 0', () => {
  const row = { raw: { close: 100, ema20: 99, ema50: 98, ema200: 90, rsi: 55, dxyChangePct: 0, tenYear: 4.25 }, x: { be_chg20: 1, usd_chg20: null, vix_z: null, mm_pct: null } };
  const base = ruleScoreOfRow(row);
  assert.ok(Number.isFinite(base));
  const s = extendedScoreOfRow(['breakeven', 'dollar'])(row);
  assert.ok(Math.abs(s - (base + EXT_WEIGHT)) < 1e-12);      // breakeven saturado (+1 × 0.10); dólar sin dato = 0
  // acotado
  const hi = { raw: row.raw, x: { be_chg20: 1, usd_chg20: -1, vix_z: 9, mm_pct: 0 } };
  assert.ok(extendedScoreOfRow(['breakeven', 'dollar', 'vix', 'managedMoney'])(hi) <= 1);
  // sin score base → NaN (no inventa)
  assert.ok(Number.isNaN(extendedScoreOfRow(['vix'])({ x: { vix_z: 1 } })));
  assert.equal(EXT_VARIANTS.length, 5);
});

test('mm_pct: es point-in-time (rezago de publicación), no entra a FEATURE_NAMES y es null sin datos', () => {
  assert.ok(!FEATURE_NAMES.includes('mm_pct')); assert.deepEqual(EXTRA_FEATURE_NAMES, ['mm_pct']);
  assert.equal(AVAILABILITY_LAG_DAYS.cotMm, 4);
  const raw = makeRaw({ seed: 41, n: 1500 });
  const rows = buildDataset(raw);
  const last = rows[rows.length - 1];
  assert.ok(Number.isFinite(last.x.mm_pct) && last.x.mm_pct >= 0 && last.x.mm_pct <= 100);
  // alterar todo dato COT-MM posterior a la fecha D no cambia mm_pct en D
  const mid = rows[Math.floor(rows.length / 2)];
  const raw2 = clone(raw);
  for (const o of raw2.cotMm) if (o.date > mid.date) o.mmNet = 99999999;
  const rows2 = buildDataset(raw2);
  assert.equal(rows2.find(r => r.date === mid.date).x.mm_pct, mid.x.mm_pct);
  assert.equal(buildDataset({ ...raw, cotMm: [] })[300].x.mm_pct, null);
});

test('runBacktest: la extensión de la fase 6 corre sobre ruido, marca datos insuficientes y no declara evidencia', () => {
  const raw = makeRaw({ seed: 303, n: 2800, beta: 0 });
  const res = runBacktest(raw, { holdoutYears: 2, permB: 60, dcaPlacebo: 40 });
  const ex = res.extension;
  assert.equal(ex.variants.length, 5 * 2);                       // 5 variantes × 2 horizontes
  assert.equal(ex.dca.length, 5); assert.equal(ex.dcaHoldout.length, 5);
  assert.ok(ex.variants.every(v => !v.verdict.startsWith('evidencia') || v.oos.icPermP < 0.01));
  assert.ok(ex.variants.every(v => Number.isFinite(v.dIC) || !Number.isFinite(v.oos.ic)));
  assert.ok(Object.keys(ex.extraICs).length === 2);
  const md = renderReport(res, { generatedAt: 'ahora' });
  for (const t of ['Fase 6', 'managed money', 'Regla de decisión', 'Referencia: política actual']) assert.ok(md.includes(t), `falta "${t}"`);

  // sin datos de managed money: las variantes que lo usan quedan "datos insuficientes" (no se inventa nada)
  const noMm = runBacktest({ ...raw, cotMm: [] }, { holdoutYears: 2, permB: 30, dcaPlacebo: 10 });
  assert.ok(noMm.extension.variants.some(v => v.id === 'ext_mm' && v.insufficient));
  assert.ok(noMm.extension.variants.some(v => v.id === 'ext_all' && !v.insufficient));   // las otras tres partes sí tienen datos
});

test('el hold-out no se usa en la extensión (perturbarlo no cambia el IC walk-forward ni el DCA previo)', () => {
  const raw = makeRaw({ seed: 304, n: 2800, beta: 0 });
  const a = runBacktest(raw, { holdoutYears: 2, permB: 30, dcaPlacebo: 10 });
  const b = clone(raw);
  for (const c of b.gold) if (c.date >= a.meta.holdoutStart) { c.close *= 1.5; c.open = c.high = c.low = c.close; }
  const r2 = runBacktest(b, { holdoutYears: 2, permB: 30, dcaPlacebo: 10 });
  assert.deepEqual(r2.extension.variants.map(v => v.oos), a.extension.variants.map(v => v.oos));
  assert.deepEqual(r2.extension.extraICs, a.extension.extraICs);
  assert.deepEqual(r2.extension.dca.map(d => d.meanRatio), a.extension.dca.map(d => d.meanRatio));
});
