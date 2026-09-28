import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DCA_POLICY, dcaCapFraction, tiltNote } from '../src/services/dcaPolicy.js';
import { modulation } from '../src/backtest/dcaSim.js';

test('el mapeo desplegado es exactamente el evaluado en el backtest (modulation con los mismos parámetros)', () => {
  for (const score of [-1, -0.5, -0.1, 0, 0.2, 0.7, 1]) {
    const m = modulation(score, DCA_POLICY.tilt);
    assert.equal(dcaCapFraction(score).multiplier, Math.round(m * 1000) / 1000);
  }
  assert.deepEqual({ ...DCA_POLICY.tilt }, { k: 0.5, min: 0.5, max: 1.5, dir: -1 });   // idéntico a `policy_score` de run.js
});

test('score bajo ⇒ multiplicador > 1 y fracción mayor; monotónica decreciente en el score', () => {
  let prev = Infinity;
  for (let s = -1; s <= 1.0001; s += 0.1) {
    const f = dcaCapFraction(s).capFraction;
    assert.ok(f <= prev + 1e-9, `no monotónica en ${s}`);
    prev = f;
  }
  assert.ok(dcaCapFraction(-0.6).multiplier > 1 && dcaCapFraction(0.6).multiplier < 1);
});

test('límites: fracción entre min y max, sin exceder el 100 % del efectivo', () => {
  for (const s of [-5, -1, 0, 1, 5]) {
    const f = dcaCapFraction(s).capFraction;
    assert.ok(f >= DCA_POLICY.minFraction && f <= DCA_POLICY.maxFraction, `${s} → ${f}`);
  }
  assert.equal(dcaCapFraction(0).capFraction, DCA_POLICY.baseFraction);
});

test('score no finito o ausente ⇒ neutro (base, ×1) sin romper', () => {
  for (const s of [NaN, undefined, null, 'x']) {
    const r = dcaCapFraction(s);
    assert.equal(r.multiplier, 1);
    assert.equal(r.capFraction, DCA_POLICY.baseFraction);
    assert.equal(r.score, null);
  }
});

test('tiltNote: describe el ajuste con honestidad (efecto chico) y no dice nada si es ×1', () => {
  assert.match(tiltNote({ multiplier: 1.2 }), /×1\.20/);
  assert.match(tiltNote({ multiplier: 1.2 }), /efecto chico/);
  assert.match(tiltNote({ multiplier: 0.8 }), /×0\.80/);
  assert.equal(tiltNote({ multiplier: 1 }), '');
});
