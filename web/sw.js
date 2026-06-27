// SwiftCrypto Service Worker — PWA + Share Target
const CACHE_NAME = 'swiftcrypto-v3';
const SHARED_FILE_KEY = 'swiftcrypto_shared_midi';
const ASSETS = [
  './encrypt_chat_mobile_full.html',
  './manifest.json',
  './midi_stego.js',
  './icon.svg'
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch: handle share target POST, otherwise cache-first
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // ── Share Target: 接收微信/系统分享的 .mid 文件 ──
  if (event.request.method === 'POST' && url.pathname.includes('encrypt_chat_mobile_full')) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.get('midi');
        if (file && file.name && (file.name.endsWith('.mid') || file.name.endsWith('.midi'))) {
          const buffer = await file.arrayBuffer();
          // 存到缓存中，app 启动后读取
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/_shared_midi', new Response(buffer, {
            headers: { 'Content-Type': 'audio/midi', 'X-Shared-File': file.name }
          }));
          // 重定向到主页面，带标记
          return Response.redirect('./encrypt_chat_mobile_full.html?shared=1', 303);
        }
      } catch(e) { console.warn('Share target error:', e); }
      return Response.redirect('./encrypt_chat_mobile_full.html', 303);
    })());
    return;
  }
  
  // ── 提供缓存的分享文件 ──
  if (url.pathname === '/_shared_midi' || url.pathname.endsWith('/_shared_midi')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => 
        cache.match('/_shared_midi').then(r => r || new Response(null, {status: 404}))
      )
    );
    return;
  }
  
  // ── 常规请求：缓存优先 ──
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetched = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
