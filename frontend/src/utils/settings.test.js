import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSettings, syncPayload } from './settings.js';

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

test('syncPayload: manda todos los campos (lo no cargado va null) para que el servidor calcule los avisos con tus datos', () => {
  assert.deepEqual(syncPayload({ cashUsd: 333, mode: 'inversion', installments: 6, targetPercent: 20, feePercent: 0.1 }),
    { cashUsd: 333, mode: 'inversion', installments: 6, targetPercent: 20, feePercent: 0.1 });
  assert.deepEqual(syncPayload({}), { cashUsd: 0, mode: 'inversion', installments: null, targetPercent: null, feePercent: null });
  assert.deepEqual(syncPayload(undefined), { cashUsd: 0, mode: 'inversion', installments: null, targetPercent: null, feePercent: null });
  // datos viejos (capital total × % de efectivo) se convierten igual que en la pantalla
  assert.equal(syncPayload({ totalCapital: 1000, cashPercent: 25 }).cashUsd, 250);
  assert.equal(syncPayload({ cashUsd: 0, totalCapital: 1000, cashPercent: 25 }).cashUsd, 0);
  // valores inválidos no viajan
  const bad = syncPayload({ cashUsd: 10, installments: 99, targetPercent: 100, feePercent: -1 });
  assert.deepEqual([bad.installments, bad.targetPercent, bad.feePercent], [null, null, null]);
  assert.equal(syncPayload({ feePercent: 0 }).feePercent, 0);        // comisión cero es un dato válido
});
