import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionView, modeView, strengthDots, fmtPrice, fmtUnits, summarizeOps, calcDcaEffect, totalDcaEffect, usageOf, cadenceView, aiView, firstBuyOp, draftFromOp, cashAfter, calendarGapView, rsiTag, zoneView, dataStatus, assetName, assetTab } from './signalView.js';

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

test('aiView: ESPERAR de la IA, compra confirmada, compra ajustada, tope de espera y sin respuesta', () => {
  const used = { used: true, confidence: 0.82, reasoning: 'FOMC mañana.', keyFactors: ['FOMC'], notes: [], followedRule: true };
  const wait = aiView({ action: 'WAIT', ai: { ...used, action: 'WAIT', waitUntil: '2026-11-08T12:00:00.000Z' } });
  assert.equal(wait.kind, 'wait'); assert.equal(wait.tone, 'warn'); assert.equal(wait.chip, 'IA: esperar hasta el 8 nov'); assert.equal(wait.confidence, 82);
  assert.match(wait.detail, /desde el 8 nov/);

  const ok = aiView({ action: 'BUY', ai: { ...used, action: 'BUY' } });
  assert.equal(ok.kind, 'buy'); assert.equal(ok.chip, 'IA: confirma la compra'); assert.equal(ok.detail, null);

  const adj = aiView({ action: 'BUY', ai: { ...used, action: 'BUY', followedRule: false, applied: { totalUsd: 75, tranches: 2, ruleTotalUsd: 125, ruleTranches: 3 } } });
  assert.equal(adj.kind, 'adjusted'); assert.equal(adj.chip, 'IA: ajustó a $75 en 2 tramos');
  assert.equal(adj.detail, 'La regla proponía $125 en 3 tramos; la IA lo dejó en $75 en 2 tramos.');
  assert.equal(aiView({ action: 'BUY', ai: { ...used, action: 'BUY', followedRule: false, applied: { totalUsd: 20, tranches: 1, ruleTotalUsd: 40, ruleTranches: 3 } } }).chip, 'IA: ajustó a $20 en 1 tramo');

  const capped = aiView({ action: 'BUY', ai: { ...used, action: 'WAIT', capped: true, notes: ['tope'] } });
  assert.equal(capped.chip, 'IA: se compra (tope de espera)'); assert.deepEqual(capped.notes, ['tope']);

  const off = aiView({ action: 'BUY', ai: { used: false, message: 'La IA no pudo evaluar esta compra; decide la regla.' } });
  assert.equal(off.kind, 'unavailable'); assert.equal(off.tone, 'muted'); assert.equal(off.chip, 'IA sin respuesta: decide la regla');
});

test('aiView: nada que mostrar sin IA o si el calendario pausó una compra que la IA aprobaba', () => {
  assert.equal(aiView(null), null);
  assert.equal(aiView({ action: 'BUY' }), null);
  assert.equal(aiView({ action: 'WAIT', ai: { used: true, action: 'BUY', reasoning: 'ok', confidence: 0.8 } }), null);
});

test('draftFromOp: la orden propuesta precarga el formulario (precio como se ve, unidades = monto ÷ precio) y solo para compras', () => {
  const d = draftFromOp({ type: 'BUY', price: 3923.4567, usdAmount: 32.4, level: 1 }, 'PAXG', '2026-11-06');
  assert.deepEqual(d, { symbol: 'PAXG', type: 'BUY', date: '2026-11-06', price: 3923, amount_usd: 32.4, units: Number((32.4 / 3923).toFixed(8)) });
  const cheap = draftFromOp({ type: 'BUY', price: 0.123456, usdAmount: 50 }, 'DOGE', '2026-11-06');
  assert.equal(cheap.price, 0.12);
  assert.equal(cheap.units, Number((50 / 0.12).toFixed(8)));
  // sin monto (plan en %): solo precio, el usuario completa lo demás
  assert.deepEqual(draftFromOp({ type: 'BUY', price: 4100, usdAmount: null }, 'PAXG', '2026-11-06'), { symbol: 'PAXG', type: 'BUY', date: '2026-11-06', price: 4100 });
  assert.equal(draftFromOp({ type: 'SELL', price: 4100, usdAmount: 10 }, 'PAXG'), null);
  assert.equal(draftFromOp(null, 'PAXG'), null);
  assert.equal(draftFromOp({ type: 'BUY', price: 0 }, 'PAXG'), null);
  assert.match(draftFromOp({ type: 'BUY', price: 10, usdAmount: 5 }, 'X').date, /^\d{4}-\d{2}-\d{2}$/);
});

test('firstBuyOp: la primera compra de una señal de COMPRAR; null si espera, vende o no hay órdenes', () => {
  const ops = [{ type: 'BUY', price: 3923, usdAmount: 32 }, { type: 'BUY', price: 3864, usdAmount: 32 }];
  assert.equal(firstBuyOp({ action: 'BUY', operations: ops }), ops[0]);
  assert.equal(firstBuyOp({ action: 'WAIT', operations: ops }), null);
  assert.equal(firstBuyOp({ action: 'BUY', operations: [] }), null);
  assert.equal(firstBuyOp({ action: 'SELL', operations: [{ type: 'SELL', percentage: 30 }] }), null);
  assert.equal(firstBuyOp(null), null);
});

test('cashAfter: lo que queda de los USDT después de la compra (nunca negativo, con centavos)', () => {
  assert.equal(cashAfter(333, 32.4), 300.6);
  assert.equal(cashAfter(333, 108), 225);
  assert.equal(cashAfter(50, 80), 0);
  assert.equal(cashAfter(undefined, 10), 0);
  assert.equal(cashAfter(100, 'x'), 100);
});

test('calendarGapView: avisa cuando el calendario no cubre los próximos días; nada si está cubierto o no hay dato', () => {
  const v = calendarGapView({ calendarCoverage: { covered: false, daysCovered: 1, lastEventDate: '2026-12-23' } });
  assert.equal(v.title, 'Calendario macro sin cubrir');
  assert.match(v.text, /^El calendario cargado termina el 23 dic: la señal no puede avisarte de eventos como el FOMC o el CPI/);
  assert.match(calendarGapView({ calendarCoverage: { covered: false } }).text, /^El calendario cargado se agotó/);
  assert.equal(calendarGapView({ calendarCoverage: { covered: true } }), null);
  assert.equal(calendarGapView({}), null);
  assert.equal(calendarGapView(null), null);
});
