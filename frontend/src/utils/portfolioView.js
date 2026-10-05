// Presentación del portfolio (pura, con tests): totales, posiciones, serie de evolución y actividad. No decide nada.

/** ¿El precio está a más de 5× (arriba o abajo) del precio actual? Un BTC "comprado" a $4,500 con el BTC a $86,000 casi seguro es un error de carga. */
export function priceFarOff(price, market, ratio = 5) {
  const p = Number(price), m = Number(market);
  if (!(p > 0) || !(m > 0)) return false;
  return p < m / ratio || p > m * ratio;
}

/** Ids de las operaciones con precio sospechoso respecto del precio actual de su activo. */
export function suspiciousOps(operations = [], prices = {}) {
  return new Set(operations.filter(o => priceFarOff(o.price, prices[o.symbol])).map(o => o.id));
}

/** Totales y posiciones a precio de mercado. `summary` viene de computePortfolioSummary. Sin precio, la posición no se valúa. */
export function portfolioTotals(summary = [], prices = {}) {
  const positions = summary.filter(s => s.units > 1e-9).map(s => {
    const price = prices[s.symbol];
    const value = Number.isFinite(price) ? s.units * price : null;
    const invested = s.costBasis ?? s.netInvested ?? 0;
    const pnl = value != null ? value - invested : null;
    return { symbol: s.symbol, units: s.units, price: price ?? null, value, invested, avg: s.avgBuyPrice || null,
      pnl, pnlPct: pnl != null && invested > 0 ? (pnl / invested) * 100 : null, operations: s.operations,
      suspect: priceFarOff(s.avgBuyPrice, price) };
  });
  const valued = positions.filter(p => p.value != null);
  const value = valued.reduce((a, p) => a + p.value, 0);
  const invested = valued.reduce((a, p) => a + p.invested, 0);
  const pnl = valued.length ? value - invested : null;
  positions.forEach(p => { p.share = p.value != null && value > 0 ? (p.value / value) * 100 : null; });
  positions.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const realized = summary.reduce((a, s) => a + (s.realizedPnl || 0), 0);
  return { positions, value: valued.length ? value : null, invested: valued.length ? invested : null, pnl,
    pnlPct: pnl != null && invested > 0 ? (pnl / invested) * 100 : null, realized, unpriced: positions.length - valued.length };
}

/** Operaciones por día para el DotGrid: { 'YYYY-MM-DD': { buy, sell } } */
export function activityCells(operations = []) {
  const cells = {};
  for (const op of operations) {
    const d = String(op.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    cells[d] ??= { buy: 0, sell: 0 };
    if (op.type === 'BUY') cells[d].buy += 1; else if (op.type === 'SELL') cells[d].sell += 1;
  }
  return cells;
}

/** Serie de evolución: costo base acumulado por operación + punto final "hoy" con el valor de mercado. */
export function evolutionSeries(operations = [], prices = {}, today = new Date().toISOString().slice(0, 10)) {
  const sorted = [...operations].sort((a, b) => new Date(a.date) - new Date(b.date));
  const state = {};
  const points = [];
  for (const op of sorted) {
    const s = (state[op.symbol] ??= { units: 0, cost: 0 });
    const units = parseFloat(op.units) || 0, amount = parseFloat(op.amount_usd) || 0;
    if (op.type === 'BUY') { s.units += units; s.cost += amount; }
    else { const f = s.units > 0 ? Math.min(1, units / s.units) : 0; s.cost = Math.max(0, s.cost * (1 - f)); s.units = Math.max(0, s.units - units); }
    points.push({ date: op.date, invested: Math.round(Object.values(state).reduce((a, v) => a + v.cost, 0)), op: { type: op.type, symbol: op.symbol, amount } });
  }
  if (!points.length) return [];
  let value = 0, priced = false;
  for (const [sym, s] of Object.entries(state)) if (s.units > 0 && Number.isFinite(prices[sym])) { value += s.units * prices[sym]; priced = true; }
  points.push({ date: today, invested: points.at(-1).invested, value: priced ? Math.round(value) : null, today: true });
  return points;
}

/** $1,234 · $1.2k · $1.50M — para ejes y totales compactos */
export function fmtCompact(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(1)}k`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
}

/** Resultado de una señal pasada contra el precio actual (positivo = la señal tenía razón). null para WAIT o sin precios. */
export function signalOutcome(action, signalPrice, currentPrice) {
  if (!signalPrice || !currentPrice || action === 'WAIT') return null;
  const pct = ((currentPrice - signalPrice) / signalPrice) * 100;
  if (action === 'BUY') return { pct, good: pct > 0 };
  if (action === 'SELL') return { pct: -pct, good: pct < 0 };
  return null;
}
