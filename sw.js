// Service Worker = kleines Script, das im Hintergrund läuft und die App offline verfügbar macht.
// Version hochzählen (v1 -> v2), wenn du Dateien änderst, damit das iPhone die neue Version lädt.
const CACHE = 'tasks-v1';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Erst Netzwerk versuchen (neueste Version), bei offline aus dem Cache laden
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
