// Service worker do Mapa GPS: guarda o app e os mapas para funcionar sem internet.
const SHELL_CACHE = 'mapa-gps-shell-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await c.addAll(SHELL);
    for (const u of CDN) { try { await c.add(new Request(u, { mode: 'cors' })); } catch (_) { } }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mapa-gps-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Rede primeiro (com limite de tempo, para sinal fraco no campo); se falhar, usa o que está salvo.
async function networkFirst(req, ms) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const r = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const idx = await caches.match('index.html') || await caches.match('./'); if (idx) return idx; }
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const p = url.pathname;
    if (req.mode === 'navigate' || p.endsWith('/index.html') || p.endsWith('/mapas/index.json')) {
      e.respondWith(networkFirst(req, 5000));
      return;
    }
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok && !p.includes('/mapas/')) (await caches.open(SHELL_CACHE)).put(req, r.clone());
      return r;
    })());
    return;
  }
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) (await caches.open(SHELL_CACHE)).put(req, r.clone());
      return r;
    })());
  }
});
