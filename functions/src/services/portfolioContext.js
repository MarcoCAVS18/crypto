// Contexto de portfolio para el motor de decisión, armado EN EL SERVIDOR con las operaciones del usuario.
// Es el mismo que arma el cliente (frontend/src/store/appStore.js → getDecision): sirve para que los avisos (que corren con la
// app cerrada) calculen exactamente la señal que la app muestra.

import { computePortfolioSummary } from './portfolioMath.js';

const DAY_MS = 86400000;
/** Ventana del "ciclo activo": las compras de los últimos 4 días bloquean repetir los mismos tramos. */
export const EXECUTED_WINDOW_MS = 4 * DAY_MS;

/**
 * @param {Array} operations  operaciones del usuario (todas, de todos los activos)
 * @param {string} symbol
 * @param {Record<string, number>} prices  precio actual por símbolo (valúa TODAS las posiciones para medir pesos)
 * @param {number} now
 * @returns {object|null} null si el usuario nunca operó ese activo
 */
export function buildPortfolioContext(operations = [], symbol, prices = {}, now = Date.now()) {
  const all = computePortfolioSummary(operations);
  const mine = all.find(s => s.symbol === symbol);
  if (!mine) return null;

  const portfolioValueUsd = all.reduce((sum, s) => {
    const px = prices[s.symbol] ?? s.avgBuyPrice;
    return sum + (s.units > 0 && px > 0 ? s.units * px : 0);
  }, 0);

  const buys = operations
    .filter(op => op.symbol === symbol && op.type === 'BUY')
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(op => ({ price: op.price, amount_usd: op.amount_usd, date: op.date }));

  return {
    ...mine,
    portfolioValueUsd,
    hasPosition: mine.units > 0 && mine.avgBuyPrice > 0,
    currentPrice: prices[symbol] ?? null,
    allBuys: buys,
    executedBuys: buys.filter(b => new Date(b.date).getTime() >= now - EXECUTED_WINDOW_MS)
  };
}
