// Token de sesión del servidor (Authorization: Bearer). Vive en localStorage; si no está disponible (modo privado, etc.)
// la sesión dura mientras la pestaña esté abierta.
const KEY = 'crypto-session-v1';
let memory = null;

export function getToken() {
  try { return localStorage.getItem(KEY) || memory; } catch { return memory; }
}
export function setToken(token) {
  memory = token || null;
  try { token ? localStorage.setItem(KEY, token) : localStorage.removeItem(KEY); } catch { /* sin storage */ }
}
export const clearToken = () => setToken(null);
