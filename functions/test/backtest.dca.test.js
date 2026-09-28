import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modulation, buildSchedule, compareDCA } from '../src/backtest/dcaSim.js';
import { ruleScore, ruleScoreOfRow } from '../src/backtest/ruleScore.js';
import { determineGoldMarketMode } from '../src/services/goldMarketMode.js';
import { mulberry32, gaussian } from '../src/backtest/stats.js';

// serie de precios de paseo aleatorio con leve deriva
function walkRows(n, seed, drift = 0.0003, vol = 0.01) {
  const rng = mulberry32(seed);
  let p = 100;
  return Array.from({ length: n }, (_, i) => { p *= Math.exp(drift + vol * gaussian(rng)); return { date: `d${String(i).padStart(5, '0')}`, close: p, i }; });
}

// ── modulation ─────────────────────────────────────────────────────────────

test('modulation: acotada, simétrica según la dirección y neutra si el score no es finito', () => {
  assert.equal(modulation(0), 1);
  assert.equal(modulation(0.5, { k: 1 }), 1.5);
  assert.equal(modulation(0.5, { k: 1, dir: -1 }), 0.5);
  assert.equal(modulation(5, { max: 2 }), 2);
  assert.equal(modulation(-5, { min: 0.25 }), 0.25);
  assert.equal(modulation(NaN), 1);
});

test('buildSchedule: una compra cada N filas', () => {
  const rows = walkRows(100, 1);
  const s = buildSchedule(rows, () => 0, { everyDays: 5 });
  assert.equal(s.length, 20);
  assert.equal(s[1].date, rows[5].date);
});

// ── compareDCA ─────────────────────────────────────────────────────────────

test('sin modulación (m=1) el DCA modulado es idéntico al fijo: ratio exactamente 1', () => {
  const rows = walkRows(2500, 2);
  const sched = buildSchedule(rows, () => 0);
  const r = compareDCA(sched, { placebo: 20 });
  assert.ok(r.windows > 20);
  assert.ok(Math.abs(r.meanRatio - 1) < 1e-12);
  assert.ok(r.perWindow.every(w => Math.abs(w.ratio - 1) < 1e-12));
});

test('el gasto queda igualado: la modulación no puede "ganar" gastando más', () => {
  const rows = walkRows(2500, 3);
  const sched = buildSchedule(rows, r => (r.i % 3) - 1);       // señal arbitraria
  const r = compareDCA(sched, { placebo: 10 });
  // con gasto igualado, ret y avgCost son consistentes: ratio<1 ⇔ modRet>fixedRet dentro de cada ventana
  for (const w of r.perWindow) assert.equal(w.ratio < 1, w.modRet > w.fixedRet);
});

test('ORÁCULO (mira el futuro, solo para validar el simulador): compra más antes de subas ⇒ ratio<1 y p pequeño', () => {
  const rows = walkRows(3000, 4, 0.0003, 0.012);
  const fwd = (i) => (i + 20 < rows.length ? Math.log(rows[i + 20].close / rows[i].close) : 0);
  const sched = buildSchedule(rows, r => Math.max(-1, Math.min(1, fwd(r.i) * 12)));
  const r = compareDCA(sched, { placebo: 200 });
  assert.ok(r.meanRatio < 0.99, `ratio ${r.meanRatio}`);
  assert.ok(r.pValue < 0.01, `p=${r.pValue}`);
  assert.ok(r.winRate > 0.9);
});

test('SEÑAL ALEATORIA: no le gana sistemáticamente al azar (p no chico en la mayoría de semillas)', () => {
  let small = 0;
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const rows = walkRows(3000, seed);
    const rng = mulberry32(seed * 7);
    const sched = buildSchedule(rows, () => 2 * rng() - 1);
    if (compareDCA(sched, { placebo: 200 }).pValue < 0.05) small++;
  }
  assert.ok(small <= 1, `${small}/6 señales aleatorias parecieron "buenas"`);
});

test('compareDCA: con pocas ventanas declara insuficiente', () => {
  const sched = buildSchedule(walkRows(300, 5), () => 0);
  assert.equal(compareDCA(sched).insufficient, true);
});

test('compareDCA es determinístico', () => {
  const sched = buildSchedule(walkRows(2000, 6), r => Math.sin(r.i / 30));
  assert.deepEqual(compareDCA(sched, { placebo: 30 }).pValue, compareDCA(sched, { placebo: 30 }).pValue);
});

// ── ruleScore: réplica coherente con producción ────────────────────────────

test('ruleScore coincide con determineGoldMarketMode de producción (sin IA) en escenarios variados', () => {
  const cases = [
    { close: 2400, ema20: 2380, ema50: 2350, ema200: 2200, rsi: 55, dxyChangePct: -0.3, tenYear: 3.9, realYield: 0.8, cotNetSpec: 120000, cotWeekChange: 20000, gvz: 16, goldSilverRatio: 78 },
    { close: 1900, ema20: 1950, ema50: 2000, ema200: 2100, rsi: 28, dxyChangePct: 0.7, tenYear: 4.8, realYield: 2.3, cotNetSpec: 250000, cotWeekChange: -20000, gvz: 27, goldSilverRatio: 92 },
    { close: 2000, ema20: 1990, ema50: 2010, ema200: 1950, rsi: 72, dxyChangePct: 0.1, tenYear: 4.1, realYield: -0.2, cotNetSpec: -5000, cotWeekChange: 0, gvz: 19, goldSilverRatio: 68 }
  ];
  const cotSent = n => (n > 200000 ? 'crowded_long' : n > 80000 ? 'bullish' : n > 0 ? 'neutral' : 'contrarian_bull');
  const ryClass = v => (v < 0 ? 'very_bullish' : v < 1 ? 'bullish' : v < 2 ? 'neutral' : 'bearish');
  for (const c of cases) {
    const ctx = {
      analysisError: 'sin IA',
      macro: {
        dxy: { value: 104, changePercent: c.dxyChangePct },
        tenYearYield: { value: c.tenYear },
        cot: { netSpec: c.cotNetSpec, weekChange: c.cotWeekChange, sentiment: cotSent(c.cotNetSpec) },
        realYield: { value: c.realYield, sentiment: ryClass(c.realYield) },
        gvz: { value: c.gvz },
        silver: { value: c.close / c.goldSilverRatio },
        dailyBias: { alignment: c.close > c.ema20 && c.close > c.ema50 ? 'bull' : c.close < c.ema20 && c.close < c.ema50 ? 'bear' : 'mixed', rsi: c.rsi }
      }
    };
    const prod = determineGoldMarketMode(c.close, { ema: { ema200: c.ema200, ema50: c.ema50 }, atr: 0, rsi: c.rsi }, { status: 'normal' }, ctx);
    const mine = ruleScore(c);
    assert.ok(Math.abs(prod.score - mine.score) < 0.002, `prod ${prod.score} vs réplica ${mine.score}`);
    assert.equal(prod.mode, mine.mode);
  }
});

test('ruleScore tolera datos faltantes (componente ausente = 0) y ruleScoreOfRow sin raw da NaN', () => {
  const s = ruleScore({ close: 100, ema200: 90, ema50: 95, rsi: 50 });
  assert.ok(Number.isFinite(s.score));
  assert.deepEqual(Object.keys(s.components), ['technical']);
  assert.ok(Number.isNaN(ruleScoreOfRow({})));
});
