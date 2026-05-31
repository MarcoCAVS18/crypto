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
      tag:     `zone_${data.symbol ?? 'crypto'}`,
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
