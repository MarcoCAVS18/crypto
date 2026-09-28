import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextZoneState, CONFIRM_READINGS, COOLDOWN_MS } from '../src/services/zoneAlert.js';
import { run as handler, handler as scheduledHandler } from '../src/scheduled/zoneWatcher.js';

const H = 3600 * 1000;

// ── Máquina de estado ───────────────────────────────────────────────────────

test('primera lectura en compra no avisa; la segunda consecutiva sí; la tercera no', () => {
  assert.equal(CONFIRM_READINGS, 2);
  let s = null, pushes = [];
  for (let i = 0; i < 4; i++) {
    const r = nextZoneState(s, 'buy', 4000, i * H);
    s = r.state; pushes.push(r.push);
  }
  assert.deepEqual(pushes, [false, true, false, false]);
  assert.equal(s.streak, 4);
});

test('flapping buy→neutral→buy dentro del enfriamiento NO reenvía', () => {
  let s = null;
  const seq = ['buy', 'buy', 'neutral', 'buy', 'buy'];         // 1 aviso confirmado y una "re-entrada"
  const pushes = seq.map((z, i) => { const r = nextZoneState(s, z, 4000, i * H); s = r.state; return r.push; });
  assert.deepEqual(pushes, [false, true, false, false, false]);
});

test('pasado el enfriamiento (12 h) una nueva entrada confirmada sí avisa', () => {
  let s = null;
  const times = [0, H, 2 * H, 13 * H, 14 * H];
  const seq   = ['buy', 'buy', 'neutral', 'buy', 'buy'];
  const pushes = seq.map((z, i) => { const r = nextZoneState(s, z, 4000, times[i]); s = r.state; return r.push; });
  assert.deepEqual(pushes, [false, true, false, false, true]);
  assert.equal(COOLDOWN_MS, 12 * H);
});

test('otras zonas nunca avisan y reinician la racha', () => {
  let s = nextZoneState(null, 'buy', 1, 0).state;
  const r = nextZoneState(s, 'sell', 1, H);
  assert.equal(r.push, false);
  assert.equal(r.state.streak, 1);
  assert.equal(r.state.zone, 'sell');
});

test('acepta el estado viejo (sin streak/lastPushAt) sin romperse', () => {
  const r = nextZoneState({ zone: 'buy', price: 4000 }, 'buy', 4001, 5 * H);
  assert.equal(r.state.streak, 2);
  assert.equal(r.push, true);
});

// ── handler (B9): ya no revienta y respeta el antispam ─────────────────────

function fakeDeps({ zoneOf, synthetic = {}, failOn = null } = {}) {
  const store = {};
  const sent = [];
  const deleted = [];
  let clock = 0;
  const deps = {
    getCryptoData: async (symbol) => {
      if (symbol === failOn) throw new Error('coinbase caído');
      return { price: 4000.5, candles: [{}], candlesSource: synthetic[symbol] ? 'synthetic' : 'real' };
    },
    calculateAllIndicators: () => ({}),
    calculateZones: (price, candles, indicators) => {
      assert.ok(indicators && typeof indicators === 'object', 'los indicadores deben ir como 3er argumento');
      return { currentZone: zoneOf() };
    },
    getZoneState: async (s) => store[s] ?? null,
    setZoneState: async (s, st) => { store[s] = st; },
    getPushSubscriptions: async () => [
      { subscription: { endpoint: 'A' } }, { subscription: { endpoint: 'B' } }
    ],
    deletePushSubscription: async (e) => { deleted.push(e); },
    sendPush: async (subs, title, body, data) => { sent.push({ title, body, data }); return subs.filter(x => x.endpoint === 'A'); },
    now: () => clock
  };
  return { deps, store, sent, deleted, tick: (ms) => { clock += ms; } };
}

test('B9: el handler corre sin errores y avisa una vez tras confirmar la zona', async () => {
  const f = fakeDeps({ zoneOf: () => 'buy' });
  await handler(f.deps);                 // lectura 1 (BTC y PAXG): sin aviso
  assert.equal(f.sent.length, 0);
  f.tick(H);
  await handler(f.deps);                 // lectura 2: confirmada
  assert.equal(f.sent.length, 2);        // BTC y PAXG
  assert.match(f.sent[0].title, /Zona de compra/);
  assert.equal(f.sent[1].data.symbol, 'PAXG');
  f.tick(H);
  await handler(f.deps);                 // sigue en compra: no repite
  assert.equal(f.sent.length, 2);
});

test('B9: elimina las suscripciones expiradas que sendPush descartó', async () => {
  const f = fakeDeps({ zoneOf: () => 'buy' });
  await handler(f.deps); f.tick(H); await handler(f.deps);
  assert.ok(f.deleted.includes('B'));
  assert.ok(!f.deleted.includes('A'));
});

test('B9: un símbolo que falla no impide procesar el otro', async () => {
  const f = fakeDeps({ zoneOf: () => 'neutral', failOn: 'BTC' });
  await handler(f.deps);
  assert.equal(f.store.BTC, undefined);
  assert.equal(f.store.PAXG.zone, 'neutral');
});

test('B9: con velas sintéticas no se actualiza estado ni se avisa', async () => {
  const f = fakeDeps({ zoneOf: () => 'buy', synthetic: { PAXG: true } });
  await handler(f.deps); f.tick(H); await handler(f.deps);
  assert.equal(f.store.PAXG, undefined);
  assert.equal(f.sent.filter(x => x.data.symbol === 'PAXG').length, 0);
  assert.equal(f.sent.filter(x => x.data.symbol === 'BTC').length, 1);
});

test('B9: el handler del scheduler no toma el evento de onSchedule como dependencias', async () => {
  // onSchedule() llama handler(event). Sin red (fetch falla) cada símbolo se registra y sigue:
  // no debe explotar con "... is not a function" por usar el evento como si fueran las deps.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('sin red (test)'); };
  try {
    await assert.doesNotReject(() => scheduledHandler({ scheduleTime: '2026-09-28T12:00:00Z', jobName: 'zoneWatcher' }));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(scheduledHandler.length, 0);   // no declara parámetros
});
