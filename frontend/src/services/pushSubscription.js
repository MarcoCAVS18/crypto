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

export async function subscribeToPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  try {
    // Registrar el service worker de push (separado del SW de Workbox)
    const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // Verificar si ya hay suscripción activa
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }

    // Guardar en backend
    await api.post('/push/subscribe', { userId, subscription: sub.toJSON() });
    return sub;
  } catch (err) {
    console.warn('[Push] subscribe error:', err.message);
    return null;
  }
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[Push] unsubscribe error:', err.message);
  }
}
