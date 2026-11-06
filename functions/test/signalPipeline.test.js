import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSettings, engineUserState } from '../src/services/userSettings.js';
import { buildPortfolioContext, EXECUTED_WINDOW_MS } from '../src/services/portfolioContext.js';
import { computeSignal, buildMarketContext } from '../src/services/signalService.js';
import { makeDecision } from '../src/services/decisionEngine.js';
import { applyDataQuality } from '../src/services/dataHealth.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 6, 12);

// ── parseSettings / engineUserState ──────────────────────────────────────────

test('parseSettings: valida y normaliza lo que manda el cliente', () => {
  assert.deepEqual(parseSettings({ cashUsd: '333.456', mode: 'inversion', installments: 4, targetPercent: 25, feePercent: 0.1 }).settings,
    { cashUsd: 333.46, mode: 'inversion', installments: 4, targetPercent: 25, feePercent: 0.1 });
  // campos vacíos = sin dato (no cero)
  assert.deepEqual(parseSettings({}).settings, { cashUsd: null, mode: 'inversion', installments: null, targetPercent: null, feePercent: null });
  assert.deepEqual(parseSettings({ cashUsd: '', targetPercent: null, feePercent: '' }).settings.cashUsd, null);
  assert.equal(parseSettings(undefined).settings.mode, 'inversion');
  assert.equal(parseSettings({ installments: 99 }).settings.installments, 12);       // se acota como en el motor
  assert.equal(parseSettings({ installments: 0 }).settings.installments, 1);
});

test('parseSettings: rechaza lo inválido con un mensaje en español', () => {
  for (const bad of [{ cashUsd: -1 }, { cashUsd: 'mucho' }, { cashUsd: 2e9 }, { mode: 'hacker' }, { installments: 'x' }, { targetPercent: 0 }, { targetPercent: 100 }, { targetPercent: 'a' }, { feePercent: -0.1 }, { feePercent: 9 }]) {
    const r = parseSettings(bad);
    assert.ok(r.error, JSON.stringify(bad));
    assert.equal(r.settings, undefined);
  }
});

test('engineUserState: arma el estado "solo USDT" que usa la ruta /decision', () => {
  assert.deepEqual(engineUserState({ cashUsd: 333, mode: 'inversion', installments: 6, feePercent: 0.1, targetPercent: 20 }), {
    cashPercent: 100, mode: 'inversion', totalCapital: 333, installments: 6, costs: { feeBps: 10 }, target: { targetPercent: 20 }
  });
  const bare = engineUserState({ cashUsd: 50 });
  assert.equal(bare.installments, 4);                 // por defecto
  assert.equal(bare.costs, undefined);
  assert.equal(bare.target, null);
  assert.equal(engineUserState({}).totalCapital, 0);
});

// ── buildPortfolioContext ────────────────────────────────────────────────────

const op = (o) => ({ symbol: 'PAXG', type: 'BUY', amount_usd: 100, price: 4000, units: 0.025, fee: 0, ...o });

test('portfolioContext: null si nunca operó ese activo', () => {
  assert.equal(buildPortfolioContext([], 'PAXG', {}, NOW), null);
  assert.equal(buildPortfolioContext([op({ symbol: 'BTC', price: 90000, units: 0.0011 })], 'PAXG', {}, NOW), null);
});

test('portfolioContext: posición, precio medio, valor del portfolio y compras (todas y las de la ventana de 4 días)', () => {
  const ops = [
    op({ date: '2026-10-20', amount_usd: 100, price: 4000, units: 0.025 }),
    op({ date: '2026-11-04', amount_usd: 100, price: 3800, units: 100 / 3800 }),
    op({ symbol: 'BTC', date: '2026-11-01', amount_usd: 90, price: 90000, units: 0.001 })
  ];
  const c = buildPortfolioContext(ops, 'PAXG', { PAXG: 3900, BTC: 100000 }, NOW);
  assert.equal(c.hasPosition, true);
  assert.equal(c.currentPrice, 3900);
  assert.ok(Math.abs(c.avgBuyPrice - 200 / (0.025 + 100 / 3800)) < 1e-6);
  assert.equal(c.allBuys.length, 2);
  assert.deepEqual(c.allBuys.map(b => b.date), ['2026-10-20', '2026-11-04']);        // ordenadas por fecha
  assert.deepEqual(c.executedBuys.map(b => b.date), ['2026-11-04']);                  // solo la de los últimos 4 días
  assert.equal(EXECUTED_WINDOW_MS, 4 * DAY);
  // valor total = PAXG + BTC a precio actual
  assert.ok(Math.abs(c.portfolioValueUsd - ((0.025 + 100 / 3800) * 3900 + 0.001 * 100000)) < 1e-6);
});

test('portfolioContext: valúa con el precio medio los activos sin precio y no cuenta posiciones cerradas', () => {
  const ops = [
    op({ symbol: 'BTC', date: '2026-10-01', amount_usd: 90, price: 90000, units: 0.001 }),
    op({ symbol: 'BTC', date: '2026-10-02', type: 'SELL', amount_usd: 100, price: 100000, units: 0.001 }),
    op({ date: '2026-10-01' })
  ];
  const c = buildPortfolioContext(ops, 'PAXG', { PAXG: 4000 }, NOW);
  assert.ok(Math.abs(c.portfolioValueUsd - 0.025 * 4000) < 1e-6);                     // BTC vendido: 0 unidades
});

// ── computeSignal (motor real, sin red) ──────────────────────────────────────

// Velas diarias determinísticas (datos de prueba, no de mercado): baja sostenida con rebote final
const candlesFrom = (n, f) => Array.from({ length: n }, (_, i) => {
  const c = f(i);
  return { timestamp: NOW - (n - i) * DAY, open: c * 1.001, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + (i % 7) * 50 };
});
const fall = candlesFrom(300, i => 100000 - i * 120 + Math.sin(i / 3) * 800);
const marketData = { price: fall.at(-1).close, candles: fall, candlesSource: 'coinbase' };
const deps = { getUpcomingEvents: () => [], warn: () => {} };
const user = { cashPercent: 100, mode: 'inversion', totalCapital: 333, installments: 4 };

test('computeSignal = el camino de la API: mismo mercado, mismo motor, misma calidad de datos', async () => {
  const pc = buildPortfolioContext([op({ symbol: 'BTC', date: '2026-10-01', amount_usd: 100, price: 130000, units: 100 / 130000 })], 'BTC', { BTC: marketData.price }, NOW);
  const s = await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: pc, now: NOW }, deps);
  const ctx = await buildMarketContext('BTC', marketData, deps);
  const manual = applyDataQuality(makeDecision(ctx.marketMode, ctx.zones, marketData.price, user, ctx.indicators, 'BTC', pc, { candlesSource: 'coinbase', pullback: null, now: NOW }), ctx.marketMode.goldContext?.dataHealth);
  assert.equal(s.decision.action, manual.action);
  assert.equal(s.decision.reason, manual.reason);
  assert.deepEqual(s.decision.cadence, manual.cadence);
  assert.ok(['BUY', 'WAIT', 'SELL'].includes(s.decision.action));
});

test('computeSignal: con una compra de ayer la cadencia NO está vencida y la señal no es COMPRAR (fin del "comprar todo el rato")', async () => {
  const bought = (daysAgo, price) => buildPortfolioContext(
    [op({ symbol: 'BTC', date: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10), amount_usd: 100, price, units: 100 / price })], 'BTC', { BTC: marketData.price }, NOW);

  const recent = await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: bought(1, marketData.price * 1.001), now: NOW }, deps);
  assert.equal(recent.decision.cadence.due, false);
  assert.notEqual(recent.decision.action, 'BUY');
  assert.ok(recent.decision.cadence.nextAt, 'informa cuándo toca la próxima');

  const old = await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: bought(10, marketData.price * 1.001), now: NOW }, deps);
  assert.equal(old.decision.cadence.due, true);
  assert.equal(old.decision.cadence.reason, 'due');
});

test('computeSignal: si falla el calendario macro la señal sale igual', async () => {
  const warns = [];
  const s = await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: null, now: NOW },
    { getUpcomingEvents: () => { throw new Error('calendario roto'); }, warn: (m) => warns.push(m) });
  assert.ok(s.decision.action);
  // si hubiera compra se avisa del fallo; si no, no hace falta tocar el calendario
  if (s.decision.action === 'BUY') assert.ok(warns.some(w => w.includes('calendario roto')));
});

test('buildMarketContext PAXG: si el contexto de oro falla cae al modo genérico y avisa (no inventa datos macro)', async () => {
  const warns = [];
  const gold = candlesFrom(300, i => 3000 + i * 2 + Math.sin(i / 4) * 20);
  const md = { price: gold.at(-1).close, candles: gold, candlesSource: 'coinbase' };
  const ctx = await buildMarketContext('PAXG', md, { getGoldContext: async () => { throw new Error('FRED caído'); }, warn: (m) => warns.push(m) });
  assert.ok(ctx.marketMode);
  assert.ok(warns.some(w => w.includes('FRED caído')));
});
