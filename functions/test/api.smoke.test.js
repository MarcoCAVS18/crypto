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

// ── P1/B15: ruta de velas para gráficos ─────────────────────────────────────

function withCoinbaseMock(fn) {
  return async () => {
    const realFetch = globalThis.fetch;
    const seen = [];
    globalThis.fetch = (url, opts) => {
      const u = String(url);
      if (!u.includes('coinbase.com')) return realFetch(url, opts);       // el test llama al server local
      const p = new URL(u).searchParams;
      seen.push(Number(p.get('granularity')));
      const end = Date.parse(p.get('end')), step = Number(p.get('granularity')) * 1000;
      const rows = [];
      for (let t = Math.floor(end / step) * step; t >= Date.parse(p.get('start')); t -= step) rows.push([t / 1000, 99, 101, 100, 100, 1]);
      return Promise.resolve({ ok: true, json: async () => rows });
    };
    try { await fn(seen); } finally { globalThis.fetch = realFetch; }
  };
}

test('P1/B15: /candles rechaza granularidades inválidas con 400 (sin llamar al exchange)', async () => {
  const r = await fetch(`${base}/api/crypto/PAXG/candles?granularity=7m`);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Granularidad no válida/);
});

test('P1/B15: /candles?granularity=15m pide velas de 15 minutos (antes caía a diario)', withCoinbaseMock(async (seen) => {
  const j = await (await fetch(`${base}/api/crypto/PAXG/candles?granularity=15m&count=96`)).json();
  assert.deepEqual([...new Set(seen)], [900]);
  assert.equal(j.candles.length, 96);
  assert.equal(j.granularity, '15m');
}));

test('P1/B15: /candles?granularity=4h se arma desde 1h y responde velas de 4h', withCoinbaseMock(async (seen) => {
  const j = await (await fetch(`${base}/api/crypto/PAXG/candles?granularity=4h&count=180`)).json();
  assert.ok(seen.every(g => g === 3600));
  assert.equal(j.candles.length, 180);
  assert.equal(j.candles[1].timestamp - j.candles[0].timestamp, 4 * 3600 * 1000);
}));

test('GET /api/health/ai está montado en esa ruta (sin clave responde con el diagnóstico, no 404)', async () => {
  const saved = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const r = await fetch(`${base}/api/health/ai`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.match(j.hint, /No hay GROQ_API_KEY/);
  } finally { if (saved !== undefined) process.env.GROQ_API_KEY = saved; }
});

test('GET /api/metrics/:symbol valida el símbolo', async () => {
  const r = await fetch(`${base}/api/metrics/%3Cbad%3E`);
  assert.equal(r.status, 400);
});

test('el diagnóstico /api/health/ai tiene su propio límite (6/min por IP): el 7.º pedido recibe 429', async () => {
  const saved = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  try {
    const h = { 'x-forwarded-for': '203.0.113.77' };
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await fetch(`${base}/api/health/ai`, { headers: h })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429]);
    // otra IP no se ve afectada
    assert.equal((await fetch(`${base}/api/health/ai`, { headers: { 'x-forwarded-for': '203.0.113.78' } })).status, 200);
  } finally { if (saved !== undefined) process.env.GROQ_API_KEY = saved; }
});

test('las respuestas llevan cabeceras de seguridad y no anuncian Express', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('humo: una ruta inexistente de /api responde JSON 404 (no el HTML por defecto de Express)', async () => {
  const r = await fetch(`${base}/api/no-existe`);
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /json/);
  assert.match((await r.json()).error, /No existe GET \/no-existe/);
});
