import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

let server, base;
before(async () => {
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

test('humo: /api/health responde con la cobertura del calendario', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.status, 'ok');
  assert.ok(j.calendar.lastEventDate);
  assert.ok(Array.isArray(j.warnings));
});

test('humo: /api/calendar devuelve eventos con hora y fase, filtrados por activo', async () => {
  const r = await fetch(`${base}/api/calendar?days=60&symbol=ETH`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age/);
  const j = await r.json();
  assert.ok(Array.isArray(j.events));
  for (const e of j.events) {
    assert.ok(e.eventTime && ['upcoming', 'released'].includes(e.phase));
    assert.ok(!(e.assets.length === 1 && e.assets[0] === 'PAXG'), 'ETH no debe recibir eventos solo-oro');
  }
  assert.ok(j.coverage.upcomingCount >= 0);
});

test('humo: /api/calendar acota los días y tolera parámetros inválidos', async () => {
  const j = await (await fetch(`${base}/api/calendar?days=99999&symbol=%3Cscript%3E`)).json();
  assert.ok(Array.isArray(j.events));
});

test('humo: /api/chat sin API key responde 503 y sin mensaje 400', async () => {
  delete process.env.GROQ_API_KEY;
  const post = (body) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ message: 'hola' })).status, 503);
  assert.equal((await post({})).status, 400);
});
