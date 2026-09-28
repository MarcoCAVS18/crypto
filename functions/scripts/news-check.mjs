// Diagnóstico de noticias: ¿cada feed responde y el parser encuentra titulares? (corre en Actions, con red)
import { RSS_FEEDS_GOLD, RSS_FEEDS_BTC, fetchUrl, parseRssItems, fetchHeadlines } from '../src/services/newsService.js';

for (const url of [...RSS_FEEDS_GOLD, ...RSS_FEEDS_BTC]) {
  try {
    const body = await fetchUrl(url);
    const items = parseRssItems(body);
    const rawItems = (body.match(/<item[\s>]/g) ?? []).length;
    console.log(`OK   ${items.length} frescos / ${rawItems} items · ${body.length} bytes · ${url.slice(0, 90)}`);
    if (rawItems > 0 && items.length === 0) console.log('     (todos filtrados por antigüedad o sin título) muestra:', body.slice(0, 300).replace(/\s+/g, ' '));
    if (rawItems === 0) console.log('     muestra:', body.slice(0, 300).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(`FAIL ${e.message} · ${url.slice(0, 90)}`);
  }
}
const gold = await fetchHeadlines(RSS_FEEDS_GOLD, 'PAXG');
console.log(`\nfetchHeadlines(oro): ${gold.length} titulares`);
gold.slice(0, 5).forEach(h => console.log(' -', h.pubDate, '|', h.source, '|', h.title));
