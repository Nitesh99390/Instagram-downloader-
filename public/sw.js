// ReelSave Pro — Service Worker
const CACHE = 'reelsave-v1';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/img/hero-phone.webp',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Never cache API calls
  if (request.method !== 'GET' || request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request)
        .then((res) => {
          // Cache static assets only
          if (request.url.includes('/static/') || request.url.endsWith('/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached)
    )
  );
});
