import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveCashUsd, engineCash } from './cash.js';

test('cashUsd manda, incluso 0', () => {
  assert.equal(effectiveCashUsd({ cashUsd: 200, totalCapital: 9999, cashPercent: 50 }), 200);
  assert.equal(effectiveCashUsd({ cashUsd: 0, totalCapital: 9999, cashPercent: 50 }), 0);
  assert.equal(effectiveCashUsd({ cashUsd: '150.5' }), 150.5);
});

test('datos guardados por la versión anterior: capital total × % de efectivo', () => {
  assert.equal(effectiveCashUsd({ totalCapital: 5000, cashPercent: 40 }), 2000);
  assert.equal(effectiveCashUsd({ totalCapital: 200, cashPercent: 100 }), 200);
  assert.equal(effectiveCashUsd({ cashUsd: null, totalCapital: 1000, cashPercent: 25 }), 250);
});

test('sin datos o inválidos: 0, y nunca negativo', () => {
  assert.equal(effectiveCashUsd({}), 0);
  assert.equal(effectiveCashUsd(undefined), 0);
  assert.equal(effectiveCashUsd({ cashUsd: -5 }), 0);
  assert.equal(effectiveCashUsd({ cashUsd: 'x', totalCapital: 'y' }), 0);
});

test('engineCash: modo solo efectivo para el motor', () => {
  assert.deepEqual(engineCash({ cashUsd: 200 }), { cashPercent: 100, totalCapital: 200 });
  assert.deepEqual(engineCash({ totalCapital: 1000, cashPercent: 50 }), { cashPercent: 100, totalCapital: 500 });
});
