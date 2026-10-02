// Features y etiquetas POINT-IN-TIME para el backtester y (más adelante) el runtime.
//
// Todas las features del día t usan solo datos visibles en t (ver timeseries.js: rezagos de
// publicación) y ventanas hacia atrás. Nunca miran adelante. Las etiquetas (retorno futuro a h días)
// SÍ miran adelante, por definición, y se guardan aparte (`fwd`) junto con la fecha en que terminan
// (`labelDate`) para poder aplicar un embargo al entrenar.
//
// Datos de entrada (`raw`):
//   gold:   [{ date, open, high, low, close, volume }]   calendario de decisión (días de negociación)
//   silver: [{ date, close }]                             opcional (ratio oro/plata)
//   dxy:    [{ date, value }]                             opcional: DX-Y.NYB para la réplica del score
//   fred:   { realYield10, yield10, yield2, breakeven10, dollarBroad, vix, gvz } → [{ date, value }]
//   cot:    [{ date (fecha del dato, martes), netSpec, openInterest }]

import { mean, zscore, percentileRank, clamp } from './stats.js';
import { emaSeries, rsiSeries, logReturns, realizedVol } from './indicators.js';
import { AVAILABILITY_LAG_DAYS, lastVisibleIndex, visibleWindow, cleanSeries } from './timeseries.js';

export const FEATURE_NAMES = [
  // precio / tendencia del oro
  'mom20', 'mom60', 'mom120', 'ext200', 'ma50_200', 'rsi14', 'rvol20', 'dd252',
  // macro (z-scores y cambios; nunca niveles absolutos sin normalizar)
  'ry_z', 'ry_chg20', 'y10_chg20', 'curve_z', 'be_chg20', 'usd_chg20', 'vix_z', 'gvz_z',
  // posicionamiento y relativos
  'cot_pct', 'cot_chg4', 'gs_z'
];

// Variables adicionales (P6): se calculan en cada fila pero NO forman parte de FEATURE_NAMES, para no alterar los modelos
// pre-declarados de las fases anteriores (el ridge de 19 variables, etc.).
export const EXTRA_FEATURE_NAMES = ['mm_pct'];

export const FORWARD_HORIZONS = [5, 20, 60];

// Historia mínima de velas antes de emitir la primera fila (EMA200 + margen para z-scores de 252)
export const MIN_HISTORY = 260;

const Z_CLAMP = 4;
const zc = (z) => (z === null ? null : clamp(z, -Z_CLAMP, Z_CLAMP));

const lag = (name) => AVAILABILITY_LAG_DAYS[name];

/** z-score del último valor visible dentro de las últimas `n` observaciones visibles (mín. `minN`). */
function levelZ(series, date, lagDays, n = 252, minN = 200) {
  const win = visibleWindow(series, date, lagDays, n).map(o => o.value);
  if (win.length < minN) return null;
  return zc(zscore(win[win.length - 1], win, minN));
}

/** Cambio (último − hace k observaciones) usando observaciones visibles; null si no hay k+1. */
function change(series, date, lagDays, k) {
  const win = visibleWindow(series, date, lagDays, k + 1);
  return win.length === k + 1 ? win[k].value - win[0].value : null;
}

/** Cambio logarítmico (último/hace k observaciones). */
function logChange(series, date, lagDays, k) {
  const win = visibleWindow(series, date, lagDays, k + 1);
  return win.length === k + 1 && win[0].value > 0 && win[k].value > 0 ? Math.log(win[k].value / win[0].value) : null;
}

/** Une dos series por fecha exacta con `fn(a, b)`. */
function combine(a, b, fn) {
  const mb = new Map(b.map(o => [o.date, o.value]));
  const out = [];
  for (const o of a) if (mb.has(o.date)) out.push({ date: o.date, value: fn(o.value, mb.get(o.date)) });
  return out;
}

/**
 * Prepara una sola vez las series derivadas y los indicadores causales.
 */
export function prepare(raw) {
  const gold = raw.gold;
  const closes = gold.map(c => c.close);
  const fred = raw.fred ?? {};
  const s = (name) => cleanSeries(fred[name] ?? []);

  const prepared = {
    gold, closes,
    ema20: emaSeries(closes, 20), ema50: emaSeries(closes, 50), ema200: emaSeries(closes, 200),
    rsi: rsiSeries(closes, 14), ret: logReturns(closes),
    realYield10: s('realYield10'), yield10: s('yield10'), yield2: s('yield2'),
    breakeven10: s('breakeven10'), dollarBroad: s('dollarBroad'), vix: s('vix'), gvz: s('gvz'),
    dxy: cleanSeries(raw.dxy ?? []),
    silver: cleanSeries((raw.silver ?? []).map(o => ({ date: o.date, value: o.close ?? o.value })))
  };

  prepared.curve = combine(prepared.yield10, prepared.yield2, (a, b) => a - b);
  prepared.goldSilver = combine(gold.map(c => ({ date: c.date, value: c.close })), prepared.silver, (g, sv) => (sv > 0 ? g / sv : NaN))
    .filter(o => Number.isFinite(o.value));

  // COT como % del open interest (o contratos netos si no hay OI), con fecha de publicación por rezago
  prepared.cot = cleanSeries((raw.cot ?? []).map(o => ({
    date: o.date,
    value: o.openInterest > 0 ? (o.netSpec / o.openInterest) * 100 : o.netSpec,
    netSpec: o.netSpec, openInterest: o.openInterest
  })));
  // COT desagregado: managed money neto como % del open interest
  prepared.cotMm = cleanSeries((raw.cotMm ?? []).map(o => ({
    date: o.date,
    value: o.openInterest > 0 ? (o.mmNet / o.openInterest) * 100 : o.mmNet
  })));
  return prepared;
}

/**
 * Features del día en la posición `i` del calendario de oro. Devuelve { x, raw } donde x = { nombre: valor|null }.
 * `raw` conserva valores en niveles para la réplica del score actual (ruleScore).
 */
export function featuresAt(P, i) {
  const date = P.gold[i].date;
  const c = P.closes;
  const mom = (h) => (i >= h ? Math.log(c[i] / c[i - h]) : null);

  let dd252 = null;
  if (i >= 251) dd252 = c[i] / Math.max(...c.slice(i - 251, i + 1)) - 1;

  // COT: percentil de 3 años (156 semanas) y cambio de 4 semanas
  const cotWin = visibleWindow(P.cot, date, lag('cot'), 156);
  const cotNow = cotWin[cotWin.length - 1];
  const cot_pct = cotWin.length >= 104 ? percentileRank(cotNow.value, cotWin.map(o => o.value), 104) : null;
  const cot_chg4 = cotWin.length >= 5 ? cotNow.value - cotWin[cotWin.length - 5].value : null;

  // Managed money: percentil de 3 años del neto como % del open interest
  const mmWin = visibleWindow(P.cotMm, date, lag('cotMm'), 156);
  const mm_pct = mmWin.length >= 104 ? percentileRank(mmWin[mmWin.length - 1].value, mmWin.map(o => o.value), 104) : null;

  const x = {
    mm_pct,
    mom20: mom(20), mom60: mom(60), mom120: mom(120),
    ext200: i >= 199 ? c[i] / P.ema200[i] - 1 : null,
    ma50_200: i >= 199 ? P.ema50[i] / P.ema200[i] - 1 : null,
    rsi14: P.rsi[i],
    rvol20: realizedVol(P.ret, i, 20),
    dd252,

    ry_z: levelZ(P.realYield10, date, lag('realYield10')),
    ry_chg20: change(P.realYield10, date, lag('realYield10'), 20),
    y10_chg20: change(P.yield10, date, lag('yield10'), 20),
    curve_z: levelZ(P.curve, date, lag('yield10')),
    be_chg20: change(P.breakeven10, date, lag('breakeven10'), 20),
    usd_chg20: logChange(P.dollarBroad, date, lag('dollarBroad'), 20),
    vix_z: levelZ(P.vix, date, lag('vix')),
    gvz_z: levelZ(P.gvz, date, lag('gvz')),

    cot_pct, cot_chg4,
    gs_z: levelZ(P.goldSilver, date, lag('silver'))
  };

  // Niveles para la réplica del score actual (misma visibilidad point-in-time)
  const last = (series, lg) => { const k = lastVisibleIndex(series, date, lg); return k >= 0 ? series[k] : null; };
  const prev = (series, lg) => { const k = lastVisibleIndex(series, date, lg); return k >= 1 ? series[k - 1] : null; };
  const dxySeries = P.dxy.length ? P.dxy : P.dollarBroad;
  const dxyLag = P.dxy.length ? 0 : lag('dollarBroad');
  const d1 = last(dxySeries, dxyLag), d0 = prev(dxySeries, dxyLag);
  const cotObs = last(P.cot, lag('cot'));
  const cotPrev = cotWin.length >= 2 ? cotWin[cotWin.length - 2] : null;
  const gsl = last(P.goldSilver, lag('silver'));

  const rawLevels = {
    close: c[i], ema20: P.ema20[i], ema50: P.ema50[i], ema200: i >= 199 ? P.ema200[i] : null, rsi: P.rsi[i],
    dxyChangePct: d1 && d0 && d0.value > 0 ? ((d1.value - d0.value) / d0.value) * 100 : null,
    tenYear: last(P.yield10, lag('yield10'))?.value ?? null,
    realYield: last(P.realYield10, lag('realYield10'))?.value ?? null,
    cotNetSpec: cotObs?.netSpec ?? null,
    cotWeekChange: cotObs && cotPrev ? cotObs.netSpec - cotPrev.netSpec : null,
    gvz: last(P.gvz, lag('gvz'))?.value ?? null,
    goldSilverRatio: gsl?.value ?? null
  };

  return { x, raw: rawLevels };
}

/**
 * Dataset completo: una fila por día desde MIN_HISTORY.
 * @returns {Array<{ date, index, close, x, raw, fwd: Record<number, number|null>, labelDate: Record<number, string|null> }>}
 */
export function buildDataset(raw, { horizons = FORWARD_HORIZONS, minHistory = MIN_HISTORY } = {}) {
  const P = prepare(raw);
  const n = P.gold.length;
  const rows = [];
  for (let i = minHistory; i < n; i++) {
    const { x, raw: levels } = featuresAt(P, i);
    const fwd = {}, labelDate = {};
    for (const h of horizons) {
      fwd[h] = i + h < n ? Math.log(P.closes[i + h] / P.closes[i]) : null;
      labelDate[h] = i + h < n ? P.gold[i + h].date : null;
    }
    rows.push({ date: P.gold[i].date, index: i, close: P.closes[i], x, raw: levels, fwd, labelDate });
  }
  return rows;
}

/** Vector de features en el orden de `names`, o null si alguna falta. */
export function toVector(row, names = FEATURE_NAMES) {
  const v = names.map(n => row.x[n]);
  return v.every(a => a !== null && a !== undefined && Number.isFinite(a)) ? v : null;
}

/** Cobertura por feature (% de filas no nulas): diagnóstico de qué datos faltan. */
export function coverage(rows, names = FEATURE_NAMES) {
  return Object.fromEntries(names.map(n => [n, rows.length ? mean(rows.map(r => (Number.isFinite(r.x[n]) ? 1 : 0))) : 0]));
}
