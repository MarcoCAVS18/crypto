import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLastGood, MIN_LIVE } from '../src/services/resilientHeadlines.js';
import { diagnoseFeed } from '../src/services/newsService.js';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const h = (title, hoursAgo) => ({ title, url: `https://x/${title}`, source: 'S', pubDate: new Date(NOW - hoursAgo * 3600e3).toUTCString() });
const memCache = () => { const m = new Map(); return { getCache: async (k) => m.get(k) ?? null, setCache: async (k, v) => { m.set(k, v); }, m }; };

test('titulares resilientes: con suficientes frescos usa los frescos y los guarda', async () => {
  const c = memCache();
  const fresh = [h('a', 1), h('b', 2), h('c', 3)];
  const r = await withLastGood({ key: 'k', fresh, ...c, now: NOW });
  assert.equal(r.source, 'live'); assert.equal(r.headlines.length, 3);
  assert.equal(c.m.get('k').headlines.length, 3);
});

test('con pocos frescos (feeds bloqueados) completa con los guardados y lo declara', async () => {
  const c = memCache();
  await withLastGood({ key: 'k', fresh: [h('viejo1', 30), h('viejo2', 31), h('viejo3', 32)], ...c, now: NOW - 40 * 3600e3 });   // se guardó hace 40 h
  const r = await withLastGood({ key: 'k', fresh: [h('nuevo', 0.5)], ...c, now: NOW });
  assert.equal(r.source, 'live+saved');
  assert.deepEqual(r.headlines.map(x => x.title), ['nuevo', 'viejo1', 'viejo2', 'viejo3']);   // ordenados por fecha
  const none = await withLastGood({ key: 'k', fresh: [], ...c, now: NOW });
  assert.equal(none.source, 'saved'); assert.equal(none.headlines.length, 3);
});

test('descarta guardados de más de 4 días y no duplica', async () => {
  const c = memCache();
  c.m.set('k', { headlines: [h('muy viejo', 200), h('dup', 5)], savedAt: 1 });
  const r = await withLastGood({ key: 'k', fresh: [h('dup', 5)], ...c, now: NOW });
  assert.deepEqual(r.headlines.map(x => x.title), ['dup']);
  assert.equal(r.source, 'live+saved');
  const none = await withLastGood({ key: 'nada', fresh: [], ...memCache(), now: NOW });
  assert.equal(none.source, 'none'); assert.deepEqual(none.headlines, []);
});

test('si la caché falla no rompe: devuelve lo que haya', async () => {
  const bad = { getCache: async () => { throw new Error('firestore'); }, setCache: async () => { throw new Error('firestore'); } };
  const ok = await withLastGood({ key: 'k', fresh: [h('a', 1), h('b', 1), h('c', 1)], ...bad, now: NOW });
  assert.equal(ok.source, 'live');
  const few = await withLastGood({ key: 'k', fresh: [h('a', 1)], ...bad, now: NOW });
  assert.equal(few.source, 'live'); assert.equal(few.headlines.length, 1);
  assert.ok(MIN_LIVE >= 2);
});

// ── diagnóstico de feeds ────────────────────────────────────────────────────
const rss = (n, hoursAgo = 1) => `<rss><channel>${Array.from({ length: n }, (_, i) => `<item><title>T${i}</title><link>https://x/${i}</link><pubDate>${new Date(NOW - hoursAgo * 3600e3).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
const resp = (status, body, url = 'https://news.google.com/rss') => ({ status, ok: status >= 200 && status < 300, url, text: async () => body, headers: { get: () => 'application/xml' } });

test('diagnoseFeed: feed sano, limitado (429), bloqueado (403), consentimiento, sin items y solo viejos', async () => {
  const u = 'https://news.google.com/rss/search?q=gold';
  const good = await diagnoseFeed(u, { fetchImpl: async () => resp(200, rss(5)), now: NOW });
  assert.equal(good.ok, true); assert.equal(good.fresh, 5); assert.equal(good.hint, null);
  assert.match((await diagnoseFeed(u, { fetchImpl: async () => resp(429, 'x'), now: NOW })).hint, /429/);
  assert.match((await diagnoseFeed(u, { fetchImpl: async () => resp(403, 'x'), now: NOW })).hint, /403/);
  assert.match((await diagnoseFeed(u, { fetchImpl: async () => resp(200, '<html>consent</html>', 'https://consent.google.com/x'), now: NOW })).hint, /consentimiento/);
  const empty = await diagnoseFeed(u, { fetchImpl: async () => resp(200, '<html>bloqueado</html>'), now: NOW });
  assert.equal(empty.ok, false); assert.match(empty.hint, /sin items/); assert.match(empty.snippet, /bloqueado/);
  const old = await diagnoseFeed(u, { fetchImpl: async () => resp(200, rss(4, 200)), now: NOW });
  assert.equal(old.ok, false); assert.equal(old.rawItems, 4); assert.match(old.hint, /72 h/);
  const down = await diagnoseFeed(u, { fetchImpl: async () => { throw new Error('ECONNRESET'); }, now: NOW });
  assert.match(down.hint, /ECONNRESET/);
  assert.ok(!good.feed.includes('q=gold'), 'no se expone la query completa');
});
