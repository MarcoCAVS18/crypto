// Descarga y parseo de historia para el backtester. Corre en el CLI / GitHub Actions, no en producción.
//
// Fuentes (todas sin costo):
//   - Oro (GC=F), plata (SI=F) y DXY (DX-Y.NYB): Yahoo Finance chart API (historia máxima, 1d).
//     Respaldo para el oro: Stooq CSV. GC=F es futuro continuo: es una PROXY del oro spot; PAXG existe
//     desde 2019 y su historia es demasiado corta para calibrar nada.
//   - FRED: CSV público (fredgraph.csv, sin clave) — las mismas series que usa producción.
//   - COT: CFTC Socrata (mismo dataset que producción, historia completa).
// Los parsers son funciones puras (testeadas); los fetchers añaden red + caché en disco.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (compatible; crypto-context-backtest/1.0)';

export const FRED_IDS = {
  realYield10: 'DFII10', yield10: 'DGS10', yield2: 'DGS2', breakeven10: 'T10YIE',
  dollarBroad: 'DTWEXBGS', vix: 'VIXCLS', gvz: 'GVZCLS'
};

const iso = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

// ── parsers puros ───────────────────────────────────────────────────────────

/** fredgraph.csv → [{date, value}] ascendente; "." y vacíos se descartan (Number('') daría 0). */
export function parseFredCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, raw] = lines[i].split(',');
    const v = (raw ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || v === '' || v === '.') continue;
    const value = Number(v);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Respuesta de Yahoo chart → [{date, open, high, low, close, volume}] sin filas incompletas ni fechas repetidas. */
export function parseYahooChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp || !r?.indicators?.quote?.[0]) throw new Error('Respuesta de Yahoo sin datos');
  const q = r.indicators.quote[0];
  const seen = new Set(), out = [];
  r.timestamp.forEach((t, i) => {
    const close = q.close?.[i];
    if (!Number.isFinite(close) || close <= 0) return;
    const date = iso(t);
    if (seen.has(date)) return;
    seen.add(date);
    out.push({ date, open: q.open?.[i] ?? close, high: q.high?.[i] ?? close, low: q.low?.[i] ?? close, close, volume: q.volume?.[i] ?? 0 });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Stooq CSV (Date,Open,High,Low,Close[,Volume]). */
export function parseStooqCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (!/^date/i.test(lines[0] ?? '')) throw new Error('Stooq: formato inesperado (¿requiere apikey?)');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, o, h, l, c, v] = lines[i].split(',');
    const close = Number(c);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(close) && close > 0)
      out.push({ date, open: Number(o) || close, high: Number(h) || close, low: Number(l) || close, close, volume: Number(v) || 0 });
  }
  return out;
}

/** Filas Socrata (dataset 6dca-aqww) → [{date (martes del dato), netSpec, openInterest}] ascendente. */
export function parseCotRows(rows) {
  if (!Array.isArray(rows)) throw new Error('COT: respuesta inesperada');
  const out = [];
  for (const r of rows) {
    const d = String(r.report_date_as_yyyy_mm_dd ?? '').slice(0, 10);
    const long = parseInt(r.noncomm_positions_long_all, 10), short = parseInt(r.noncomm_positions_short_all, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(long) || !Number.isFinite(short)) continue;
    out.push({ date: d, netSpec: long - short, openInterest: parseInt(r.open_interest_all, 10) || null });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Filas Socrata del COT DESAGREGADO (dataset 72hh-3qpy) → [{date, mmNet, openInterest}] ascendente. mmNet = managed money largos − cortos. */
export function parseCotMmRows(rows) {
  if (!Array.isArray(rows)) throw new Error('COT managed money: respuesta inesperada');
  const out = [];
  for (const r of rows) {
    const d = String(r.report_date_as_yyyy_mm_dd ?? '').slice(0, 10);
    const long = parseInt(r.m_money_positions_long_all, 10), short = parseInt(r.m_money_positions_short_all, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(long) || !Number.isFinite(short)) continue;
    out.push({ date: d, mmNet: long - short, openInterest: parseInt(r.open_interest_all, 10) || null });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ── red + caché ─────────────────────────────────────────────────────────────

async function httpGet(url, { json = false, retries = 3 } = {}) {
  let last;
  for (let a = 0; a < retries; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/csv,*/*' }, signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return json ? res.json() : res.text();
    } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * (a + 1))); }
  }
  throw last;
}

async function cached(cacheDir, name, loader) {
  const file = cacheDir ? path.join(cacheDir, `${name}.json`) : null;
  if (file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* sin caché */ } }
  const data = await loader();
  if (file) { await fs.mkdir(cacheDir, { recursive: true }); await fs.writeFile(file, JSON.stringify(data)); }
  return data;
}

// Con `range=max` Yahoo degrada la granularidad (devolvió ~270 filas para GC=F): se piden fechas explícitas.
// Se prueban dos hosts y se queda la serie más larga; el mínimo de filas evita aceptar una serie degradada.
const YAHOO_START = 946684800;   // 2000-01-01
export async function yahoo(symbol, { minRows = 1000, fetcher = httpGet } = {}) {
  const period2 = Math.floor(Date.now() / 1000);
  let best = [], lastErr = null;
  for (const host of ['query1', 'query2']) {
    try {
      const rows = parseYahooChart(await fetcher(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${YAHOO_START}&period2=${period2}&interval=1d&events=history`, { json: true }));
      if (rows.length > best.length) best = rows;
      if (best.length >= minRows) break;
    } catch (e) { lastErr = e; }
  }
  if (best.length < minRows) throw new Error(`Yahoo ${symbol}: solo ${best.length} filas${lastErr ? ` (${lastErr.message})` : ''}`);
  return best;
}

/** Descarga todo lo que necesita `buildDataset`. Devuelve también `sources` para el reporte. */
export async function loadHistory({ cacheDir = null, log = () => {} } = {}) {
  const sources = {};
  const step = async (key, name, fn) => {
    try { const d = await cached(cacheDir, name, fn); sources[key] = { ok: true, n: d.length, from: d[0]?.date, to: d[d.length - 1]?.date }; log(`${key}: ${d.length} filas`); return d; }
    catch (e) { sources[key] = { ok: false, error: String(e.message ?? e) }; log(`${key}: FALLÓ — ${e.message}`); return []; }
  };

  let gold = await step('gold', 'gold_gcf', () => yahoo('GC=F'));
  if (gold.length < 1000) {
    const alt = await step('gold(stooq)', 'gold_stooq', async () => parseStooqCsv(await httpGet('https://stooq.com/q/d/l/?s=xauusd&i=d')));
    if (alt.length > gold.length) gold = alt;          // nunca reemplazar por algo más corto
  }
  const silver = await step('silver', 'silver_sif', () => yahoo('SI=F', { minRows: 500 }));
  const dxy = await step('dxy', 'dxy', () => yahoo('DX-Y.NYB', { minRows: 500 }).then(rows => rows.map(r => ({ date: r.date, value: r.close }))));

  const fred = {};
  for (const [key, id] of Object.entries(FRED_IDS)) {
    fred[key] = await step(`fred.${key}`, `fred_${id}`, async () => parseFredCsv(await httpGet(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)));
  }

  const cot = await step('cot', 'cot_gold', async () => {
    const rows = await httpGet(
      'https://publicreporting.cftc.gov/resource/6dca-aqww.json' +
      '?market_and_exchange_names=GOLD%20-%20COMMODITY%20EXCHANGE%20INC.&$limit=5000&$order=report_date_as_yyyy_mm_dd%20ASC' +
      '&$select=report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all', { json: true });
    return parseCotRows(rows);
  });

  // P6: COT desagregado (managed money). Falla sin romper el resto: las variantes que lo usan quedan como "datos insuficientes".
  const cotMm = await step('cot_mm', 'cot_mm_gold', async () => {
    const rows = await httpGet(
      'https://publicreporting.cftc.gov/resource/72hh-3qpy.json' +
      '?market_and_exchange_names=GOLD%20-%20COMMODITY%20EXCHANGE%20INC.&$limit=5000&$order=report_date_as_yyyy_mm_dd%20ASC' +
      '&$select=report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all,open_interest_all', { json: true });
    return parseCotMmRows(rows);
  });

  return { raw: { gold, silver, dxy, fred, cot, cotMm }, sources };
}
