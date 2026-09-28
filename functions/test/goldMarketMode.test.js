import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  determineGoldMarketMode, AI_WEIGHT, MODE_THRESHOLD,
  interpolate, dxyScore, yieldScore, gvzAdjustment, ratioAdjustment
} from '../src/services/goldMarketMode.js';

const ind = { ema: { ema50: 4000, ema200: 4000 }, atr: 8, rsi: 50 };
const vol = { status: 'normal' };
const PRICE = 4000;

// Contexto de oro totalmente neutral; `mut` modifica solo lo que se quiere barrer
const base = () => ({
  analysis: { sentiment: 'neutral', score: 0, reasoning: '', keyFactors: [] },
  analysisError: null,
  macro: {
    dxy: { value: 100, changePercent: 0 },
    tenYearYield: { value: 4.1 },
    cot: null, realYield: null,
    gvz: { value: 17 }, silver: { value: 50 }, dailyBias: null
  },
  headlines: []
});
const run = (mut = () => {}) => { const c = base(); mut(c); return determineGoldMarketMode(PRICE, ind, vol, c); };
const ref = run();

// ── B6: la IA ya no puede decidir sola el régimen ───────────────────────────

test('B6: constantes — el peso de la IA queda por debajo del umbral de modo', () => {
  assert.ok(AI_WEIGHT < MODE_THRESHOLD);
});

test('B6: barriendo el score de la IA de −1 a +1, el modo nunca deja de ser neutral', () => {
  for (let s = -1; s <= 1.0001; s += 0.05) {
    const r = run(c => { c.analysis.score = s; });
    assert.equal(r.mode, 'neutral', `score IA ${s.toFixed(2)} → ${r.mode} (${r.score})`);   // antes: risk_on/off desde |0.63|
  }
});

test('B6: el aporte máximo de la IA es AI_WEIGHT', () => {
  const up = run(c => { c.analysis.score = 1; }).score - ref.score;
  const dn = run(c => { c.analysis.score = -1; }).score - ref.score;
  assert.ok(Math.abs(up - AI_WEIGHT) < 1e-3, `up=${up}`);
  assert.ok(Math.abs(dn + AI_WEIGHT) < 1e-3, `dn=${dn}`);
});

test('B6: si la IA falló no aporta al score y la razón lo dice (no "sentimiento neutral")', () => {
  const r = run(c => { c.analysis.score = 0.9; c.analysisError = 'timeout'; });
  assert.equal(r.score, ref.score);
  assert.ok(r.reasons.some(x => /IA no disponible/.test(x)));
  assert.ok(!r.reasons.some(x => /IA: Sentimiento/.test(x)));
  assert.equal(r.goldContext.analysisError, 'timeout');
});

// ── B6: continuidad (sin acantilados) ───────────────────────────────────────

test('B6: DXY — un cambio de 0.002 pp mueve el score < 0.002 (antes: −0.125 en 0.149→0.151)', () => {
  for (let x = -1.5; x <= 1.5; x += 0.0137) {
    const a = run(c => { c.macro.dxy.changePercent = x; }).score;
    const b = run(c => { c.macro.dxy.changePercent = x + 0.002; }).score;
    // el score final se redondea a 3 decimales: tolerancia = 2 milésimas (el escalón viejo era 125)
    assert.ok(Math.abs(a - b) < 0.002, `salto en DXY ${x.toFixed(4)}: ${a} → ${b}`);
  }
});

test('B6: 10Y — continuo en los antiguos bordes 3.5 / 4.0 / 4.25 / 4.75', () => {
  for (const edge of [3.5, 4.0, 4.25, 4.75]) {
    const a = run(c => { c.macro.tenYearYield.value = edge - 0.001; }).score;
    const b = run(c => { c.macro.tenYearYield.value = edge + 0.001; }).score;
    assert.ok(Math.abs(a - b) < 0.002, `salto en 10Y ${edge}: ${a} → ${b}`);
  }
});

test('B6: GVZ y oro/plata — continuos en los antiguos bordes', () => {
  for (const edge of [15, 20, 25]) {
    const a = run(c => { c.macro.gvz.value = edge - 0.01; }).score;
    const b = run(c => { c.macro.gvz.value = edge + 0.01; }).score;
    assert.ok(Math.abs(a - b) < 0.001, `salto en GVZ ${edge}`);
  }
  for (const edge of [70, 80, 90]) {
    const a = run(c => { c.macro.silver.value = PRICE / (edge - 0.01); }).score;
    const b = run(c => { c.macro.silver.value = PRICE / (edge + 0.01); }).score;
    assert.ok(Math.abs(a - b) < 0.001, `salto en oro/plata ${edge}`);
  }
});

// ── Mapeos: sentido económico preservado ────────────────────────────────────

test('mapeos: dólar fuerte resta, dólar débil suma, saturan en ±1', () => {
  assert.equal(dxyScore(0), -0);
  assert.ok(dxyScore(0.3) < 0 && dxyScore(-0.3) > 0);
  assert.equal(dxyScore(5), -1);
  assert.equal(dxyScore(-5), 1);
});

test('mapeos: yields bajos favorecen, altos penalizan (monótono decreciente)', () => {
  assert.equal(yieldScore(3), 1);
  assert.equal(yieldScore(5.5), -1);
  let prev = Infinity;
  for (let y = 3; y <= 5.5; y += 0.05) { const v = yieldScore(y); assert.ok(v <= prev + 1e-12); prev = v; }
});

test('mapeos: GVZ alto resta, bajo suma; oro/plata alto resta, bajo suma', () => {
  assert.ok(gvzAdjustment(12) > 0 && gvzAdjustment(30) < 0 && Math.abs(gvzAdjustment(18)) < 1e-12);
  assert.ok(ratioAdjustment(65) > 0 && ratioAdjustment(95) < 0 && Math.abs(ratioAdjustment(80)) < 1e-12);
});

test('interpolate satura fuera de rango e interpola dentro', () => {
  const k = [[0, 0], [10, 100]];
  assert.equal(interpolate(k, -5), 0);
  assert.equal(interpolate(k, 15), 100);
  assert.equal(interpolate(k, 2.5), 25);
});

// ── Regresión: el resto de las señales sigue pesando igual ──────────────────

test('COT crowded_long resta 0.10 y contrarian_bull suma 0.10', () => {
  const crowd = run(c => { c.macro.cot = { netSpec: 250000, weekChange: 0, sentiment: 'crowded_long' }; });
  const bull  = run(c => { c.macro.cot = { netSpec: -5000, weekChange: 0, sentiment: 'contrarian_bull' }; });
  assert.ok(Math.abs(crowd.score - ref.score + 0.10) < 1e-3);
  assert.ok(Math.abs(bull.score - ref.score - 0.10) < 1e-3);
});

test('tasa real very_bullish suma 0.10 y bearish resta 0.10', () => {
  const vb = run(c => { c.macro.realYield = { value: -0.3, sentiment: 'very_bullish' }; });
  const br = run(c => { c.macro.realYield = { value: 2.4, sentiment: 'bearish' }; });
  assert.ok(Math.abs(vb.score - ref.score - 0.10) < 1e-3);
  assert.ok(Math.abs(br.score - ref.score + 0.10) < 1e-3);
});

test('confluencia alcista fuerte → risk_on; confluencia bajista fuerte → risk_off', () => {
  const bull = run(c => {
    c.analysis.score = 0.8;
    c.macro.dxy.changePercent = -0.9; c.macro.tenYearYield.value = 3.2;
    c.macro.cot = { netSpec: -1000, weekChange: 20000, sentiment: 'contrarian_bull' };
    c.macro.realYield = { value: -0.4, sentiment: 'very_bullish' };
    c.macro.gvz.value = 12; c.macro.silver.value = PRICE / 65;
    c.macro.dailyBias = { alignment: 'bull', trendShort: 'alcista', rsi: 55 };
  });
  const bear = run(c => {
    c.analysis.score = -0.8;
    c.macro.dxy.changePercent = 0.9; c.macro.tenYearYield.value = 5;
    c.macro.cot = { netSpec: 300000, weekChange: -20000, sentiment: 'crowded_long' };
    c.macro.realYield = { value: 2.6, sentiment: 'bearish' };
    c.macro.gvz.value = 30; c.macro.silver.value = PRICE / 95;
    c.macro.dailyBias = { alignment: 'bear', trendShort: 'bajista', rsi: 45 };
  });
  assert.equal(bull.mode, 'risk_on');
  assert.equal(bear.mode, 'risk_off');
  assert.ok(bull.score <= 1 && bear.score >= -1);
});

test('sin contexto de oro cae al modo técnico con goldContext null', () => {
  const r = determineGoldMarketMode(PRICE, ind, vol, null);
  assert.equal(r.goldContext, null);
  assert.ok(['risk_on', 'neutral', 'risk_off'].includes(r.mode));
});
