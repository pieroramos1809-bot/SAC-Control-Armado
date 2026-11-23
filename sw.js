/* Service worker: la app abre sin internet. Las llamadas al servidor (Apps Script) nunca se cachean. */
const VERSION = 'sac-v2-1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './manifest.webmanifest',
  './vendor/xlsx.full.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;           // API de Google: directo a la red
  if (req.mode === 'navigate') {                                                 // páginas: red primero, caché de respaldo
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {                                  // archivos: caché primero, y se renueva en segundo plano
    const red = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || red;
  }));
});
self.addEventListener('message', e => { if (e.data === 'saltar') self.skipWaiting(); });
