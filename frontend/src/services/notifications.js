// Notificaciones nativas del navegador/PWA
// Funciona en segundo plano en Android e iOS 16.4+ (instalado como PWA)

export function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getPermission() {
  if (!isSupported()) return 'denied';
  return Notification.permission;
}

export async function requestPermission() {
  if (!isSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function sendZoneNotification(symbol, type, price) {
  if (!isSupported() || Notification.permission !== 'granted') return;

  const isBuy = type === 'buy';
  const title = isBuy
    ? `${symbol} — Zona de compra`
    : `${symbol} — Zona de distribución`;
  const body = `Precio: $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${
    isBuy ? 'Oportunidad de acumulación' : 'Evaluá toma de ganancias'
  }`;

  try {
    new Notification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: `${symbol}_${type}`,   // reemplaza notificación anterior del mismo tipo
      renotify: true,
      silent: false
    });
  } catch (e) {
    console.warn('[Notifications] No se pudo enviar:', e.message);
  }
}
