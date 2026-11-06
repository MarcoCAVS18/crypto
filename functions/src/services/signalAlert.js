// Avisos (push) de la SEÑAL: salen de la misma decisión que muestra la app (services/signalService.js), no de la zona de precio.
//
// Antes el aviso miraba solo si el precio estaba en "zona de compra" y mandaba siempre el mismo texto ("Zona de compra ·
// Oportunidad de acumulación"): no coincidía con la app (que podía decir ESPERAR) y todos los avisos eran iguales.
//
// Reglas (máquina de estado por usuario y activo):
//   1. La señal tiene que sostenerse `CONFIRM_READINGS` lecturas horarias seguidas (2 ⇒ ~2 h) antes de avisar.
//   2. Se avisa UNA vez por racha (mientras siga igual no se repite) y solo para COMPRAR o VENDER; esperar nunca avisa.
//   3. Enfriamiento de `COOLDOWN_MS` (12 h) por usuario y activo, aunque la señal se apague y vuelva.
// La cadencia del motor (una compra por semana) ya hace que COMPRAR no sea permanente: el aviso llega cuando toca.

export const CONFIRM_READINGS = 2;
export const COOLDOWN_MS = 12 * 3600 * 1000;
export const ALERT_ACTIONS = ['BUY', 'SELL'];

/**
 * @param {{action?:string, streak?:number, lastPushAt?:number}|null} prev
 * @param {'BUY'|'SELL'|'WAIT'|string} action  señal actual
 * @param {number} now
 * @returns {{ state:{action:string, streak:number, lastPushAt:number|null, checkedAt:number}, push:boolean }}
 */
export function nextSignalState(prev, action, now = Date.now()) {
  const same = prev?.action === action;
  const streak = same ? (Number(prev.streak) || 1) + 1 : 1;
  const lastPushAt = Number(prev?.lastPushAt) || null;

  const confirmedNow = ALERT_ACTIONS.includes(action) && streak === CONFIRM_READINGS;
  const cooledDown = lastPushAt === null || now - lastPushAt >= COOLDOWN_MS;
  const push = confirmedNow && cooledDown;

  return { push, state: { action, streak, lastPushAt: push ? now : lastPushAt, checkedAt: now } };
}

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const px = (n) => `$${n >= 1000 ? Math.round(n).toLocaleString('en-US') : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const firstSentence = (t, max = 120) => {
  const s = String(t ?? '').split(/\s[·—]\s|\.\s/)[0].trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/**
 * Texto del aviso, armado con la decisión (monto, tramos, motivo): dos avisos distintos dicen cosas distintas.
 * @returns {{ title:string, body:string, tag:string, data:object }|null} null si no hay nada útil que avisar
 */
export function buildNotification(decision, { symbol, price, cashUsd = 0 } = {}) {
  if (!decision || !ALERT_ACTIONS.includes(decision.action)) return null;
  const data = { kind: 'signal', symbol, action: decision.action, tag: `signal_${symbol}` };

  if (decision.action === 'BUY') {
    const ops = (decision.operations ?? []).filter(o => o?.type === 'BUY' && Number.isFinite(o.usdAmount) && o.usdAmount > 0);
    if (!ops.length) return null;                                     // sin montos no hay aviso accionable
    const total = ops.reduce((a, o) => a + o.usdAmount, 0);
    const c = decision.cadence;
    const dropPct = c?.reason === 'dip' && c.lastBuyPrice > 0 && price > 0 ? Math.round((1 - price / c.lastBuyPrice) * 1000) / 10 : null;
    const title = c?.reason === 'dip' ? `${symbol}: bajó${dropPct ? ` ${dropPct} %` : ''} — conviene adelantar la compra`
      : c?.reason === 'due' ? `${symbol}: toca la compra de la semana`
      : `${symbol}: toca comprar`;
    const share = cashUsd > 0 ? ` (${Math.round((total / cashUsd) * 100)} % de tus ${usd(cashUsd)})` : '';
    const tramos = ops.map((o, i) => `${usd(o.usdAmount)} ${i === 0 ? 'ahora a' : 'a'} ${px(o.price)}`).join(' · ');
    // Si la IA ajustó la compra (tamaño o tramos), el motivo del aviso es el suyo: es lo que muestra la pantalla
    const why = firstSentence(decision.ai?.used && decision.ai.followedRule === false && decision.ai.reasoning ? decision.ai.reasoning : decision.reason);
    return { title, body: `Usá ${usd(total)}${share} en ${ops.length} ${ops.length === 1 ? 'tramo' : 'tramos'}: ${tramos}.${why ? `\n${why}` : ''}`, tag: data.tag, data };
  }

  // SELL
  const pct = decision.operations?.find(o => o?.type === 'SELL')?.percentage;
  const why = firstSentence(decision.reason);
  return {
    title: `${symbol}: señal de venta parcial`,
    body: `${pct ? `Vender ${pct} % de la posición` : 'Recorte parcial'} cerca de ${px(price)}.${why ? `\n${why}` : ''}`,
    tag: data.tag, data
  };
}
