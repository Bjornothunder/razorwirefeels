// RAZOR WIRE FEELS — Service Worker
// Handles caching, offline support, and PWA installation

const CACHE_NAME = 'rwf-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/directory.html',
  '/signup.html',
  '/manifest.json',
  '/RWF_Logo_8000px.jpg',
];

// ============================================================
// INSTALL — cache static assets
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[RWF SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — clean up old caches
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[RWF SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — network first, fall back to cache
// Inmate pages (NC/[id]/) use cache first for speed
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external requests (fonts, analytics, etc.)
  if (url.origin !== location.origin) return;

  // Inmate profile pages — cache first (they update infrequently)
  if (url.pathname.includes('/NC/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Static assets — cache first
  if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Everything else — network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ============================================================
// BACKGROUND SYNC — for form submissions when offline
// ============================================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-signup') {
    event.waitUntil(syncPendingSignups());
  }
});

async function syncPendingSignups() {
  // When online again, retry any pending form submissions
  const cache = await caches.open('rwf-pending');
  const requests = await cache.keys();
  return Promise.all(
    requests.map(request =>
      fetch(request).then(() => cache.delete(request))
    )
  );
}

// ============================================================
// PUSH NOTIFICATIONS — for new episodes from followed pages
// ============================================================
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New episode published',
    icon: '/RWF_Logo_8000px.jpg',
    badge: '/RWF_Logo_8000px.jpg',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'read', title: 'Read Now' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Razor Wire Feels', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data.url;
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
