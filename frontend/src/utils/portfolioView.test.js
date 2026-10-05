import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceFarOff, suspiciousOps, portfolioTotals, activityCells, evolutionSeries, fmtCompact, signalOutcome } from './portfolioView.js';

const summary = [
  { symbol: 'PAXG', units: 0.5, costBasis: 2000, avgBuyPrice: 4000, operations: 3, realizedPnl: 0 },
  { symbol: 'BTC', units: 0.01, costBasis: 900, avgBuyPrice: 90000, operations: 2, realizedPnl: 50 },
  { symbol: 'ETH', units: 0, costBasis: 0, avgBuyPrice: 0, operations: 2, realizedPnl: 10 }
];

test('totales: valor, P&L y peso por posición; ignora posiciones cerradas', () => {
  const t = portfolioTotals(summary, { PAXG: 4200, BTC: 100000 });
  assert.equal(t.positions.length, 2);
  assert.equal(t.value, 3100);
  assert.equal(t.invested, 2900);
  assert.equal(t.pnl, 200);
  assert.ok(Math.abs(t.pnlPct - 6.897) < 0.01);
  assert.equal(t.positions[0].symbol, 'PAXG');
  assert.ok(Math.abs(t.positions[0].share - 67.74) < 0.01);
  assert.equal(t.realized, 60);
});

test('totales: sin precio no se inventa valor', () => {
  const t = portfolioTotals(summary, { PAXG: 4200 });
  assert.equal(t.unpriced, 1);
  assert.equal(t.value, 2100);
  assert.equal(t.positions.find(p => p.symbol === 'BTC').value, null);
  const none = portfolioTotals(summary, {});
  assert.equal(none.value, null);
  assert.equal(none.pnl, null);
});

test('actividad por día', () => {
  const c = activityCells([{ date: '2026-09-01', type: 'BUY' }, { date: '2026-09-01', type: 'SELL' }, { date: '2026-09-02', type: 'BUY' }, { date: 'x', type: 'BUY' }]);
  assert.deepEqual(c, { '2026-09-01': { buy: 1, sell: 1 }, '2026-09-02': { buy: 1, sell: 0 } });
});

test('evolución: costo base acumulado, venta parcial proporcional y punto final con valor', () => {
  const ops = [
    { date: '2026-01-01', symbol: 'PAXG', type: 'BUY', units: 1, amount_usd: 1000 },
    { date: '2026-02-01', symbol: 'PAXG', type: 'BUY', units: 1, amount_usd: 1200 },
    { date: '2026-03-01', symbol: 'PAXG', type: 'SELL', units: 1, amount_usd: 1500 }
  ];
  const s = evolutionSeries(ops, { PAXG: 1300 }, '2026-04-01');
  assert.deepEqual(s.map(p => p.invested), [1000, 2200, 1100, 1100]);
  assert.equal(s.at(-1).value, 1300);
  assert.equal(evolutionSeries([], {}).length, 0);
  assert.equal(evolutionSeries(ops, {}, '2026-04-01').at(-1).value, null);
});

test('formato compacto y resultado de señal', () => {
  assert.equal(fmtCompact(950), '$950');
  assert.equal(fmtCompact(12500), '$12.5k');
  assert.equal(fmtCompact(-2500000), '-$2.50M');
  assert.equal(signalOutcome('BUY', 100, 110).good, true);
  assert.equal(signalOutcome('SELL', 100, 110).good, false);
  assert.equal(signalOutcome('WAIT', 100, 110), null);
  assert.equal(signalOutcome('BUY', null, 110), null);
});

test('precio sospechoso: lejos del actual (5×) arriba o abajo; sin dato no marca', () => {
  assert.equal(priceFarOff(4486, 86000), true);       // BTC cargado con precio de oro
  assert.equal(priceFarOff(70000, 86000), false);
  assert.equal(priceFarOff(500000, 86000), true);
  assert.equal(priceFarOff(4486, null), false);
  assert.equal(priceFarOff(0, 86000), false);
  const ops = [{ id: 'a', symbol: 'BTC', price: 4486 }, { id: 'b', symbol: 'BTC', price: 80000 }, { id: 'c', symbol: 'ETH', price: 1 }];
  assert.deepEqual([...suspiciousOps(ops, { BTC: 86000 })], ['a']);
});

test('una posición con promedio absurdo queda marcada como sospechosa', () => {
  const t = portfolioTotals([{ symbol: 'BTC', units: 0.0633, costBasis: 284, avgBuyPrice: 4486, operations: 1 }], { BTC: 86000 });
  assert.equal(t.positions[0].suspect, true);
});
