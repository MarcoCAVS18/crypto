// Mensajes de error de la API legibles. Dos problemas que había:
//  1. El servidor responde `{ error: "…" }` pero el interceptor solo miraba `message`, así que el motivo real (p. ej. el
//     error de Firestore o de la IA) nunca llegaba a la pantalla: se veía "Request failed with status code 500".
//  2. Si el sitio no tiene proxy hacia la API (p. ej. Netlify sin `VITE_API_URL`), `/api/**` devuelve el index.html del
//     sitio con status 200: la app fallaba sin decir por qué.

export function looksLikeHtml(data) {
  return typeof data === 'string' && /^\s*(<!doctype html|<html)/i.test(data);
}

const isFirebaseHost = (h) => /(^|\.)(web\.app|firebaseapp\.com)$/.test(h) || h === 'localhost' || h === '127.0.0.1';

/**
 * Mensaje cuando /api devolvió una página web. La causa habitual es abrir el sitio desde una dirección que no tiene la API
 * (Netlify, un deploy viejo): ahí se dice dónde estás y a dónde ir. En Firebase significa que la función no respondió bien.
 */
export function htmlInsteadOfApiMessage(host = (typeof location !== 'undefined' ? location.hostname : ''), projectId = import.meta.env?.VITE_FIREBASE_PROJECT_ID) {
  if (host && !isFirebaseHost(host)) {
    const target = projectId ? `https://${projectId}.web.app` : 'la dirección de Firebase (…web.app)';
    return `Estás en ${host}, que no tiene la API de la app. Abrí ${target}.`;
  }
  return 'La API no respondió bien (devolvió una página web en lugar de datos). Recargá en un momento; si sigue, avisá.';
}

/** Mensaje para un error de axios. */
export function describeApiError(error) {
  const data = error?.response?.data;
  if (looksLikeHtml(data)) return htmlInsteadOfApiMessage();
  const fromBody = (data && typeof data === 'object') ? (data.error ?? data.message) : null;
  return (typeof fromBody === 'string' && fromBody) || error?.message || 'Error de conexión';
}
