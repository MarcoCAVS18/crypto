// Peso objetivo del oro en el portafolio, con bandas. Principio 6 de la auditoría: decidir según el estado del
// portafolio objetivo, no según el precio de entrada.
//
// El peso se mide como costo de la posición / capital total (mismo criterio que el motor). Sin `targetPercent`
// (no configurado) no hay regla: nada cambia.

export const DEFAULT_BAND_PCT = 5;      // ± puntos porcentuales alrededor del objetivo
export const MAX_REBALANCE_TRIM_PCT = 30; // nunca recortar más del 30 % de la posición de una vez

export function normalizeTarget(input) {
  const t = Number(input?.targetPercent ?? input);
  if (!Number.isFinite(t) || t <= 0 || t >= 100) return null;
  const band = Number.isFinite(Number(input?.bandPct)) ? Math.min(20, Math.max(1, Number(input.bandPct))) : DEFAULT_BAND_PCT;
  return { targetPercent: t, bandPct: band, lower: Math.max(0, t - band), upper: Math.min(100, t + band) };
}

/** @returns {{ state:'below'|'inside'|'above', target:object, allocationPercent:number }|null} */
export function weightState(allocationPercent, targetInput) {
  const target = normalizeTarget(targetInput);
  if (!target || !Number.isFinite(allocationPercent)) return null;
  const state = allocationPercent < target.lower ? 'below' : allocationPercent > target.upper ? 'above' : 'inside';
  return { state, target, allocationPercent };
}

/** Porcentaje de la posición a recortar para volver al borde superior de la banda (acotado). */
export function trimPctToBand(allocationPercent, target) {
  if (!target || allocationPercent <= target.upper || allocationPercent <= 0) return 0;
  const excess = (allocationPercent - target.targetPercent) / allocationPercent * 100;   // hasta el objetivo, no solo la banda
  return Math.min(MAX_REBALANCE_TRIM_PCT, Math.max(0, Math.round(excess)));
}
