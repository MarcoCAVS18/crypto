// Ajustes de "Tu posición" que el servidor guarda en el perfil (USDT disponibles, modo, compras, comisión, peso objetivo).
//
// Viven en el navegador, pero los avisos (push) se calculan en el servidor con la app cerrada: para que digan LO MISMO que la app
// necesitan los mismos datos. La app los sincroniza cada vez que se guardan (PUT /api/auth/settings).

import { normalizeInstallments } from './dcaPolicy.js';

const MODES = ['inversion', 'observacion', 'trading'];
const present = (x) => x !== null && x !== undefined && x !== '';

/**
 * Valida y normaliza lo que manda el cliente.
 * @returns {{ settings: object }|{ error: string }}
 */
export function parseSettings(input) {
  const b = input && typeof input === 'object' ? input : {};
  const out = { cashUsd: null, mode: 'inversion', installments: null, targetPercent: null, feePercent: null };

  if (present(b.cashUsd)) {
    const n = Number(b.cashUsd);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: 'Los USDT disponibles tienen que ser un número entre 0 y 1.000 millones.' };
    out.cashUsd = Math.round(n * 100) / 100;
  }
  if (present(b.mode)) {
    if (!MODES.includes(b.mode)) return { error: 'Modo no válido.' };
    out.mode = b.mode;
  }
  if (present(b.installments)) {
    const n = Number(b.installments);
    if (!Number.isFinite(n)) return { error: 'La cantidad de compras no es válida.' };
    out.installments = normalizeInstallments(n);
  }
  if (present(b.targetPercent)) {
    const n = Number(b.targetPercent);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) return { error: 'El peso objetivo tiene que estar entre 0 y 100.' };
    out.targetPercent = n;
  }
  if (present(b.feePercent)) {
    const n = Number(b.feePercent);
    if (!Number.isFinite(n) || n < 0 || n > 5) return { error: 'La comisión tiene que estar entre 0 y 5 %.' };
    out.feePercent = n;
  }
  return { settings: out };
}

/**
 * Estado de usuario para el motor (`makeDecision`), igual al que arma la ruta /decision con lo que manda el cliente:
 * modo "solo USDT" (cashPercent 100, totalCapital = USDT).
 */
export function engineUserState(settings = {}) {
  const fee = settings.feePercent;
  const target = settings.targetPercent;
  return {
    cashPercent: 100,
    mode: settings.mode ?? 'inversion',
    totalCapital: Number(settings.cashUsd) || 0,
    installments: normalizeInstallments(settings.installments),
    costs: Number.isFinite(fee) && fee >= 0 ? { feeBps: Math.round(fee * 100) } : undefined,
    target: Number.isFinite(target) && target > 0 && target < 100 ? { targetPercent: target } : null
  };
}
