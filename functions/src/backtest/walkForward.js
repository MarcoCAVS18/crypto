// Validación walk-forward (expanding window) con embargo y hold-out final intocable.
//
// Reglas anti-sobreajuste implementadas acá:
//  1. EMBARGO por fecha de etiqueta: una fila solo entra al entrenamiento si su retorno futuro
//     TERMINÓ antes de la primera fecha que se va a predecir (`labelDate[h] < inicioDelBloque`).
//     Sin esto, el entrenamiento "conoce" el precio de días que el test todavía no vivió.
//  2. La winsorización de features usa cuantiles del ENTRENAMIENTO (no de toda la muestra).
//  3. HOLD-OUT: las filas con fecha ≥ `holdoutStart` nunca participan del walk-forward ni de la
//     elección de nada; se evalúan una sola vez con un modelo entrenado antes de esa fecha.
//  4. La significancia del IC sale de un test de PERMUTACIÓN por desplazamiento circular (`icPermP`),
//     que respeta la autocorrelación de scores y retornos. La fórmula analítica con n/h (`icPValue`)
//     se conserva solo como referencia: es demasiado optimista con scores persistentes.

import { toVector, FEATURE_NAMES } from './features.js';
import {
  ridgeFit, logisticFit, columnStats, spearman, pearson, mean, median, quantile, icSignificance, icPermutationTest, brierScore, calibrationBins
} from './stats.js';

const DEFAULTS = {
  names: FEATURE_NAMES,
  horizon: 20,
  kind: 'ridge',          // 'ridge' (retorno esperado) | 'logistic' (P(sube))
  lambda: 5,
  minTrain: 750,          // ≈ 3 años de días hábiles
  retrainEvery: 63,       // ≈ trimestral
  winsorQ: 0.01,
  permB: 500,             // desplazamientos del test de permutación
  signs: null,            // solo kind 'prior': signo económico (+1/−1) por feature, alineado con `names`
  holdoutStart: null      // 'YYYY-MM-DD': desde acá todo es hold-out
};

/** Filas utilizables: vector completo y etiqueta disponible, ordenadas por fecha. */
export function usableRows(rows, names, h) {
  return rows
    .map(r => ({ r, v: toVector(r, names) }))
    .filter(({ r, v }) => v !== null && r.fwd[h] !== null && r.fwd[h] !== undefined)
    .map(({ r, v }) => ({ date: r.date, index: r.index, x: v, y: r.fwd[h], labelDate: r.labelDate[h], row: r }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function winsorBounds(X, q) {
  const p = X[0].length;
  return Array.from({ length: p }, (_, j) => {
    const col = X.map(r => r[j]);
    return [quantile(col, q), quantile(col, 1 - q)];
  });
}
const clip = (x, bounds) => x.map((v, j) => Math.min(bounds[j][1], Math.max(bounds[j][0], v)));

/** Ajusta un modelo con winsorización de entrenamiento. Devuelve predict(x) → { score, prob? }. */
export function fitModel(kind, trainX, trainY, { lambda, winsorQ, signs = null }) {
  const bounds = winsorBounds(trainX, winsorQ);
  const X = trainX.map(x => clip(x, bounds));
  if (kind === 'prior') {
    // Compuesto de signos A PRIORI: no se ajusta ningún coeficiente (solo medias y desvíos del
    // entrenamiento para estandarizar). Es el análogo estadístico de un score experto: cada
    // variable suma o resta según lo que dice la teoría económica, con el mismo peso.
    if (!signs || signs.length !== trainX[0].length) throw new Error("kind 'prior' requiere `signs` alineado con `names`");
    const { means, stds } = columnStats(X);
    const k = signs.length;
    return { kind, coef: signs.map(sg => sg / k), intercept: 0, means, stds, bounds,
      predict: (x) => ({ score: clip(x, bounds).reduce((s, v, j) => s + (signs[j] * (v - means[j])) / (stds[j] * k), 0) }) };
  }
  if (kind === 'logistic') {
    const m = logisticFit(X, trainY.map(v => (v > 0 ? 1 : 0)), lambda / 100);
    return { kind, coef: m.coef, intercept: m.intercept, means: m.means, stds: m.stds, bounds,
      predict: (x) => { const prob = m.predictProba(clip(x, bounds)); return { score: prob - 0.5, prob }; } };
  }
  const m = ridgeFit(X, trainY, lambda);
  return { kind, coef: m.coef, intercept: m.intercept, means: m.means, stds: m.stds, bounds,
    predict: (x) => ({ score: m.predict(clip(x, bounds)) }) };
}

/**
 * Métricas de un conjunto de predicciones OOS.
 * @param {Array<{score:number, actual:number, prob?:number}>} preds
 * @param {number} horizon
 * @param {number} trainBaseRate - tasa base de subidas en entrenamiento (para el Brier de referencia)
 */
export function evaluate(preds, horizon, trainBaseRate = null, { permB = 500 } = {}) {
  const n = preds.length;
  if (n < 30) return { n, insufficient: true };

  const scores = preds.map(p => p.score), actual = preds.map(p => p.actual);
  const ic = spearman(scores, actual);
  const sig = icSignificance(ic, n, horizon);
  const perm = icPermutationTest(scores, actual, { B: permB, minShift: Math.max(40, 2 * horizon) });

  // IC con predicciones NO solapadas (cada h días): estimación más limpia, menos datos
  const stride = Math.max(1, horizon);
  const sub = preds.filter((_, i) => i % stride === 0);
  const icNonOverlap = sub.length >= 10 ? spearman(sub.map(p => p.score), sub.map(p => p.actual)) : NaN;

  const dirHit = mean(preds.map(p => (Math.sign(p.score) === Math.sign(p.actual) ? 1 : 0)));
  const baseUp = mean(preds.map(p => (p.actual > 0 ? 1 : 0)));

  // Terciles por score: ¿el tercio "mejor" rinde más que el "peor"?
  const t1 = quantile(scores, 1 / 3), t2 = quantile(scores, 2 / 3);
  const top = preds.filter(p => p.score >= t2).map(p => p.actual);
  const bottom = preds.filter(p => p.score <= t1).map(p => p.actual);
  const spread = { top: mean(top), bottom: mean(bottom), base: mean(actual), diff: mean(top) - mean(bottom) };

  const out = {
    n, ic,
    icPermP: perm.pValue,        // p-value honesto (permutación por desplazamiento circular)
    icNullSd: perm.nullSd,       // desvío del IC bajo la hipótesis nula: escala del "ruido" para este par de series
    icPValue: sig.pValue, icTStat: sig.tStat, effectiveN: sig.effectiveN,   // referencia analítica (optimista)
    icNonOverlap, dirHit, baseUp, spread
  };

  if (preds[0].prob !== undefined) {
    const p = preds.map(x => x.prob), y = preds.map(x => (x.actual > 0 ? 1 : 0));
    const base = trainBaseRate ?? baseUp;
    out.brier = brierScore(p, y);
    out.brierBaseline = brierScore(p.map(() => base), y);
    out.calibration = calibrationBins(p, y, 5);
  }
  return out;
}

/**
 * Walk-forward completo + hold-out.
 * @returns {{ config, folds: object[], oos: object, holdout: object|null, predictions: object[], coefStability: object }}
 */
export function walkForward(rows, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const { names, horizon: h, kind, lambda, minTrain, retrainEvery, winsorQ, holdoutStart, signs } = cfg;

  const data = usableRows(rows, names, h);
  const inWF = holdoutStart ? data.filter(d => d.date < holdoutStart) : data;
  const inHold = holdoutStart ? data.filter(d => d.date >= holdoutStart) : [];

  const preds = [], folds = [];
  let k = 0;
  while (k < inWF.length) {
    const block = inWF.slice(k, k + retrainEvery);
    const start = block[0].date;
    // entrenamiento: solo filas cuya etiqueta ya terminó antes de `start` (embargo por fecha)
    const train = inWF.filter(d => d.labelDate < start);
    if (train.length >= minTrain) {
      const model = fitModel(kind, train.map(d => d.x), train.map(d => d.y), { lambda, winsorQ, signs });
      for (const d of block) {
        const o = model.predict(d.x);
        preds.push({ date: d.date, score: o.score, prob: o.prob, actual: d.y, fold: folds.length });
      }
      folds.push({
        start, end: block[block.length - 1].date, nTrain: train.length,
        trainLabelEnd: train[train.length - 1].labelDate, coef: model.coef
      });
    }
    k += retrainEvery;
  }

  const baseRate = (rowsArr) => mean(rowsArr.map(d => (d.y > 0 ? 1 : 0)));
  const oos = evaluate(preds, h, preds.length ? baseRate(inWF.filter(d => d.date < preds[0].date)) : null, { permB: cfg.permB });

  // Estabilidad de coeficientes entre folds (¿el signo se sostiene?)
  const coefStability = {};
  names.forEach((name, j) => {
    const cs = folds.map(f => f.coef[j]);
    if (!cs.length) return;
    const m = mean(cs);
    coefStability[name] = {
      mean: m,
      signConsistency: cs.filter(c => Math.sign(c) === Math.sign(m)).length / cs.length
    };
  });

  // Hold-out: un solo modelo, entrenado con todo lo que terminó antes de holdoutStart
  let holdout = null, holdoutPreds = [];
  if (inHold.length) {
    const train = data.filter(d => d.labelDate < holdoutStart);
    if (train.length >= minTrain) {
      const model = fitModel(kind, train.map(d => d.x), train.map(d => d.y), { lambda, winsorQ, signs });
      holdoutPreds = inHold.map(d => { const o = model.predict(d.x); return { date: d.date, score: o.score, prob: o.prob, actual: d.y }; });
      holdout = { ...evaluate(holdoutPreds, h, baseRate(train), { permB: cfg.permB }), nTrain: train.length, coef: model.coef };
    }
  }

  return { config: cfg, folds, oos, holdout, predictions: preds, holdoutPredictions: holdoutPreds, coefStability };
}

/**
 * IC de un score externo (p. ej. la réplica del score actual) sobre las mismas filas y horizonte,
 * en el mismo tramo temporal que evalúa el modelo.
 */
export function evaluateScore(rows, scoreFn, { horizon = 20, from = null, to = null, permB = 500 } = {}) {
  const preds = [];
  for (const r of rows) {
    if (r.fwd[horizon] === null || r.fwd[horizon] === undefined) continue;
    if ((from && r.date < from) || (to && r.date >= to)) continue;
    const s = scoreFn(r);
    if (Number.isFinite(s)) preds.push({ score: s, actual: r.fwd[horizon] });
  }
  return evaluate(preds, horizon, null, { permB });
}

/** IC univariado de cada feature contra el retorno a h días (diagnóstico, no para elegir variables). */
export function featureICs(rows, names = FEATURE_NAMES, horizon = 20, { permB = 300 } = {}) {
  return Object.fromEntries(names.map(name => {
    const pairs = rows.filter(r => Number.isFinite(r.x[name]) && r.fwd[horizon] !== null && r.fwd[horizon] !== undefined);
    if (pairs.length < 50) return [name, { n: pairs.length, ic: NaN, pValue: NaN }];
    const perm = icPermutationTest(pairs.map(r => r.x[name]), pairs.map(r => r.fwd[horizon]), { B: permB, minShift: Math.max(40, 2 * horizon) });
    return [name, { n: pairs.length, ic: perm.ic, pValue: perm.pValue }];
  }));
}

export { median, pearson };
