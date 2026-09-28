import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run as runOutcomes } from '../src/scheduled/outcomeJob.js';
import { run as runSnapshot } from '../src/scheduled/snapshotJob.js';
import { buildDecisionRecord } from '../src/services/decisionLog.js';

const DAY = 86400000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const daily = Array.from({ length: 120 }, (_, i) => ({ timestamp: T0 + i * DAY, close: 100 + i, low: 99 + i, high: 102 + i }));

test('outcomeJob etiqueta decisiones con id horario, no re-etiqueta las completas y omite legacy/inválidas', async () => {
  const saved = [];
  const decisions = [
    { id: 'PAXG_2026010112', ts: T0 + 12 * 3600e3, price: 100, decision: 'BUY', strength: 'fuerte', shadow: { id: 'fixed_dca', action: 'BUY' } },
    { id: 'PAXG_2026010212', ts: T0 + DAY + 12 * 3600e3, price: 101, decision: 'WAIT' },
    { id: 'abcAUTOID', ts: T0, price: 100, decision: 'BUY' },                           // legacy
    { id: 'PAXG_2026010312', ts: T0 + 2 * DAY, price: 0, decision: 'BUY' },              // sin precio
    { id: 'PAXG_2026010412', timestamp: { toMillis: () => T0 + 3 * DAY }, price: 103, decision: 'SELL' }
  ];
  const res = await runOutcomes({
    getDecisionsBySymbol: async (sym) => (sym === 'PAXG' ? decisions : []),
    getOutcomes: async () => [{ id: 'PAXG_2026010212', complete: true }],
    saveOutcome: async (id, data) => saved.push({ id, data }),
    getDailyCandles: async () => daily,
    now: () => T0 + 119 * DAY
  });
  assert.equal(res.PAXG.labeled, 2);
  assert.deepEqual(saved.map(s => s.id), ['PAXG_2026010112', 'PAXG_2026010412']);
  const first = saved[0].data;
  assert.equal(first.action, 'BUY'); assert.equal(first.strength, 'fuerte'); assert.equal(first.complete, true);
  assert.deepEqual(first.shadow, { id: 'fixed_dca', action: 'BUY' });
  assert.ok(first.h20.ret > 0);
  assert.equal(res.BTC.labeled, 0);
});

test('outcomeJob: un error en un símbolo no frena a los demás y se informa', async () => {
  const warn = console.error; console.error = () => {};
  try {
    const res = await runOutcomes({
      getDecisionsBySymbol: async (sym) => { if (sym === 'PAXG') throw new Error('boom'); return []; },
      getOutcomes: async () => [], saveOutcome: async () => {}, getDailyCandles: async () => daily, now: () => T0 + 100 * DAY
    });
    assert.equal(res.PAXG.error, 'boom');
    assert.equal(res.BTC.labeled, 0);
  } finally { console.error = warn; }
});

test('buildDecisionRecord guarda el modo sombra', () => {
  const rec = buildDecisionRecord({ symbol: 'PAXG', marketData: { price: 4000 }, marketMode: { mode: 'neutral', score: 0 }, zones: {}, indicators: {}, userState: { cashPercent: 50 }, decision: { action: 'WAIT', operations: [] }, shadow: { id: 'fixed_dca', action: 'BUY', capFraction: 0.75 } });
  assert.deepEqual(rec.shadow, { id: 'fixed_dca', action: 'BUY', capFraction: 0.75 });
});

// ── snapshotJob: alerta de fuentes caídas ───────────────────────────────────
const candles = Array.from({ length: 5 }, (_, i) => ({ timestamp: i, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const baseDeps = (over = {}) => ({
  getCryptoData: async () => ({ price: 100, change24h: 0, candles, candlesSource: 'coinbase' }),
  calculateAllIndicators: () => ({ ema: {}, rsi: 50, atr: 1 }),
  analyzeVolume: () => ({ status: 'normal' }),
  calculateZones: () => null,
  determineMarketMode: () => ({ mode: 'neutral', score: 0 }),
  determineGoldMarketMode: () => ({ mode: 'neutral', score: 0, goldContext: { dataHealth: { level: 'severe', missing: ['dxy', 'tenYearYield'] } } }),
  getGoldContext: async () => ({}), saveSnapshot: async () => true, now: () => 1e12, ...over
});

test('snapshotJob: con severa persistente envía UN push y registra el enfriamiento; sin persistencia no envía', async () => {
  const sev = { dataHealth: { level: 'severe' } };
  const pushes = []; let state = null;
  const deps = baseDeps({
    getLatestSnapshots: async () => [sev, sev],
    getZoneState: async () => state, setZoneState: async (_k, s) => { state = s; },
    getPushSubscriptions: async () => [{ subscription: { endpoint: 'e1' } }],
    sendPush: async (subs, title) => { pushes.push(title); return subs; },
    deletePushSubscription: async () => {}
  });
  await runSnapshot(deps);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0], /fuentes de datos caídas/);
  assert.equal(state.lastAlertAt, 1e12);
  await runSnapshot(deps);                                   // enfriamiento: no repite
  assert.equal(pushes.length, 1);

  const quiet = baseDeps({ ...deps, getLatestSnapshots: async () => [sev, { dataHealth: { level: 'none' } }], getZoneState: async () => null });
  const before = pushes.length;
  await runSnapshot(quiet);
  assert.equal(pushes.length, before);
});

test('snapshotJob: si la alerta falla el snapshot igual se guarda', async () => {
  const warn = console.warn; console.warn = () => {};
  let saved = 0;
  try {
    await runSnapshot(baseDeps({
      getLatestSnapshots: async () => { throw new Error('firestore caído'); },
      getZoneState: async () => null, setZoneState: async () => {}, getPushSubscriptions: async () => [], sendPush: async () => [],
      saveSnapshot: async () => { saved++; return true; }
    }));
  } finally { console.warn = warn; }
  assert.ok(saved >= 1);
});
