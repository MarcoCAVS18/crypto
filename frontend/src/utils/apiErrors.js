// Mensajes de error de la API legibles. Dos problemas que había:
//  1. El servidor responde `{ error: "…" }` pero el interceptor solo miraba `message`, así que el motivo real (p. ej. el
//     error de Firestore o de la IA) nunca llegaba a la pantalla: se veía "Request failed with status code 500".
//  2. Si el sitio no tiene proxy hacia la API (p. ej. Netlify sin `VITE_API_URL`), `/api/**` devuelve el index.html del
//     sitio con status 200: la app fallaba sin decir por qué.

export function looksLikeHtml(data) {
  return typeof data === 'string' && /^\s*(<!doctype html|<html)/i.test(data);
}

export const HTML_INSTEAD_OF_API = 'La API no responde: el sitio devolvió una página web en lugar de datos. Revisá que VITE_API_URL apunte a tu backend (https://<proyecto>.web.app/api).';

/** Mensaje para un error de axios. */
export function describeApiError(error) {
  const data = error?.response?.data;
  if (looksLikeHtml(data)) return HTML_INSTEAD_OF_API;
  const fromBody = (data && typeof data === 'object') ? (data.error ?? data.message) : null;
  return (typeof fromBody === 'string' && fromBody) || error?.message || 'Error de conexión';
}
