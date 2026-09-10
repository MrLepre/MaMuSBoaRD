const CACHE_NAME = 'mamusboard-shell-v14';
const SHELL = ['./','./index.html','./style.css','./app.js','./manifest.json','./js/core/state.js','./js/core/bootstrap.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Network-first: evita que uma versão antiga do index/app/css fique presa
  // no celular após um novo deploy. Se estiver offline, cai para o cache.
  event.respondWith(fetch(req).then(resp => {
    const copy = resp.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
    return resp;
  }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html'))));
});
