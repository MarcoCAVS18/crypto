import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCosts, orderCostUsd, applyCosts, costNote, DEFAULT_COSTS } from '../src/services/costModel.js';
import { normalizeTarget, weightState, trimPctToBand, MAX_REBALANCE_TRIM_PCT } from '../src/services/portfolioPolicy.js';
import { evaluateExit, EXIT_RULES } from '../src/services/exitPolicy.js';
import { pullbackLevels } from '../src/services/pullbacks.js';

// ── costos ──────────────────────────────────────────────────────────────────
test('costos: valores por defecto, límites y entradas basura', () => {
  assert.deepEqual(normalizeCosts(undefined), { ...DEFAULT_COSTS });
  assert.equal(normalizeCosts({ feeBps: 9999 }).feeBps, 500);
  assert.equal(normalizeCosts({ feeBps: -3 }).feeBps, 0);
  assert.equal(normalizeCosts({ feeBps: 'abc' }).feeBps, DEFAULT_COSTS.feeBps);
  assert.equal(normalizeCosts({ feeBps: null }).feeBps, DEFAULT_COSTS.feeBps);
});

test('costo de una orden = comisión + medio spread', () => {
  assert.equal(orderCostUsd(1000, { feeBps: 50, spreadBps: 10 }), 5.5);
  assert.equal(orderCostUsd(0), 0);
  assert.equal(orderCostUsd(NaN), 0);
});

test('applyCosts: anota costo, descarta tramos ínfimos y conserva operaciones sin monto', () => {
  const ops = [{ usdAmount: 1000, level: 1 }, { usdAmount: 4, level: 2 }, { usdAmount: null, level: 3 }];
  const r = applyCosts(ops, { feeBps: 50, spreadBps: 0, minOrderUsd: 10 });
  assert.equal(r.operations.length, 2);
  assert.equal(r.operations[0].estCostUsd, 5);
  assert.equal(r.dropped, 1);
  assert.equal(r.totalCostUsd, 5);
  assert.match(costNote(r, { feeBps: 50, spreadBps: 0, minOrderUsd: 10 }), /Costo estimado ≈ \$5\.00.*omitieron 1 tramo/);
});

// ── peso objetivo ───────────────────────────────────────────────────────────
test('peso objetivo: sin objetivo no hay regla; con objetivo hay bandas', () => {
  assert.equal(normalizeTarget(undefined), null);
  assert.equal(normalizeTarget({ targetPercent: 0 }), null);
  assert.equal(normalizeTarget({ targetPercent: 100 }), null);
  const t = normalizeTarget({ targetPercent: 20 });
  assert.deepEqual([t.lower, t.upper], [15, 25]);
  assert.equal(weightState(10, { targetPercent: 20 }).state, 'below');
  assert.equal(weightState(20, { targetPercent: 20 }).state, 'inside');
  assert.equal(weightState(30, { targetPercent: 20 }).state, 'above');
  assert.equal(weightState(30, undefined), null);
});

test('recorte de rebalanceo: hasta el objetivo, acotado, y cero dentro de la banda', () => {
  const t = normalizeTarget({ targetPercent: 20 });
  assert.equal(trimPctToBand(24, t), 0);
  assert.equal(trimPctToBand(30, t), 33 > MAX_REBALANCE_TRIM_PCT ? MAX_REBALANCE_TRIM_PCT : 33);
  assert.equal(trimPctToBand(26, t), Math.round((26 - 20) / 26 * 100));
});

// ── salidas por régimen ─────────────────────────────────────────────────────
test('salidas: rotura de tendencia + macro adverso + ganancia ⇒ recorte; sin ganancia o sin macro adverso ⇒ nada', () => {
  const bear = { longAlignment: 'bear', extension200Pct: -3, rsi: 40 };
  const e = evaluateExit({ pnlPercent: 20, score: -0.4, dailyBias: bear });
  assert.equal(e.kind, 'trendBreak'); assert.equal(e.pct, EXIT_RULES.trendBreak.trimPct);
  assert.equal(evaluateExit({ pnlPercent: 5, score: -0.4, dailyBias: bear }), null);
  assert.equal(evaluateExit({ pnlPercent: 20, score: 0.1, dailyBias: bear }), null);
  assert.equal(evaluateExit({ pnlPercent: null, score: -0.4, dailyBias: bear }), null);
});

test('salidas: sobre-extensión (>25 % sobre EMA200, RSI diario ≥70, ganancia ≥25 %) ⇒ recorte chico', () => {
  const hot = { longAlignment: 'bull', extension200Pct: 28, rsi: 74 };
  const e = evaluateExit({ pnlPercent: 30, score: 0.5, dailyBias: hot });
  assert.equal(e.kind, 'overExtension'); assert.ok(e.pct <= 20);
  assert.equal(evaluateExit({ pnlPercent: 30, score: 0.5, dailyBias: { ...hot, rsi: 60 } }), null);
  assert.equal(evaluateExit({ pnlPercent: 10, score: 0.5, dailyBias: hot }), null);
});

// ── retrocesos históricos ───────────────────────────────────────────────────
const wave = (n, amp = 20, drift = 0) => Array.from({ length: n }, (_, i) => ({ close: 4000 + Math.sin(i / 3) * amp + i * drift }));

test('pullbackLevels: cuantiles de la profundidad de retrocesos; el 3.º siempre bajo el 2.º; acotado', () => {
  const p = pullbackLevels(wave(250, 20));
  assert.ok(p.l3Pct > p.l2Pct);
  assert.ok(p.l2Pct >= 0.4 && p.l3Pct <= 8);
  const calm = pullbackLevels(wave(250, 2));
  assert.ok(calm.l2Pct < p.l2Pct, 'activo más calmo ⇒ niveles menos profundos');
});

test('pullbackLevels: pocos datos o serie inválida ⇒ null (el motor usa los niveles fijos)', () => {
  assert.equal(pullbackLevels(wave(30)), null);
  assert.equal(pullbackLevels(undefined), null);
  assert.equal(pullbackLevels(Array.from({ length: 200 }, () => ({ close: 100 }))), null);   // sin retrocesos
});
