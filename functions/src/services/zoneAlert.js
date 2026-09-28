// Máquina de estado (pura) del aviso "entró en zona de compra".
//
// Las zonas cambian seguido (en simulación ~23 % de las horas), así que avisar en cada
// transición generaría spam. Reglas:
//   1. La zona tiene que confirmarse en `CONFIRM_READINGS` lecturas consecutivas (2 → ~2 h).
//   2. Se avisa UNA vez por racha: no se repite mientras siga en compra.
//   3. Enfriamiento: no más de un aviso cada `COOLDOWN_MS` (12 h) por símbolo, aunque la
//      zona salga y vuelva a entrar.

export const CONFIRM_READINGS = 2;
export const COOLDOWN_MS = 12 * 3600 * 1000;

/**
 * @param {{zone?:string, streak?:number, lastPushAt?:number}|null} prev - estado guardado (puede ser del formato viejo)
 * @param {'buy'|'neutral'|'sell'} zone   - zona actual
 * @param {number} price
 * @param {number} now                    - ms
 * @returns {{ state: {zone,price,streak,lastPushAt,checkedAt}, push: boolean }}
 */
export function nextZoneState(prev, zone, price, now = Date.now()) {
  const sameZone = prev?.zone === zone;
  const streak   = sameZone ? (Number(prev.streak) || 1) + 1 : 1;
  const lastPushAt = Number(prev?.lastPushAt) || null;   // null = nunca avisó

  const confirmedNow = zone === 'buy' && streak === CONFIRM_READINGS;
  const cooledDown   = lastPushAt === null || now - lastPushAt >= COOLDOWN_MS;
  const push = confirmedNow && cooledDown;

  return {
    push,
    state: {
      zone,
      price,
      streak,
      lastPushAt: push ? now : lastPushAt,
      checkedAt: now
    }
  };
}
