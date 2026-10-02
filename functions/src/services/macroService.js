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

/**
 * Convierte la respuesta de Yahoo `chart` en { value, changePercent, prevClose }.
 *
 * changePercent es el cambio contra el cierre de la sesión ANTERIOR. Con `range=5d`,
 * `meta.chartPreviousClose` suele ser el cierre previo a toda la ventana (cambio de
 * ~5 días, no de "hoy"), por eso se calcula con los dos últimos cierres diarios y
 * se usa el meta solo como último recurso.
 *
 * @param {object} json - respuesta completa de Yahoo (`{ chart: { result: [...] } }`)
 * @param {string} ticker
 */
export function parseYahooChart(json, ticker = '') {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data in Yahoo response for ${ticker}`);

  const meta  = result.meta ?? {};
  const closesRaw = result.indicators?.quote?.[0]?.close ?? [];
  const stamps    = result.timestamp ?? [];

  // Pares (timestamp, cierre) válidos, en orden cronológico
  const bars = [];
  for (let i = 0; i < closesRaw.length; i++) {
    const c = closesRaw[i];
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) bars.push({ ts: stamps[i], close: c });
  }

  const lastBar = bars[bars.length - 1];
  const price   = meta.regularMarketPrice ?? meta.price ?? lastBar?.close;
  if (price == null) throw new Error(`No price for ${ticker}`);

  let prevClose = null;
  if (bars.length >= 2 && meta.regularMarketTime != null && lastBar.ts != null) {
    const off    = meta.gmtoffset ?? 0;
    const dayKey = t => Math.floor((t + off) / 86400);
    // Si la última barra es la sesión de hoy, el previo es la anterior; si todavía no
    // hay barra de hoy, la última barra ya es el cierre previo.
    prevClose = dayKey(meta.regularMarketTime) === dayKey(lastBar.ts)
      ? bars[bars.length - 2].close
      : lastBar.close;
  } else if (bars.length === 1) {
    prevClose = null;
  }
  if (prevClose == null) prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;

  const changePercent = prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

  // Para el bono 10Y Yahoo devuelve porcentaje directo (4.35 = 4.35 %)
  return {
    value: Math.round(price * 1000) / 1000,
    changePercent: Math.round(changePercent * 1000) / 1000,
    prevClose: prevClose ?? null
  };
}

function parseYahooResponse(rawData, ticker, resolve, reject) {
  try {
    resolve(parseYahooChart(JSON.parse(rawData), ticker));
  } catch (err) {
    reject(err.message?.startsWith('No ') ? err : new Error(`Parse error for ${ticker}: ${err.message}`));
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
const COT_BASE = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';
// Solo las columnas necesarias. OJO: el dataset 6dca-aqww (CFTC, Legacy Futures Only) YA NO tiene la columna
// `as_of_date_in_form_yymmdd`: pedirla (en $select o $order) devuelve HTTP 400 "no-such-column" y era la causa real de
// "Datos degradados: faltan COT". La fecha del reporte está en `report_date_as_yyyy_mm_dd`.
const COT_SELECT = 'report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all';

export function cotUrl(limit) {
  return `${COT_BASE}?market_and_exchange_names=${encodeURIComponent('GOLD - COMMODITY EXCHANGE INC.')}` +
    `&$select=${COT_SELECT}&$limit=${limit}&$order=report_date_as_yyyy_mm_dd%20DESC`;
}

export async function fetchCotRows(limit, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(cotUrl(limit), { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`COT API HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Historia de ~3 años para el percentil; si falla (timeout, HTTP), reintenta con solo las últimas 4 semanas para no
 * perder la posición actual (sin percentil). Solo lanza si ambos fallan.
 */
export async function getCOTData(opts = {}) {
  try {
    return parseCotHistory(await fetchCotRows(160, opts));
  } catch (err) {
    console.warn('[MacroService] COT (160 semanas) falló:', err.message, '— reintento con 4 semanas');
    try {
      return parseCotHistory(await fetchCotRows(4, opts));
    } catch (err2) {
      console.warn('[MacroService] COT fetch failed:', err2.message);
      throw err2;
    }
  }
}

/** Prueba el pedido a la CFTC tal como lo hace la función (4 semanas): sirve para ver POR QUÉ falla desde Cloud Functions. */
export async function diagnoseCot({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const started = Date.now();
  try {
    const rows = await fetchCotRows(4, { fetchImpl, timeoutMs });
    const parsed = parseCotHistory(rows);
    return { ok: true, ms: Date.now() - started, rows: rows.length, reportDate: parsed.reportDate, netSpec: parsed.netSpec };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e.message ?? e), name: e.name ?? null, cause: e.cause?.code ?? e.cause?.message ?? null };
  }
}

/** 'YYMMDD' (formato que espera dataHealth.parseYymmdd) a partir de la fecha del reporte; tolera el nombre de columna anterior. */
export function cotReportDate(row) {
  if (row?.as_of_date_in_form_yymmdd) return String(row.as_of_date_in_form_yymmdd);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(row?.report_date_as_yyyy_mm_dd ?? ''));
  return m ? `${m[1].slice(2)}${m[2]}${m[3]}` : null;
}

const cotNet = (r) => parseInt(r.noncomm_positions_long_all || 0, 10) - parseInt(r.noncomm_positions_short_all || 0, 10);

/**
 * Filas de Socrata (más nueva primero) → posición actual + percentil histórico.
 * El percentil (0–100) dice qué tan extremo es el posicionamiento neto frente a los últimos ~3 años;
 * los umbrales absolutos de `sentiment` (80k / 200k) no se adaptan al tamaño del mercado. Es informativo:
 * el score sigue usando `sentiment` hasta que el backtest respalde otra regla.
 */
export function parseCotHistory(data) {
  if (!Array.isArray(data) || data.length < 2) throw new Error('COT data insuficiente');

  const latest = data[0];
  const netSpec = cotNet(latest);
  const weekChange = netSpec - cotNet(data[1]);
  const longs  = parseInt(latest.noncomm_positions_long_all  || 0, 10);
  const shorts = parseInt(latest.noncomm_positions_short_all || 0, 10);

  let sentiment;
  if (netSpec > 200000)      sentiment = 'crowded_long';    // contrarian bajista
  else if (netSpec > 80000)  sentiment = 'bullish';
  else if (netSpec > 0)      sentiment = 'neutral';
  else                       sentiment = 'contrarian_bull'; // extremo short → contrarian alcista

  const nets = data.map(cotNet).filter(Number.isFinite);
  const netSpecPercentile = nets.length >= 52
    ? Math.round((nets.filter(v => v <= netSpec).length / nets.length) * 1000) / 10
    : null;

  return { netSpec, weekChange, sentiment, longs, shorts, reportDate: cotReportDate(latest), netSpecPercentile, historyWeeks: nets.length };
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

/**
 * Último valor válido de un CSV de FRED (`fredgraph.csv`).
 * Los faltantes vienen como "." (formato viejo) o vacíos (formato nuevo); los valores
 * válidos SON decimales (p. ej. "1.85"), así que no se puede filtrar por "." en el valor.
 * @returns {{ date: string, value: number }}
 */
export function parseFredCsv(text) {
  const lines = String(text).trim().split(/\r?\n/).slice(1); // omitir encabezado
  for (let i = lines.length - 1; i >= 0; i--) {
    const [date, raw] = lines[i].split(',').map(x => x?.trim());
    if (!raw || raw === '.') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && Math.abs(value) < 20) return { date, value };
  }
  throw new Error('Sin datos válidos de DFII10');
}

/** Clasificación del rendimiento real 10Y para el oro. */
export function classifyRealYield(value) {
  if (value < 0)      return 'very_bullish'; // tasa real negativa → muy bueno para el oro
  if (value < 1)      return 'bullish';
  if (value < 2)      return 'neutral';
  return 'bearish';                          // tasa real alta → presión sobre el oro
}

/**
 * Rendimiento real 10Y (TIPS, FRED DFII10). Sin API key.
 * Interpreta: <0% muy alcista para oro, >2% bajista.
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

    const { date, value } = parseFredCsv(await res.text());
    return { value, date, sentiment: classifyRealYield(value) };
  } catch (err) {
    clearTimeout(timer);
    console.warn('[MacroService] Real yield fetch failed:', err.message);
    throw err;
  }
}
