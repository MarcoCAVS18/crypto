// Riesgo de calendario macro, DETERMINÍSTICO (antes lo decidía un LLM y cambiaba entre llamadas).
//
// Solo actúa en una ventana corta alrededor de la publicación, cuando los spreads y la volatilidad se
// disparan; fuera de ella no toca la decisión. Motivo de la acotación: el backtest de la fase 2/3 mostró que
// reducir compras de forma amplia suele encarecer el costo promedio; acá se pausa/reduce unas pocas horas y
// la compra se hace después del dato (el diferimiento cuesta poco).
//
// NO está respaldado por backtest (no hay historia de calendario con horas): es higiene de riesgo declarada.
//
//   crítico (FOMC, CPI, NFP…): ≤ 3 h antes → pausa · publicado hace ≤ 1 h → pausa · 3–24 h antes → 75 %
//   alto:                      ≤ 2 h antes → 50 %  · publicado hace ≤ 1 h → 50 %  · 2–24 h antes → 90 %
//
// Solo modula COMPRAS (una venta o un WAIT no se tocan).

export const EVENT_RULES = Object.freeze({
  critical: { blackoutBeforeH: 3, blackoutAfterH: 1, nearFraction: 0.75, farWithinH: 24 },
  high:     { reduceBeforeH: 2,   reduceAfterH: 1, reduceFraction: 0.5, nearFraction: 0.9, farWithinH: 24 }
});

/** @returns {{ capitalFraction:number, event:object|null, kind:'blackout'|'reduce'|'watch'|null }} el evento más restrictivo */
export function eventCapitalFraction(events = []) {
  let best = { capitalFraction: 1, event: null, kind: null };
  for (const e of events) {
    const h = e.hoursUntil;
    if (!Number.isFinite(h)) continue;
    let f = 1, kind = null;

    if (e.impact === 'critical') {
      const r = EVENT_RULES.critical;
      if (e.phase === 'released' ? -h <= r.blackoutAfterH : (h >= 0 && h <= r.blackoutBeforeH)) { f = 0; kind = 'blackout'; }
      else if (e.phase === 'upcoming' && h <= r.farWithinH) { f = r.nearFraction; kind = 'watch'; }
    } else if (e.impact === 'high') {
      const r = EVENT_RULES.high;
      if (e.phase === 'released' ? -h <= r.reduceAfterH : (h >= 0 && h <= r.reduceBeforeH)) { f = r.reduceFraction; kind = 'reduce'; }
      else if (e.phase === 'upcoming' && h <= r.farWithinH) { f = r.nearFraction; kind = 'watch'; }
    }
    if (f < best.capitalFraction) best = { capitalFraction: f, event: e, kind };
  }
  return best;
}

const fmtH = (h) => (h >= 1 ? `${Math.round(h)} h` : `${Math.max(1, Math.round(h * 60))} min`);

/**
 * Aplica el riesgo de calendario a una decisión. Devuelve la MISMA decisión si no corresponde.
 * @param {object} decision - { action, strength, operations, recommendation, ... }
 * @param {Array}  events   - getUpcomingEvents(...)
 */
export function applyEventRisk(decision, events) {
  if (decision?.action !== 'BUY') return decision;
  const { capitalFraction, event, kind } = eventCapitalFraction(events);
  if (!event || capitalFraction >= 1) return decision;

  const when = event.phase === 'released' ? `publicado hace ${fmtH(-event.hoursUntil)}` : `en ${fmtH(event.hoursUntil)}`;
  const label = event.fullName ?? event.name;
  const calendarNote = kind === 'blackout'
    ? `${label} ${when}: los spreads y la volatilidad se disparan. Esperá el dato y comprá después.`
    : `${label} ${when}: conviene entrar con menos tamaño y completar después.`;

  const calendarRisk = { capitalFraction, reasoning: calendarNote, calendarNote, originalAction: decision.action, event: event.name, deterministic: true };

  if (capitalFraction === 0) {
    return {
      ...decision,
      action: 'WAIT',
      operations: [],
      recommendation: `⚠️ Entrada pausada por evento macro: ${calendarNote} · ${decision.recommendation}`,
      calendarRisk
    };
  }
  const operations = (decision.operations ?? []).map(op => ({
    ...op,
    usdAmount: op.usdAmount != null ? Math.round(op.usdAmount * capitalFraction * 100) / 100 : null,
    units: op.units != null ? op.units * capitalFraction : null,
    calendarReduced: true
  }));
  return {
    ...decision,
    operations,
    recommendation: `⚠️ Entrada al ${Math.round(capitalFraction * 100)}% por evento macro: ${calendarNote} · ${decision.recommendation}`,
    calendarRisk
  };
}
