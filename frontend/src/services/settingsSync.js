// Sincroniza "Tu posición" (USDT, modo, compras, comisión, peso objetivo) con el perfil del servidor.
// Los avisos (push) se calculan en el servidor con la app cerrada: necesitan tus mismos datos para decir lo que dice la pantalla.
// Se agrupa en una sola llamada (debounce) y no se repite si nada cambió; si falla, se reintenta con el próximo cambio.
import api from './api';
import { getToken } from './session';
import { syncPayload } from '../utils/settings';

const DEBOUNCE_MS = 1500;
let timer = null;
let lastSent = '';

async function send(payload) {
  const key = JSON.stringify(payload);
  if (key === lastSent || !getToken()) return;
  try {
    await api.put('/auth/settings', payload, { timeout: 15000 });
    lastSent = key;
  } catch (err) {
    console.warn('[Settings] no se pudieron sincronizar:', err.message);
  }
}

/** Programa la sincronización de los ajustes actuales (se llama cada vez que cambian y al abrir la app). */
export function syncSettings(userState) {
  clearTimeout(timer);
  const payload = syncPayload(userState);
  timer = setTimeout(() => send(payload), DEBOUNCE_MS);
}

/** Al cerrar sesión: cancela lo pendiente y olvida lo último enviado (el próximo usuario sincroniza lo suyo). */
export function resetSettingsSync() {
  clearTimeout(timer);
  timer = null;
  lastSent = '';
}
