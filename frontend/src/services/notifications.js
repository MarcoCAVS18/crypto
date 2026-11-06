// Permiso de notificaciones del navegador/PWA. Los avisos de la señal los manda el servidor por Web Push (services/pushSubscription.js)
// con la misma señal que muestra la app; la pantalla ya no genera notificaciones propias (salían distintas y duplicadas).
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
