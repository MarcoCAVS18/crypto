import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDecision } from '../src/services/decisionEngine.js';

// Caso real reportado: promedio ~4,700, precio 4,150 (−13 %), contexto Risk OFF durante mucho tiempo con "Esperar".
const price = 4150;
const zones = (cz = 'neutral') => ({ currentZone: cz, buy: { min: 4000, max: 4100, reason: 'ATR' }, neutral: { min: 4100, max: 4300 }, sell: { min: 4500, max: 4600, reason: 'ATR' } });
const mm = (mode = 'risk_off') => ({ mode, score: mode === 'risk_off' ? -0.35 : 0, reasons: ['Contexto flojo'], goldContext: { macro: {}, sources: {} } });
const pf = (extra = {}) => ({ hasPosition: true, units: 1.7121, avgBuyPrice: 4768, costBasis: 8164, netInvested: 8164, currentPrice: price, allBuys: [], executedBuys: [], ...extra });
const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
const decide = (user, portfolio = pf(), cz = 'neutral', mode = 'risk_off') =>
  makeDecision(mm(mode), zones(cz), price, { mode: 'inversion', ...user }, { rsi: 45, atr: 30 }, 'PAXG', portfolio, { candlesSource: 'real' });

test('Risk OFF con el precio bajo tu promedio y efectivo suficiente: COMPRA (baja el promedio)', () => {
  const d = decide({ cashPercent: 50, totalCapital: 20000 });
  assert.equal(d.action, 'BUY');
  assert.match(d.reason, /se sigue acumulando la debilidad/);
  assert.ok(d.operations.length >= 1 && d.policy);
});

test('posición concentrada: WAIT que lo dice (peso y cómo revisar "Capital total"), no un genérico de Risk OFF', () => {
  const d = decide({ cashPercent: 50, totalCapital: 10000 });
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /PAXG ya pesa 82 % de tu capital/);
  assert.doesNotMatch(d.reason, /^Mercado en Risk OFF/);
  assert.match(d.recommendation, /Capital total.*TODO lo que tenés/);
});

test('efectivo menor a 30 %: WAIT que dice el efectivo y dónde ajustarlo', () => {
  const d = decide({ cashPercent: 20, totalCapital: 20000 });
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /Efectivo 20 %.*al menos 30 %/);
  assert.match(d.recommendation, /Tu posición/);
});

test('todos los tramos ya ejecutados en los últimos 4 días: WAIT que lo dice', () => {
  const buys = [4150, 4090, 4050].map(p => ({ price: p, amount_usd: 100, date: day(1) }));
  const d = decide({ cashPercent: 50, totalCapital: 20000 }, pf({ executedBuys: buys }));
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /Ya registraste compras en los últimos 4 días/);
});

test('precio por encima del promedio y fuera de zona de compra en Risk OFF: WAIT que lo explica', () => {
  const d = decide({ cashPercent: 50, totalCapital: 20000 }, pf({ avgBuyPrice: 3900, costBasis: 6700, netInvested: 6700 }), 'neutral');
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /por encima de tu promedio y fuera de la zona de compra/);
});

test('BTC en Risk OFF no cambia: sigue el WAIT genérico (la acumulación contra el score es solo del oro)', () => {
  const d = makeDecision(mm('risk_off'), zones('buy'), 90000, { mode: 'inversion', cashPercent: 50, totalCapital: 20000 }, { rsi: 45, atr: 500 }, 'BTC', null, { candlesSource: 'real' });
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /^Mercado en Risk OFF/);
});
