// Offline cache. Bump VERSION when shipping changes.
const VERSION = 'fp-v1';
const APP = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/store.js', 'js/images.js', 'js/naming.js', 'js/export.js',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'vendor/jszip.min.js',
];
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(APP);
    try { await cache.add(new Request(JSZIP, { mode: 'cors' })); } catch { /* offline at install */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.href === JSZIP) {
    // Library never changes: cache first.
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
      return res;
    })));
  } else if (url.origin === location.origin) {
    // App files: network first so updates show up, cache when offline.
    e.respondWith(fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(request, copy)); }
      return res;
    }).catch(() => caches.match(request, { ignoreSearch: true })));
  }
});
