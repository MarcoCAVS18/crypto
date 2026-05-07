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

/**
 * Obtiene el reporte COT (Commitment of Traders) para el oro desde CFTC SOCRATA.
 * Sin API key. Devuelve posición neta especulativa y cambio semanal.
 * @returns {{ netSpec, weekChange, sentiment, longs, shorts, reportDate }}
 */
export async function getCOTData() {
  const url =
    'https://publicreporting.cftc.gov/resource/6dca-aqww.json' +
    '?market_and_exchange_names=GOLD%20-%20COMMODITY%20EXCHANGE%20INC.' +
    '&$limit=4&$order=as_of_date_in_form_yymmdd%20DESC';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`COT API HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) throw new Error('COT data insuficiente');

    const latest = data[0];
    const prev   = data[1];

    const longs  = parseInt(latest.noncomm_positions_long_all  || 0, 10);
    const shorts = parseInt(latest.noncomm_positions_short_all || 0, 10);
    const netSpec = longs - shorts;

    const prevNet = parseInt(prev.noncomm_positions_long_all  || 0, 10)
                  - parseInt(prev.noncomm_positions_short_all || 0, 10);
    const weekChange = netSpec - prevNet;

    let sentiment;
    if (netSpec > 200000)      sentiment = 'crowded_long';    // contrarian bajista
    else if (netSpec > 80000)  sentiment = 'bullish';
    else if (netSpec > 0)      sentiment = 'neutral';
    else                       sentiment = 'contrarian_bull'; // extremo short → contrarian alcista

    return { netSpec, weekChange, sentiment, longs, shorts, reportDate: latest.as_of_date_in_form_yymmdd };
  } catch (err) {
    clearTimeout(timer);
    console.warn('[MacroService] COT fetch failed:', err.message);
    throw err;
  }
}

/**
 * Obtiene GVZ (índice de volatilidad del oro) y precio de la plata.
 * GVZ alto (>20) = entorno volátil para el oro; bajo (<15) = tendencia estable.
 * El ratio Oro/Plata se calcula después en goldMarketMode usando el precio de PAXG.
 * @returns {{ gvz: {value, changePercent}|null, silver: {value, changePercent}|null }}
 */
export async function getGoldVolatilityData() {
  const [gvzResult, silverResult] = await Promise.allSettled([
    fetchYahooChart('^GVZ'),
    fetchYahooChart('SI=F')   // plata futuros (USD/oz troy)
  ]);

  if (gvzResult.status === 'rejected') {
    console.warn('[MacroService] GVZ fetch failed:', gvzResult.reason?.message);
  }
  if (silverResult.status === 'rejected') {
    console.warn('[MacroService] Silver fetch failed:', silverResult.reason?.message);
  }

  return {
    gvz:    gvzResult.status    === 'fulfilled' ? gvzResult.value    : null,
    silver: silverResult.status === 'fulfilled' ? silverResult.value : null
  };
}
 * Sin API key. Interpreta: <0% muy alcista para oro, >2% bajista.
 * @returns {{ value, date, sentiment }}
 */
export async function getRealYield() {
  const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/csv' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`FRED API HTTP ${res.status}`);

    const text = await res.text();
    const lines = text.trim().split('\n').slice(1); // omitir encabezado
    // '.' significa dato ausente; filtrar y quedarse con los válidos
    const valid = lines.filter(l => !l.split(',')[1]?.trim().includes('.'));
    if (valid.length === 0) throw new Error('Sin datos válidos de DFII10');

    const [date, valueStr] = valid[valid.length - 1].split(',');
    const value = parseFloat(valueStr);
    if (isNaN(value)) throw new Error('Valor DFII10 inválido');

    let sentiment;
    if (value < 0)      sentiment = 'very_bullish'; // tasa real negativa → muy bueno para el oro
    else if (value < 1) sentiment = 'bullish';
    else if (value < 2) sentiment = 'neutral';
    else                sentiment = 'bearish';       // tasa real alta → presión sobre el oro

    return { value, date: date.trim(), sentiment };
  } catch (err) {
    clearTimeout(timer);
    console.warn('[MacroService] Real yield fetch failed:', err.message);
    throw err;
  }
}
