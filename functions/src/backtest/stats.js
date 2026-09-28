// Estadística mínima y sin dependencias para el backtester: descriptivos, correlaciones de rango,
// ridge, regresión logística con L2, calibración y un RNG con semilla.
// Todo puro y determinístico. Pensado para pocas variables (≈10–20) y algunos miles de filas.

// ── descriptivos ────────────────────────────────────────────────────────────

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

/** Desvío estándar poblacional (ddof=0) por defecto. */
export function std(a, ddof = 0) {
  if (a.length - ddof <= 0) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - ddof));
}

/** Cuantil con interpolación lineal (q en [0,1]). */
export function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (a) => quantile(a, 0.5);

/** Z-score de x respecto de `arr`; null si la muestra es corta o degenerada (std=0). */
export function zscore(x, arr, minN = 30) {
  if (arr.length < minN) return null;
  const s = std(arr);
  return s > 0 ? (x - mean(arr)) / s : null;
}

/** Percentil (0–100) de x dentro de `arr`: % de valores ≤ x. Null con muestra corta. */
export function percentileRank(x, arr, minN = 30) {
  if (arr.length < minN) return null;
  return (arr.filter(v => v <= x).length / arr.length) * 100;
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ── correlaciones ───────────────────────────────────────────────────────────

export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** Rangos 1..n con promedio en empates. */
export function rank(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Correlación de Spearman (IC de rango): robusta a valores extremos. */
export const spearman = (a, b) => pearson(rank(a), rank(b));

/** Función de distribución normal estándar (Abramowitz–Stegun 7.1.26 vía erf). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Significancia aproximada de un IC. Las etiquetas a horizonte `h` se solapan (retornos a 20 días
 * de días consecutivos comparten 19/20 de su ventana), así que la muestra efectiva es ≈ n/h, no n.
 * Sin esta corrección los p-values salen absurdamente chicos.
 * @returns {{ tStat: number, pValue: number, effectiveN: number }} p-value de dos colas
 */
export function icSignificance(ic, n, horizon = 1) {
  const effectiveN = Math.max(0, Math.floor(n / Math.max(1, horizon)));
  if (!Number.isFinite(ic) || effectiveN < 5 || Math.abs(ic) >= 1) return { tStat: NaN, pValue: NaN, effectiveN };
  const tStat = ic * Math.sqrt((effectiveN - 2) / (1 - ic * ic));
  return { tStat, pValue: 2 * (1 - normalCdf(Math.abs(tStat))), effectiveN };
}

/**
 * Test de permutación por DESPLAZAMIENTO CIRCULAR para el IC (Spearman).
 *
 * Por qué: las predicciones de un modelo con features persistentes y los retornos a h días están
 * ambos muy autocorrelacionados; el IC "muestral" tiene una varianza mucho mayor que la fórmula
 * con n/h (en pruebas con ruido puro el IC fuera de muestra oscila ±0.2). Desplazar circularmente
 * la serie de resultados respecto de los scores conserva la autocorrelación de ambas series pero
 * destruye su alineación, así que da la distribución nula CORRECTA del IC.
 *
 * @param {number[]} scores
 * @param {number[]} actual
 * @param {object} o
 * @param {number} [o.B]        cantidad de desplazamientos
 * @param {number} [o.seed]
 * @param {number} [o.minShift] desplazamiento mínimo (≥ horizonte, para no reutilizar el mismo tramo)
 * @returns {{ ic:number, pValue:number, nullSd:number, B:number }} p-value de dos colas (con corrección +1)
 */
export function icPermutationTest(scores, actual, { B = 1000, seed = 1, minShift = 40 } = {}) {
  const n = Math.min(scores.length, actual.length);
  if (n < 3 * minShift) return { ic: NaN, pValue: NaN, nullSd: NaN, B: 0 };
  const rs = rank(scores.slice(0, n)), ra = rank(actual.slice(0, n));
  const ic = pearson(rs, ra);
  const rng = mulberry32(seed);
  const span = n - 2 * minShift;
  let extreme = 0;
  const nulls = [];
  for (let b = 0; b < B; b++) {
    const shift = minShift + Math.floor(rng() * span);
    const shifted = new Array(n);
    for (let i = 0; i < n; i++) shifted[i] = ra[(i + shift) % n];
    const v = pearson(rs, shifted);
    nulls.push(v);
    if (Math.abs(v) >= Math.abs(ic)) extreme++;
  }
  return { ic, pValue: (extreme + 1) / (B + 1), nullSd: std(nulls), B };
}

// ── RNG con semilla ─────────────────────────────────────────────────────────

/** Mulberry32: uniforme [0,1) determinístico. */
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar (Box–Muller) desde un RNG uniforme. */
export function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── álgebra lineal ──────────────────────────────────────────────────────────

/** Resuelve A x = b con A simétrica definida positiva (Cholesky). */
export function solveSPD(A, b) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) throw new Error('matriz no definida positiva (¿variables colineales sin regularización?)');
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

// ── estandarización ─────────────────────────────────────────────────────────

/** Media y desvío por columna (std=0 → 1 para no dividir por cero). */
export function columnStats(X) {
  const p = X[0]?.length ?? 0;
  const means = new Array(p).fill(0), stds = new Array(p).fill(1);
  for (let j = 0; j < p; j++) {
    const col = X.map(r => r[j]);
    means[j] = mean(col);
    const s = std(col);
    stds[j] = s > 1e-12 ? s : 1;
  }
  return { means, stds };
}

const standardize = (x, means, stds) => x.map((v, j) => (v - means[j]) / stds[j]);

// ── ridge ───────────────────────────────────────────────────────────────────

/**
 * Regresión ridge con intercepto SIN penalizar, sobre variables estandarizadas.
 * @param {number[][]} X  filas × variables
 * @param {number[]} y
 * @param {number} lambda penalización L2 (0 = mínimos cuadrados)
 * @returns {{ coef:number[], intercept:number, means:number[], stds:number[], lambda:number, predict:(x:number[])=>number }}
 *   `coef` está en unidades ESTANDARIZADAS (comparables entre variables).
 */
export function ridgeFit(X, y, lambda = 1) {
  const n = X.length, p = X[0].length;
  const { means, stds } = columnStats(X);
  const Z = X.map(r => standardize(r, means, stds));
  const ybar = mean(y);
  const yc = y.map(v => v - ybar);

  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += Z[i][j] * yc[i];
      for (let k = j; k < p; k++) A[j][k] += Z[i][j] * Z[i][k];
    }
  }
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    A[j][j] += lambda * n;              // λ escalado por n: comparable entre tamaños de muestra
  }
  const coef = solveSPD(A, b);
  const model = {
    coef, intercept: ybar, means, stds, lambda,
    predict: (x) => ybar + standardize(x, means, stds).reduce((s, v, j) => s + v * coef[j], 0)
  };
  return model;
}

// ── logística ───────────────────────────────────────────────────────────────

export const sigmoid = (z) => 1 / (1 + Math.exp(-clamp(z, -35, 35)));

/**
 * Regresión logística con L2 (intercepto sin penalizar), Newton–Raphson (IRLS) sobre variables
 * estandarizadas. `lambda` > 0 evita divergencia con separación perfecta.
 * @returns {{ coef:number[], intercept:number, means:number[], stds:number[], lambda:number, iterations:number,
 *             predictProba:(x:number[])=>number }}
 */
export function logisticFit(X, y, lambda = 0.01, { maxIter = 50, tol = 1e-8 } = {}) {
  const n = X.length, p = X[0].length;
  const { means, stds } = columnStats(X);
  const Z = X.map(r => standardize(r, means, stds));

  let w = new Array(p + 1).fill(0);            // w[0] = intercepto
  const base = Math.min(0.999, Math.max(0.001, mean(y)));
  w[0] = Math.log(base / (1 - base));

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const H = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
    const g = new Array(p + 1).fill(0);

    for (let i = 0; i < n; i++) {
      let z = w[0];
      for (let j = 0; j < p; j++) z += w[j + 1] * Z[i][j];
      const pr = sigmoid(z), wt = Math.max(pr * (1 - pr), 1e-9), err = pr - y[i];
      g[0] += err;
      H[0][0] += wt;
      for (let j = 0; j < p; j++) {
        g[j + 1] += err * Z[i][j];
        H[0][j + 1] += wt * Z[i][j];
        for (let k = j; k < p; k++) H[j + 1][k + 1] += wt * Z[i][j] * Z[i][k];
      }
    }
    for (let j = 0; j <= p; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    for (let j = 1; j <= p; j++) { H[j][j] += lambda * n; g[j] += lambda * n * w[j]; }
    H[0][0] += 1e-9;

    const step = solveSPD(H, g);
    let maxStep = 0;
    for (let j = 0; j <= p; j++) { w[j] -= step[j]; maxStep = Math.max(maxStep, Math.abs(step[j])); }
    if (maxStep < tol) { iterations++; break; }
  }

  const coef = w.slice(1);
  return {
    coef, intercept: w[0], means, stds, lambda, iterations,
    predictProba: (x) => sigmoid(w[0] + standardize(x, means, stds).reduce((s, v, j) => s + v * coef[j], 0))
  };
}

// ── métricas de probabilidad ────────────────────────────────────────────────

/** Brier score (menor es mejor). Con p = tasa base constante vale base·(1−base). */
export function brierScore(p, y) {
  return mean(p.map((v, i) => (v - y[i]) ** 2));
}

/** Tabla de calibración: por bin, probabilidad media predicha vs frecuencia observada. */
export function calibrationBins(p, y, bins = 10) {
  const out = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins;
    const idx = p.map((v, i) => i).filter(i => p[i] >= lo && (b === bins - 1 ? p[i] <= hi : p[i] < hi));
    if (idx.length) out.push({ bin: `${lo.toFixed(1)}–${hi.toFixed(1)}`, n: idx.length, predicted: mean(idx.map(i => p[i])), observed: mean(idx.map(i => y[i])) });
  }
  return out;
}

// ── series ──────────────────────────────────────────────────────────────────

/** Máxima caída desde un máximo previo, como fracción positiva (0.25 = −25 %). */
export function maxDrawdown(values) {
  let peak = -Infinity, dd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) dd = Math.max(dd, (peak - v) / peak);
  }
  return dd;
}
