import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolioSummary } from './portfolioMath.js';

const buy  = (units, price, date = '2026-01-01', symbol = 'PAXG') =>
  ({ symbol, type: 'BUY',  units, amount_usd: units * price, price, date });
const sell = (units, price, date = '2026-02-01', symbol = 'PAXG') =>
  ({ symbol, type: 'SELL', units, amount_usd: units * price, price, date });
const one = (ops) => computePortfolioSummary(ops)[0];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('sin operaciones devuelve lista vacía', () => {
  assert.deepEqual(computePortfolioSummary([]), []);
  assert.deepEqual(computePortfolioSummary(), []);
});

test('solo compras: promedio ponderado', () => {
  const s = one([buy(1, 4000), buy(1, 4400, '2026-01-02')]);
  near(s.units, 2);
  near(s.avgBuyPrice, 4200);
  near(s.costBasis, 8400);
  near(s.netInvested, 8400);
  assert.equal(s.hasPosition, true);
});

test('B1: una venta parcial NO cambia el costo promedio (1u@4000, vende 0.3u@4800)', () => {
  const s = one([buy(1, 4000), sell(0.3, 4800)]);
  near(s.units, 0.7);
  near(s.avgBuyPrice, 4000);          // antes daba ≈3657 y P&L +31 % (real +20 %)
  near(s.costBasis, 2800);
  near(s.realizedPnl, 240);           // 0.3 × (4800 − 4000)
  near(s.netInvested, 4000 - 1440);   // flujo de caja neto se mantiene
  assert.equal(s.hasPosition, true);
});

test('B1: vender la mitad a 8000 no deja promedio 0 ni pierde la posición', () => {
  const s = one([buy(1, 4000), sell(0.5, 8000)]);
  near(s.avgBuyPrice, 4000);
  near(s.units, 0.5);
  near(s.realizedPnl, 2000);
  assert.equal(s.hasPosition, true);
});

test('vender todo cierra la posición', () => {
  const s = one([buy(1, 4000), sell(1, 4500)]);
  assert.equal(s.units, 0);
  assert.equal(s.avgBuyPrice, 0);
  assert.equal(s.costBasis, 0);
  assert.equal(s.hasPosition, false);
  near(s.realizedPnl, 500);
});

test('recomprar después de vender promedia con el costo remanente', () => {
  const s = one([buy(1, 4000), sell(0.5, 5000, '2026-02-01'), buy(0.5, 5000, '2026-03-01')]);
  near(s.units, 1);
  near(s.costBasis, 2000 + 2500);
  near(s.avgBuyPrice, 4500);
});

test('el orden de entrada no importa: se ordena por fecha', () => {
  const ordered   = one([buy(1, 4000, '2026-01-01'), sell(0.5, 5000, '2026-02-01')]);
  const unordered = one([sell(0.5, 5000, '2026-02-01'), buy(1, 4000, '2026-01-01')]);
  near(unordered.avgBuyPrice, ordered.avgBuyPrice);
  near(unordered.units, ordered.units);
});

test('mismo día: la compra se procesa antes que la venta', () => {
  const s = one([sell(0.5, 5000, '2026-01-01'), buy(1, 4000, '2026-01-01')]);
  near(s.units, 0.5);
  near(s.avgBuyPrice, 4000);
});

test('vender más de lo que hay no genera unidades negativas', () => {
  const s = one([buy(1, 4000), sell(2, 5000)]);
  assert.equal(s.units, 0);
  assert.equal(s.hasPosition, false);
  assert.ok(s.costBasis >= 0);
});

test('agrupa por símbolo sin mezclar costos', () => {
  const r = computePortfolioSummary([
    buy(1, 4000, '2026-01-01', 'PAXG'),
    buy(0.1, 60000, '2026-01-01', 'BTC'),
    sell(0.05, 70000, '2026-02-01', 'BTC')
  ]);
  const paxg = r.find(x => x.symbol === 'PAXG');
  const btc  = r.find(x => x.symbol === 'BTC');
  near(paxg.avgBuyPrice, 4000);
  near(btc.avgBuyPrice, 60000);
  near(btc.units, 0.05);
});

test('acumula comisiones y cuenta operaciones', () => {
  const s = one([{ ...buy(1, 4000), fee: 5 }, { ...sell(0.5, 4100), fee: 2 }]);
  near(s.fees, 7);
  assert.equal(s.operations, 2);
});
