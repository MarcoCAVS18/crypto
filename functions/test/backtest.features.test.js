import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastVisibleIndex, visibleWindow, cleanSeries, addDays, AVAILABILITY_LAG_DAYS } from '../src/backtest/timeseries.js';
import { emaSeries, rsiSeries, logReturns, realizedVol } from '../src/backtest/indicators.js';
import { buildDataset, toVector, coverage, FEATURE_NAMES, MIN_HISTORY, FORWARD_HORIZONS } from '../src/backtest/features.js';
import { makeRaw, clone, weekdays } from './helpers/synth.js';
import { mulberry32, gaussian } from '../src/backtest/stats.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// ── timeseries: visibilidad por rezago de publicación ───────────────────────

const obs = (pairs) => pairs.map(([date, value]) => ({ date, value }));

test('lastVisibleIndex respeta el rezago: un dato con fecha d es visible desde d+L', () => {
  const s = obs([['2026-01-01', 1], ['2026-01-02', 2], ['2026-01-05', 3]]);
  assert.equal(lastVisibleIndex(s, '2026-01-02', 0), 1);
  assert.equal(lastVisibleIndex(s, '2026-01-02', 1), 0);        // con rezago 1, el dato del 02 aún no se publicó
  assert.equal(lastVisibleIndex(s, '2026-01-03', 1), 1);
  assert.equal(lastVisibleIndex(s, '2025-12-31', 0), -1);
  assert.equal(lastVisibleIndex(s, '2026-01-05', 7), -1);
  assert.equal(lastVisibleIndex([], '2026-01-05', 0), -1);
});

test('visibleWindow devuelve las últimas n observaciones visibles en orden', () => {
  const s = obs([['2026-01-01', 1], ['2026-01-02', 2], ['2026-01-05', 3], ['2026-01-06', 4]]);
  assert.deepEqual(visibleWindow(s, '2026-01-06', 0, 3).map(o => o.value), [2, 3, 4]);
  assert.deepEqual(visibleWindow(s, '2026-01-06', 1, 2).map(o => o.value), [2, 3]);
  assert.deepEqual(visibleWindow(s, '2025-01-01', 0, 3), []);
});

test('cleanSeries ordena, deduplica (gana el último) y descarta no finitos', () => {
  const c = cleanSeries([{ date: '2026-01-02', value: 2 }, { date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 9 }, { date: '2026-01-03', value: NaN }, null]);
  assert.deepEqual(c, [{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 9 }]);
  assert.equal(addDays('2026-01-30', 3), '2026-02-02');
  assert.equal(AVAILABILITY_LAG_DAYS.cot, 4);
});

// ── indicadores causales ────────────────────────────────────────────────────

test('EMA/RSI/retornos/volatilidad: valores conocidos y causalidad', () => {
  const e = emaSeries([10, 10, 10, 20], 3);
  assert.deepEqual(e.slice(0, 3), [10, 10, 10]);
  near(e[3], 15);                                             // alpha=0.5
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsiSeries(up, 14)[29], 100);                   // solo sube → RSI 100
  assert.equal(rsiSeries(up, 14)[13], null);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.equal(rsiSeries(down, 14)[29], 0);
  assert.equal(logReturns([100, 110])[0], null);
  near(logReturns([100, 110])[1], Math.log(1.1));
  // volatilidad de retornos alternantes ±1 % → ≈ 1 % · √252
  const r = Array.from({ length: 40 }, (_, i) => (i === 0 ? null : (i % 2 ? 0.01 : -0.01)));
  near(realizedVol(r, 39, 20), 0.01 * Math.sqrt(252) * Math.sqrt(20 / 19), 1e-6);
  assert.equal(realizedVol(r, 10, 20), null);
  // causalidad: cambiar el futuro no altera el valor pasado
  const a = emaSeries([1, 2, 3, 4, 5], 3), b = emaSeries([1, 2, 3, 4, 500], 3);
  assert.deepEqual(a.slice(0, 4), b.slice(0, 4));
});

// ── dataset ─────────────────────────────────────────────────────────────────

test('buildDataset: una fila por día desde MIN_HISTORY y etiquetas de retorno futuro exactas', () => {
  const raw = makeRaw({ seed: 2, n: 700 });
  const rows = buildDataset(raw);
  assert.equal(rows.length, 700 - MIN_HISTORY);
  assert.deepEqual(FORWARD_HORIZONS, [5, 20, 60]);
  const r = rows[10], i = r.index;
  near(r.fwd[20], Math.log(raw.gold[i + 20].close / raw.gold[i].close));
  assert.equal(r.labelDate[20], raw.gold[i + 20].date);
  const last = rows[rows.length - 1];
  assert.equal(last.fwd[5], null);                            // sin futuro no hay etiqueta
  assert.equal(last.labelDate[60], null);
});

test('features de precio: tendencia alcista → mom/ext200 positivos y drawdown 0 en máximos', () => {
  const dates = weekdays('2015-01-01', 400);
  const gold = dates.map((date, i) => { const c = 1000 * Math.exp(0.001 * i); return { date, open: c, high: c, low: c, close: c, volume: 1 }; });
  const rows = buildDataset({ gold, fred: {}, cot: [] });
  const r = rows[rows.length - 1];
  assert.ok(r.x.mom20 > 0 && r.x.mom60 > 0 && r.x.mom120 > 0);
  assert.ok(r.x.ext200 > 0 && r.x.ma50_200 > 0);
  near(r.x.dd252, 0);
  assert.equal(r.x.rsi14, 100);
  near(r.x.mom20, 0.02, 1e-9);
});

test('sin series macro las features macro son null y toVector devuelve null (no inventa datos)', () => {
  const rows = buildDataset(makeRaw({ seed: 3, n: 500, macro: false }));
  const r = rows[100];
  assert.equal(r.x.ry_z, null); assert.equal(r.x.cot_pct, null); assert.equal(r.x.gs_z, null);
  assert.ok(Number.isFinite(r.x.mom20));
  assert.equal(toVector(r), null);
  const cov = coverage(rows);
  assert.equal(cov.ry_z, 0);
  assert.ok(cov.mom20 > 0.99);
});

test('con datos completos hay vector de features finito y z-scores winsorizados a ±4', () => {
  const raw = makeRaw({ seed: 4, n: 900 });
  // outlier gigante en el VIX dentro de la ventana visible
  raw.fred.vix[850].value = 5000;
  const rows = buildDataset(raw);
  const ok = rows.filter(r => toVector(r) !== null);
  assert.ok(ok.length > 300, `filas completas: ${ok.length}`);
  for (const r of ok) for (const name of FEATURE_NAMES) assert.ok(Number.isFinite(r.x[name]), name);
  const spike = rows.find(r => r.date === raw.gold[851].date);
  assert.ok(Math.abs(spike.x.vix_z) <= 4 + 1e-9);
  assert.ok(spike.x.vix_z > 3);
});

test('COT: el percentil usa % del open interest y una serie creciente da percentil 100', () => {
  const raw = makeRaw({ seed: 5, n: 900 });
  raw.cot = raw.cot.map((o, k) => ({ ...o, netSpec: 1000 * k, openInterest: 400000 }));
  const rows = buildDataset(raw);
  const late = rows[rows.length - 1];
  assert.equal(late.x.cot_pct, 100);
  assert.ok(late.x.cot_chg4 > 0);
});

// ── el test que más importa: NO hay fuga del futuro ────────────────────────

const perturbAfter = (raw, cutoff, rng) => {
  const out = clone(raw);
  let mult = 1;
  for (const c of out.gold) if (c.date > cutoff) { mult *= Math.exp(0.05 * gaussian(rng)); c.close *= mult; c.open = c.high = c.low = c.close; }
  for (const k of Object.keys(out.fred)) for (const o of out.fred[k]) if (o.date > cutoff) o.value += 5 * gaussian(rng);
  for (const o of out.cot) if (o.date > cutoff) o.netSpec += 100000 * gaussian(rng);
  for (const o of out.silver) if (o.date > cutoff) o.close *= 2;
  return out;
};

test('NO-FUGA: alterar TODO dato posterior a D no cambia ninguna feature de filas ≤ D', () => {
  const raw = makeRaw({ seed: 6, n: 900 });
  const cutoff = raw.gold[700].date;
  const a = buildDataset(raw);
  const b = buildDataset(perturbAfter(raw, cutoff, mulberry32(99)));
  const upto = a.filter(r => r.date <= cutoff);
  assert.ok(upto.length > 300);
  for (const ra of upto) {
    const rb = b.find(r => r.date === ra.date);
    assert.deepEqual(rb.x, ra.x, `features cambiaron en ${ra.date}`);
    assert.deepEqual(rb.raw, ra.raw, `niveles cambiaron en ${ra.date}`);
  }
  // sanidad: la perturbación SÍ afecta a las etiquetas (que miran adelante) y a las filas posteriores
  const near700 = a.find(r => r.index === 699);
  assert.notEqual(b.find(r => r.date === near700.date).fwd[60], near700.fwd[60]);
  const after = a.find(r => r.date > cutoff);
  assert.notDeepEqual(b.find(r => r.date === after.date).x, after.x);
});

test('NO-FUGA por rezago: el dato de la tasa real del día D (rezago 1) no se ve en D, sí en D+1', () => {
  const raw = makeRaw({ seed: 7, n: 800 });
  const D = raw.gold[600].date;
  const base = buildDataset(raw);
  const tampered = clone(raw);
  tampered.fred.realYield10.find(o => o.date === D).value += 3;      // publicación tardía del dato de D
  const t = buildDataset(tampered);
  const at = (rows, d) => rows.find(r => r.date === d);
  assert.deepEqual(at(t, D).x, at(base, D).x, 'el dato de D no debe estar visible en D');
  const next = raw.gold[601].date;
  assert.notEqual(at(t, next).x.ry_chg20, at(base, next).x.ry_chg20, 'sí debe verse en D+1');
});

test('NO-FUGA por rezago del COT (4 días) y del dólar amplio (7 días)', () => {
  const raw = makeRaw({ seed: 8, n: 900 });
  const D = raw.gold[700].date;
  const cotDate = raw.cot.filter(o => o.date <= D).at(-1).date;       // último martes ≤ D: tiene < 4 días o más
  const daysBetween = (Date.parse(`${D}T00:00:00Z`) - Date.parse(`${cotDate}T00:00:00Z`)) / 86400000;
  const base = buildDataset(raw);
  const t = clone(raw);
  t.cot.find(o => o.date === cotDate).netSpec += 500000;
  const tt = buildDataset(t);
  const d0 = base.find(r => r.date === D), d1 = tt.find(r => r.date === D);
  if (daysBetween < 4) assert.deepEqual(d1.raw.cotNetSpec, d0.raw.cotNetSpec, 'COT aún no publicado');
  else assert.notEqual(d1.raw.cotNetSpec, d0.raw.cotNetSpec, 'COT ya publicado');

  const usdDate = raw.fred.dollarBroad.filter(o => o.date <= D).at(-1).date;   // = D (día hábil)
  const t2 = clone(raw);
  t2.fred.dollarBroad.find(o => o.date === usdDate).value *= 1.5;
  const r2 = buildDataset(t2).find(r => r.date === D);
  assert.deepEqual(r2.x.usd_chg20, d0.x.usd_chg20, 'el dólar amplio de D no es visible hasta 7 días después');
});
