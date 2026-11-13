// Service Worker: macht die App offline-fähig.
// Bei jeder Änderung an den Dateien: VERSION hochzählen, damit iPhone/Mac die neue Version holen.
const VERSION = 'v0.4.2';
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/model.js', 'js/views.js', 'js/ui.js', 'js/util.js', 'js/icons.js', 'js/config.js', 'js/md.js', 'js/keys.js',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'favicon.svg', 'favicon-32.png', 'favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase-Bibliothek (feste Version): einmal laden, dann aus dem Cache
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return; // Firebase-Datenbank etc. nicht anfassen
  // Eigene Dateien: erst Netz (neueste Version, am Browser-Cache vorbei), offline aus dem Cache
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
