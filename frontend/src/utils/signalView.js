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
    if (c.reason === 'zone') return { tone: 'accent', text: 'En zona de compra: se suma aunque ya compraste' };
    return null;
  }
  if (decision.action === 'WAIT' && c.due === false) {
    const day = fmtDay(c.nextAt);
    const dip = Number.isFinite(c.dipPrice) ? ` o si baja a ${fmtPrice(c.dipPrice)}` : '';
    return { tone: 'warn', text: `Próxima compra ${day ? `desde el ${day}` : 'en unos días'}${dip}` };
  }
  return null;
}

/**
 * Participación de la IA en la decisión (`decision.ai` del servidor) lista para mostrar. null si no hay nada que aclarar
 * (compra que la regla no propuso, o decisión pausada después por el calendario).
 * La IA solo afina el momento y el tamaño de una compra que la regla ya permite: acá se cuenta qué hizo y qué cambió.
 * @returns {{ kind:'wait'|'buy'|'adjusted'|'unavailable', tone:'accent'|'warn'|'muted', chip:string, title:string, text:string,
 *             factors:string[], detail:string|null, notes:string[], confidence:number|null }|null}
 */
export function aiView(decision) {
  const ai = decision?.ai;
  if (!ai) return null;
  if (!ai.used) {
    return { kind: 'unavailable', tone: 'muted', chip: 'IA sin respuesta: decide la regla', title: 'La IA no pudo evaluar esta compra', text: ai.message ?? 'Decide la regla.', factors: [], detail: null, notes: [], confidence: null };
  }
  const confidence = Number.isFinite(ai.confidence) ? Math.round(ai.confidence * 100) : null;
  const base = { text: ai.reasoning ?? '', factors: ai.keyFactors ?? [], notes: ai.notes ?? [], confidence };

  if (decision.action === 'WAIT' && ai.action === 'WAIT') {
    const day = fmtDay(ai.waitUntil);
    return { ...base, kind: 'wait', tone: 'warn', chip: `IA: esperar${day ? ` hasta el ${day}` : ''}`, title: 'La IA recomienda esperar', detail: day ? `La compra queda pendiente: se vuelve a evaluar desde el ${day} o antes si cambia el contexto.` : null };
  }
  if (decision.action !== 'BUY') return null;                       // p. ej. el calendario pausó una compra que la IA aprobaba: ya lo explica la recomendación

  const a = ai.applied;
  if (a && !ai.followedRule && Number.isFinite(a.totalUsd)) {
    const fmt = (n) => fmtPrice(n, { decimals: 0 });
    const t = (n) => `${n} ${n === 1 ? 'tramo' : 'tramos'}`;
    return { ...base, kind: 'adjusted', tone: 'accent', chip: `IA: ajustó a ${fmt(a.totalUsd)} en ${t(a.tranches)}`, title: 'La IA ajustó la compra', detail: `La regla proponía ${fmt(a.ruleTotalUsd)} en ${t(a.ruleTranches)}; la IA lo dejó en ${fmt(a.totalUsd)} en ${t(a.tranches)}.` };
  }
  return { ...base, kind: 'buy', tone: 'accent', chip: ai.capped ? 'IA: se compra (tope de espera)' : 'IA: confirma la compra', title: ai.capped ? 'Se compra igual: tope de espera' : 'La IA confirma la compra', detail: null };
}

/** Primera orden de compra de la señal (la de "ahora"), o null. */
export const firstBuyOp = (decision) => (decision?.action === 'BUY' ? (decision.operations ?? []).find(o => o?.type === 'BUY' && o.price > 0) ?? null : null);

/**
 * Orden propuesta → datos para precargar el formulario de operación ("Ya compré" / "Registrar"). El usuario puede corregir todo antes de guardar.
 * El precio va redondeado como se muestra en pantalla y las unidades salen de monto ÷ precio (así los tres campos cuadran).
 */
export function draftFromOp(op, symbol, today = new Date().toISOString().slice(0, 10)) {
  if (!op || op.type !== 'BUY' || !(op.price > 0)) return null;
  const price = op.price >= 1000 ? Math.round(op.price) : Math.round(op.price * 100) / 100;
  const amount = Number.isFinite(op.usdAmount) && op.usdAmount > 0 ? Math.round(op.usdAmount * 100) / 100 : null;
  return { symbol, type: 'BUY', date: today, price, ...(amount ? { amount_usd: amount, units: Number((amount / price).toFixed(8)) } : {}) };
}

/** USDT que quedan después de una compra (nunca negativo). */
export const cashAfter = (cash, usdSpent) => Math.max(0, Math.round(((Number(cash) || 0) - (Number(usdSpent) || 0)) * 100) / 100);

/** El calendario macro no cubre los próximos días: "sin eventos" no es un dato. null si está cubierto o no hay dato. */
export function calendarGapView(decision) {
  const c = decision?.calendarCoverage;
  if (!c || c.covered !== false) return null;
  const day = c.lastEventDate ? fmtDay(`${c.lastEventDate}T12:00:00Z`) : null;
  return {
    title: 'Calendario macro sin cubrir',
    text: `${day ? `El calendario cargado termina el ${day}` : 'El calendario cargado se agotó'}: la señal no puede avisarte de eventos como el FOMC o el CPI (la IA lo sabe y no asume que no los hay). Hay que cargar las fechas nuevas.`
  };
}
