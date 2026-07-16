// Minimal service worker: caches the app shell so it installs cleanly and
// reopens instantly. API calls always go to the network (never cached),
// since this app is multiplayer and needs live data.
const CACHE_NAME = 'bedrock-go-shell-v1';
const SHELL_FILES = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event)=>{
  const url = new URL(event.request.url);
  // Never cache API calls — always hit the real server for live multiplayer data.
  if(url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
