// Autenticación por PIN. Nombre histórico: YA NO usa Firestore desde el navegador. Todo pasa por la API (/api/auth/*):
// el servidor guarda y verifica el PIN (scrypt), limita los intentos y entrega un token de sesión. Así la app no depende
// de que el navegador pueda hablar con Firestore (redes/bloqueadores que lo impedían) y las reglas quedan cerradas.
import api from './api';
import { setToken, clearToken } from './session';

const TIMEOUT = 20000;
const errorCode = (err) => err?.response?.data?.code ?? null;

/** ¿El perfil ya tiene PIN? */
export async function hasProfile(userId) {
  const { data } = await api.get(`/auth/status/${encodeURIComponent(userId)}`, { timeout: TIMEOUT });
  return !!data.exists;
}

/** Crea el PIN y deja la sesión iniciada. */
export async function setupPin(userId, pin) {
  const { data } = await api.post('/auth/setup', { userId, pin }, { timeout: TIMEOUT });
  setToken(data.token);
  return data;
}

/**
 * Verifica el PIN. true = correcto (sesión iniciada); false = incorrecto (`err.attemptsLeft` no aplica: se devuelve false y
 * el mensaje del servidor queda en `lastVerifyMessage`). Lanza si está bloqueado o si el servidor no responde.
 */
export let lastVerifyMessage = '';
export async function verifyPin(userId, pin) {
  lastVerifyMessage = '';
  try {
    const { data } = await api.post('/auth/login', { userId, pin }, { timeout: TIMEOUT });
    setToken(data.token);
    return true;
  } catch (err) {
    if (errorCode(err) === 'BAD_PIN') { lastVerifyMessage = err.message; return false; }
    throw err;                      // BLOQUEADO (429), red caída, etc.: el mensaje ya viene en español del servidor
  }
}

export const isLockedError = (err) => errorCode(err) === 'LOCKED';

export async function logoutServer() {
  try { await api.post('/auth/logout', {}, { timeout: 8000 }); } catch { /* igual se borra el token local */ }
  clearToken();
}

/** Monedas guardadas del perfil (null si no hay). Requiere sesión. */
export async function getUserCryptos() {
  const { data } = await api.get('/auth/me', { timeout: TIMEOUT });
  return data.cryptos ?? null;
}

export async function saveUserCryptos(_userId, cryptos) {
  await api.put('/auth/cryptos', { cryptos }, { timeout: TIMEOUT });
}
