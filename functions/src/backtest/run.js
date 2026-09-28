// Orquestación del backtest completo (pura: recibe datos crudos, devuelve resultados serializables).
//
// Protocolo (fijado ANTES de mirar resultados):
//  1. Hold-out = últimos `holdoutYears` años. Nada de lo que sigue lo toca salvo la evaluación final.
//  2. Diagnóstico univariado (IC de cada feature) SOLO con datos previos al hold-out.
//  3. Menú de modelos pre-declarado (candidates.js) × horizontes: walk-forward + hold-out + veredicto estricto.
//  4. Línea base: la réplica del score actual (ruleScore) evaluada en los mismos tramos.
//  5. DCA: ¿modular con el score actual (a favor o en contra) o con el compuesto a priori abarata el costo promedio?
//  6. Se cuenta cuántas comparaciones se hicieron (riesgo de falsos positivos).

import { buildDataset, coverage, FEATURE_NAMES, MIN_HISTORY } from './features.js';
import { walkForward, evaluateScore, featureICs } from './walkForward.js';
import { MODEL_MENU, HORIZONS, verdict } from './candidates.js';
import { ruleScoreOfRow } from './ruleScore.js';
import { buildSchedule, compareDCA } from './dcaSim.js';
import { addDays } from './timeseries.js';
import { std } from './stats.js';

const slim = (m) => {
  if (!m) return m;
  const { coef, ...rest } = m;
  return rest;
};

export function runBacktest(raw, { holdoutYears = 2, permB = 500, horizons = HORIZONS, dcaPlacebo = 300, log = () => {} } = {}) {
  const rows = buildDataset(raw);
  if (rows.length < 1200) return { insufficient: true, rows: rows.length };

  const lastDate = rows[rows.length - 1].date;
  const holdoutStart = addDays(lastDate, -Math.round(365.25 * holdoutYears));
  const pre = rows.filter(r => r.date < holdoutStart);
  let comparisons = 0;

  const out = {
    meta: {
      firstDate: rows[0].date, lastDate, rows: rows.length, holdoutStart, holdoutYears, permB,
      minHistory: MIN_HISTORY, horizons, coverage: coverage(rows)
    },
    featureICs: {}, models: [], baseline: [], dca: [], dcaHoldout: []
  };

  for (const h of horizons) {
    out.featureICs[h] = featureICs(pre.filter(r => r.labelDate[h] !== null && r.labelDate[h] < holdoutStart), FEATURE_NAMES, h, { permB: 300 });   // etiquetas que no tocan el hold-out
    comparisons += FEATURE_NAMES.length;
  }
  log('features univariadas listas');

  const priorPreds = {};
  const firstPred = {};   // primera fecha OOS por horizonte: la línea base se mide en el MISMO tramo que los modelos
  for (const m of MODEL_MENU) {
    for (const h of horizons) {
      const r = walkForward(rows, { ...m, horizon: h, holdoutStart, permB });
      comparisons++;
      out.models.push({
        id: m.id, label: m.label, horizon: h, kind: m.kind, names: m.names,
        folds: r.folds.length, oos: r.oos, holdout: slim(r.holdout), verdict: verdict(r.oos, r.holdout),
        coefStability: m.kind === 'prior' ? undefined : r.coefStability
      });
      if (r.predictions.length && !firstPred[h]) firstPred[h] = r.predictions[0].date;
      if (m.id === 'prior' && h === 20) priorPreds.map = new Map(r.predictions.map(p => [p.date, p.score]));
      log(`modelo ${m.id} h${h}: IC OOS ${r.oos.ic?.toFixed?.(3)} p=${r.oos.icPermP?.toFixed?.(3)}`);
    }
  }

  for (const h of horizons) {
    const firstOos = firstPred[h] ?? null;
    const oos = evaluateScore(rows, ruleScoreOfRow, { horizon: h, from: firstOos, to: holdoutStart, permB });
    const hold = evaluateScore(rows, ruleScoreOfRow, { horizon: h, from: holdoutStart, permB });
    comparisons++;
    out.baseline.push({ id: 'rule', label: 'Score actual (réplica diaria, sin IA)', horizon: h, from: firstOos, oos, holdout: hold, verdict: verdict(oos, hold) });
  }

  // DCA: score actual en ambas direcciones y compuesto a priori (fuera de muestra)
  const dcaRuns = [
    { id: 'rule_follow', label: 'Score actual — comprar MÁS con score alto', rows: pre, score: ruleScoreOfRow, dir: +1 },
    { id: 'rule_contra', label: 'Score actual — comprar MÁS con score bajo (contrarian)', rows: pre, score: ruleScoreOfRow, dir: -1 }
  ];
  if (priorPreds.map?.size) {
    const vals = [...priorPreds.map.values()];
    const sd = std(vals) || 1;
    const sc = (r) => Math.max(-1, Math.min(1, (priorPreds.map.get(r.date) ?? NaN) / (2 * sd)));
    const oosRows = pre.filter(r => priorPreds.map.has(r.date));
    dcaRuns.push({ id: 'prior_follow', label: 'Compuesto a priori (OOS) — más con score alto', rows: oosRows, score: sc, dir: +1 });
    dcaRuns.push({ id: 'prior_contra', label: 'Compuesto a priori (OOS) — más con score bajo', rows: oosRows, score: sc, dir: -1 });
  }
  for (const d of dcaRuns) {
    const sched = buildSchedule(d.rows, d.score, { everyDays: 5, mod: { k: 1, dir: d.dir } });
    const r = compareDCA(sched, { windowBuys: 104, stepBuys: 4, placebo: dcaPlacebo });   // ventanas de ~2 años
    comparisons++;
    const { perWindow, ...rest } = r;
    out.dca.push({ id: d.id, label: d.label, period: [d.rows[0]?.date, d.rows[d.rows.length - 1]?.date], ...rest });
    log(`dca ${d.id}: ratio ${r.meanRatio?.toFixed?.(4)} p=${r.pValue?.toFixed?.(3)}`);
  }

  // Hold-out del DCA (una sola mirada): el score actual sobre los últimos años, ventanas de ~6 meses
  // (con 2 años no entran ventanas de 2). Mismas dos direcciones ya pre-declaradas.
  const holdRows = rows.filter(r => r.date >= holdoutStart);
  for (const [id, label, dir] of [['rule_follow', 'Score actual — más con score alto', +1], ['rule_contra', 'Score actual — más con score bajo (contrarian)', -1]]) {
    const sched = buildSchedule(holdRows, ruleScoreOfRow, { everyDays: 5, mod: { k: 1, dir } });
    const { perWindow, ...rest } = compareDCA(sched, { windowBuys: 26, stepBuys: 2, placebo: dcaPlacebo });
    comparisons++;
    out.dcaHoldout.push({ id, label, period: [holdRows[0]?.date, holdRows[holdRows.length - 1]?.date], ...rest });
  }

  out.meta.comparisons = comparisons;
  return out;
}
