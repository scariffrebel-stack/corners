// Shows Corners alerts, and opens the group when one is tapped.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(data.title || 'Corners', {
    body: data.body || '',
    tag: data.tag,
    data: { url: data.url || '/' },
    icon: '/icon.svg',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    return open ? open.navigate(url).then((c) => c.focus()) : self.clients.openWindow(url);
  }));
});
