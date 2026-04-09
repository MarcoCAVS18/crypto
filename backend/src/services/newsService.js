// Headlines de noticias sobre oro y macro vía Google News RSS (sin API key)

import https from 'https';
import http from 'http';

const RSS_URL = 'https://news.google.com/rss/search?q=gold+price+federal+reserve+DXY+treasury&hl=en-US&gl=US&ceid=US:en';
const MAX_HEADLINES = 15;
const TIMEOUT_MS = 10000;

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error('Too many redirects'));

    const lib = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; crypto-dashboard/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    };

    const req = lib.get(url, options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('RSS fetch timeout'));
    });
  });
}

function parseRssTitles(xml) {
  const titles = [];
  // Match <title> inside <item> blocks — skip the channel-level title
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/;

  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null && titles.length < MAX_HEADLINES) {
    const titleMatch = titleRegex.exec(itemMatch[1]);
    if (titleMatch) {
      let title = titleMatch[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') // strip CDATA
        .replace(/<[^>]+>/g, '')                        // strip HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      if (title) titles.push(title);
    }
  }

  return titles;
}

/**
 * Obtiene las últimas noticias sobre oro y macro desde Google News RSS.
 * @returns {Promise<string[]>} Array de titulares en inglés
 */
export async function getGoldHeadlines() {
  try {
    const xml = await fetchUrl(RSS_URL);
    const headlines = parseRssTitles(xml);
    console.log(`[NewsService] Fetched ${headlines.length} headlines`);
    return headlines;
  } catch (err) {
    console.warn('[NewsService] RSS fetch failed:', err.message);
    return [];
  }
}
