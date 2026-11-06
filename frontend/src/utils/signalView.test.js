import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionView, modeView, strengthDots, fmtPrice, fmtUnits, summarizeOps, calcDcaEffect, totalDcaEffect, usageOf, cadenceView, rsiTag, zoneView, dataStatus, assetName, assetTab } from './signalView.js';

test('acción y modo: textos y tonos; desconocidos caen en esperar / neutral', () => {
  assert.equal(actionView('BUY').word, 'Comprar'); assert.equal(actionView('SELL').tone, 'pink');
  assert.equal(actionView(undefined).word, 'Esperar');
  assert.equal(modeView('risk_off').label, 'Risk OFF'); assert.equal(modeView({ mode: 'risk_on' }).tone, 'accent');
  assert.equal(modeView(null).label, 'Neutral');
  assert.equal(strengthDots('fuerte'), 3); assert.equal(strengthDots('débil'), 1); assert.equal(strengthDots('x'), 1);
});

test('formatos de precio y unidades', () => {
  assert.equal(fmtPrice(84123.4), '$84,123'); assert.equal(fmtPrice(4150), '$4,150'); assert.equal(fmtPrice(12.345), '$12.35');
  assert.equal(fmtPrice(4150, { decimals: 2 }), '$4,150.00'); assert.equal(fmtPrice(null), '—'); assert.equal(fmtPrice(NaN), '—');
  assert.equal(fmtUnits(1.71212), '1.7121'); assert.equal(fmtUnits(0.0753), '0.075300'); assert.equal(fmtUnits(0.00001234), '0.00001234');
});

test('summarizeOps: tramos y total; sin montos devuelve total null', () => {
  assert.deepEqual(summarizeOps([{ type: 'BUY', usdAmount: 60 }, { type: 'BUY', usdAmount: 140 }]), { type: 'BUY', count: 2, totalUsd: 200 });
  assert.deepEqual(summarizeOps([{ type: 'BUY', usdAmount: null }]), { type: 'BUY', count: 1, totalUsd: null });
  assert.deepEqual(summarizeOps([]), { type: null, count: 0, totalUsd: null });
});

test('efecto en el costo promedio: por tramo y total (compra por debajo del promedio lo baja)', () => {
  const summary = { hasPosition: true, avgBuyPrice: 4700, units: 2, costBasis: 9400 };
  const one = calcDcaEffect({ usdAmount: 400, price: 4000 }, summary);
  assert.ok(one.improves && one.newAvg < 4700);
  const total = totalDcaEffect([{ type: 'BUY', usdAmount: 400, price: 4000 }, { type: 'BUY', usdAmount: 400, price: 3900 }], summary);
  assert.ok(total.improves && total.to < one.newAvg && total.deltaPct < 0 && total.from === 4700);
  assert.equal(calcDcaEffect({ usdAmount: 400, price: 4000 }, { hasPosition: false }), null);
  assert.equal(totalDcaEffect([{ type: 'SELL', usdAmount: 1, price: 1 }], summary), null);
});

test('RSI, zona, datos y nombres', () => {
  assert.equal(rsiTag(75), 'Sobrecompra'); assert.equal(rsiTag(20), 'Sobreventa'); assert.equal(rsiTag(50), 'Neutral'); assert.equal(rsiTag(null), '');
  assert.equal(zoneView('buy').label, 'Zona de compra'); assert.equal(zoneView('x').label, 'Zona neutral');
  assert.deepEqual(dataStatus({ goldContext: { dataHealth: { missing: ['cot'], stale: ['realYield', 'gvz'] } } }), { known: true, problems: 3, text: '3 con problema' });
  assert.equal(dataStatus({ goldContext: { dataHealth: { missing: [], stale: [] } } }).text, 'Al día');
  assert.equal(dataStatus({}).known, false);
  assert.equal(assetName('PAXG'), 'Oro · PAXG'); assert.equal(assetName('SOL'), 'SOL'); assert.equal(assetTab('XAUUSDT'), 'XAUT');
});

test('usageOf: cuánto de los USDT usa la compra y cuánto queda de reserva', () => {
  const ops = [{ type: 'BUY', usdAmount: 32.4 }, { type: 'BUY', usdAmount: 32.4 }, { type: 'BUY', usdAmount: 43.2 }];
  assert.deepEqual(usageOf(ops, 333), { usd: 108, cash: 333, pct: 32, reserve: 225 });
  assert.equal(usageOf(ops, 0), null);                                        // sin USDT cargados
  assert.equal(usageOf([{ type: 'BUY', usdAmount: null }], 333), null);       // sin montos
  assert.equal(usageOf([{ type: 'SELL', percentage: 30 }], 333), null);       // ventas no usan USDT
  assert.equal(usageOf([], 333), null);
  assert.equal(usageOf([{ type: 'BUY', usdAmount: 400 }], 333).reserve, 0);   // decisión vieja con menos efectivo: nunca negativa
});

test('cadenceView: COMPRAR explica por qué toca; ESPERAR por ritmo dice cuándo toca la próxima', () => {
  assert.equal(cadenceView({ action: 'BUY', cadence: { reason: 'due' } }).text, 'Toca la compra de la semana');
  assert.equal(cadenceView({ action: 'BUY', cadence: { reason: 'first' } }).text, 'Primera compra de este activo');
  assert.match(cadenceView({ action: 'BUY', cadence: { reason: 'dip', dipPct: 3 } }).text, /^Bajó 3 % o más desde tu última compra/);
  const wait = cadenceView({ action: 'WAIT', cadence: { due: false, reason: 'recent', nextAt: '2026-11-10T12:00:00.000Z', dipPrice: 3880 } });
  assert.equal(wait.tone, 'warn');
  assert.equal(wait.text, 'Próxima compra desde el 10 nov o si baja a $3,880');
  assert.equal(cadenceView({ action: 'WAIT', cadence: { due: false, nextAt: 'basura' } }).text, 'Próxima compra en unos días');
});

test('cadenceView: sin cadencia, vender o esperar por otro motivo ⇒ nada que aclarar', () => {
  assert.equal(cadenceView(null), null);
  assert.equal(cadenceView({ action: 'BUY' }), null);
  assert.equal(cadenceView({ action: 'SELL', cadence: { due: false } }), null);
  assert.equal(cadenceView({ action: 'WAIT', cadence: { due: true, reason: 'due' } }), null);
});
