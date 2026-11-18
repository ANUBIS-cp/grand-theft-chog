// Grand Theft Chog's service worker: it only shows raid alerts and opens the game when you tap one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let msg = { title: 'Grand Theft Chog', body: '', url: '/play', tag: 'gtc' };
  try {
    msg = { ...msg, ...e.data.json() };
  } catch {
    /* an alert without details still shows */
  }
  e.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: msg.url },
    }),
  );
});

// A tap: bring an open game window to that robbery, or open one.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/play', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins)
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      return self.clients.openWindow(url);
    }),
  );
});
