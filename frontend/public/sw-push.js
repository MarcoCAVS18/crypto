// Service Worker — maneja Web Push cuando la app está cerrada
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }

  const { title, body, data = {} } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:    '/icon.svg',
      badge:   '/icon.svg',
      tag:     data.tag ?? `signal_${data.symbol ?? 'crypto'}`,      // un aviso por activo: el nuevo reemplaza al anterior
      renotify: true,
      data
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
