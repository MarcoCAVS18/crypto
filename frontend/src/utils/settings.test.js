import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSettings } from './settings.js';

test('sin ajustes ⇒ objeto vacío (el servidor usa sus valores por defecto)', () => {
  assert.deepEqual(buildSettings({}), {});
  assert.deepEqual(buildSettings({ targetPercent: null, feePercent: null }), {});
  assert.deepEqual(buildSettings(undefined), {});
});

test('peso objetivo y comisión se convierten (comisión en % → puntos básicos)', () => {
  assert.deepEqual(buildSettings({ targetPercent: 20, feePercent: 0.6 }), { target: { targetPercent: 20 }, costs: { feeBps: 60 } });
  assert.deepEqual(buildSettings({ feePercent: 0 }), { costs: { feeBps: 0 } });
});

test('valores inválidos se ignoran (0, ≥100, negativos, NaN)', () => {
  assert.deepEqual(buildSettings({ targetPercent: 0, feePercent: -1 }), {});
  assert.deepEqual(buildSettings({ targetPercent: 100 }), {});
  assert.deepEqual(buildSettings({ targetPercent: NaN, feePercent: NaN }), {});
});

test('cantidad de compras: entero 1–12 viaja al servidor; null, decimales o fuera de rango se ignoran', () => {
  assert.deepEqual(buildSettings({ installments: 6 }), { installments: 6 });
  assert.deepEqual(buildSettings({ installments: 1 }), { installments: 1 });
  assert.deepEqual(buildSettings({ installments: 12, feePercent: 0.1 }), { installments: 12, costs: { feeBps: 10 } });
  for (const bad of [null, undefined, 0, 13, 2.5, '4', NaN, -1]) assert.deepEqual(buildSettings({ installments: bad }), {}, String(bad));
});
