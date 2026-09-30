import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIN_RE, legacyHash, makeCredential, checkPin, lockState, afterAttempt, attemptsLeft, newSession, sessionId, sessionValid, MAX_FAILS, LOCK_MS
} from '../src/services/pinAuth.js';
import { _setDbForTests } from '../src/config/database.js';
import app from '../src/app.js';

// ── unidades ────────────────────────────────────────────────────────────────
test('PIN: de 4 a 8 dígitos', () => {
  for (const ok of ['1234', '00000000', '987654']) assert.ok(PIN_RE.test(ok), ok);
  for (const bad of ['123', '123456789', 'abcd', '12 34', '', '12.3']) assert.ok(!PIN_RE.test(bad), bad);
});

test('credencial nueva: scrypt con sal aleatoria; verifica bien y rechaza mal', () => {
  const a = makeCredential('4321'), b = makeCredential('4321');
  assert.notEqual(a.pinSalt, b.pinSalt);
  assert.notEqual(a.pinHash, b.pinHash);
  assert.equal(a.pinHash.length, 64);
  assert.deepEqual(checkPin(a, '4321', 'marco'), { ok: true, upgrade: false });
  assert.deepEqual(checkPin(a, '4322', 'marco'), { ok: false, upgrade: false });
  assert.equal(checkPin(a, 'abcd', 'marco').ok, false);            // formato inválido nunca coincide
  assert.equal(checkPin({}, '4321', 'marco').ok, false);
});

test('PIN del formato viejo (SHA-256 del cliente): se acepta y pide migrar; el equivocado no', () => {
  const legacy = { pinHash: legacyHash('1234', 'tomas') };
  assert.deepEqual(checkPin(legacy, '1234', 'tomas'), { ok: true, upgrade: true });
  assert.equal(checkPin(legacy, '1235', 'tomas').ok, false);
  assert.equal(checkPin(legacy, '1234', 'marco').ok, false);       // la sal incluye el usuario
  // el hash viejo es exactamente el que calculaba el navegador
  assert.equal(legacyHash('1234', 'tomas').length, 64);
});

test('bloqueo: 5 fallos seguidos bloquean 15 min; un acierto reinicia el contador', () => {
  let p = {};
  for (let i = 1; i < MAX_FAILS; i++) {
    const patch = afterAttempt(p, false, 1000);
    assert.equal(patch.lockedUntil, 0);
    p = { ...p, ...patch };
    assert.equal(p.failCount, i);
  }
  const last = afterAttempt(p, false, 1000);
  assert.equal(last.lockedUntil, 1000 + LOCK_MS);
  assert.deepEqual(lockState({ lockedUntil: 1000 + LOCK_MS }, 2000), { locked: true, retryAfterSec: Math.ceil((LOCK_MS - 1000) / 1000) });
  assert.equal(lockState({ lockedUntil: 1000 + LOCK_MS }, 1000 + LOCK_MS + 1).locked, false);
  assert.deepEqual(afterAttempt({ failCount: 3 }, true), { failCount: 0, lockedUntil: 0 });
  assert.equal(attemptsLeft({ failCount: 1 }, false), MAX_FAILS - 2);
});

test('sesión: token aleatorio, se guarda solo su hash, vence a los 30 días', () => {
  const a = newSession(1000), b = newSession(1000);
  assert.notEqual(a.token, b.token);
  assert.equal(a.id, sessionId(a.token));
  assert.notEqual(a.id, a.token);
  assert.ok(sessionValid({ expiresAt: a.expiresAt }, 1000));
  assert.ok(!sessionValid({ expiresAt: a.expiresAt }, a.expiresAt + 1));
  assert.ok(!sessionValid(null));
});

// ── Firestore falso ─────────────────────────────────────────────────────────
function fakeDb() {
  const cols = new Map();
  const col = (n) => { if (!cols.has(n)) cols.set(n, new Map()); return cols.get(n); };
  let auto = 0;
  const snap = (id, data) => ({ id, exists: data !== undefined, data: () => data });
  const query = (m, filters = [], order = null, lim = Infinity) => ({
    where: (f, _op, v) => query(m, [...filters, [f, v]], order, lim),
    orderBy: (f, dir = 'asc') => query(m, filters, [f, dir], lim),
    limit: (n) => query(m, filters, order, n),
    get: async () => {
      let rows = [...m.entries()].map(([id, d]) => ({ id, d })).filter(({ d }) => filters.every(([f, v]) => d[f] === v));
      if (order) rows.sort((a, b) => (order[1] === 'desc' ? -1 : 1) * String(a.d[order[0]] ?? '').localeCompare(String(b.d[order[0]] ?? '')));
      return { docs: rows.slice(0, lim).map(({ id, d }) => snap(id, d)) };
    }
  });
  return {
    _cols: cols,
    collection: (n) => {
      const m = col(n);
      return {
        ...query(m),
        doc: (id) => ({
          get: async () => snap(id, m.get(id)),
          set: async (data, opt) => { m.set(id, opt?.merge ? { ...(m.get(id) ?? {}), ...data } : { ...data }); },
          create: async (data) => { if (m.has(id)) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; } m.set(id, { ...data }); },
          delete: async () => { m.delete(id); }
        }),
        add: async (data) => { const id = `auto${++auto}`; m.set(id, { ...data }); return { id }; }
      };
    }
  };
}

let server, base, db;
before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(r => server.close(r)));
beforeEach(() => { db = fakeDb(); _setDbForTests(db); });

let ipN = 0;
const call = async (method, path, body, token) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(ipN / 250)}.${ipN++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, body: await r.json() };
};

test('auth: status → setup → login; el token da acceso y logout lo revoca', async () => {
  assert.deepEqual((await call('GET', '/api/auth/status/marco')).body, { userId: 'marco', exists: false });
  assert.equal((await call('GET', '/api/auth/status/intruso')).status, 404);

  const setup = await call('POST', '/api/auth/setup', { userId: 'marco', pin: '4321' });
  assert.equal(setup.status, 200);
  assert.ok(setup.body.token);
  assert.equal((await call('GET', '/api/auth/status/marco')).body.exists, true);
  assert.equal((await call('POST', '/api/auth/setup', { userId: 'marco', pin: '9999' })).status, 409);   // no se pisa un PIN

  const me = await call('GET', '/api/auth/me', null, setup.body.token);
  assert.equal(me.body.userId, 'marco');

  const login = await call('POST', '/api/auth/login', { userId: 'marco', pin: '4321' });
  assert.equal(login.status, 200);
  await call('POST', '/api/auth/logout', {}, login.body.token);
  assert.equal((await call('GET', '/api/auth/me', null, login.body.token)).status, 401);
  // ni el hash ni el token en claro quedan guardados como sesión
  const sessions = [...db._cols.get('_sessions').keys()];
  assert.ok(!sessions.includes(login.body.token));
});

test('auth: rechaza PIN inválido y perfiles desconocidos; nunca devuelve el hash', async () => {
  assert.equal((await call('POST', '/api/auth/setup', { userId: 'marco', pin: '12' })).status, 400);
  assert.equal((await call('POST', '/api/auth/setup', { userId: 'otro', pin: '1234' })).status, 404);
  assert.equal((await call('POST', '/api/auth/login', { userId: 'marco', pin: '1234' })).status, 404);      // sin PIN todavía
  const s = await call('POST', '/api/auth/setup', { userId: 'marco', pin: '1234' });
  assert.ok(!JSON.stringify(s.body).includes('pinHash'));
});

test('auth: PIN incorrecto descuenta intentos y al 5.º bloquea (429); el PIN correcto también queda bloqueado', async () => {
  await call('POST', '/api/auth/setup', { userId: 'tomas', pin: '2468' });
  const first = await call('POST', '/api/auth/login', { userId: 'tomas', pin: '0000' });
  assert.equal(first.status, 401);
  assert.equal(first.body.attemptsLeft, 4);
  for (let i = 0; i < 4; i++) await call('POST', '/api/auth/login', { userId: 'tomas', pin: '0000' });
  const locked = await call('POST', '/api/auth/login', { userId: 'tomas', pin: '2468' });   // aun con el PIN correcto
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'LOCKED');
  assert.ok(locked.body.retryAfterSec > 0);
});

test('auth: un perfil con hash viejo (cliente) entra y se migra a scrypt', async () => {
  await db.collection('user_profiles').doc('victor').set({ pinHash: legacyHash('1357', 'victor'), cryptos: ['BTC', 'ETH'] });
  const r = await call('POST', '/api/auth/login', { userId: 'victor', pin: '1357' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.cryptos, ['BTC', 'ETH']);
  const saved = (await db.collection('user_profiles').doc('victor').get()).data();
  assert.equal(saved.pinAlgo, 'scrypt-v2');
  assert.notEqual(saved.pinHash, legacyHash('1357', 'victor'));
  assert.equal((await call('POST', '/api/auth/login', { userId: 'victor', pin: '1357' })).status, 200);   // sigue entrando
});

test('auth: monedas — solo con sesión, validadas', async () => {
  const { body } = await call('POST', '/api/auth/setup', { userId: 'marco', pin: '1111' });
  assert.equal((await call('PUT', '/api/auth/cryptos', { cryptos: ['BTC'] })).status, 401);
  assert.equal((await call('PUT', '/api/auth/cryptos', { cryptos: ['btc!'] }, body.token)).status, 400);
  assert.equal((await call('PUT', '/api/auth/cryptos', { cryptos: ['BTC', 'PAXG', 'BTC'] }, body.token)).status, 200);
  assert.deepEqual((await call('GET', '/api/auth/me', null, body.token)).body.cryptos, ['BTC', 'PAXG']);
});

const op = (o = {}) => ({ date: '2026-09-01', symbol: 'PAXG', type: 'BUY', amount_usd: 100, price: 4000, units: 0.025, fee: 0.1, exchange: 'Binance', notes: '', ...o });

test('portfolio: exige sesión', async () => {
  for (const [m, p] of [['GET', '/api/portfolio/operations'], ['POST', '/api/portfolio/operations'], ['DELETE', '/api/portfolio/operations/x']]) {
    const r = await call(m, p, m === 'POST' ? op() : undefined);
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.equal(r.body.code, 'SESSION');
  }
});

test('portfolio: cada usuario ve y borra solo lo suyo (el userId sale de la sesión, no del body)', async () => {
  const marco = (await call('POST', '/api/auth/setup', { userId: 'marco', pin: '1111' })).body.token;
  const tomas = (await call('POST', '/api/auth/setup', { userId: 'tomas', pin: '2222' })).body.token;

  const created = await call('POST', '/api/portfolio/operations', { ...op(), userId: 'tomas' }, marco);   // intenta hacerse pasar por Tomás
  assert.equal(created.status, 201);
  const mine = (await call('GET', '/api/portfolio/operations', null, marco)).body;
  assert.equal(mine.count, 1);
  assert.equal(mine.operations[0].userId, 'marco');
  assert.equal((await call('GET', '/api/portfolio/operations', null, tomas)).body.count, 0);

  assert.equal((await call('DELETE', `/api/portfolio/operations/${created.body.id}`, undefined, tomas)).status, 403);
  assert.equal((await call('DELETE', `/api/portfolio/operations/${created.body.id}`, undefined, marco)).status, 200);
  assert.equal((await call('DELETE', `/api/portfolio/operations/${created.body.id}`, undefined, marco)).status, 404);
});

test('portfolio: Marco también ve las operaciones viejas sin userId; otros usuarios no', async () => {
  await db.collection('portfolio_operations').add({ date: '2026-01-01', symbol: 'BTC', type: 'BUY', amount_usd: 50, price: 90000, units: 0.0005 });
  await db.collection('portfolio_operations').add({ date: '2026-02-01', symbol: 'BTC', type: 'BUY', amount_usd: 60, price: 91000, units: 0.0006, userId: 'victor' });
  const marco = (await call('POST', '/api/auth/setup', { userId: 'marco', pin: '1111' })).body.token;
  const victor = (await call('POST', '/api/auth/setup', { userId: 'victor', pin: '3333' })).body.token;
  assert.equal((await call('GET', '/api/portfolio/operations', null, marco)).body.count, 1);
  assert.equal((await call('GET', '/api/portfolio/operations', null, victor)).body.count, 1);
  assert.equal((await call('GET', '/api/portfolio/operations?symbol=ETH', null, victor)).body.count, 0);
});

test('portfolio: valida las operaciones (tipos, rangos, fecha, símbolo)', async () => {
  const t = (await call('POST', '/api/auth/setup', { userId: 'marco', pin: '1111' })).body.token;
  for (const bad of [op({ type: 'HOLD' }), op({ symbol: 'x' }), op({ date: 'ayer' }), op({ price: 0 }), op({ units: -1 }), op({ amount_usd: 'mucho' }), op({ amount_usd: 1e12 })]) {
    assert.equal((await call('POST', '/api/portfolio/operations', bad, t)).status, 400, JSON.stringify(bad));
  }
  const ok = await call('POST', '/api/portfolio/operations', op({ symbol: 'paxg', type: 'sell', notes: 'x'.repeat(900) }), t);
  assert.equal(ok.status, 201);
  const saved = (await call('GET', '/api/portfolio/operations', null, t)).body.operations[0];
  assert.equal(saved.symbol, 'PAXG'); assert.equal(saved.type, 'SELL'); assert.equal(saved.notes.length, 500);
});
