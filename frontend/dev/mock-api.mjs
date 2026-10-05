// API SIMULADA para desarrollar y revisar la UI sin red ni Firestore. NO es mercado real: velas sintéticas deterministas.
// Usa los módulos reales del servidor (indicadores, zonas, modo de mercado, motor de decisión) para que las formas de los
// datos sean las verdaderas. Uso:  node dev/mock-api.mjs  (puerto 3001)  y  VITE_API_URL=http://127.0.0.1:3001/api npm run dev
import http from 'node:http';
import { calculateAllIndicators, analyzeVolume } from '../../functions/src/services/technicalAnalysis.js';
import { calculateZones } from '../../functions/src/services/zoneCalculator.js';
import { determineMarketMode } from '../../functions/src/services/marketMode.js';
import { determineGoldMarketMode } from '../../functions/src/services/goldMarketMode.js';
import { makeDecision } from '../../functions/src/services/decisionEngine.js';
import { buildGoldSources } from '../../functions/src/services/dataHealth.js';
import { getUpcomingEvents } from '../../functions/src/data/macroCalendar.js';
import { mulberry32, gaussian } from '../../functions/src/backtest/stats.js';

const PORT = Number(process.env.PORT || 3001);
const BASE = { BTC: 84000, ETH: 3100, PAXG: 4150 };
const VOL  = { BTC: 0.006, ETH: 0.008, PAXG: 0.0016 };
const HOUR = 3600e3, DAY = 24 * HOUR;

function candles(symbol, count, stepMs, endTs = Date.now()) {
  const rng = mulberry32(symbol.length * 7919 + stepMs / 1000);
  const out = []; let p = BASE[symbol] * 0.93;
  const vol = VOL[symbol] * Math.sqrt(stepMs / HOUR);
  const end = Math.floor(endTs / stepMs) * stepMs;
  for (let i = count - 1; i >= 0; i--) {
    const drift = (BASE[symbol] - p) * 0.01;
    const o = p, c = o * (1 + drift / BASE[symbol] * 8 + vol * gaussian(rng));
    const h = Math.max(o, c) * (1 + Math.abs(vol * gaussian(rng)) * 0.5), l = Math.min(o, c) * (1 - Math.abs(vol * gaussian(rng)) * 0.5);
    out.push({ timestamp: end - i * stepMs, open: o, high: h, low: l, close: c, volume: 800 + 400 * rng() });
    p = c;
  }
  const k = BASE[symbol] / out[out.length - 1].close;               // termina cerca del precio de referencia
  return out.map(c => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }));
}

const goldContext = () => {
  const macro = {
    dxy: { value: 99.2, changePercent: -0.18, source: 'yahoo' }, tenYearYield: { value: 4.12, source: 'yahoo' },
    cot: { netSpec: 226000, weekChange: -4000, sentiment: 'crowded_long', reportDate: '260929', netSpecPercentile: 91 },
    realYield: { value: 1.74, sentiment: 'neutral', date: '2026-10-01', source: 'fred-csv' },
    gvz: { value: 19.4 }, silver: { value: 52.1 }, spot: { ticker: 'GC=F', price: 4162, time: Date.now() - 20 * 60e3 },
    dailyBias: { alignment: 'bear', rsi: 41, source: 'gc-futures', longAlignment: 'mixed' }
  };
  const headlines = [
    { title: 'Gold slips as Treasury yields firm ahead of Fed commentary', source: 'Reuters', pubDate: new Date(Date.now() - 2 * HOUR).toUTCString(), url: '#' },
    { title: 'Dollar steadies; traders weigh rate-cut odds after jobs data', source: 'Bloomberg', pubDate: new Date(Date.now() - 5 * HOUR).toUTCString(), url: '#' },
    { title: 'Central banks keep buying gold, WGC says', source: 'WGC', pubDate: new Date(Date.now() - 9 * HOUR).toUTCString(), url: '#' }
  ];
  const analysis = { sentiment: 'neutral', score: -0.1, labels: { monetary: -1, geopolitics: 0, inflation: 0, goldDemand: 1 }, reasoning: 'Rendimientos firmes presionan al oro, pero la demanda de bancos centrales lo sostiene.', keyFactors: ['Tasas reales', 'Compras de bancos centrales'] };
  const sources = buildGoldSources({ macro, results: {}, dailyBias: macro.dailyBias, headlines, analysisError: null, fred: { available: true, series: { a: { status: 'ok' } } } });
  return { macro, headlines, headlinesSource: 'live', analysis, sources, fetchedAt: new Date().toISOString(), fromCache: false, analysisError: null };
};

function market(symbol, tf = '4h') {
  const step = tf === '1h' ? HOUR : 4 * HOUR;
  const cs = candles(symbol, 250, step);
  const price = cs[cs.length - 1].close;
  const indicators = calculateAllIndicators(cs), vol = analyzeVolume(cs);
  const zones = calculateZones(price, cs, indicators);
  const marketMode = symbol === 'PAXG' ? determineGoldMarketMode(price, indicators, vol, goldContext()) : determineMarketMode(price, indicators, vol);
  const day = candles(symbol, 24, HOUR);
  return { cs, price, indicators, vol, zones, marketMode, body: {
    symbol, timestamp: Date.now(), price, change24h: ((price / day[0].close) - 1) * 100,
    high24h: Math.max(...day.map(c => c.high)), low24h: Math.min(...day.map(c => c.low)),
    marketMode, zones, newsContext: symbol === 'PAXG' ? null : { symbol, sentiment: 'bullish', score: 0.25, reasoning: 'Flujos a ETFs positivos y menor presión regulatoria.', keyFactors: ['ETF', 'Regulación'], headlines: goldContext().headlines.map(h => ({ ...h, title: h.title.replace(/Gold|gold/g, symbol) })), headlinesSource: 'live', fetchedAt: new Date().toISOString() },
    candlesSource: 'real',
    technicalAnalysis: { trendShort: indicators.trendShort, trendLong: indicators.trendLong, volumeStatus: vol.status, volumeRatio: Math.round(vol.ratio * 100) / 100, rsi: Math.round(indicators.rsi * 10) / 10, atr: Math.round(indicators.atr * 100) / 100, atrPercent: Math.round(indicators.atr / price * 10000) / 100, ema20: indicators.ema.ema20, ema50: indicators.ema.ema50, ema200: indicators.ema.ema200, vwap: indicators.vwap, candlesCount: cs.length }
  } };
}

const OPS = (() => {
  const out = []; const d = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  const add = (symbol, n, price, usd, type = 'BUY') => out.push({ id: `${symbol}${n}${type}`, date: d(n), symbol, type, amount_usd: usd, price, units: usd / price, fee: +(usd * 0.001).toFixed(2), exchange: 'Binance', notes: '', userId: 'marco' });
  [[200, 4780, 600], [170, 4820, 500], [150, 4760, 700], [120, 4790, 400], [100, 4700, 800], [80, 4690, 500], [60, 4650, 600], [45, 4600, 500], [30, 4420, 700], [21, 4380, 500], [14, 4290, 600], [9, 4210, 400], [4, 4150, 300]].forEach(([n, p, u]) => add('PAXG', n, p, u));
  [[190, 61000, 90], [140, 66000, 80], [90, 71000, 60], [50, 78000, 60], [20, 83000, 44]].forEach(([n, p, u]) => add('BTC', n, p, u));
  if (process.env.PHANTOM) add('BTC', 3, 4486, 284);   // simula un BTC cargado con precio de oro (para probar el aviso)
  return out;
})();

const decisionFor = (symbol, body) => {
  const m = market(symbol);
  const ops = OPS.filter(o => o.symbol === symbol);
  const units = ops.reduce((a, o) => a + o.units, 0), cost = ops.reduce((a, o) => a + o.amount_usd, 0);
  const ctx = body.portfolioContext ?? { hasPosition: units > 0, units, avgBuyPrice: cost / units, costBasis: cost, netInvested: cost, currentPrice: m.price, allBuys: [], executedBuys: [] };
  const d = makeDecision(m.marketMode, m.zones, m.price, { cashPercent: Number(body.cashPercent) || 100, mode: body.mode || 'inversion', totalCapital: Number(body.totalCapital) || 0, costs: body.settings?.costs, target: body.settings?.target ?? null }, m.indicators, symbol, ctx, { candlesSource: 'real' });
  return { symbol, price: m.price, marketMode: m.marketMode, zones: m.zones, decision: d };
};

const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); res.end(JSON.stringify(data)); };
const readBody = (req) => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/^\/api/, ''); let m;
  try {
    if (p === '/health') return send(res, 200, { status: 'ok', warnings: [] });
    if ((m = /^\/crypto\/([A-Za-z]+)\/candles$/.exec(p))) {
      const g = u.searchParams.get('granularity') || '1d', n = Number(u.searchParams.get('count')) || 120;
      const step = { '15m': 15 * 60e3, '1h': HOUR, '4h': 4 * HOUR, '1d': DAY }[g] ?? DAY;
      return send(res, 200, { candles: candles(m[1].toUpperCase(), n, step).map(c => ({ time: c.timestamp / 1000, ...c })) });
    }
    if ((m = /^\/crypto\/([A-Za-z]+)\/decisions$/.exec(p))) {
      const sym = m[1].toUpperCase();
      return send(res, 200, { symbol: sym, count: 6, decisions: ['BUY', 'WAIT', 'WAIT', 'BUY', 'WAIT', 'SELL'].map((a, i) => ({ id: `d${i}`, timestamp: new Date(Date.now() - i * 7 * HOUR).toISOString(), symbol: sym, decision: a, reason: 'Acumulación en tramos', marketMode: 'neutral', price: BASE[sym] * (1 - i * 0.004) })) });
    }
    if (p === '/crypto/decision' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, decisionFor(String(b.symbol).toUpperCase(), b)); }
    if ((m = /^\/crypto\/([A-Za-z]+)\/news\/refresh$/.exec(p))) return send(res, 200, market(m[1].toUpperCase()).body.newsContext ?? {});
    if ((m = /^\/crypto\/([A-Za-z]+)$/.exec(p))) return send(res, 200, market(m[1].toUpperCase(), u.searchParams.get('timeframe') || '4h').body);
    if (p.startsWith('/gold-context')) return send(res, 200, goldContext());
    if (p === '/calendar') return send(res, 200, { events: getUpcomingEvents(Number(u.searchParams.get('days')) || 21, u.searchParams.get('symbol')), coverage: { upcomingCount: 8 } });
    if (p === '/portfolio/operations' && req.method === 'POST') { const b = await readBody(req); const id = `new${OPS.length + 1}`; OPS.unshift({ id, ...b, userId: 'marco' }); return send(res, 201, { id }); }
    if ((m = /^\/portfolio\/operations\/([\w-]+)$/.exec(p))) {
      const i = OPS.findIndex(o => o.id === m[1]);
      if (i < 0) return send(res, 404, { error: 'Operación no encontrada.' });
      if (req.method === 'PUT' && process.env.PUT_MODE === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><html><body>app</body></html>'); }
      if (req.method === 'PUT' && process.env.PUT_MODE === 'fail') return send(res, 500, { error: 'No se pudo guardar el cambio.' });
      if (req.method === 'PUT' && process.env.PUT_MODE === 'slow') await new Promise(r => setTimeout(r, 4000));
      if (req.method === 'PUT') { const b = await readBody(req); OPS[i] = { ...OPS[i], ...b, id: m[1] }; return send(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { OPS.splice(i, 1); return send(res, 200, { ok: true }); }
    }
    if (p === '/portfolio/operations') return send(res, 200, { operations: OPS, count: OPS.length });
    if ((m = /^\/metrics\/([A-Za-z]+)$/.exec(p))) return send(res, 200, { symbol: m[1], records: 14, complete: 6, baselines: {}, summary: { BUY: { 5: { n: 8, hitRate: 0.62, baseUpRate: 0.55, meanRet: 0.012, edgeVsBase: 0.007 }, 20: { n: 6, hitRate: 0.67, baseUpRate: 0.58, meanRet: 0.021, edgeVsBase: 0.04 } }, SELL: { 20: { n: 3, hitRate: 0.33, baseUpRate: 0.58, meanRet: 0.004, edgeVsBase: -0.01 } } }, byStrength: {}, follow: { signals: 9, followed: 6, followRate: 0.6667, operations: 13, operationsWithoutSignal: 3, meanRetFollowed: 0.02, meanRetNotFollowed: 0.01 }, shadow: { n: 6, champion: { buys: 4, meanRet: 0.02 }, shadow: { buys: 6, meanRet: 0.015 } } });
    if (p === '/history') return send(res, 200, { decisions: [] });
    if (p.startsWith('/futures')) return send(res, 200, { signal: { direction: 'NEUTRAL', reasoning: 'Sin ventaja clara', leverage: 1, positionUsd: 0 }, price: 4162 });
    if (p === '/chat') return send(res, 200, { reply: 'Esta es una respuesta de ejemplo.' });
    return send(res, 404, { error: `mock: no existe ${req.method} ${p}` });
  } catch (e) { console.error(e); send(res, 500, { error: String(e.message) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`mock-api en http://127.0.0.1:${PORT}/api`));
