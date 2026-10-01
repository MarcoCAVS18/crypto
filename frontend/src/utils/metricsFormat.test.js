import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricRows, pct, rate } from './metricsFormat.js';

test('pct/rate: formato y guiones para datos ausentes', () => {
  assert.equal(pct(0.0234), '+2.3%'); assert.equal(pct(-0.01), '-1.0%'); assert.equal(pct(null), '—');
  assert.equal(rate(0.667), '67%'); assert.equal(rate(undefined), '—');
});

test('metricRows: solo acciones con señales, base invertida para SELL, marca muestras chicas', () => {
  const summary = {
    BUY:  { 20: { n: 12, hitRate: 0.75, baseUpRate: 0.6, meanRet: 0.03, edgeVsBase: 0.01 } },
    SELL: { 20: { n: 2, hitRate: 0.5, baseUpRate: 0.6, meanRet: -0.01, edgeVsBase: 0.02 } },
    WAIT: { 20: { n: 5, hitRate: null, meanRet: 0.01, edgeVsBase: null } }
  };
  const rows = metricRows(summary, 20);
  assert.deepEqual(rows.map(r => r.action), ['BUY', 'SELL', 'WAIT']);
  assert.equal(rows[0].hit, '75%'); assert.equal(rows[0].base, '60%'); assert.equal(rows[0].lowSample, false);
  assert.equal(rows[1].base, '40%'); assert.equal(rows[1].lowSample, true);
  assert.equal(rows[2].hit, '—'); assert.equal(rows[2].base, '—');
  assert.deepEqual(metricRows(summary, 60), []);
  assert.deepEqual(metricRows(undefined, 20), []);
});
