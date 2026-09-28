import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkForward, evaluateScore, featureICs, usableRows, evaluate } from '../src/backtest/walkForward.js';
import { buildDataset, FEATURE_NAMES } from '../src/backtest/features.js';
import { mulberry32, gaussian } from '../src/backtest/stats.js';
import { makeRaw, clone } from './helpers/synth.js';
import { MODEL_MENU, verdict } from '../src/backtest/candidates.js';

// Datasets cacheados: construirlos es lo más caro del test
const cache = new Map();
const dataset = (seed, opts) => {
  const key = `${seed}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) { const raw = makeRaw({ seed, ...opts }); cache.set(key, { raw, rows: buildDataset(raw) }); }
  return cache.get(key);
};

// Señal plantada FUERTE (β alto, ruido bajo). Es la condición más favorable posible: si ni así se ve, el
// sistema sería inútil; si con datos reales sale algo mucho más chico, es lo esperable.
const PLANTED = { n: 2600, beta: 0.012, dailyVol: 0.006 };
const PARSIMONIOUS = ['ry_chg20', 'ry_z', 'mom60'];
const ONLY_TRUE = ['ry_chg20'];   // el modelo "correcto": aísla si el pipeline detecta lo que existe

// ── sin señal: el sistema NO debe inventar una ventaja ─────────────────────

test('SIN SEÑAL: el ruido produce ICs de ±0.2–0.3 (series persistentes) — por eso el veredicto exige p<0.01 Y hold-out', () => {
  // Documenta el nivel de ruido real: un IC de 0.2 sobre ~7 años de datos NO es evidencia.
  let big = 0, evidence = 0, combos = 0;
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    const rows = dataset(seed, { n: 2600, beta: 0 }).rows;
    const holdoutStart = rows[rows.length - 500].date;
    for (const m of MODEL_MENU) {
      const r = walkForward(rows, { ...m, horizon: 20, permB: 200, holdoutStart });
      combos++;
      if (Math.abs(r.oos.ic) > 0.15) big++;
      if (verdict(r.oos, r.holdout).startsWith('evidencia')) evidence++;
    }
  }
  assert.ok(big >= 3, `se esperaba ver ICs grandes por azar; aparecieron ${big}/${combos}`);
  assert.ok(evidence <= 1, `${evidence} de ${combos} combinaciones de puro ruido se declararon "evidencia"`);
});

test('SIN SEÑAL: el IC medio sobre ruido NO es positivo (si algo, el ajuste de regresores persistentes sesga levemente a negativo)', () => {
  const ics = [31, 32, 33, 34, 35, 36].map(seed => walkForward(dataset(seed, { n: 2600, beta: 0 }).rows, { names: PARSIMONIOUS, horizon: 20, permB: 50 }).oos.ic);
  const avg = ics.reduce((a, b) => a + b, 0) / ics.length;
  // Un sesgo POSITIVO sería una fuga de futuro; uno levemente negativo es el sobreajuste esperable y no engaña.
  assert.ok(avg < 0.05 && avg > -0.25, `IC medio ${avg.toFixed(3)} (${ics.map(x => x.toFixed(2))})`);
});

// ── con señal plantada: el sistema SÍ la encuentra cuando el modelo es parsimonioso ─

test('CON SEÑAL: el ridge con la variable correcta acierta el signo en todas las series y llega a p<0.05 en la mayoría (potencia limitada)', () => {
  // Hallazgo medido: incluso con señal fuerte y modelo correcto, ~6 años de OOS con etiquetas solapadas a 20 días
  // dan poca potencia (p<0.05 en 3 de 4 series, p<0.01 en 1). "Sin evidencia" NO equivale a "no hay señal".
  let detected = 0;
  for (const seed of [41, 42, 43, 44]) {
    const { rows } = dataset(seed, PLANTED);
    const r = walkForward(rows, { names: ONLY_TRUE, kind: 'ridge', lambda: 5, horizon: 20 });
    assert.ok(r.oos.ic > 0, `seed ${seed}: IC OOS ${r.oos.ic.toFixed(3)}`);
    const s = r.coefStability.ry_chg20;
    assert.ok(s.mean < 0 && s.signConsistency >= 0.9, `seed ${seed}: coef ${s.mean}, consistencia ${s.signConsistency}`);   // oro cae cuando sube la tasa real
    if (r.oos.icPermP < 0.05) detected++;
  }
  assert.ok(detected >= 2, `solo ${detected} de 4 series detectadas`);
});

test('CON SEÑAL: el compuesto de signos a priori (sin ajustar nada) también la encuentra', () => {
  const { rows } = dataset(41, PLANTED);
  const r = walkForward(rows, { kind: 'prior', names: ['ry_chg20', 'mom60'], signs: [-1, +1], horizon: 20 });
  assert.ok(r.oos.ic > 0.15, `IC OOS ${r.oos.ic.toFixed(3)}`);
  assert.ok(r.folds.every(f => f.coef.length === 2 && f.coef[0] === -0.5 && f.coef[1] === 0.5), 'los pesos son fijos, no ajustados');
});

test("kind 'prior' exige signos alineados con las variables", () => {
  const { rows } = dataset(41, PLANTED);
  assert.throws(() => walkForward(rows, { kind: 'prior', names: ['ry_chg20', 'mom60'], signs: [-1], horizon: 20 }), /signs/);
});

test('LÍMITE HONESTO: un ridge con las 19 variables NO garantiza detectar ni siquiera una señal fuerte (sobreajuste)', () => {
  // No se afirma que falle siempre: se afirma que su IC queda muy por debajo del modelo parsimonioso.
  const { rows } = dataset(41, PLANTED);
  const small = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, permB: 50 }).oos.ic;
  const all = walkForward(rows, { names: FEATURE_NAMES, horizon: 20, permB: 50 }).oos.ic;
  assert.ok(small > all, `parsimonioso ${small.toFixed(2)} vs 19 variables ${all.toFixed(2)}`);
});

test('CON SEÑAL: logística mejora el Brier respecto de la tasa base y devuelve tabla de calibración', () => {
  const { rows } = dataset(41, PLANTED);
  const r = walkForward(rows, { names: PARSIMONIOUS, kind: 'logistic', lambda: 5, horizon: 20, permB: 50 });
  assert.ok(r.oos.brier < r.oos.brierBaseline, `${r.oos.brier} vs ${r.oos.brierBaseline}`);
  assert.ok(r.oos.calibration.length >= 2);
  for (const b of r.oos.calibration) assert.ok(b.predicted >= 0 && b.predicted <= 1 && b.observed >= 0 && b.observed <= 1);
});

test('featureICs: el IC univariado de la variable plantada es negativo y significativo por permutación', () => {
  const { rows } = dataset(41, PLANTED);
  const ics = featureICs(rows, FEATURE_NAMES, 20);
  assert.ok(ics.ry_chg20.ic < -0.15, `ic=${ics.ry_chg20.ic}`);
  assert.ok(ics.ry_chg20.pValue < 0.05, `p=${ics.ry_chg20.pValue}`);
  assert.equal(Object.keys(ics).length, FEATURE_NAMES.length);
});

// ── veredicto ──────────────────────────────────────────────────────────────

test('verdict: exige p<0.01 y hold-out coherente; distingue los casos', () => {
  const ok = { icPermP: 0.004, ic: 0.2 };
  assert.match(verdict({ insufficient: true }, null), /insuficientes/);
  assert.match(verdict({ icPermP: 0.04, ic: 0.2 }, { ic: 0.2, icPermP: 0.01 }), /sin evidencia/);
  assert.match(verdict(ok, null), /hold-out sin datos/);
  assert.match(verdict(ok, { ic: 0.15, icPermP: 0.05 }), /^evidencia/);
  assert.match(verdict(ok, { ic: 0.15, icPermP: 0.4 }), /no la confirma/);
  assert.match(verdict(ok, { ic: -0.1, icPermP: 0.2 }), /descartado/);
});

// ── el embargo por fecha de etiqueta ───────────────────────────────────────

test('EMBARGO: ningún fold entrena con etiquetas que terminan después de su primer día de test', () => {
  const { rows } = dataset(41, PLANTED);
  const r = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, lambda: 5, permB: 50 });
  assert.ok(r.folds.length > 10, `folds ${r.folds.length}`);
  for (const f of r.folds) assert.ok(f.trainLabelEnd < f.start, `fold ${f.start}: entrena con etiquetas hasta ${f.trainLabelEnd}`);
  for (let i = 1; i < r.folds.length; i++) {
    assert.ok(r.folds[i].start > r.folds[i - 1].start);
    assert.ok(r.folds[i].nTrain >= r.folds[i - 1].nTrain);      // ventana expansiva
  }
  assert.ok(r.folds[0].nTrain >= 750);
});

test('las predicciones son estrictamente posteriores al inicio del entrenamiento y no se repiten fechas', () => {
  const { rows } = dataset(41, PLANTED);
  const r = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, lambda: 5, permB: 50 });
  const dates = r.predictions.map(p => p.date);
  assert.equal(new Set(dates).size, dates.length);
  assert.deepEqual(dates, [...dates].sort());
});

// ── hold-out intocable ─────────────────────────────────────────────────────

test('HOLD-OUT: se evalúa aparte, con un modelo entrenado solo con etiquetas anteriores', () => {
  const { rows } = dataset(41, PLANTED);
  const holdoutStart = rows[rows.length - 500].date;
  const r = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, lambda: 5, holdoutStart, permB: 50 });
  assert.ok(r.predictions.every(p => p.date < holdoutStart));
  assert.ok(r.holdoutPredictions.length > 300 && r.holdoutPredictions.every(p => p.date >= holdoutStart));
  assert.ok(r.folds.every(f => f.end < holdoutStart));
  const expectTrain = usableRows(rows, PARSIMONIOUS, 20).filter(d => d.labelDate < holdoutStart).length;
  assert.equal(r.holdout.nTrain, expectTrain);
  assert.ok(r.holdout.ic > 0, `IC hold-out ${r.holdout.ic}`);
});

test('HOLD-OUT sin fuga: alterar los datos posteriores a holdoutStart NO cambia ninguna predicción del walk-forward', () => {
  const { raw, rows } = dataset(41, PLANTED);
  const holdoutStart = rows[rows.length - 500].date;
  const a = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, lambda: 5, holdoutStart, permB: 50 });

  const rng = mulberry32(5);
  const t = clone(raw);
  let mult = 1;
  for (const c of t.gold) if (c.date >= holdoutStart) { mult *= Math.exp(0.05 * gaussian(rng)); c.close *= mult; c.open = c.high = c.low = c.close; }
  for (const k of Object.keys(t.fred)) for (const o of t.fred[k]) if (o.date >= holdoutStart) o.value += 3 * gaussian(rng);
  for (const o of t.cot) if (o.date >= holdoutStart) o.netSpec += 80000 * gaussian(rng);
  const b = walkForward(buildDataset(t), { names: PARSIMONIOUS, horizon: 20, lambda: 5, holdoutStart, permB: 50 });

  assert.equal(b.predictions.length, a.predictions.length);
  for (let i = 0; i < a.predictions.length; i++) {
    assert.equal(b.predictions[i].date, a.predictions[i].date);
    assert.equal(b.predictions[i].score, a.predictions[i].score, `predicción distinta en ${a.predictions[i].date}`);
  }
});

// ── score externo, evaluate y determinismo ─────────────────────────────────

test('evaluateScore: la variable verdadera predice; un score aleatorio no', () => {
  const { rows } = dataset(41, PLANTED);
  const good = evaluateScore(rows, r => (Number.isFinite(r.x.ry_chg20) ? -r.x.ry_chg20 : NaN), { horizon: 20, permB: 200 });
  const rng = mulberry32(77);
  const noise = evaluateScore(rows, () => rng(), { horizon: 20, permB: 200 });
  assert.ok(good.ic > 0.15, `ic bueno ${good.ic}`);
  assert.ok(Math.abs(noise.ic) < 0.1, `ic ruido ${noise.ic}`);
  assert.ok(good.icPermP < noise.icPermP);
});

test('evaluate: con pocas predicciones lo declara insuficiente en vez de inventar métricas', () => {
  const r = evaluate(Array.from({ length: 10 }, (_, i) => ({ score: i, actual: i })), 20);
  assert.equal(r.insufficient, true);
});

test('determinismo: dos corridas con los mismos datos dan resultados idénticos', () => {
  const { rows } = dataset(41, PLANTED);
  const a = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, lambda: 5, permB: 50 });
  const b = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, lambda: 5, permB: 50 });
  assert.deepEqual(a.oos, b.oos);
  assert.deepEqual(a.folds.map(f => f.coef), b.folds.map(f => f.coef));
});

test('sin datos suficientes no hay folds ni métricas (no revienta)', () => {
  const { rows } = dataset(51, { n: 600 });
  const r = walkForward(rows, { names: PARSIMONIOUS, horizon: 20, minTrain: 750 });
  assert.equal(r.folds.length, 0);
  assert.equal(r.oos.insufficient, true);
  assert.equal(r.holdout, null);
});
