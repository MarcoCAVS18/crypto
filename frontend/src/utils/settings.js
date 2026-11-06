import { effectiveCashUsd } from './cash.js';

// Ajustes opcionales del perfil que viajan al motor de decisión (el servidor los vuelve a sanear).
export function buildSettings(userState) {
  const settings = {};
  if (Number.isFinite(userState?.targetPercent) && userState.targetPercent > 0 && userState.targetPercent < 100) {
    settings.target = { targetPercent: userState.targetPercent };
  }
  if (Number.isFinite(userState?.feePercent) && userState.feePercent >= 0) {
    settings.costs = { feeBps: Math.round(userState.feePercent * 100) };
  }
  // En cuántas compras se reparten los USDT (el servidor usa 4 si no viene y vuelve a acotarlo a 1–12)
  if (Number.isInteger(userState?.installments) && userState.installments >= 1 && userState.installments <= 12) {
    settings.installments = userState.installments;
  }
  return settings;
}

/**
 * Lo que se sincroniza con el servidor (PUT /auth/settings) para que los avisos se calculen con tus mismos datos con la app cerrada.
 * Siempre manda todos los campos: lo que no está cargado va como null (el servidor lo toma como "sin dato").
 */
export function syncPayload(userState) {
  const inst = userState?.installments;
  const num = (x) => (Number.isFinite(x) ? x : null);
  return {
    cashUsd: effectiveCashUsd(userState),
    mode: userState?.mode ?? 'inversion',
    installments: Number.isInteger(inst) && inst >= 1 && inst <= 12 ? inst : null,
    targetPercent: Number.isFinite(userState?.targetPercent) && userState.targetPercent > 0 && userState.targetPercent < 100 ? userState.targetPercent : null,
    feePercent: Number.isFinite(userState?.feePercent) && userState.feePercent >= 0 ? num(userState.feePercent) : null
  };
}
