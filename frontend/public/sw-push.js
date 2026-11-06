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

// Tocar el aviso abre la app en el activo del aviso (la tarjeta tiene "Ya compré" para registrar la compra con los datos cargados)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const symbol = event.notification.data?.symbol;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) {
        if (symbol) list[0].postMessage({ type: 'activo', symbol });
        return list[0].focus();
      }
      return clients.openWindow(symbol ? `/?activo=${encodeURIComponent(symbol)}` : '/');
    })
  );
});
