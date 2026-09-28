// Menú de modelos candidatos PRE-DECLARADOS.
//
// Se fijan ANTES de mirar resultados para no elegir el ganador por los datos (data snooping): con N
// candidatos y varios horizontes hay N×H comparaciones, y algo "sale significativo" por azar. El
// reporte lista cuántas comparaciones se hicieron y exige p < 0.01 más confirmación en el hold-out.
//
// Lección de las pruebas sintéticas (ver docs/BACKTEST.md): con ~40 observaciones independientes por
// ventana de entrenamiento, un ridge con las 19 variables ajusta ruido aun cuando hay una señal fuerte
// plantada. Por eso se prueban también modelos chicos y un compuesto de signos a priori sin ajuste.

import { FEATURE_NAMES } from './features.js';

export const MACRO_FEATURES = [
  'ry_z', 'ry_chg20', 'y10_chg20', 'curve_z', 'be_chg20', 'usd_chg20', 'vix_z', 'gvz_z', 'cot_pct', 'cot_chg4', 'gs_z'
];

export const TREND_FEATURES = ['mom20', 'mom60', 'mom120', 'ext200', 'ma50_200', 'rsi14', 'rvol20', 'dd252'];

/**
 * Signos económicos a priori (sobre la variable estandarizada) — NO estimados de los datos:
 *  + momentum de largo plazo del oro (time-series momentum) y cruce de medias alcista
 *  − tasa real (nivel y cambio): mayor costo de oportunidad para un activo sin cupón
 *  − cambio del bono 10Y nominal · − dólar amplio · + inflación implícita · + VIX (demanda de refugio)
 *  − posicionamiento especulativo alto (contrarian)
 * Las variables ambiguas (ext200, rsi14, rvol20, dd252, curva, GVZ, gold/silver, cambio COT) quedan
 * fuera del compuesto: no hay signo teórico claro.
 */
export const PRIOR_SIGNS = {
  mom60: +1, mom120: +1, ma50_200: +1,
  ry_z: -1, ry_chg20: -1, y10_chg20: -1, usd_chg20: -1, be_chg20: +1, vix_z: +1,
  cot_pct: -1
};

const priorNames = Object.keys(PRIOR_SIGNS);

export const MODEL_MENU = [
  { id: 'prior',       label: 'Compuesto de signos a priori (sin ajuste)', kind: 'prior',    names: priorNames, signs: priorNames.map(n => PRIOR_SIGNS[n]) },
  { id: 'macro_ridge', label: 'Ridge solo macro (11 variables)',           kind: 'ridge',    names: MACRO_FEATURES, lambda: 5 },
  { id: 'trend_ridge', label: 'Ridge solo tendencia del oro (8 variables)', kind: 'ridge',   names: TREND_FEATURES, lambda: 5 },
  { id: 'all_ridge',   label: 'Ridge con las 19 variables',                kind: 'ridge',    names: FEATURE_NAMES, lambda: 5 },
  { id: 'macro_logit', label: 'Logística solo macro → P(sube)',            kind: 'logistic', names: MACRO_FEATURES, lambda: 5 }
];

export const HORIZONS = [20, 60];   // 5 días es demasiado ruidoso para un acumulador de largo plazo

/** Nivel de evidencia. Exige p<0.01 (el test de permutación es liberal con series persistentes) y hold-out coherente. */
export function verdict(oos, holdout) {
  if (!oos || oos.insufficient) return 'datos insuficientes';
  const strong = oos.icPermP < 0.01;
  if (!strong) return 'sin evidencia (indistinguible del azar)';
  if (!holdout || holdout.insufficient) return 'señal en walk-forward, hold-out sin datos';
  const sameSign = Math.sign(holdout.ic) === Math.sign(oos.ic);
  if (sameSign && holdout.icPermP < 0.10) return 'evidencia: walk-forward y hold-out coinciden';
  if (sameSign) return 'señal en walk-forward; el hold-out no la confirma con claridad';
  return 'descartado: el hold-out contradice el walk-forward';
}
