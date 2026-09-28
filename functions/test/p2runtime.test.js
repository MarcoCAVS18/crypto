import { test } from 'node:test';
import assert from 'node:assert/strict';
import { determineGoldMarketMode, modeWithHysteresis, MODE_THRESHOLD, MODE_EXIT_THRESHOLD } from '../src/services/goldMarketMode.js';
import { determineMarketMode } from '../src/services/marketMode.js';
import { atrPercentile, calculateATR } from '../src/services/technicalAnalysis.js';
import { previousModeFromSnapshots, getPreviousMode } from '../src/services/previousMode.js';
import { run as runSnapshot } from '../src/scheduled/snapshotJob.js';

// ── histéresis ──────────────────────────────────────────────────────────────

test('histéresis: entra a ±0.25 y sale recién a ±0.15', () => {
  assert.equal(MODE_EXIT_THRESHOLD < MODE_THRESHOLD, true);
  assert.equal(modeWithHysteresis(0.26, null), 'risk_on');
  assert.equal(modeWithHysteresis(0.20, null), 'neutral');              // sin modo previo: umbral simple
  assert.equal(modeWithHysteresis(0.20, 'risk_on'), 'risk_on');         // banda: se sostiene
  assert.equal(modeWithHysteresis(0.15, 'risk_on'), 'neutral');         // salió
  assert.equal(modeWithHysteresis(-0.20, 'risk_off'), 'risk_off');
  assert.equal(modeWithHysteresis(-0.10, 'risk_off'), 'neutral');
  assert.equal(modeWithHysteresis(0.20, 'risk_off'), 'neutral');        // no hereda el modo opuesto
  assert.equal(modeWithHysteresis(-0.30, 'risk_on'), 'risk_off');       // cambio franco sin demora
});

test('histéresis: un score que oscila 0.24↔0.27 no parpadea con modo previo', () => {
  let mode = null, flips = 0;
  for (const sc of [0.27, 0.24, 0.27, 0.24, 0.26, 0.23]) {
    const m = modeWithHysteresis(sc, mode);
    if (mode && m !== mode) flips++;
    mode = m;
  }
  assert.equal(flips, 0);
  assert.equal(mode, 'risk_on');
});

const ctx = (dxyChg) => ({
  analysis: { sentiment: 'neutral', score: 0 }, analysisError: null,
  macro: { dxy: { value: 100, changePercent: dxyChg }, tenYearYield: { value: 3.6 }, cot: null, realYield: null, gvz: { value: 17 }, silver: null, dailyBias: null },
  headlines: []
});
const ind = { ema: { ema50: 100, ema200: 100 }, atr: 1, rsi: 50 };

test('determineGoldMarketMode: usa el modo previo y lo declara en el resultado y en las razones', () => {
  // dxy −0.3 % → +0.125; 10Y 3.6 → +0.2·0.86 ≈ +0.172; técnico neutral(0) → ≈ 0.30 ⇒ entra; luego lo bajamos a la banda
  const strong = determineGoldMarketMode(100, ind, { status: 'normal' }, ctx(-0.3));
  assert.equal(strong.mode, 'risk_on');
  const band = determineGoldMarketMode(100, ind, { status: 'normal' }, ctx(0.0));           // solo 10Y ≈ 0.17..: en la banda
  assert.ok(band.score > MODE_EXIT_THRESHOLD && band.score <= MODE_THRESHOLD, `score ${band.score}`);
  assert.equal(band.mode, 'neutral');
  assert.equal(band.hysteresis.held, false);
  const held = determineGoldMarketMode(100, ind, { status: 'normal' }, ctx(0.0), { previousMode: 'risk_on' });
  assert.equal(held.mode, 'risk_on');
  assert.equal(held.hysteresis.held, true);
  assert.ok(held.reasons.some(r => /histéresis/.test(r)));
});

// ── ATR por percentil ───────────────────────────────────────────────────────

test('determineMarketMode: con percentileAtr la volatilidad se juzga contra el historial propio', () => {
  const base = { ema: { ema50: 100, ema200: 100 }, rsi: 50, atr: 0.5 };            // ATR/precio 0.5 %: bucket "controlada" absoluto
  const vol = { status: 'normal' };
  const abs = determineMarketMode(100, { ...base, atrPercentile: 95 }, vol);
  const pctHi = determineMarketMode(100, { ...base, atrPercentile: 95 }, vol, null, { percentileAtr: true });
  const pctLo = determineMarketMode(100, { ...base, atrPercentile: 10 }, vol, null, { percentileAtr: true });
  assert.equal(abs.score - pctHi.score, 3);                                          // +1 (controlada) frente a −2 (extrema)
  assert.ok(pctHi.reasons.some(r => /percentil/.test(r)));
  assert.equal(pctLo.score - pctHi.score, 3);
  // sin percentil disponible cae al criterio absoluto, no revienta
  const fb = determineMarketMode(100, { ...base, atrPercentile: null }, vol, null, { percentileAtr: true });
  assert.equal(fb.score, abs.score);
});

test('atrPercentile: rango de volatilidad alto ⇒ percentil alto; sin historia ⇒ null', () => {
  const mk = (n, rangeAt) => Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 5), r = rangeAt(i);
    return { open: c, close: c, high: c + r, low: c - r, volume: 1, timestamp: i };
  });
  const calm = mk(300, () => 0.3);
  const spike = mk(300, i => (i > 280 ? 3 : 0.3));
  const pCalm = atrPercentile(calm, calculateATR(calm, 14));
  const pSpike = atrPercentile(spike, calculateATR(spike, 14));
  assert.ok(pSpike >= 95, `spike ${pSpike}`);
  assert.ok(pCalm !== null && pCalm <= 100);
  const short = mk(50, () => 1);
  assert.equal(atrPercentile(short, calculateATR(short, 14)), null);
});

// ── modo previo desde snapshots ─────────────────────────────────────────────

test('previousModeFromSnapshots: usa el último snapshot fresco; ignora viejos, futuros o inválidos', () => {
  const NOW = 1_800_000_000_000;
  assert.equal(previousModeFromSnapshots([{ ts: NOW - 3600e3, market: { mode: 'risk_on' } }], NOW), 'risk_on');
  assert.equal(previousModeFromSnapshots([{ ts: NOW - 7 * 3600e3, market: { mode: 'risk_on' } }], NOW), null);   // viejo
  assert.equal(previousModeFromSnapshots([{ ts: NOW + 3600e3, market: { mode: 'risk_on' } }], NOW), null);       // del futuro
  assert.equal(previousModeFromSnapshots([{ ts: NOW - 1000, market: { mode: 'raro' } }], NOW), null);
  assert.equal(previousModeFromSnapshots([], NOW), null);
  assert.equal(previousModeFromSnapshots(null, NOW), null);
});

test('getPreviousMode nunca lanza: si Firestore falla devuelve null', async () => {
  const orig = console.warn; console.warn = () => {};
  try {
    assert.equal(await getPreviousMode('PAXG', { getSnapshots: async () => { throw new Error('boom'); } }), null);
    assert.equal(await getPreviousMode('PAXG', { now: 2e12, getSnapshots: async () => [{ ts: 2e12 - 1000, market: { mode: 'risk_off' } }] }), 'risk_off');
  } finally { console.warn = orig; }
});

test('snapshotJob pasa el modo previo al modo de oro', async () => {
  let received = null;
  const candles = Array.from({ length: 5 }, (_, i) => ({ timestamp: i, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
  const res = await runSnapshot({
    getCryptoData: async () => ({ price: 100, change24h: 0, candles, candlesSource: 'coinbase' }),
    calculateAllIndicators: () => ({ ema: {}, rsi: 50, atr: 1 }),
    analyzeVolume: () => ({ status: 'normal' }),
    calculateZones: () => null,
    determineMarketMode: () => ({ mode: 'neutral', score: 0 }),
    determineGoldMarketMode: (_p, _i, _v, _c, opts) => { received = opts; return { mode: 'risk_on', score: 0.3 }; },
    getGoldContext: async () => ({}),
    getPreviousMode: async (sym) => (sym === 'PAXG' ? 'risk_on' : null),
    saveSnapshot: async () => true,
    now: () => 1_800_000_000_000
  });
  assert.equal(res.PAXG, 'saved');
  assert.deepEqual(received, { previousMode: 'risk_on' });
});

// ── COT: percentil histórico ────────────────────────────────────────────────

import { parseCotHistory } from '../src/services/macroService.js';

const cotRow = (long, short, d) => ({ noncomm_positions_long_all: String(long), noncomm_positions_short_all: String(short), as_of_date_in_form_yymmdd: d });

test('parseCotHistory: posición actual, cambio semanal y percentil frente al historial', () => {
  // más nueva primero: neto actual 150k; historial 100 semanas con netos 0..99k
  const hist = Array.from({ length: 100 }, (_, i) => cotRow(1000 * (99 - i) + 50000, 50000, `d${i}`));
  const rows = [cotRow(200000, 50000, 'ahora'), ...hist];
  const r = parseCotHistory(rows);
  assert.equal(r.netSpec, 150000);
  assert.equal(r.sentiment, 'bullish');
  assert.equal(r.weekChange, 150000 - 99000);
  assert.equal(r.netSpecPercentile, 100);              // el actual es el mayor de todos
  assert.equal(r.historyWeeks, 101);
  const low = parseCotHistory([cotRow(50000, 50000, 'x'), ...hist]);
  assert.ok(low.netSpecPercentile < 3);
});

test('parseCotHistory: con menos de 52 semanas no inventa un percentil; con datos insuficientes lanza', () => {
  const r = parseCotHistory([cotRow(200000, 50000, 'a'), cotRow(190000, 50000, 'b'), cotRow(180000, 50000, 'c')]);
  assert.equal(r.netSpecPercentile, null);
  assert.equal(r.reportDate, 'a');
  assert.throws(() => parseCotHistory([cotRow(1, 1, 'a')]), /insuficiente/);
});

// ── monitor de desacople ────────────────────────────────────────────────────

import { decouplingStatus } from '../src/services/decoupling.js';
import { mulberry32, gaussian } from '../src/backtest/stats.js';

function goldAndYield(n, seed, beta) {
  const rng = mulberry32(seed);
  const t0 = Date.parse('2024-01-01T00:00:00Z');
  const candles = [], obs = [];
  let g = 2000, ry = 1.5;
  for (let i = 0; i < n; i++) {
    const dRy = 0.03 * gaussian(rng);
    ry += dRy;
    g *= Math.exp(beta(i) * dRy + 0.006 * gaussian(rng));
    const ts = t0 + i * 86400000;
    candles.push({ timestamp: ts, close: g });
    obs.push({ date: new Date(ts).toISOString().slice(0, 10), value: ry });
  }
  return { candles, obs };
}

test('decoupling: relación inversa intacta ⇒ normal con correlación negativa', () => {
  const { candles, obs } = goldAndYield(320, 5, () => -0.25);
  const r = decouplingStatus(candles, obs);
  assert.equal(r.status, 'normal');
  assert.ok(r.corr60 < -0.3, `corr60 ${r.corr60}`);
});

test('decoupling: la relación desaparece en los últimos 60 días ⇒ decoupled/weakened y mensaje de advertencia', () => {
  const { candles, obs } = goldAndYield(320, 6, i => (i < 250 ? -0.3 : 0));
  const r = decouplingStatus(candles, obs);
  assert.notEqual(r.status, 'normal');
  assert.ok(r.corr250 !== null && r.corr60 > r.corr250, `${r.corr60} vs ${r.corr250}`);
  assert.match(r.message, /tasa real/);
});

test('decoupling: sin datos suficientes o desalineados devuelve null (no inventa)', () => {
  assert.equal(decouplingStatus([], []), null);
  assert.equal(decouplingStatus(undefined, undefined), null);
  const { candles } = goldAndYield(100, 7, () => 0);
  assert.equal(decouplingStatus(candles, [{ date: '1999-01-01', value: 1 }]), null);
});

test('determineGoldMarketMode muestra la advertencia de desacople pero no cambia el score', () => {
  const mk = (dec) => ({
    analysis: { sentiment: 'neutral', score: 0 }, analysisError: null, headlines: [],
    macro: { dxy: null, tenYearYield: null, cot: null, realYield: { value: 0.5, sentiment: 'bullish' }, gvz: null, silver: null, dailyBias: null, decoupling: dec }
  });
  const a = determineGoldMarketMode(100, ind, { status: 'normal' }, mk(null));
  const b = determineGoldMarketMode(100, ind, { status: 'normal' }, mk({ status: 'decoupled', message: 'desacoplado', corr60: 0, corr250: -0.3 }));
  assert.equal(a.score, b.score);
  assert.ok(b.reasons.some(r => /desacoplado/.test(r)));
  assert.ok(!a.reasons.some(r => /desacoplado/.test(r)));
});
