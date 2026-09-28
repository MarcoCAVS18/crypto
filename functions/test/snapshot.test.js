import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotDocId, buildSnapshot, SNAPSHOT_MODEL_VERSION } from '../src/services/snapshot.js';
import { run as runSnapshotJob, SNAPSHOT_SYMBOLS } from '../src/scheduled/snapshotJob.js';
import { determineGoldMarketMode } from '../src/services/goldMarketMode.js';
import { determineMarketMode } from '../src/services/marketMode.js';
import { buildGoldSources } from '../src/services/dataHealth.js';
import { buildHealthReport } from '../src/routes/health.js';
import { saveSnapshot, getLatestSnapshots, _setDbForTests } from '../src/config/database.js';

const NOW = Date.parse('2026-09-28T12:20:00Z');
const H = 3600 * 1000;

const indicators = {
  rsi: 54.44, atr: 8.2, vwap: 3999.5,
  ema: { ema20: 3990, ema50: 3950, ema100: 3900, ema200: 3800 },
  trendShort: 'alcista', trendLong: 'alcista'
};
const volume = { status: 'normal', ratio: 1.0123 };
const zones = { currentZone: 'neutral', buy: { min: 3950, max: 3970 }, sell: { min: 4030, max: 4050 } };
const marketData = { price: 4000.123456, change24h: 0.4567, candlesSource: 'real' };

const macro = {
  dxy: { value: 100.2, changePercent: -0.31 }, tenYearYield: { value: 4.12, source: 'yahoo' },
  realYield: { value: 1.85, date: '2026-09-25', sentiment: 'neutral', change20d: -0.1, zscore1y: 0.4, source: 'fred-csv' },
  cot: { netSpec: 150000, weekChange: 8000, sentiment: 'bullish', reportDate: '260922' },
  gvz: { value: 17.4, source: 'yahoo' }, silver: { value: 48.2 },
  dailyBias: { alignment: 'bull', trendShort: 'alcista', rsi: 58, source: 'gc-futures', longAlignment: 'bull', extension200Pct: 6.5, atrPercent: 1.1 },
  spot: { ticker: 'GC=F', price: 3990, time: NOW - 10 * 60000 },
  fred: { available: true, series: {
    realYield10: { status: 'ok', latest: { date: '2026-09-25', value: 1.85 }, change20d: -0.1, zscore1y: 0.4, percentile1y: 55 },
    vix: { status: 'failed', error: 'HTTP 500' }
  } }
};

function goldContext() {
  return {
    analysis: { sentiment: 'bullish', score: 0.5, reasoning: 'x', keyFactors: [] }, analysisError: null,
    headlines: [{}, {}, {}], macro,
    sources: buildGoldSources({
      macro, dailyBias: macro.dailyBias, headlines: [{}], analysisError: null, fred: macro.fred, now: NOW,
      results: { macro: { status: 'fulfilled' }, realYield: { status: 'fulfilled' }, cot: { status: 'fulfilled' }, volData: { status: 'fulfilled' }, spot: { status: 'fulfilled' } }
    })
  };
}

// ── construcción del snapshot ───────────────────────────────────────────────

test('snapshotDocId: un id por símbolo y hora UTC, ordenable', () => {
  assert.equal(snapshotDocId('paxg', NOW), 'PAXG_2026092812');
  assert.ok(snapshotDocId('PAXG', NOW) < snapshotDocId('PAXG', NOW + H));
});

test('buildSnapshot (oro): guarda técnicos, zona, score con componentes y todo el contexto macro', () => {
  const mm = determineGoldMarketMode(marketData.price, indicators, volume, goldContext());
  const s = buildSnapshot({ symbol: 'PAXG', marketData, indicators, volume, zones, marketMode: mm, now: NOW });

  assert.equal(s.id, 'PAXG_2026092812');
  assert.equal(s.ts, NOW);
  assert.equal(s.modelVersion, SNAPSHOT_MODEL_VERSION);
  assert.equal(s.timeframe, '4h');
  assert.equal(s.price, 4000.1235);
  assert.equal(s.candlesSource, 'real');
  assert.equal(s.technicals.rsi, 54.4);
  assert.equal(s.technicals.atrPercent, 0.205);
  assert.equal(s.technicals.volumeRatio, 1.01);
  assert.equal(s.zone, 'neutral');
  assert.deepEqual(s.zones.buy, { min: 3950, max: 3970 });

  // score y componentes: la suma de componentes reproduce el score (antes del recorte a ±1)
  assert.equal(s.market.mode, mm.mode);
  assert.equal(s.market.score, mm.score);
  const sum = Object.values(s.market.components).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - s.market.score) < 0.002, `suma componentes ${sum} vs score ${s.market.score}`);
  for (const k of ['ai', 'dxy', 'tenYear', 'technical', 'cot', 'realYield', 'gvz', 'goldSilver', 'dailyBias']) {
    assert.ok(k in s.market.components, `falta componente ${k}`);
  }

  // contexto macro
  assert.deepEqual(s.gold.ai, { sentiment: 'bullish', score: 0.5, error: null });
  assert.equal(s.gold.realYield.zscore1y, 0.4);
  assert.equal(s.gold.cot.netSpec, 150000);
  assert.equal(s.gold.dailyRegime.longAlignment, 'bull');
  assert.equal(s.gold.headlineCount, 3);
  assert.equal(s.gold.premium.premiumPct, 0.254);      // (4000.1235 − 3990) / 3990
  assert.equal(s.gold.spotPrice, 3990);
  assert.deepEqual(s.gold.fred.realYield10, { status: 'ok', value: 1.85, asOf: '2026-09-25', change20d: -0.1, zscore1y: 0.4, percentile1y: 55 });
  assert.equal(s.gold.fred.vix.status, 'failed');
  assert.equal(s.sources.realYield, 'ok');
  assert.equal(s.dataHealth.degraded, false);
});

test('buildSnapshot: con un insumo caído el snapshot lo registra (dataHealth y sources)', () => {
  const ctx = goldContext();
  ctx.macro = { ...macro, cot: null };
  ctx.sources = buildGoldSources({
    macro: ctx.macro, dailyBias: macro.dailyBias, headlines: [{}], analysisError: null, fred: macro.fred, now: NOW,
    results: { macro: { status: 'fulfilled' }, realYield: { status: 'fulfilled' }, cot: { status: 'rejected', reason: new Error('CFTC HTTP 500') }, volData: { status: 'fulfilled' }, spot: { status: 'fulfilled' } }
  });
  const mm = determineGoldMarketMode(marketData.price, indicators, volume, ctx);
  const s = buildSnapshot({ symbol: 'PAXG', marketData, indicators, volume, zones, marketMode: mm, now: NOW });
  assert.equal(s.sources.cot, 'failed');
  assert.equal(s.dataHealth.degraded, true);
  assert.deepEqual(s.dataHealth.missing, ['cot']);
  assert.equal(s.gold.cot, null);
  assert.ok(!('cot' in s.market.components));
});

test('buildSnapshot (BTC): sin bloque de oro ni componentes; sin `undefined` en ningún nivel', () => {
  const mm = determineMarketMode(70000, { ...indicators, ema: { ema50: 68000, ema200: 60000 }, atr: 900 }, volume);
  const s = buildSnapshot({ symbol: 'btc', marketData: { price: 70000 }, indicators, volume, zones: null, marketMode: mm, now: NOW });
  assert.equal(s.symbol, 'BTC');
  assert.equal(s.gold, null);
  assert.equal(s.market.components, null);
  assert.equal(s.zone, null);
  assert.equal(s.sources, null);
  const hasUndefined = (v) => v === undefined || (v && typeof v === 'object' && Object.values(v).some(hasUndefined));
  assert.equal(hasUndefined(s), false);
});

// ── Firestore falso ─────────────────────────────────────────────────────────

function fakeFirestore() {
  const store = new Map();
  const makeQuery = (conds = [], order = null, lim = Infinity) => ({
    where: (field, op, value) => makeQuery([...conds, { field, op, value }], order, lim),
    orderBy: (field, dir) => makeQuery(conds, { field, dir }, lim),
    limit: (n) => makeQuery(conds, order, n),
    get: async () => {
      let rows = [...store.entries()].map(([id, data]) => ({ id, data }));
      for (const c of conds) rows = rows.filter(r => (c.op === '>=' ? r.id >= c.value : r.id < c.value));
      rows.sort((a, b) => (a.id < b.id ? -1 : 1) * (order?.dir === 'desc' ? -1 : 1));
      return { docs: rows.slice(0, lim).map(r => ({ id: r.id, data: () => r.data })) };
    }
  });
  return {
    store,
    collection: () => ({
      doc: (id) => ({ create: async (d) => {
        if (store.has(id)) { const e = new Error('6 ALREADY_EXISTS'); e.code = 6; throw e; }
        store.set(id, d);
      } }),
      ...makeQuery()
    })
  };
}

test('saveSnapshot es idempotente por hora y getLatestSnapshots devuelve los más nuevos primero', async () => {
  const fs = fakeFirestore(); _setDbForTests(fs);
  const mk = (sym, t) => ({ id: snapshotDocId(sym, t), symbol: sym, ts: t, price: 1 });
  assert.equal(await saveSnapshot(mk('PAXG', NOW)), true);
  assert.equal(await saveSnapshot(mk('PAXG', NOW + 10 * 60000)), false);        // misma hora → conserva la primera
  assert.equal(await saveSnapshot(mk('PAXG', NOW + H)), true);
  assert.equal(await saveSnapshot(mk('PAXG', NOW + 2 * H)), true);
  assert.equal(await saveSnapshot(mk('BTC', NOW)), true);

  const last = await getLatestSnapshots('PAXG', 2);
  assert.deepEqual(last.map(x => x.ts), [NOW + 2 * H, NOW + H]);
  assert.equal(fs.store.get('PAXG_2026092812').id, undefined, 'el id va en el documento, no dentro de los datos');
  assert.ok((await getLatestSnapshots('BTC', 5)).every(x => x.symbol === 'BTC'));
});

test('saveSnapshot propaga errores que no son ALREADY_EXISTS', async () => {
  _setDbForTests({ collection: () => ({ doc: () => ({ create: async () => { throw new Error('permission denied'); } }) }) });
  await assert.rejects(() => saveSnapshot({ id: 'PAXG_2026092812' }), /permission denied/);
});

// ── job programado ──────────────────────────────────────────────────────────

function jobDeps({ synthetic = {}, failCrypto = null, goldFails = false, alreadySaved = false } = {}) {
  const saved = [];
  return {
    saved,
    deps: {
      getCryptoData: async (symbol) => {
        if (symbol === failCrypto) throw new Error('coinbase caído');
        return { price: symbol === 'BTC' ? 70000 : 4000, candles: [{}], change24h: 0.1, candlesSource: synthetic[symbol] ? 'synthetic' : 'real' };
      },
      calculateAllIndicators: () => indicators,
      analyzeVolume: () => volume,
      calculateZones: () => zones,
      determineMarketMode: (price, ind, vol) => determineMarketMode(price, { ...ind, ema: { ema50: price, ema200: price } }, vol),
      determineGoldMarketMode: (price, ind, vol, ctx) => determineGoldMarketMode(price, ind, vol, ctx),
      getGoldContext: async () => { if (goldFails) throw new Error('groq y fred caídos'); return goldContext(); },
      saveSnapshot: async (rec) => { saved.push(rec); return !alreadySaved; },
      now: () => NOW
    }
  };
}

test('job: guarda un snapshot por símbolo con el id de la hora', async () => {
  const j = jobDeps();
  const r = await runSnapshotJob(j.deps);
  assert.deepEqual(SNAPSHOT_SYMBOLS, ['PAXG', 'BTC']);
  assert.deepEqual(r, { PAXG: 'saved', BTC: 'saved' });
  assert.deepEqual(j.saved.map(x => x.id), ['PAXG_2026092812', 'BTC_2026092812']);
  assert.ok(j.saved[0].gold, 'PAXG lleva contexto de oro');
  assert.equal(j.saved[1].gold, null);
});

test('job: si esa hora ya tiene snapshot lo informa como "exists"', async () => {
  const r = await runSnapshotJob(jobDeps({ alreadySaved: true }).deps);
  assert.deepEqual(r, { PAXG: 'exists', BTC: 'exists' });
});

test('job: velas sintéticas se omiten; una falla no impide el otro símbolo', async () => {
  const j = jobDeps({ synthetic: { PAXG: true }, failCrypto: 'BTC' });
  const r = await runSnapshotJob(j.deps);
  assert.deepEqual(r, { PAXG: 'skipped', BTC: 'error' });
  assert.equal(j.saved.length, 0);
});

test('job: si el contexto de oro no está disponible guarda igual el snapshot técnico', async () => {
  const j = jobDeps({ goldFails: true });
  const r = await runSnapshotJob(j.deps);
  assert.equal(r.PAXG, 'saved');
  const paxg = j.saved.find(x => x.symbol === 'PAXG');
  assert.equal(paxg.gold, null);                 // la ausencia de `gold` marca que faltó el macro
  assert.ok(paxg.technicals.rsi);
});

// ── health: último snapshot ─────────────────────────────────────────────────

const cfg = { groqKey: true, fredKey: true, vapidKeys: true, groqModel: 'm' };
const cal = { lastEventDate: '2026-12-18', daysCovered: 81, upcomingCount: 11, unverifiedUpcoming: 0 };

test('health: snapshot reciente → sin advertencia; viejo o inexistente → advierte', () => {
  const fresh = buildHealthReport({ config: cfg, calendar: cal, cachedContext: null, now: NOW, lastSnapshot: { id: 'PAXG_2026092812', ts: NOW - 20 * 60000, modelVersion: 'p1' } });
  assert.equal(fresh.snapshots.last.ageMinutes, 20);
  assert.deepEqual(fresh.warnings, []);

  const old = buildHealthReport({ config: cfg, calendar: cal, cachedContext: null, now: NOW, lastSnapshot: { id: 'x', ts: NOW - 5 * H } });
  assert.match(old.warnings.join(' '), /hace 300 min: el job snapshotJob no está corriendo/);

  const none = buildHealthReport({ config: cfg, calendar: cal, cachedContext: null, now: NOW, lastSnapshot: null });
  assert.match(none.warnings.join(' '), /Todavía no hay snapshots/);
  assert.equal(none.snapshots.last, null);

  const unknown = buildHealthReport({ config: cfg, calendar: cal, cachedContext: null, now: NOW });   // no se consultó
  assert.equal('snapshots' in unknown, false);
  assert.deepEqual(unknown.warnings, []);
});
