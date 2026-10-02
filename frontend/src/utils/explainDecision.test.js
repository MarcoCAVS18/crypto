import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFactors, dataIssues, buildExplanation } from './explainDecision.js';

const components = { dxy: 0.1, tenYear: -0.2, technical: 0.15, ai: 0, cot: -0.1, realYield: 0.05, gvz: 0.002, extra: 'x' };

test('scoreFactors: ordena por peso absoluto, marca dirección y llena la barra con 0.25', () => {
  const f = scoreFactors(components);
  assert.deepEqual(f.map(x => x.key), ['tenYear', 'technical', 'dxy', 'cot', 'realYield', 'gvz', 'ai']);   // 'extra' (no numérico) se ignora
  assert.equal(f[0].direction, 'contra'); assert.equal(f[0].barPct, 80);
  assert.equal(f.find(x => x.key === 'ai').direction, 'neutral');
  assert.equal(f.find(x => x.key === 'gvz').direction, 'neutral');                      // |0.002| < 0.005
  assert.equal(f.find(x => x.key === 'dxy').label, 'Dólar (DXY)');
  assert.deepEqual(scoreFactors(null), []);
});

test('dataIssues: lo que falta primero, luego lo viejo, luego lo informativo; usa los textos del servidor', () => {
  const sources = {
    dxy: { status: 'ok' }, cot: { status: 'stale', ageDays: 12.4, asOf: '2026-09-22' },
    realYield: { status: 'failed', error: 'FRED sin respuesta' }, aiSentiment: { status: 'missing', error: 'sin titulares' },
    dailyRegime: { status: 'ok', fallback: true }, spot: { status: 'stale', note: 'mercado de futuros cerrado' }
  };
  const issues = dataIssues({ sources, headlinesSource: 'saved' });
  assert.deepEqual(issues.map(i => [i.level, i.key]), [['error', 'realYield'], ['error', 'aiSentiment'], ['warn', 'cot'], ['warn', 'headlines'], ['info', 'dailyRegime'], ['info', 'spot']]);
  assert.match(issues.find(i => i.key === 'cot').text, /del 2026-09-22, 12 días/);
  assert.match(issues.find(i => i.key === 'realYield').text, /FRED sin respuesta.*sin este insumo/);
});

test('dataIssues: sin fuentes usa dataQuality; sin nada no inventa problemas', () => {
  const q = dataIssues({ dataQuality: { missing: ['cot'], stale: ['realYield'] } });
  assert.deepEqual(q.map(i => [i.level, i.label]), [['error', 'COT'], ['warn', 'Tasa real 10Y']]);
  assert.deepEqual(dataIssues({}), []);
  assert.deepEqual(dataIssues({ sources: { dxy: { status: 'ok' }, cot: { status: 'ok' } } }), []);
  assert.equal(dataIssues({ analysisError: '401' })[0].key, 'aiError');
});

test('buildExplanation (oro): cabecera, score, factores, tamaño por política, evento, costos y advertencia', () => {
  const e = buildExplanation({
    symbol: 'PAXG',
    decision: {
      action: 'BUY', strength: 'moderada', reason: 'Acumulación', policy: { capFraction: 0.9, multiplier: 1.2, score: -0.3 },
      calendarRisk: { calendarNote: 'CPI en 3 h: menos tamaño', capitalFraction: 0.75 },
      operations: [{ estCostUsd: 0.5 }, { estCostUsd: 0.7 }], dataQuality: { level: 'severe', missing: ['cot'], stale: [] }
    },
    marketMode: { score: -0.3, mode: 'risk_off', hysteresis: { held: true }, components, reasons: ['a', 'b'],
      goldContext: { sources: { cot: { status: 'failed', error: 'sin dato' } } } }
  });
  assert.equal(e.headline.actionLabel, 'Comprar');
  assert.deepEqual(e.score, { value: -0.3, mode: 'risk_off', heldByHysteresis: true });
  assert.equal(e.factors[0].key, 'tenYear');
  assert.match(e.sizing[0], /90 % del efectivo.*×1\.20.*comprar la debilidad/);
  assert.deepEqual(e.adjustments.map(a => a.kind), ['calendar', 'costs', 'quality']);
  assert.match(e.adjustments[1].text, /\$1\.20/);
  assert.equal(e.issues[0].key, 'cot');
  assert.match(e.caveat, /no una predicción/);
});

test('buildExplanation: BTC no muestra factores del oro ni advertencia; sin datos devuelve null', () => {
  const e = buildExplanation({ symbol: 'BTC', decision: { action: 'WAIT', reason: 'x' }, marketMode: { score: 0.1, mode: 'neutral', components, reasons: ['r'] } });
  assert.deepEqual(e.factors, []); assert.equal(e.caveat, null); assert.deepEqual(e.reasons, ['r']);
  assert.equal(buildExplanation({}), null);
  // política neutra: sin texto de ajuste de peso
  const n = buildExplanation({ symbol: 'PAXG', decision: { action: 'BUY', policy: { capFraction: 0.75, multiplier: 1.0 } } });
  assert.match(n.sizing[0], /sin ajuste: score neutro/);
});
