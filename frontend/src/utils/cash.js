// USDT disponibles para invertir: UN solo dato, el que carga el usuario. El motor sigue recibiendo (cashPercent, totalCapital)
// y trabaja en "modo solo efectivo" (cashPercent = 100, totalCapital = USDT): el peso de cada posición se mide aparte contra el
// valor de todo el Portfolio (ver decisionEngine.js). Los datos guardados por la versión anterior (capital total × % de efectivo)
// se convierten solos.

/** USDT disponibles. `cashUsd` manda si está cargado (incluso 0); si no, se deriva del esquema anterior. */
export function effectiveCashUsd(userState) {
  const direct = userState?.cashUsd;
  if (direct !== null && direct !== undefined && Number.isFinite(Number(direct))) return Math.max(0, Number(direct));
  const total = Number(userState?.totalCapital), pct = Number(userState?.cashPercent);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(pct)) return Math.round(total * pct) / 100;
  return 0;
}

/** Argumentos para el motor de decisión a partir de los USDT disponibles. */
export const engineCash = (userState) => ({ cashPercent: 100, totalCapital: effectiveCashUsd(userState) });
