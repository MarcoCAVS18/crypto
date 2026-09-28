import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hourBucket, decisionDocId, decisionIdPrefix, isHourlyDecisionId, buildDecisionRecord, DECISION_MODEL_VERSION
} from '../src/services/decisionLog.js';
import { saveDecision, getDecisionsBySymbol, _setDbForTests } from '../src/config/database.js';

const T = (iso) => new Date(iso).getTime();
const H = 3600 * 1000;

// ── Helpers puros ───────────────────────────────────────────────────────────

test('hourBucket / decisionDocId: formato y orden cronológico', () => {
  assert.equal(hourBucket(T('2026-09-28T09:05:00Z')), '2026092809');
  assert.equal(decisionDocId('paxg', T('2026-09-28T09:59:59Z')), 'PAXG_2026092809');
  const ids = [T('2026-09-28T09:00:00Z'), T('2026-09-28T10:00:00Z'), T('2026-10-01T00:00:00Z'), T('2027-01-01T00:00:00Z')].map(t => decisionDocId('PAXG', t));
  assert.deepEqual(ids, [...ids].sort());
});

test('isHourlyDecisionId distingue el formato nuevo de los IDs automáticos', () => {
  assert.equal(isHourlyDecisionId('PAXG_2026092809'), true);
  assert.equal(isHourlyDecisionId('kJ3x9QmZp0aBcD1eF2gH'), false);
  assert.equal(decisionIdPrefix('btc'), 'BTC_');
});

test('buildDecisionRecord: guarda las features y no deja `undefined` (Firestore lo rechaza)', () => {
  const rec = buildDecisionRecord({
    symbol: 'paxg',
    marketData: { price: 4012.5, candlesSource: 'real' },
    marketMode: {
      mode: 'neutral', score: 0.1234567,
      goldContext: {
        sentiment: 'bullish', sentimentScore: 0.42, analysisError: null,
        cot: { sentiment: 'bullish', netSpec: 120000 }, realYield: { value: 1.4321 },
        gvz: { value: 17.123 }, macro: { dxy: { changePercent: -0.2 }, tenYearYield: { value: 4.1 } },
        goldSilverRatio: 81.234, dailyBias: { alignment: 'bull' }
      }
    },
    zones: { currentZone: 'neutral' },
    indicators: { rsi: 55.55, atr: 8, trendShort: 'alcista', trendLong: 'alcista' },
    userState: { cashPercent: '60', mode: 'inversion' },
    decision: { action: 'WAIT', strength: 'débil', reason: 'x', operations: [] }
  });
  assert.equal(rec.symbol, 'PAXG');
  assert.equal(rec.modeScore, 0.123);
  assert.equal(rec.zone, 'neutral');
  assert.equal(rec.cashPercent, 60);
  assert.equal(rec.atrPercent, 0.199);
  assert.equal(rec.gold.cot, 'bullish');
  assert.equal(rec.gold.realYield, 1.432);
  assert.equal(rec.gold.aiError, false);
  assert.equal(rec.modelVersion, DECISION_MODEL_VERSION);
  const hasUndefined = (v) => v === undefined || (v && typeof v === 'object' && Object.values(v).some(hasUndefined));
  assert.equal(hasUndefined(rec), false);
});

test('buildDecisionRecord: entradas mínimas (BTC, sin contexto de oro)', () => {
  const rec = buildDecisionRecord({
    symbol: 'BTC', marketData: { price: 70000 }, marketMode: { mode: 'risk_on' },
    zones: null, indicators: null, userState: { cashPercent: 50, mode: 'inversion' },
    decision: { action: 'BUY', operations: [{}] }
  });
  assert.equal(rec.gold, null);
  assert.equal(rec.rsi, null);
  assert.equal(rec.opsCount, 1);
  assert.equal(JSON.stringify(rec).includes('undefined'), false);
});

// ── Firestore falso (create idempotente + consultas por rango de ID) ────────

function fakeFirestore() {
  const store = new Map();
  let clock = 0;
  const api = { store, setClock: (t) => { clock = t; } };

  const makeQuery = (conds = [], order = null, lim = Infinity) => ({
    where: (field, op, value) => makeQuery([...conds, { field, op, value }], order, lim),
    orderBy: (field, dir) => makeQuery(conds, { field, dir }, lim),
    limit: (n) => makeQuery(conds, order, n),
    get: async () => {
      let rows = [...store.entries()].map(([id, data]) => ({ id, data }));
      for (const c of conds) {
        const onId = typeof c.field !== 'string';           // FieldPath.documentId()
        rows = rows.filter(r => {
          const v = onId ? r.id : r.data[c.field];
          return c.op === '>=' ? v >= c.value : c.op === '<' ? v < c.value : v === c.value;
        });
      }
      if (order) {
        rows.sort((a, b) => (a.id < b.id ? -1 : 1) * (order.dir === 'desc' ? -1 : 1));
      } else {
        rows.sort((a, b) => (a.id < b.id ? -1 : 1));          // como Firestore: por ID de documento
      }
      return { docs: rows.slice(0, lim).map(r => ({ id: r.id, data: () => r.data })) };
    }
  });

  api.collection = () => ({
    doc: (id) => ({
      create: async (data) => {
        if (store.has(id)) { const e = new Error('6 ALREADY_EXISTS: Document already exists'); e.code = 6; throw e; }
        store.set(id, { ...data, timestamp: { toMillis: () => clock } });
      }
    }),
    ...makeQuery()
  });
  return api;
}

test('B10: saveDecision es idempotente por símbolo y hora (la primera gana)', async () => {
  const fs = fakeFirestore(); _setDbForTests(fs);
  const t0 = T('2026-09-28T09:05:00Z');
  assert.equal(await saveDecision({ symbol: 'PAXG', decision: 'WAIT' }, t0), true);
  assert.equal(await saveDecision({ symbol: 'PAXG', decision: 'BUY' }, t0 + 20 * 60000), false);   // misma hora
  assert.equal(fs.store.get('PAXG_2026092809').decision, 'WAIT');
  assert.equal(await saveDecision({ symbol: 'PAXG', decision: 'BUY' }, t0 + H), true);              // hora siguiente
  assert.equal(await saveDecision({ symbol: 'BTC', decision: 'WAIT' }, t0), true);                  // otro símbolo
  assert.equal(fs.store.size, 3);
});

test('B10: saveDecision propaga errores que no son ALREADY_EXISTS', async () => {
  _setDbForTests({ collection: () => ({ doc: () => ({ create: async () => { throw new Error('permission denied'); } }) }) });
  await assert.rejects(() => saveDecision({ symbol: 'PAXG' }, 0), /permission denied/);
});

test('B10: getDecisionsBySymbol devuelve las N MÁS RECIENTES en orden (antes: muestra arbitraria)', async () => {
  const fs = fakeFirestore(); _setDbForTests(fs);
  const t0 = T('2026-09-01T00:00:00Z');
  // 60 señales horarias insertadas en orden mezclado (37 es coprimo con 60 → permutación)
  const hours = [...Array(60).keys()].map(i => (i * 37) % 60);
  for (const h of hours) { fs.setClock(t0 + h * H); await saveDecision({ symbol: 'PAXG', n: h }, t0 + h * H); }
  const got = await getDecisionsBySymbol('PAXG', 5);
  assert.deepEqual(got.map(d => d.n), [59, 58, 57, 56, 55]);
});

test('B10: el prefijo no mezcla símbolos parecidos (BTC vs BTCX / ETH)', async () => {
  const fs = fakeFirestore(); _setDbForTests(fs);
  const t = T('2026-09-28T09:00:00Z');
  await saveDecision({ symbol: 'BTC', k: 'btc' }, t);
  await saveDecision({ symbol: 'BTCX', k: 'btcx' }, t);
  await saveDecision({ symbol: 'ETH', k: 'eth' }, t);
  const got = await getDecisionsBySymbol('BTC', 10);
  assert.deepEqual(got.map(d => d.k), ['btc']);
});

test('B10: completa con documentos legacy (ID automático) solo si faltan, sin duplicar', async () => {
  const fs = fakeFirestore(); _setDbForTests(fs);
  const t = T('2026-09-28T09:00:00Z');
  fs.store.set('autoIdA', { symbol: 'PAXG', k: 'old-1', timestamp: { toMillis: () => t - 5 * H } });
  fs.store.set('autoIdB', { symbol: 'PAXG', k: 'old-2', timestamp: { toMillis: () => t - 9 * H } });
  fs.setClock(t);
  await saveDecision({ symbol: 'PAXG', k: 'new' }, t);
  assert.deepEqual((await getDecisionsBySymbol('PAXG', 10)).map(d => d.k), ['new', 'old-1', 'old-2']);
  // con suficientes nuevos ya no se mira el legacy
  assert.deepEqual((await getDecisionsBySymbol('PAXG', 1)).map(d => d.k), ['new']);
});

test('B10: una falla de lectura devuelve [] en vez de romper la decisión', async () => {
  _setDbForTests({ collection: () => { throw new Error('boom'); } });
  assert.deepEqual(await getDecisionsBySymbol('PAXG', 5), []);
});

test('el endpoint del historial puede pedir que una falla de lectura NO se disfrace de "sin señales"', async () => {
  _setDbForTests({ collection: () => { throw new Error('boom'); } });
  await assert.rejects(() => getDecisionsBySymbol('PAXG', 5, { throwOnError: true }), /boom/);
});
