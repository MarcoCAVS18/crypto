// Headlines de noticias sobre oro y macro vía Google News RSS (sin API key)
// Retorna objetos { title, url, source, pubDate } en lugar de strings puros

import https from 'https';
import http from 'http';

// Dos búsquedas paralelas: macro/financiero + geopolítica
const RSS_URLS = [
  'https://news.google.com/rss/search?q=gold+price+dollar+federal+reserve+treasury&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=gold+war+geopolitics+sanctions+central+bank+inflation&hl=en-US&gl=US&ceid=US:en'
];
const MAX_PER_FEED = 10;
const TIMEOUT_MS   = 10000;

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error('Too many redirects'));

    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; crypto-dashboard/1.0)',
        'Accept':     'application/rss+xml, application/xml, text/xml'
      }
    }, (res) => {
      if ([301, 302, 307].includes(res.statusCode) && res.headers.location) {
        return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error('RSS fetch timeout')); });
  });
}

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseRssItems(xml) {
  const items   = [];
  const itemRx  = /<item[^>]*>([\s\S]*?)<\/item>/g;

  let m;
  while ((m = itemRx.exec(xml)) !== null && items.length < MAX_PER_FEED) {
    const block = m[1];

    // Title
    const titleM = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block);
    if (!titleM) continue;
    const rawTitle = decodeEntities(titleM[1]);
    if (!rawTitle) continue;

    // URL — Google News RSS puts the redirect link in <link>
    const linkM = /<link>([\s\S]*?)<\/link>/.exec(block);
    const url   = linkM ? linkM[1].trim() : null;

    // Source name (from <source> tag or fallback: last " - Source" in title)
    const srcTagM = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block);
    let source = srcTagM ? decodeEntities(srcTagM[1]) : '';
    if (!source) {
      const dash = rawTitle.lastIndexOf(' - ');
      if (dash > 0) source = rawTitle.slice(dash + 3);
    }

    // Strip "- Source" suffix from displayed title for cleaner look
    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }

    // pubDate
    const dateM   = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
    const pubDate = dateM ? dateM[1].trim() : null;

    items.push({ title, url, source, pubDate });
  }

  return items;
}

/**
 * Obtiene las últimas noticias sobre oro desde dos feeds RSS de Google News:
 * uno financiero (Fed, DXY, yields) y uno geopolítico (guerras, sanciones).
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function getGoldHeadlines() {
  const results = await Promise.allSettled(RSS_URLS.map(fetchUrl));

  const seen    = new Set();
  const allItems = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.warn('[NewsService] Feed failed:', r.reason?.message);
      continue;
    }
    for (const item of parseRssItems(r.value)) {
      if (!seen.has(item.title)) {
        seen.add(item.title);
        allItems.push(item);
      }
    }
  }

  // Más recientes primero
  allItems.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  console.log(`[NewsService] ${allItems.length} headlines (${RSS_URLS.length} feeds)`);
  return allItems.slice(0, 12);
}
