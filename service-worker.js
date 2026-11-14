const CACHE_NAME='sovann-sense-pwa-v1';
const APP_SHELL=['./','./index.html','./settings.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'];
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sovann-sense-pwa-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET') return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin) return;
 // Never cache ABA payment images, private books, receipts, user credentials, or API traffic.
 if(url.pathname.includes('/assets/')||url.pathname.includes('/api/')||url.pathname.includes('/private-')||url.pathname.includes('/payment-'))return;
 if(req.mode==='navigate'){
  e.respondWith(fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put('./index.html',copy));}return resp;}).catch(()=>caches.match('./index.html')));
  return;
 }
 e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{
  if(resp.ok && (url.pathname.endsWith('/settings.js')||url.pathname.includes('/icons/')||url.pathname.endsWith('/manifest.webmanifest'))){let copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}
  return resp;
 })));
});
