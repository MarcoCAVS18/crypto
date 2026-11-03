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
