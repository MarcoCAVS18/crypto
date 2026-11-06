// Suscripción Web Push — registra el dispositivo para recibir notificaciones
// aunque la app esté cerrada.
import api from './api';

const VAPID_PUBLIC = 'BOiFLh7sNGSvlbEc9e3npc2rDBVSOnaE5anqn5oC4Msxyefm5erdW21CsXkjKDXi6OPcXj08i0NX0zl416fJP1g';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

const READY_TIMEOUT_MS = 8000;

// El service worker es UNO solo (el de Workbox, que carga public/sw-push.js con el handler de push): acá no se registra otro.
// Registrar '/sw-push.js' aparte en el mismo scope pisaba al de Workbox y los avisos llegaban a un worker sin handler.
const activeRegistration = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, rej) => setTimeout(() => rej(new Error('el service worker no está activo')), READY_TIMEOUT_MS))
]);

// El usuario sale de la sesión del servidor (los avisos son personales): ya no se manda un userId en el pedido.
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  try {
    const reg = await activeRegistration();

    // Verificar si ya hay suscripción activa
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }

    // Guardar en backend
    await api.post('/push/subscribe', { subscription: sub.toJSON() });
    return sub;
  } catch (err) {
    console.warn('[Push] subscribe error:', err.message);
    return null;
  }
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[Push] unsubscribe error:', err.message);
  }
}
