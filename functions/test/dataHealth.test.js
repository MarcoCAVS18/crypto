import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoldSources, summarizeSources, applyDataQuality, parseYymmdd, SCORING_INPUTS } from '../src/services/dataHealth.js';
import { determineGoldMarketMode } from '../src/services/goldMarketMode.js';
import { buildHealthReport } from '../src/routes/health.js';
import { _setDbForTests } from '../src/config/database.js';
import app from '../src/app.js';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const rej = (msg) => ({ status: 'rejected', reason: new Error(msg) });
const ful = (value = {}) => ({ status: 'fulfilled', value });

// Macro completa y fresca
const fullMacro = () => ({
  dxy: { value: 100, changePercent: 0.1 }, tenYearYield: { value: 4.1 },
  realYield: { value: 1.8, date: '2026-09-25', sentiment: 'neutral', source: 'fred-csv' },
  cot: { netSpec: 120000, reportDate: '260922', sentiment: 'bullish' },
  gvz: { value: 17 }, silver: { value: 50 },
  spot: { ticker: 'GC=F', price: 4000, time: NOW - 30 * 60000 }
});
const okResults = () => ({ macro: ful(), realYield: ful(), cot: ful(), volData: ful(), spot: ful() });
const build = (over = {}) => buildGoldSources({
  macro: fullMacro(), results: okResults(), dailyBias: { alignment: 'bull', source: 'gc-futures' },
  headlines: [{}], analysisError: null, fred: { available: true, series: { a: { status: 'ok' } } }, now: NOW, ...over
});

// ── buildGoldSources ────────────────────────────────────────────────────────

test('todo fresco → todos los insumos de scoring ok y sin degradación', () => {
  const s = build();
  for (const k of SCORING_INPUTS) assert.equal(s[k].status, 'ok', k);
  const h = summarizeSources(s);
  assert.equal(h.degraded, false);
  assert.equal(h.level, 'none');
  assert.equal(h.message, null);
});

test('un insumo caído aparece como failed con el error real de la fuente (antes: silencio)', () => {
  const macro = fullMacro(); macro.realYield = null;
  const s = build({ macro, results: { ...okResults(), realYield: rej('Sin datos válidos de DFII10') } });
  assert.equal(s.realYield.status, 'failed');
  assert.match(s.realYield.error, /DFII10/);
  const h = summarizeSources(s);
  assert.equal(h.degraded, true);
  assert.equal(h.level, 'partial');
  assert.deepEqual(h.missing, ['realYield']);
  assert.match(h.message, /faltan Tasa real 10Y/);
});

test('datos viejos: tasa real >5 días y COT >10 días quedan "stale"', () => {
  const macro = fullMacro();
  macro.realYield.date = '2026-09-10';        // 18 días
  macro.cot.reportDate = '260901';            // 27 días
  const s = build({ macro });
  assert.equal(s.realYield.status, 'stale');
  assert.equal(s.cot.status, 'stale');
  assert.equal(s.cot.asOf, '2026-09-01');
  const h = summarizeSources(s);
  assert.deepEqual(h.stale.sort(), ['cot', 'realYield']);
  assert.match(h.message, /desactualizados/);
});

test('el oro de referencia viejo (fin de semana) NO degrada el score', () => {
  const macro = fullMacro(); macro.spot.time = NOW - 30 * 3600000;
  const s = build({ macro });
  assert.equal(s.spot.status, 'stale');
  assert.match(s.spot.note, /cerrado/);
  assert.equal(summarizeSources(s).degraded, false);
});

test('severa: sin DXY ni 10Y, o 3 o más insumos faltantes', () => {
  const m1 = fullMacro(); m1.dxy = null; m1.tenYearYield = null;
  assert.equal(summarizeSources(build({ macro: m1, results: { ...okResults(), macro: rej('yahoo caído') } })).level, 'severe');
  const m2 = fullMacro(); m2.cot = null; m2.gvz = null; m2.silver = null;
  assert.equal(summarizeSources(build({ macro: m2 })).level, 'severe');
  const m3 = fullMacro(); m3.cot = null; m3.gvz = null;
  assert.equal(summarizeSources(build({ macro: m3 })).level, 'partial');
});

test('IA: error de análisis o falta de titulares se reporta y cuenta como faltante', () => {
  assert.equal(build({ analysisError: 'timeout' }).aiSentiment.status, 'failed');
  const s = build({ headlines: [] });
  assert.equal(s.aiSentiment.status, 'missing');
  assert.equal(s.headlines.status, 'failed');
  assert.ok(summarizeSources(s).missing.includes('aiSentiment'));
});

test('régimen diario con respaldo de PAXG queda ok pero marcado fallback; sin velas falla', () => {
  assert.equal(build({ dailyBias: { alignment: 'bull', source: 'paxg' } }).dailyRegime.fallback, true);
  assert.equal(build({ dailyBias: null }).dailyRegime.status, 'failed');
});

test('FRED: sin clave → failed con el motivo; con series vencidas → stale (informativo, no degrada)', () => {
  const s1 = build({ fred: { available: false, series: { x: { status: 'failed', error: 'FRED_API_KEY no configurada' } } } });
  assert.equal(s1.fred.status, 'failed');
  assert.match(s1.fred.error, /FRED_API_KEY/);
  assert.equal(summarizeSources(s1).degraded, false);          // FRED no está en SCORING_INPUTS
  const s2 = build({ fred: { available: true, series: { a: { status: 'ok' }, b: { status: 'stale' } } } });
  assert.equal(s2.fred.status, 'stale');
  assert.equal(s2.fred.okCount, 1);
});

test('parseYymmdd', () => {
  assert.equal(parseYymmdd('260922'), Date.UTC(2026, 8, 22));
  assert.equal(parseYymmdd('xx'), null);
  assert.equal(parseYymmdd(undefined), null);
  assert.equal(summarizeSources(null), null);
});

// ── applyDataQuality ────────────────────────────────────────────────────────

const buy = { action: 'BUY', strength: 'fuerte', reason: 'r', recommendation: 'Acumular en tramos', operations: [{}] };

test('sin degradación la decisión no cambia (misma referencia)', () => {
  assert.equal(applyDataQuality(buy, { degraded: false }), buy);
  assert.equal(applyDataQuality(buy, null), buy);
});

test('degradación parcial: adjunta dataQuality sin tocar acción ni intensidad', () => {
  const h = { degraded: true, level: 'partial', missing: ['cot'], stale: [], message: 'Datos degradados: faltan COT.' };
  const d = applyDataQuality(buy, h);
  assert.equal(d.action, 'BUY');
  assert.equal(d.strength, 'fuerte');
  assert.deepEqual(d.dataQuality, { degraded: true, level: 'partial', missing: ['cot'], stale: [] });
  assert.equal(d.recommendation, 'Acumular en tramos');
});

test('degradación severa: una compra baja un escalón y advierte; WAIT/SELL no se tocan', () => {
  const h = { degraded: true, level: 'severe', missing: ['dxy', 'tenYearYield'], stale: [], message: 'Datos degradados: faltan DXY, Bono 10Y.' };
  const d = applyDataQuality(buy, h);
  assert.equal(d.strength, 'moderado');
  assert.match(d.recommendation, /^⚠️ Datos degradados: faltan DXY, Bono 10Y\. Acumular/);
  assert.equal(applyDataQuality({ ...buy, strength: 'débil' }, h).strength, 'débil');
  const wait = { action: 'WAIT', strength: 'fuerte', recommendation: 'x' };
  assert.equal(applyDataQuality(wait, h).strength, 'fuerte');
  assert.equal(applyDataQuality({ action: 'SELL', strength: 'fuerte', recommendation: 'x' }, h).strength, 'fuerte');
});

// ── integración con el modo de mercado ──────────────────────────────────────

const ind = { ema: { ema50: 4000, ema200: 4000 }, atr: 8, rsi: 50 };
const ctx = (sources) => ({
  analysis: { sentiment: 'neutral', score: 0 }, analysisError: null, headlines: [], sources,
  macro: { dxy: { value: 100, changePercent: 0 }, tenYearYield: { value: 4.1 }, cot: null, realYield: null, gvz: { value: 17 }, silver: { value: 50 }, dailyBias: null }
});

test('el modo de mercado dice PRIMERO que los datos están degradados y lo expone en goldContext', () => {
  const macro = fullMacro(); macro.realYield = null;
  const sources = build({ macro, results: { ...okResults(), realYield: rej('DFII10 sin datos') } });
  const r = determineGoldMarketMode(4000, ind, { status: 'normal' }, ctx(sources));
  assert.match(r.reasons[0], /^Datos degradados: faltan Tasa real 10Y/);
  assert.equal(r.goldContext.dataHealth.level, 'partial');
  assert.ok(r.goldContext.sources.realYield.status === 'failed');
});

test('contexto viejo sin `sources` no rompe: dataHealth null y sin razón extra', () => {
  const r = determineGoldMarketMode(4000, ind, { status: 'normal' }, ctx(undefined));
  assert.equal(r.goldContext.dataHealth, null);
  assert.ok(!r.reasons.some(x => /degradados/.test(x)));
});

// ── /api/health/deep ────────────────────────────────────────────────────────

const cal = { lastEventDate: '2026-12-18', daysCovered: 81, upcomingCount: 11, unverifiedUpcoming: 0 };
const cfg = { groqKey: true, fredKey: true, vapidKeys: true, groqModel: 'openai/gpt-oss-120b' };

test('health: todo bien → ok sin warnings', () => {
  const r = buildHealthReport({
    config: cfg, calendar: cal, now: NOW,
    cachedContext: { fetchedAt: new Date(NOW - 20 * 60000).toISOString(), sources: build(), analysisError: null }
  });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.goldContext.ageMinutes, 20);
  assert.equal(r.goldContext.degraded, false);
});

test('health: avisa claves faltantes, insumos caídos, contexto viejo, error de IA y calendario', () => {
  const macro = fullMacro(); macro.cot = null;
  const r = buildHealthReport({
    config: { ...cfg, fredKey: false, groqKey: false }, now: NOW,
    calendar: { ...cal, daysCovered: 10, unverifiedUpcoming: 3 },
    cachedContext: {
      fetchedAt: new Date(NOW - 5 * 3600000).toISOString(), analysisError: 'HTTP 404',
      sources: build({ macro, results: { ...okResults(), cot: rej('CFTC HTTP 500') } })
    }
  });
  assert.equal(r.status, 'degraded');
  const w = r.warnings.join(' | ');
  assert.match(w, /GROQ_API_KEY/);
  assert.match(w, /FRED_API_KEY/);
  assert.match(w, /faltan COT/);
  assert.match(w, /sin refrescar hace 300 min/);
  assert.match(w, /Análisis de IA falló: HTTP 404/);
  assert.match(w, /quedan 10 días/);
  assert.match(w, /3 eventos próximos/);
});

test('health: sin contexto cacheado se informa sin inventar estado', () => {
  const r = buildHealthReport({ config: cfg, calendar: cal, cachedContext: null, now: NOW });
  assert.deepEqual(r.goldContext, { cached: false });
  assert.equal(r.status, 'ok');
});

test('health HTTP: nunca expone las claves, solo si están configuradas', async () => {
  process.env.GROQ_API_KEY = 'gsk_SECRET_VALUE'; process.env.FRED_API_KEY = 'fredsecretvalue';
  _setDbForTests({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health/deep`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.ok(!text.includes('gsk_SECRET_VALUE') && !text.includes('fredsecretvalue'));
    const j = JSON.parse(text);
    assert.equal(j.config.groqKey, true);
    assert.equal(j.config.fredKey, true);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  } finally {
    delete process.env.GROQ_API_KEY; delete process.env.FRED_API_KEY;
    await new Promise(r => server.close(r));
  }
});

test('health HTTP: si falla la lectura del caché responde 200 degradado con el motivo', async () => {
  _setDbForTests({ collection: () => { throw new Error('firestore caído'); } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try {
    const j = await (await fetch(`http://127.0.0.1:${server.address().port}/api/health/deep`)).json();
    assert.equal(j.status, 'degraded');
    assert.match(j.warnings.join(' '), /firestore caído/);
  } finally { await new Promise(r => server.close(r)); }
});
