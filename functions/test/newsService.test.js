import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHeadlines, parseRssItems } from '../src/services/newsService.js';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map(i =>
  `<item><title>${i.title}</title><link>${i.url ?? 'https://x.test/a'}</link><pubDate>${i.pubDate}</pubDate></item>`).join('')}</channel></rss>`;

test('parseRssItems: descarta noticias de más de 72 h y separa la fuente del título', () => {
  const xml = rss([
    { title: 'Gold hits record - Reuters', pubDate: 'Mon, 28 Sep 2026 10:00:00 GMT' },
    { title: 'Old story - Blog', pubDate: 'Mon, 21 Sep 2026 10:00:00 GMT' }
  ]);
  const items = parseRssItems(xml, NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Gold hits record');
  assert.equal(items[0].source, 'Reuters');
});

test('fetchHeadlines: junta feeds, deduplica, ordena por fecha y tolera feeds caídos', async () => {
  const feeds = { a: rss([{ title: 'Uno', pubDate: 'Mon, 28 Sep 2026 08:00:00 GMT' }, { title: 'Dos', pubDate: 'Mon, 28 Sep 2026 11:00:00 GMT' }]),
                  b: rss([{ title: 'Dos', pubDate: 'Mon, 28 Sep 2026 11:00:00 GMT' }]) };
  const fetcher = async (u) => { if (u === 'c') throw new Error('HTTP 429'); return feeds[u]; };
  const warn = console.warn; console.warn = () => {};
  try {
    const out = await fetchHeadlines(['a', 'b', 'c'], 'TEST', { fetcher, now: NOW });
    assert.deepEqual(out.map(h => h.title), ['Dos', 'Uno']);
  } finally { console.warn = warn; }
});

test('fetchHeadlines: si todos los feeds fallan devuelve lista vacía (el llamador decide qué mostrar)', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(await fetchHeadlines(['a'], 'TEST', { fetcher: async () => { throw new Error('HTTP 403'); }, now: NOW }), []);
  } finally { console.warn = warn; }
});
