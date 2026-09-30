// Ajustes opcionales del perfil que viajan al motor de decisión (el servidor los vuelve a sanear).
export function buildSettings(userState) {
  const settings = {};
  if (Number.isFinite(userState?.targetPercent) && userState.targetPercent > 0 && userState.targetPercent < 100) {
    settings.target = { targetPercent: userState.targetPercent };
  }
  if (Number.isFinite(userState?.feePercent) && userState.feePercent >= 0) {
    settings.costs = { feeBps: Math.round(userState.feePercent * 100) };
  }
  return settings;
}
