// Series de tiempo "point-in-time": cada observación solo es visible a partir de su FECHA DE
// PUBLICACIÓN (fecha del dato + rezago), nunca antes. Es lo que evita la fuga de información del
// futuro (look-ahead bias), el error clásico que hace que un backtest se vea brillante y en vivo falle.
//
// Convención: la decisión del día t se toma al CIERRE de t y puede usar todo lo publicado hasta t
// inclusive. Un dato con fecha d y rezago L (días) es visible desde el día d+L.

const DAY_MS = 86400000;

/** Rezagos de publicación en días de calendario (conservadores). */
export const AVAILABILITY_LAG_DAYS = {
  gold: 0,          // cierre diario de GC=F: conocido al cierre de ese día
  silver: 0,
  realYield10: 1,   // FRED: el dato del día d aparece el día hábil siguiente
  yield10: 1,
  yield2: 1,
  breakeven10: 1,
  vix: 1,
  gvz: 1,
  dollarBroad: 7,   // DTWEXBGS se publica semanalmente (lunes, con datos hasta el viernes anterior)
  cot: 4            // CFTC: dato al martes, se publica el viernes (+3); +1 de margen → visible desde el lunes
};

export const toMs = (dateStr) => Date.parse(`${dateStr}T00:00:00Z`);
export const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Suma días a una fecha 'YYYY-MM-DD'. */
export const addDays = (dateStr, n) => toDate(toMs(dateStr) + n * DAY_MS);

/**
 * Índice de la última observación visible el día `dateStr`, es decir con `date + lagDays <= dateStr`,
 * o -1 si todavía no hay ninguna. `series` debe estar ordenada por `date` ascendente.
 */
export function lastVisibleIndex(series, dateStr, lagDays = 0) {
  const cutoff = toMs(dateStr) - lagDays * DAY_MS;         // visible si toMs(obs.date) <= cutoff
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (toMs(series[mid].date) <= cutoff) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Últimas `n` observaciones visibles el día `dateStr` (orden cronológico). */
export function visibleWindow(series, dateStr, lagDays, n) {
  const i = lastVisibleIndex(series, dateStr, lagDays);
  if (i < 0) return [];
  return series.slice(Math.max(0, i - n + 1), i + 1);
}

/**
 * Normaliza y ordena una serie [{date, value}] descartando duplicados de fecha (gana el último) y
 * valores no finitos.
 */
export function cleanSeries(obs) {
  const byDate = new Map();
  for (const o of obs) if (o && typeof o.date === 'string' && Number.isFinite(o.value)) byDate.set(o.date, o);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
