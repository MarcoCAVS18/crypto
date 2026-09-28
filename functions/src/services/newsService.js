// Headlines de noticias sobre oro y macro — múltiples fuentes RSS
// Retorna objetos { title, url, source, pubDate } ordenados por fecha

import https from 'https';
import http from 'http';

const MAX_AGE_MS   = 72 * 60 * 60 * 1000; // descartar noticias > 72h
const MAX_PER_FEED = 10;
const TIMEOUT_MS   = 10000;

export const RSS_FEEDS_GOLD = [
  // Google News — ángulo financiero/macro (`when:2d`: sin filtro de fecha devolvía notas viejas y 0 frescas)
  'https://news.google.com/rss/search?q=gold+price+dollar+federal+reserve+treasury+when:2d&hl=en-US&gl=US&ceid=US:en',
  // Google News — ángulo geopolítico
  'https://news.google.com/rss/search?q=gold+war+geopolitics+sanctions+central+bank+inflation+when:2d&hl=en-US&gl=US&ceid=US:en',
  // Google News — precio del oro / XAU
  'https://news.google.com/rss/search?q=gold+XAUUSD+bullion+when:2d&hl=en-US&gl=US&ceid=US:en',
  // Yahoo Finance — ETF GLD y futuro de oro (kitco.com/rss/news.rss dejó de existir: 404)
  'https://finance.yahoo.com/rss/headline?s=GLD&region=US&lang=en-US',
  'https://finance.yahoo.com/rss/headline?s=GC=F&region=US&lang=en-US'
];

export const RSS_FEEDS_BTC = [
  // Google News — precio y mercado Bitcoin
  'https://news.google.com/rss/search?q=bitcoin+price+BTC+when:2d&hl=en-US&gl=US&ceid=US:en',
  // Google News — macro y regulación cripto
  'https://news.google.com/rss/search?q=bitcoin+federal+reserve+ETF+crypto+regulation+when:2d&hl=en-US&gl=US&ceid=US:en',
  // CoinTelegraph — Bitcoin
  'https://cointelegraph.com/rss/tag/bitcoin',
  // Yahoo Finance — ticker BTC-USD
  'https://finance.yahoo.com/rss/headline?s=BTC-USD&region=US&lang=en-US'
];

const RSS_FEEDS_ETH = [
  // Google News — Ethereum precio
  'https://news.google.com/rss/search?q=ethereum+ETH+price+when:2d&hl=en-US&gl=US&ceid=US:en',
  // Google News — Ethereum L2, staking, EIP
  'https://news.google.com/rss/search?q=ethereum+staking+layer2+defi+when:2d&hl=en-US&gl=US&ceid=US:en',
  // CoinTelegraph — Ethereum
  'https://cointelegraph.com/rss/tag/ethereum',
];

export function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; crypto-dashboard/1.0)',
        'Accept':     'application/rss+xml, application/xml, text/xml, */*'
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return fetchUrl(new URL(res.headers.location, url).toString(), redirectCount + 1).then(resolve).catch(reject);
      }
      // Antes se parseaba igual el cuerpo de un 403/429 (HTML de bloqueo) y salían 0 titulares sin ningún aviso
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
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
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export function parseRssItems(xml, now = Date.now()) {
  const items  = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;

  while ((m = itemRx.exec(xml)) !== null && items.length < MAX_PER_FEED) {
    const block = m[1];

    const titleM = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block);
    if (!titleM) continue;
    const rawTitle = decodeEntities(titleM[1]);
    if (!rawTitle) continue;

    // Filtrar por antigüedad antes de procesar el resto
    const dateM   = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
    const pubDate = dateM ? dateM[1].trim() : null;
    if (pubDate) {
      const age = now - new Date(pubDate).getTime();
      if (age > MAX_AGE_MS) continue; // ignorar noticias viejas
    }

    const linkM = /<link>([\s\S]*?)<\/link>/.exec(block);
    const url   = linkM ? linkM[1].trim() : null;

    const srcTagM = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block);
    let source = srcTagM ? decodeEntities(srcTagM[1]) : '';
    if (!source) {
      const dash = rawTitle.lastIndexOf(' - ');
      if (dash > 0) source = rawTitle.slice(dash + 3);
    }

    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }

    items.push({ title, url, source, pubDate });
  }
  return items;
}

export async function fetchHeadlines(feeds, label, { fetcher = fetchUrl, now = Date.now() } = {}) {
  const results = await Promise.allSettled(feeds.map(u => fetcher(u)));

  const seen     = new Set();
  const allItems = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.warn(`[NewsService:${label}] Feed failed:`, r.reason?.message);
      continue;
    }
    for (const item of parseRssItems(r.value, now)) {
      if (!seen.has(item.title)) {
        seen.add(item.title);
        allItems.push(item);
      }
    }
  }

  allItems.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const failed = results.filter(r => r.status !== 'fulfilled').length;
  console.log(`[NewsService:${label}] ${allItems.length} headlines frescos (≤72h, ${feeds.length - failed}/${feeds.length} feeds ok)`);
  return allItems.slice(0, 14);
}

/**
 * Obtiene noticias recientes de oro desde múltiples feeds RSS.
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function getGoldHeadlines() {
  return fetchHeadlines(RSS_FEEDS_GOLD, 'PAXG');
}

/**
 * Obtiene noticias recientes de Bitcoin desde múltiples feeds RSS.
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function getBtcHeadlines() {
  return fetchHeadlines(RSS_FEEDS_BTC, 'BTC');
}

/**
 * Obtiene noticias recientes de Ethereum desde múltiples feeds RSS.
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function getEthHeadlines() {
  return fetchHeadlines(RSS_FEEDS_ETH, 'ETH');
}

/**
 * Obtiene noticias de cualquier token via Google News genérico.
 * @param {string} symbol
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function getTokenHeadlines(symbol) {
  const feeds = [
    `https://news.google.com/rss/search?q=${symbol}+crypto+price+when:2d&hl=en-US&gl=US&ceid=US:en`,
    `https://news.google.com/rss/search?q=${symbol}+cryptocurrency+market+when:2d&hl=en-US&gl=US&ceid=US:en`,
  ];
  return fetchHeadlines(feeds, symbol);
}

/**
 * Dispatcher genérico — obtiene noticias según el símbolo.
 * @param {string} symbol
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function getAssetHeadlines(symbol) {
  if (symbol === 'PAXG') return getGoldHeadlines();
  if (symbol === 'ETH')  return getEthHeadlines();
  if (symbol === 'BTC')  return getBtcHeadlines();
  return getTokenHeadlines(symbol);
}
