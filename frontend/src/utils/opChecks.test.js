import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountMismatch, operationIssues, priceFarFromMarket } from './opChecks.js';

test('una operación coherente no tiene problemas (con tolerancia por redondeo/comisión)', () => {
  assert.deepEqual(operationIssues({ amount_usd: 500, units: 0.00526316, price: 95000 }), []);
  assert.deepEqual(operationIssues({ amount_usd: 500.4, units: 0.00526316, price: 95000 }), []);
  assert.deepEqual(operationIssues({ amount_usd: 0.5, units: 0.00001, price: 90000 }), []);   // polvo: diferencia < $1
});

test('detecta unidades de un BTC "entero" con un monto de $334 (la operación que deforma el promedio)', () => {
  const issues = operationIssues({ amount_usd: 334, units: 0.0716, price: 88000 });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /no coincide con unidades × precio/);
  assert.ok(amountMismatch({ amount_usd: 334, units: 0.0716, price: 88000 }).relative > 0.9);
});

test('datos incompletos o inválidos no rompen', () => {
  assert.equal(amountMismatch({}), null);
  assert.deepEqual(operationIssues({ amount_usd: 'x', units: 1, price: 1 }), []);
  assert.deepEqual(operationIssues(undefined), []);
});

test('priceFarFromMarket avisa si el precio está lejos del actual', () => {
  assert.equal(priceFarFromMarket(4400, 88000), true);
  assert.equal(priceFarFromMarket(85000, 88000), false);
  assert.equal(priceFarFromMarket(85000, null), false);
});
