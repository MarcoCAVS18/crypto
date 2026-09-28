// Datos sintéticos determinísticos para tests del backtester (no son datos de mercado).
import { mulberry32, gaussian } from '../../src/backtest/stats.js';

const DAY = 86400000;
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** n días hábiles (lun–vie) desde `start` ('YYYY-MM-DD'). */
export function weekdays(start, n) {
  const out = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < n) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(iso(t));
    t += DAY;
  }
  return out;
}

/** Martes semanales (fecha del dato COT) cubriendo [start, start+days). */
export function tuesdays(start, days) {
  const out = [];
  const t0 = Date.parse(`${start}T00:00:00Z`);
  for (let d = 0; d < days; d++) if (new Date(t0 + d * DAY).getUTCDay() === 2) out.push(iso(t0 + d * DAY));
  return out;
}

/**
 * Dataset crudo sintético.
 * @param {object} o
 * @param {number} o.seed
 * @param {number} o.n            días hábiles
 * @param {number} [o.beta]       si > 0, el oro reacciona (con signo −) al cambio a 20 obs de la tasa real: SEÑAL PLANTADA
 * @param {number} [o.dailyVol]
 * @param {boolean} [o.macro]     incluir series FRED/COT/plata (true por defecto)
 */
export function makeRaw({ seed = 1, n = 1800, beta = 0, dailyVol = 0.008, macro = true } = {}) {
  const rng = mulberry32(seed);
  const dates = weekdays('2014-01-01', n);

  // tasa real: paseo aleatorio lento
  const ry = [];
  let v = 1.0;
  for (let i = 0; i < n; i++) { v += 0.03 * gaussian(rng); ry.push(v); }

  // oro: retorno diario = deriva pequeña + beta·(−Δ20 tasa real) + ruido
  const closes = [];
  let p = 1200;
  for (let i = 0; i < n; i++) {
    const chg20 = i >= 21 ? ry[i - 1] - ry[i - 21] : 0;           // usa solo datos hasta i−1
    const r = 0.0002 + beta * (-chg20) + dailyVol * gaussian(rng);
    p *= Math.exp(r);
    closes.push(p);
  }
  const gold = dates.map((date, i) => ({
    date, open: closes[i] * 0.999, high: closes[i] * 1.006, low: closes[i] * 0.994, close: closes[i], volume: 1000
  }));

  if (!macro) return { gold, fred: {}, cot: [], silver: [] };

  const walk = (start, sigma, floor = -Infinity) => {
    let x = start; const out = [];
    for (let i = 0; i < n; i++) { x = Math.max(floor, x + sigma * gaussian(rng)); out.push(x); }
    return out;
  };
  const toObs = (arr) => arr.map((value, i) => ({ date: dates[i], value }));
  const y10 = walk(2.5, 0.04), y2 = walk(1.5, 0.05);

  const cotDates = tuesdays('2014-01-01', Math.ceil(n * 1.45));
  let net = 100000;
  const cot = cotDates.filter(d => d <= dates[n - 1]).map(date => {
    net += 6000 * gaussian(rng);
    return { date, netSpec: Math.round(net), openInterest: 450000 };
  });

  return {
    gold,
    silver: dates.map((date, i) => ({ date, close: closes[i] / (65 + 5 * Math.sin(i / 200)) })),
    fred: {
      realYield10: toObs(ry), yield10: toObs(y10), yield2: toObs(y2),
      breakeven10: toObs(walk(2.0, 0.02)), dollarBroad: toObs(walk(110, 0.4, 80)),
      vix: toObs(walk(18, 0.8, 9)), gvz: toObs(walk(16, 0.5, 8))
    },
    cot
  };
}

/** Copia profunda. */
export const clone = (o) => JSON.parse(JSON.stringify(o));
