import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toChartCandles } from './chartCandles.js';

const c = (ts, close = 10) => ({ timestamp: ts, open: close, high: close + 1, low: close - 1, close });

test('ordena ascendente, en segundos, y descarta repetidas (gana la última)', () => {
  const out = toChartCandles([c(3000, 3), c(1000, 1), c(2000, 2), c(2000, 22)]);
  assert.deepEqual(out.map(x => x.time), [1, 2, 3]);
  assert.equal(out[1].close, 22);
});

test('descarta velas con valores no finitos o sin tiempo', () => {
  const out = toChartCandles([c(1000), { timestamp: 2000, open: NaN, high: 1, low: 1, close: 1 }, { open: 1, high: 1, low: 1, close: 1 }, null, c(3000)]);
  assert.deepEqual(out.map(x => x.time), [1, 3]);
});

test('acepta `time` como respaldo y entradas inválidas devuelven []', () => {
  assert.equal(toChartCandles([{ time: 5000, open: 1, high: 2, low: 0, close: 1 }])[0].time, 5);
  assert.deepEqual(toChartCandles(undefined), []);
  assert.deepEqual(toChartCandles('x'), []);
});
