import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean, std, quantile, median, zscore, percentileRank, clamp, pearson, rank, spearman, normalCdf, icSignificance,
  mulberry32, gaussian, solveSPD, columnStats, ridgeFit, logisticFit, sigmoid, brierScore, calibrationBins, maxDrawdown
} from '../src/backtest/stats.js';

const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} ${a} ≉ ${b}`);

// ── descriptivos ────────────────────────────────────────────────────────────

test('mean/std/quantile/median', () => {
  near(mean([1, 2, 3, 4]), 2.5);
  near(std([2, 4, 4, 4, 5, 5, 7, 9]), 2);                    // ejemplo clásico: σ = 2
  near(std([1, 2, 3, 4], 1), 1.2909944, 1e-6);
  assert.ok(Number.isNaN(std([1], 1)));
  near(quantile([1, 2, 3, 4, 5], 0.5), 3);
  near(quantile([1, 2, 3, 4], 0.25), 1.75);                  // interpolación lineal
  near(median([5, 1, 3]), 3);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});

test('zscore y percentil: nulls con muestra corta o degenerada', () => {
  const arr = Array.from({ length: 100 }, (_, i) => i);
  near(zscore(99, arr), (99 - 49.5) / std(arr));
  assert.equal(zscore(1, [1, 2, 3]), null);                  // < minN
  assert.equal(zscore(1, Array(50).fill(3)), null);          // std = 0
  assert.equal(percentileRank(49, arr), 50);
  assert.equal(percentileRank(1000, arr), 100);
  assert.equal(percentileRank(1, [1, 2]), null);
  assert.equal(clamp(5, 0, 3), 3);
});

// ── correlaciones ───────────────────────────────────────────────────────────

test('pearson y spearman: perfectas, inversas, robustez a extremos', () => {
  near(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1);
  near(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
  assert.ok(Number.isNaN(pearson([1, 1, 1, 1], [1, 2, 3, 4])));
  // monótona no lineal: Spearman = 1, Pearson < 1
  const x = [1, 2, 3, 4, 5, 6], y = x.map(v => v ** 5);
  near(spearman(x, y), 1);
  assert.ok(pearson(x, y) < 0.99);
  // un valor extremo no arruina Spearman
  near(spearman([1, 2, 3, 4, 1000], [1, 2, 3, 4, 5]), 1);
});

test('rank promedia los empates', () => {
  assert.deepEqual(rank([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
  assert.deepEqual(rank([3, 1, 2]), [3, 1, 2]);
});

test('normalCdf y significancia del IC con corrección por solapamiento', () => {
  near(normalCdf(0), 0.5, 1e-7);
  near(normalCdf(1.96), 0.975, 1e-3);
  near(normalCdf(-1.96), 0.025, 1e-3);
  const naive = icSignificance(0.1, 2000, 1);
  const overlap = icSignificance(0.1, 2000, 20);
  assert.equal(overlap.effectiveN, 100);
  assert.ok(naive.pValue < 1e-4);                            // sin corregir parece "imposible que sea azar"
  assert.ok(overlap.pValue > 0.3, `p=${overlap.pValue}`);   // corregido: IC 0.10 con n_efectivo=100 NO es significativo
  assert.ok(Number.isNaN(icSignificance(NaN, 100, 1).pValue));
  assert.ok(Number.isNaN(icSignificance(0.5, 20, 20).pValue));   // n efectivo < 5
});

// ── RNG ─────────────────────────────────────────────────────────────────────

test('mulberry32 es determinístico y uniforme; gaussian tiene media≈0 y desvío≈1', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const g = mulberry32(7);
  const xs = Array.from({ length: 20000 }, () => gaussian(g));
  near(mean(xs), 0, 0.03);
  near(std(xs), 1, 0.03);
});

// ── álgebra ─────────────────────────────────────────────────────────────────

test('solveSPD resuelve un sistema conocido y rechaza matrices no definidas', () => {
  const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
  const x = solveSPD(A, [1, 2, 3]);
  const back = A.map(r => r.reduce((s, v, j) => s + v * x[j], 0));
  near(back[0], 1); near(back[1], 2); near(back[2], 3);
  assert.throws(() => solveSPD([[1, 2], [2, 1]], [1, 1]), /no definida positiva/);
});

test('columnStats no divide por cero en columnas constantes', () => {
  const { means, stds } = columnStats([[1, 5], [2, 5], [3, 5]]);
  near(means[1], 5);
  assert.equal(stds[1], 1);
});

// ── ridge ───────────────────────────────────────────────────────────────────

function makeLinear(n, seed, noise = 0) {
  const rng = mulberry32(seed);
  const X = Array.from({ length: n }, () => [gaussian(rng), gaussian(rng) * 10 + 5, gaussian(rng)]);
  const y = X.map(r => 1 + 2 * r[0] - 0.3 * r[1] + 0 * r[2] + noise * gaussian(rng));
  return { X, y };
}

test('ridge con λ=0 recupera una función lineal exacta (en cualquier escala de las variables)', () => {
  const { X, y } = makeLinear(200, 1);
  const m = ridgeFit(X, y, 0);
  const probe = [0.5, 4, -1];
  near(m.predict(probe), 1 + 2 * 0.5 - 0.3 * 4, 1e-6);
});

test('ridge: λ grande encoge los coeficientes hacia 0; el intercepto es la media de y', () => {
  const { X, y } = makeLinear(300, 2, 0.5);
  const free = ridgeFit(X, y, 0), shrunk = ridgeFit(X, y, 5);
  const norm = c => Math.hypot(...c);
  assert.ok(norm(shrunk.coef) < norm(free.coef) * 0.5);
  near(shrunk.intercept, mean(y));
  assert.equal(shrunk.lambda, 5);
});

test('ridge funciona con variables colineales gracias a la regularización', () => {
  const rng = mulberry32(3);
  const X = Array.from({ length: 100 }, () => { const a = gaussian(rng); return [a, a * 2, gaussian(rng)]; });
  const y = X.map(r => r[0] + 0.1 * gaussian(rng));
  assert.throws(() => ridgeFit(X, y, 0), /no definida positiva/);
  const m = ridgeFit(X, y, 0.1);
  assert.ok(Number.isFinite(m.predict([1, 2, 0])));
});

// ── logística ───────────────────────────────────────────────────────────────

test('logística recupera el signo y aprende una señal plantada; probabilidades en (0,1)', () => {
  const rng = mulberry32(5);
  const n = 2000;
  const X = Array.from({ length: n }, () => [gaussian(rng), gaussian(rng)]);
  const y = X.map(r => (rng() < sigmoid(1.5 * r[0] - 1.0 * r[1]) ? 1 : 0));
  const m = logisticFit(X, y, 0.001);
  assert.ok(m.coef[0] > 0.8 && m.coef[1] < -0.4, `coef=${m.coef}`);
  assert.ok(m.iterations < 30);
  const hi = m.predictProba([2, -2]), lo = m.predictProba([-2, 2]);
  assert.ok(hi > 0.9 && lo < 0.1);
  for (const r of X.slice(0, 50)) { const p = m.predictProba(r); assert.ok(p > 0 && p < 1); }
});

test('logística con separación perfecta no diverge gracias a L2', () => {
  const X = Array.from({ length: 60 }, (_, i) => [i < 30 ? -1 - i / 100 : 1 + i / 100]);
  const y = X.map(r => (r[0] > 0 ? 1 : 0));
  const m = logisticFit(X, y, 0.05);
  assert.ok(Number.isFinite(m.coef[0]) && Math.abs(m.coef[0]) < 50);
  assert.ok(m.predictProba([2]) > 0.9);
});

test('logística sin señal devuelve ≈ la tasa base', () => {
  const rng = mulberry32(6);
  const X = Array.from({ length: 1500 }, () => [gaussian(rng)]);
  const y = X.map(() => (rng() < 0.6 ? 1 : 0));
  const m = logisticFit(X, y, 0.01);
  near(m.predictProba([0]), 0.6, 0.05);
  assert.ok(Math.abs(m.coef[0]) < 0.15);
});

// ── métricas ────────────────────────────────────────────────────────────────

test('Brier: perfecto=0, tasa base constante = b(1−b), peor caso=1', () => {
  near(brierScore([1, 0, 1], [1, 0, 1]), 0);
  near(brierScore([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0]), 0.25);
  near(brierScore([0, 1], [1, 0]), 1);
});

test('calibrationBins agrupa por probabilidad y compara con la frecuencia observada', () => {
  const p = [0.05, 0.05, 0.55, 0.55, 0.95, 0.95];
  const y = [0, 0, 1, 0, 1, 1];
  const t = calibrationBins(p, y, 10);
  assert.equal(t.length, 3);
  near(t[0].predicted, 0.05); near(t[0].observed, 0);
  near(t[1].observed, 0.5);
  near(t[2].observed, 1);
  assert.equal(t.reduce((s, r) => s + r.n, 0), 6);
});

test('maxDrawdown', () => {
  near(maxDrawdown([100, 120, 90, 110, 60, 130]), 0.5);
  assert.equal(maxDrawdown([1, 2, 3]), 0);
  assert.equal(maxDrawdown([]), 0);
});
