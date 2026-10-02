// Chequeos de coherencia de una operación del portfolio. Una operación con monto, unidades y precio que no cuadran
// (p. ej. unidades de un BTC entero con el monto de $300) deforma el costo promedio y el P&L de todo el activo.
// El servidor aplica la misma regla al guardar (functions/src/routes/portfolio.js).

export const AMOUNT_TOLERANCE = 0.05;   // 5 % (cubre redondeos y comisiones incluidas en el monto)

/** Diferencia relativa entre el monto cargado y unidades × precio; null si no se puede calcular. */
export function amountMismatch(op) {
  const amount = Number(op?.amount_usd), units = Number(op?.units), price = Number(op?.price);
  if (![amount, units, price].every(Number.isFinite) || units <= 0 || price <= 0) return null;
  const expected = units * price;
  return { expected, amount, relative: Math.abs(amount - expected) / expected };
}

/** Lista de problemas legibles (vacía si la operación es coherente). */
export function operationIssues(op) {
  const issues = [];
  const m = amountMismatch(op);
  if (m && m.relative > AMOUNT_TOLERANCE && Math.abs(m.amount - m.expected) > 1) {
    const fmt = (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    issues.push(`El monto (${fmt(m.amount)}) no coincide con unidades × precio (${fmt(m.expected)}).`);
  }
  return issues;
}

/** ¿El precio de la operación está muy lejos del precio actual? (para avisar al cargarla, no para rechazarla) */
export function priceFarFromMarket(price, marketPrice, maxRatio = 0.35) {
  const p = Number(price), mkt = Number(marketPrice);
  if (!(p > 0) || !(mkt > 0)) return false;
  return Math.abs(p - mkt) / mkt > maxRatio;
}
