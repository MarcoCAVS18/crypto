// Lógica de PRESENTACIÓN de la señal y del mercado (pura, con tests). No decide nada: solo da formato a lo que devuelve la API.

export const ASSET_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', PAXG: 'Oro · PAXG', XAUUSDT: 'Oro · Futuros' };
export const assetName = (s) => ASSET_NAMES[s] ?? s;
export const assetTab = (s) => (s === 'XAUUSDT' ? 'XAUT' : s);

/** Acción → texto grande, tono (clases de color) y frase corta. */
export const ACTION_VIEW = {
  BUY:  { word: 'Comprar', tone: 'accent', text: 'text-accent', bg: 'bg-accent', dot: 'Señal de compra' },
  WAIT: { word: 'Esperar', tone: 'warn',   text: 'text-warn',   bg: 'bg-warn',   dot: 'Sin señal clara' },
  SELL: { word: 'Vender',  tone: 'pink',   text: 'text-pink',   bg: 'bg-pink',   dot: 'Señal de venta' }
};
export const actionView = (a) => ACTION_VIEW[a] ?? ACTION_VIEW.WAIT;

export const MODE_VIEW = {
  risk_on:  { label: 'Risk ON',  tone: 'accent' },
  neutral:  { label: 'Neutral',  tone: 'warn' },
  risk_off: { label: 'Risk OFF', tone: 'pink' }
};
export const modeView = (m) => MODE_VIEW[typeof m === 'object' ? m?.mode : m] ?? MODE_VIEW.neutral;

/** Fuerza de la señal → 1..3 puntos. */
export const strengthDots = (s) => ({ fuerte: 3, moderado: 2, 'débil': 1 }[s] ?? 1);

export function fmtPrice(p, { decimals = null } = {}) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  const d = decimals ?? (p >= 1000 ? 0 : 2);
  return `$${p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

export function fmtUnits(u) {
  if (!Number.isFinite(u)) return '—';
  if (u >= 1) return u.toFixed(4);
  if (u >= 0.001) return u.toFixed(6);
  return u.toFixed(8);
}

/** Resumen de las órdenes de una señal: cuántos tramos y cuánto suman. */
export function summarizeOps(operations = []) {
  const ops = operations.filter(o => o && (o.type === 'BUY' || o.type === 'SELL'));
  const withAmount = ops.filter(o => Number.isFinite(o.usdAmount));
  return {
    type: ops[0]?.type ?? null, count: ops.length,
    totalUsd: withAmount.length ? withAmount.reduce((a, o) => a + o.usdAmount, 0) : null
  };
}

/**
 * Cuánto de tus USDT usa la compra y cuánto queda de reserva. null si no hay compra con monto o no hay efectivo cargado.
 * @returns {{ usd:number, cash:number, pct:number, reserve:number }|null}
 */
export function usageOf(operations = [], cashUsd = 0) {
  const s = summarizeOps(operations);
  if (s.type !== 'BUY' || s.totalUsd == null || !(cashUsd > 0)) return null;
  return { usd: s.totalUsd, cash: cashUsd, pct: Math.round((s.totalUsd / cashUsd) * 100), reserve: Math.max(0, cashUsd - s.totalUsd) };
}

/** Efecto de una compra en el costo promedio de la posición (null si no hay posición o faltan datos). */
export function calcDcaEffect(op, summary) {
  if (!summary?.hasPosition || !summary.avgBuyPrice || !summary.units || !op?.usdAmount || !op?.price) return null;
  const newUnits = summary.units + op.usdAmount / op.price;
  const newInvested = (summary.costBasis ?? summary.netInvested ?? 0) + op.usdAmount;
  const newAvg = newInvested / newUnits;
  const delta = newAvg - summary.avgBuyPrice;
  return { newAvg, avgDelta: delta, avgDeltaPct: (delta / summary.avgBuyPrice) * 100, improves: delta < 0 };
}

/** Efecto de TODAS las compras de la señal juntas sobre el promedio (para mostrarlo una vez, no por tramo). */
export function totalDcaEffect(operations = [], summary) {
  const buys = operations.filter(o => o?.type === 'BUY' && o.usdAmount && o.price);
  if (!buys.length || !summary?.hasPosition || !summary.avgBuyPrice || !summary.units) return null;
  const usd = buys.reduce((a, o) => a + o.usdAmount, 0);
  const units = buys.reduce((a, o) => a + o.usdAmount / o.price, 0);
  const newAvg = ((summary.costBasis ?? summary.netInvested ?? 0) + usd) / (summary.units + units);
  const delta = newAvg - summary.avgBuyPrice;
  return { from: summary.avgBuyPrice, to: newAvg, deltaPct: (delta / summary.avgBuyPrice) * 100, improves: delta < 0 };
}

export const rsiTag = (rsi) => (rsi == null ? '' : rsi > 70 ? 'Sobrecompra' : rsi < 30 ? 'Sobreventa' : 'Neutral');
export const rsiTone = (rsi) => (rsi == null ? 'muted' : rsi > 70 ? 'pink' : rsi < 30 ? 'accent' : 'ink');
export const trendText = (t) => (t === 'alcista' ? 'Alcista' : t === 'bajista' ? 'Bajista' : '—');
export const trendTone = (t) => (t === 'alcista' ? 'accent' : t === 'bajista' ? 'pink' : 'muted');

const ZONE_VIEW = { buy: { label: 'Zona de compra', tone: 'accent' }, sell: { label: 'Zona de venta', tone: 'pink' }, neutral: { label: 'Zona neutral', tone: 'ink' } };
export const zoneView = (z) => ZONE_VIEW[z] ?? ZONE_VIEW.neutral;

/** ¿Cuántos insumos tienen problema? (faltan o están viejos) → para el aviso "Datos" del resumen. */
export function dataStatus(marketMode) {
  const h = marketMode?.goldContext?.dataHealth;
  if (!h) return { known: false, problems: 0, text: null };
  const problems = (h.missing?.length ?? 0) + (h.stale?.length ?? 0);
  return { known: true, problems, text: problems ? `${problems} con problema` : 'Al día' };
}

const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
};

/**
 * Línea del ritmo de compra (una por semana, o antes si el precio cae) a partir de `decision.cadence` del servidor.
 * COMPRAR: por qué toca ahora. ESPERAR por ritmo: cuándo toca la próxima. null si no hay nada que aclarar.
 * @returns {{ tone:'accent'|'warn', text:string }|null}
 */
export function cadenceView(decision) {
  const c = decision?.cadence;
  if (!c) return null;
  if (decision.action === 'BUY') {
    if (c.reason === 'dip') {
      return { tone: 'accent', text: `Bajó ${Number.isFinite(c.dipPct) ? `${c.dipPct} % o más ` : ''}desde tu última compra: se adelanta` };
    }
    if (c.reason === 'due') return { tone: 'accent', text: 'Toca la compra de la semana' };
    if (c.reason === 'first') return { tone: 'accent', text: 'Primera compra de este activo' };
    return null;
  }
  if (decision.action === 'WAIT' && c.due === false) {
    const day = fmtDay(c.nextAt);
    const dip = Number.isFinite(c.dipPrice) ? ` o si baja a ${fmtPrice(c.dipPrice)}` : '';
    return { tone: 'warn', text: `Próxima compra ${day ? `desde el ${day}` : 'en unos días'}${dip}` };
  }
  return null;
}
