// Costos de operar (comisión + spread). El efecto medido del tilt de DCA (~0.3 %) es MENOR que una comisión,
// así que las órdenes chicas o de más se comen la ventaja: se estiman costos y se descartan tramos ínfimos.
//
// Valores por defecto para BINANCE spot (el exchange del usuario): comisión 0.10 % por orden, tanto maker como taker
// (0.075 % pagando con BNB) y un spread supuesto de 0.05 % para PAXG/USDT (par menos líquido que BTC). El mínimo de
// $10 cubre el notional mínimo de Binance ($5–10 según el par). Se pueden fijar por perfil (`userState.costs`).
// Con 0.1 % por orden el costo de un DCA es MENOR que la ventaja medida del tilt (~0.3 %), no al revés.

export const DEFAULT_COSTS = Object.freeze({ feeBps: 10, spreadBps: 5, minOrderUsd: 10 });

const num = (x, lo, hi, def) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Math.min(hi, Math.max(lo, Number(x))) : def);

export function normalizeCosts(input) {
  const c = input && typeof input === 'object' ? input : {};
  return {
    feeBps: num(c.feeBps, 0, 500, DEFAULT_COSTS.feeBps),
    spreadBps: num(c.spreadBps, 0, 500, DEFAULT_COSTS.spreadBps),
    minOrderUsd: num(c.minOrderUsd, 0, 10000, DEFAULT_COSTS.minOrderUsd)
  };
}

/** Costo estimado de una orden de `usd` (comisión + medio spread). */
export function orderCostUsd(usd, costs = DEFAULT_COSTS) {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const { feeBps, spreadBps } = normalizeCosts(costs);
  return usd * (feeBps + spreadBps / 2) / 10000;
}

/**
 * Anota cada operación con su costo estimado y descarta las que no llegan al monto mínimo.
 * Operaciones sin monto (usdAmount null: no hay capital cargado) se conservan tal cual.
 * @returns {{ operations:Array, dropped:number, totalCostUsd:number }}
 */
export function applyCosts(operations = [], costsInput) {
  const costs = normalizeCosts(costsInput);
  let dropped = 0, total = 0;
  const kept = [];
  for (const op of operations) {
    if (op.usdAmount == null) { kept.push(op); continue; }
    if (op.usdAmount < costs.minOrderUsd) { dropped++; continue; }
    const cost = Math.round(orderCostUsd(op.usdAmount, costs) * 100) / 100;
    total += cost;
    kept.push({ ...op, estCostUsd: cost });
  }
  return { operations: kept, dropped, totalCostUsd: Math.round(total * 100) / 100 };
}

export function costNote({ totalCostUsd, dropped }, costsInput) {
  const c = normalizeCosts(costsInput);
  const parts = [];
  if (totalCostUsd > 0) parts.push(` Costo estimado ≈ $${totalCostUsd.toFixed(2)} (supuesto: ${(c.feeBps / 100).toFixed(2)} % de comisión + ${(c.spreadBps / 100).toFixed(2)} % de spread; ajustable en el perfil).`);
  if (dropped > 0) parts.push(` Se omitieron ${dropped} tramo(s) menores a $${c.minOrderUsd} para que el costo no se coma el beneficio.`);
  return parts.join('');
}
