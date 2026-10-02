import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOperation } from '../src/routes/portfolio.js';

const base = { date: '2026-10-01', symbol: 'BTC', type: 'BUY', exchange: 'Binance' };

test('acepta una operación coherente (monto ≈ unidades × precio, con redondeo)', () => {
  assert.ok(parseOperation({ ...base, amount_usd: 500, price: 95000, units: 0.00526316 }, 'marco').op);
  assert.ok(parseOperation({ ...base, amount_usd: 500.6, price: 95000, units: 0.00526316 }, 'marco').op);
  assert.ok(parseOperation({ ...base, amount_usd: '0.5', price: 90000, units: '0.00001' }, 'marco').op);   // polvo
});

test('rechaza la operación fantasma: unidades de $6k con monto de $334 (deforma el costo promedio)', () => {
  const r = parseOperation({ ...base, amount_usd: 334, price: 88000, units: 0.0716 }, 'marco');
  assert.equal(r.op, undefined);
  assert.match(r.error, /no coincide con unidades × precio/);
});

test('rechaza también el caso inverso (monto enorme con pocas unidades)', () => {
  assert.match(parseOperation({ ...base, amount_usd: 66000, price: 88000, units: 0.0716 }, 'marco').error, /no coincide/);
});
