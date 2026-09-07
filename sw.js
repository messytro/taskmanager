// Service worker: caches the app shell on first visit so it keeps working
// without a network connection afterward. Cloud sync now talks directly to
// Supabase (a different origin), so it's never intercepted by this cache
// logic anyway — offline it'll just fail naturally and the app falls back
// to local-only storage, same as if sync were never configured.

const CACHE_NAME = 'b2quest-cache-v4';
const APP_SHELL = ['./', './index.html', './manifest.json', './config.js', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // don't fail install if e.g. icons 404 during dev
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // For the page itself: try the network first (so you get updates when
  // online), fall back to the cached copy when offline.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (icons, manifest, config): cache-first, network fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
