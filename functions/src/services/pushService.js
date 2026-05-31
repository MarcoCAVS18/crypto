// Web Push — envía notificaciones a suscriptores registrados
import webpush from 'web-push';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

function init() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails('mailto:noreply@crypto-context.app', VAPID_PUBLIC, VAPID_PRIVATE);
  return true;
}

/**
 * Envía una notificación a todas las suscripciones dadas.
 * Las suscripciones inválidas/expiradas se eliminan del array retornado.
 */
export async function sendPush(subscriptions, title, body, data = {}) {
  if (!init()) {
    console.warn('[Push] VAPID keys not configured');
    return [];
  }

  const payload = JSON.stringify({ title, body, data });
  const valid   = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload);
        valid.push(sub);
      } catch (err) {
        // 410 Gone = suscripción expirada, descartarla
        if (err.statusCode !== 410) {
          valid.push(sub);
          console.warn('[Push] send error:', err.statusCode, err.message);
        }
      }
    })
  );

  return valid;
}
