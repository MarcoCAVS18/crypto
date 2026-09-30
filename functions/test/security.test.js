import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, clientKey } from '../src/middleware/rateLimit.js';
import { corsOptions, securityHeaders } from '../src/middleware/security.js';

const mkRes = () => { const r = { headers: {}, code: 200, body: null, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; return r; };
const req = (ip = '1.1.1.1') => ({ headers: { 'x-forwarded-for': ip }, ip: '9.9.9.9' });

test('rateLimit: deja pasar hasta el máximo y luego responde 429 con Retry-After', () => {
  let t = 1000;
  const lim = createRateLimiter({ max: 3, windowMs: 60000, now: () => t, name: 'x' });
  let passed = 0;
  for (let i = 0; i < 3; i++) lim(req(), mkRes(), () => passed++);
  assert.equal(passed, 3);
  const res = mkRes();
  lim(req(), res, () => assert.fail('no debe pasar'));
  assert.equal(res.code, 429);
  assert.ok(Number(res.headers['Retry-After']) >= 1);
  assert.match(res.body.error, /Demasiados pedidos/);
});

test('rateLimit: cada IP tiene su contador y la ventana se reinicia', () => {
  let t = 0;
  const lim = createRateLimiter({ max: 1, windowMs: 1000, now: () => t });
  let ok = 0;
  lim(req('1.1.1.1'), mkRes(), () => ok++);
  lim(req('2.2.2.2'), mkRes(), () => ok++);          // otra IP: pasa
  assert.equal(ok, 2);
  const blocked = mkRes(); lim(req('1.1.1.1'), blocked, () => ok++);
  assert.equal(blocked.code, 429);
  t = 1500;                                           // ventana nueva
  lim(req('1.1.1.1'), mkRes(), () => ok++);
  assert.equal(ok, 3);
});

test('clientKey: toma la primera IP de X-Forwarded-For', () => {
  assert.equal(clientKey({ headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' } }), '8.8.8.8');
  assert.equal(clientKey({ headers: {}, ip: '5.5.5.5' }), '5.5.5.5');
});

test('CORS: sin configurar refleja el origen (como antes); con CORS_ORIGINS solo los listados y sin Origin', () => {
  assert.deepEqual(corsOptions({}), { origin: true });
  const { origin } = corsOptions({ CORS_ORIGINS: 'https://a.web.app, https://b.com' });
  const check = (o) => { let r; origin(o, (_e, v) => { r = v; }); return r; };
  assert.equal(check('https://a.web.app'), true);
  assert.equal(check('https://evil.com'), false);
  assert.equal(check(undefined), true);
});

test('securityHeaders pone las cabeceras básicas', () => {
  const res = mkRes(); let next = false;
  securityHeaders({}, res, () => { next = true; });
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.ok(next);
});
