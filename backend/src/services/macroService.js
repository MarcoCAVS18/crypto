// Datos macroeconómicos vía Yahoo Finance (sin API key)
// DXY (US Dollar Index) y rendimiento del bono a 10 años de EE.UU.
// DXY inversamente correlacionado con el oro: DXY sube → oro baja

import https from 'https';

const YAHOO_TIMEOUT_MS = 10000;

function fetchYahooChart(ticker) {
  const encoded = encodeURIComponent(ticker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d&includePrePost=false`;

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: YAHOO_TIMEOUT_MS
  };

  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      // Follow single redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        https.get(res.headers.location, options, (res2) => {
          let data = '';
          res2.on('data', chunk => { data += chunk; });
          res2.on('end', () => parseYahooResponse(data, ticker, resolve, reject));
        }).on('error', reject);
        return;
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => parseYahooResponse(data, ticker, resolve, reject));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${ticker}`));
    });
  });
}

function parseYahooResponse(rawData, ticker, resolve, reject) {
  try {
    const json = JSON.parse(rawData);
    const result = json.chart?.result?.[0];
    if (!result) {
      return reject(new Error(`No data in Yahoo response for ${ticker}`));
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.price;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;

    if (price == null) return reject(new Error(`No price for ${ticker}`));

    const changePercent = prevClose && prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : 0;

    // For 10Y yield, Yahoo returns percent directly (e.g. 4.35 means 4.35%)
    resolve({
      value: Math.round(price * 1000) / 1000,
      changePercent: Math.round(changePercent * 1000) / 1000,
      prevClose: prevClose ?? null
    });
  } catch (err) {
    reject(new Error(`Parse error for ${ticker}: ${err.message}`));
  }
}

/**
 * Obtiene DXY y rendimiento del bono a 10 años de EE.UU.
 * @returns {{ dxy: {value, changePercent}|null, tenYearYield: {value, changePercent}|null }}
 */
export async function getMacroData() {
  const [dxyResult, yieldResult] = await Promise.allSettled([
    fetchYahooChart('DX-Y.NYB'),
    fetchYahooChart('^TNX')
  ]);

  if (dxyResult.status === 'rejected') {
    console.warn('[MacroService] DXY fetch failed:', dxyResult.reason?.message);
  }
  if (yieldResult.status === 'rejected') {
    console.warn('[MacroService] 10Y yield fetch failed:', yieldResult.reason?.message);
  }

  return {
    dxy: dxyResult.status === 'fulfilled' ? dxyResult.value : null,
    tenYearYield: yieldResult.status === 'fulfilled' ? yieldResult.value : null
  };
}
