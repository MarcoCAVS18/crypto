import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, groupByUser, handler } from '../src/scheduled/signalWatcher.js';

const H = 3600 * 1000;
const T0 = Date.UTC(2026, 10, 6, 12);

const sub = (userId, n = 1) => ({ userId, subscription: { endpoint: `https://push.example/${userId}/${n}`, keys: { p256dh: 'k', auth: 'a' } } });

/** Dependencias falsas: el mercado, la señal y Firestore son controlables; nada toca la red. */
function makeDeps(over = {}) {
  const calls = { sent: [], market: [], signal: [], deleted: [], states: new Map() };
  const profiles = over.profiles ?? { marco: { cryptos: ['PAXG'], settings: { cashUsd: 333, mode: 'inversion', installments: 4 } } };
  const d = {
    now: () => d._now,
    _now: T0,
    getPushSubscriptions: async () => over.subs ?? [sub('marco')],
    getProfile: async (id) => profiles[id] ?? null,
    listUserOperations: async () => over.ops ?? [],
    getCryptoData: async (symbol) => {
      calls.market.push(symbol);
      if (over.marketFail?.includes(symbol)) throw new Error('sin red');
      return over.market?.[symbol] ?? { price: symbol === 'PAXG' ? 3923 : 90000, candles: [], candlesSource: 'coinbase' };
    },
    signalDeps: {},
    computeSignal: async (args) => {
      calls.signal.push(args);
      if (over.signalFail?.includes(args.symbol)) throw new Error('motor roto');
      const action = typeof over.action === 'function' ? over.action(args) : (over.action ?? 'BUY');
      return { decision: over.decision?.(args) ?? buyDecision(action) };
    },
    getZoneState: async (k) => calls.states.get(k) ?? null,
    setZoneState: async (k, v) => { calls.states.set(k, v); },
    sendPush: async (subs, title, body, data) => { calls.sent.push({ subs, title, body, data }); return over.keepNone ? [] : subs; },
    deletePushSubscription: async (e) => { calls.deleted.push(e); },
    ...over.deps
  };
  return { d, calls };
}

const buyDecision = (action) => action === 'BUY'
  ? { action, reason: 'Precio 18.0% por debajo del promedio', cadence: { reason: 'due' }, operations: [{ type: 'BUY', usdAmount: 83, price: 3923 }, { type: 'BUY', usdAmount: 83, price: 3864 }] }
  : { action, reason: 'Ya compraste ayer', operations: [] };

const tick = async (d, hours = 1) => { d._now += hours * H; return run(d); };

// ── agrupación ───────────────────────────────────────────────────────────────

test('groupByUser: junta los dispositivos de cada usuario e ignora los que no tienen usuario (ya no hay aviso "para todos")', () => {
  const m = groupByUser([sub('Marco', 1), sub('marco', 2), sub('tomas'), { subscription: { endpoint: 'x' } }, { userId: 'a' }, null]);
  assert.deepEqual([...m.keys()], ['marco', 'tomas']);
  assert.equal(m.get('marco').length, 2);
});

test('el handler del scheduler no acepta dependencias (onSchedule le pasa el evento como primer argumento)', () => {
  assert.equal(handler.length, 0);
});

// ── flujo ────────────────────────────────────────────────────────────────────

test('sin suscripciones no hace nada ni pide mercado', async () => {
  const { d, calls } = makeDeps({ subs: [] });
  assert.deepEqual(await run(d), { users: 0, pushes: 0, skipped: [] });
  assert.equal(calls.market.length, 0);
});

test('COMPRAR confirmado (2 lecturas): un solo push, con la señal, los montos y los tramos de ESE usuario', async () => {
  const { d, calls } = makeDeps();
  assert.equal((await run(d)).pushes, 0);                  // 1.ª lectura: no avisa
  const r = await tick(d);                                 // 2.ª: confirma
  assert.equal(r.pushes, 1);
  assert.equal(calls.sent.length, 1);
  const p = calls.sent[0];
  assert.equal(p.title, 'PAXG: toca la compra de la semana');
  assert.match(p.body, /^Usá \$166 \(50 % de tus \$333\) en 2 tramos: \$83 ahora a \$3,923 · \$83 a \$3,864\./);
  assert.deepEqual(p.data, { kind: 'signal', symbol: 'PAXG', action: 'BUY', tag: 'signal_PAXG' });
  assert.equal(p.subs[0].endpoint, 'https://push.example/marco/1');
  assert.equal((await tick(d)).pushes, 0);                 // sigue igual: no repite
  assert.equal(calls.sent.length, 1);
});

test('la señal que se calcula usa los USDT, el modo y las compras del usuario (no valores por defecto)', async () => {
  const ops = [{ symbol: 'PAXG', type: 'BUY', date: '2026-11-04', amount_usd: 100, price: 4000, units: 0.025, fee: 0 }];
  const { d, calls } = makeDeps({ ops, profiles: { marco: { cryptos: ['PAXG'], settings: { cashUsd: 333, mode: 'inversion', installments: 6, feePercent: 0.1, targetPercent: 20 } } } });
  await run(d);
  const a = calls.signal[0];
  assert.equal(a.symbol, 'PAXG');
  assert.equal(a.now, T0);
  assert.equal(a.userState.totalCapital, 333);
  assert.equal(a.userState.installments, 6);
  assert.deepEqual(a.userState.costs, { feeBps: 10 });
  assert.deepEqual(a.userState.target, { targetPercent: 20 });
  assert.equal(a.portfolioContext.hasPosition, true);
  assert.equal(a.portfolioContext.allBuys.length, 1);
  assert.equal(a.portfolioContext.executedBuys.length, 1);     // compró hace 2 días: dentro de la ventana de 4
  assert.equal(a.portfolioContext.currentPrice, 3923);
});

test('ESPERAR no avisa nunca, aunque la zona de precio sea de compra (el caso del reporte: aviso ≠ app)', async () => {
  const { d, calls } = makeDeps({ action: 'WAIT' });
  for (let i = 0; i < 5; i++) await tick(d);
  assert.equal(calls.sent.length, 0);
});

test('un aviso por compra: COMPRAR → (compra) ESPERAR → vuelve a tocar pasada la semana = segundo aviso, no uno por hora', async () => {
  let phase = 'BUY';
  const { d, calls } = makeDeps({ action: () => phase });
  await run(d); await tick(d);                    // aviso 1
  phase = 'WAIT';
  for (let i = 0; i < 24 * 7; i++) await tick(d);
  phase = 'BUY';
  await tick(d); await tick(d);                   // aviso 2
  for (let i = 0; i < 10; i++) await tick(d);
  assert.equal(calls.sent.length, 2);
});

test('sin ajustes sincronizados, sin USDT o fuera del modo inversión: no se calcula ni se avisa, y queda dicho por qué', async () => {
  const { d, calls } = makeDeps({
    subs: [sub('nuevo'), sub('sinplata'), sub('trader'), sub('marco')],
    profiles: {
      nuevo: { cryptos: ['PAXG'] },
      sinplata: { cryptos: ['PAXG'], settings: { cashUsd: 0, mode: 'inversion' } },
      trader: { cryptos: ['PAXG'], settings: { cashUsd: 500, mode: 'trading' } },
      marco: { cryptos: ['PAXG'], settings: { cashUsd: 333, mode: 'inversion' } }
    }
  });
  await run(d);
  const r = await tick(d);
  assert.equal(r.pushes, 1);
  assert.deepEqual(calls.signal.map(c => c.userState.totalCapital), [333, 333]);   // solo Marco, dos corridas
  assert.deepEqual(r.skipped, ['nuevo: sin USDT sincronizados', 'sinplata: sin USDT sincronizados', 'trader: modo trading']);
});

test('cada usuario recibe el aviso en SUS dispositivos y con SUS montos', async () => {
  const { d, calls } = makeDeps({
    subs: [sub('marco', 1), sub('marco', 2), sub('tomas')],
    profiles: {
      marco: { cryptos: ['PAXG'], settings: { cashUsd: 333, mode: 'inversion' } },
      tomas: { cryptos: ['PAXG'], settings: { cashUsd: 1000, mode: 'inversion' } }
    }
  });
  await run(d);
  const r = await tick(d);
  assert.equal(r.pushes, 2);
  const byEndpoint = (e) => calls.sent.find(s => s.subs.some(x => x.endpoint === e));
  assert.equal(byEndpoint('https://push.example/marco/1').subs.length, 2);
  assert.match(byEndpoint('https://push.example/marco/1').body, /de tus \$333\)/);
  assert.match(byEndpoint('https://push.example/tomas/1').body, /de tus \$1,000\)/);
});

test('el mercado se pide una sola vez por activo en la corrida (aunque lo sigan varios usuarios)', async () => {
  const { d, calls } = makeDeps({
    subs: [sub('marco'), sub('tomas')],
    profiles: {
      marco: { cryptos: ['PAXG', 'BTC'], settings: { cashUsd: 333, mode: 'inversion' } },
      tomas: { cryptos: ['PAXG'], settings: { cashUsd: 100, mode: 'inversion' } }
    }
  });
  await run(d);
  assert.deepEqual([...calls.market].sort(), ['BTC', 'PAXG']);
});

test('sin monedas en el perfil usa BTC y PAXG; el oro de futuros (XAUUSDT) no avisa', async () => {
  const { d, calls } = makeDeps({ profiles: { marco: { settings: { cashUsd: 333, mode: 'inversion' } } } });
  await run(d);
  assert.deepEqual(calls.signal.map(c => c.symbol), ['BTC', 'PAXG']);
  const { d: d2, calls: c2 } = makeDeps({ profiles: { marco: { cryptos: ['XAUUSDT', 'PAXG'], settings: { cashUsd: 333, mode: 'inversion' } } } });
  await run(d2);
  assert.deepEqual(c2.signal.map(c => c.symbol), ['PAXG']);
});

test('velas sintéticas o sin datos: se omite ese activo (nunca se decide con datos inventados) y los demás siguen', async () => {
  const { d, calls } = makeDeps({
    profiles: { marco: { cryptos: ['PAXG', 'BTC', 'ETH'], settings: { cashUsd: 333, mode: 'inversion' } } },
    market: { PAXG: { price: 3923, candles: [], candlesSource: 'synthetic' } },
    marketFail: ['BTC']
  });
  await run(d);
  assert.deepEqual(calls.signal.map(c => c.symbol), ['ETH']);
});

test('un activo que falla no frena a los demás ni al resto de los usuarios', async () => {
  const { d, calls } = makeDeps({
    subs: [sub('marco'), sub('tomas')],
    profiles: {
      marco: { cryptos: ['PAXG', 'BTC'], settings: { cashUsd: 333, mode: 'inversion' } },
      tomas: { cryptos: ['BTC'], settings: { cashUsd: 100, mode: 'inversion' } }
    },
    signalFail: ['PAXG']
  });
  const errors = []; const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
  try { await run(d); await tick(d); } finally { console.error = orig; }
  assert.equal(calls.sent.length, 2);                       // BTC de marco y BTC de tomas
  assert.ok(errors.some(e => e.includes('PAXG')));
});

test('si falla el perfil de un usuario, los demás se procesan', async () => {
  const { d, calls } = makeDeps({
    subs: [sub('roto'), sub('marco')],
    deps: { getProfile: async (id) => { if (id === 'roto') throw new Error('firestore'); return { cryptos: ['PAXG'], settings: { cashUsd: 333, mode: 'inversion' } }; } }
  });
  const orig = console.error; console.error = () => {};
  try { await run(d); await tick(d); } finally { console.error = orig; }
  assert.equal(calls.sent.length, 1);
});

test('las suscripciones vencidas (el servicio de push las rechaza) se borran', async () => {
  const dead = sub('marco', 2);
  const { d, calls } = makeDeps({
    subs: [sub('marco', 1), dead],
    deps: { sendPush: async (subs, t, b, data) => { calls_sent(subs); return subs.filter(s => s.endpoint.endsWith('/1')); } }
  });
  const seen = [];
  function calls_sent(s) { seen.push(...s); }
  await run(d); await tick(d);
  assert.equal(seen.length, 2);
  assert.deepEqual(calls.deleted, [dead.subscription.endpoint]);
});

test('si no queda ningún dispositivo válido no se cuenta como push enviado', async () => {
  const { d, calls } = makeDeps({ keepNone: true });
  await run(d);
  const r = await tick(d);
  assert.equal(r.pushes, 0);
  assert.equal(calls.deleted.length, 1);
});

test('el estado de la racha es por usuario y por activo (no se mezclan)', async () => {
  const { d, calls } = makeDeps({
    subs: [sub('marco'), sub('tomas')],
    profiles: {
      marco: { cryptos: ['PAXG'], settings: { cashUsd: 333, mode: 'inversion' } },
      tomas: { cryptos: ['PAXG'], settings: { cashUsd: 100, mode: 'inversion' } }
    }
  });
  await run(d);
  assert.deepEqual([...calls.states.keys()].sort(), ['SIGNAL_marco_PAXG', 'SIGNAL_tomas_PAXG']);
});
