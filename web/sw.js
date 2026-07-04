// SwiftCrypto Service Worker — PWA + Share Target
const CACHE_NAME = 'swiftcrypto-v16';
// 部署后浏览器会自动检测 SW 变化 → install → skipWaiting → activate → 清除旧缓存
// 以后改 HTML 只需改这里版本号即可
const TONE_CACHE = 'swiftcrypto-tone-v1'; // 音色库独立缓存，不被更新清除
const SALAMANDER = './lib/salamander/';
const SHARED_FILE_KEY = 'swiftcrypto_shared_midi';
const ASSETS = [
  './encrypt_chat_mobile_full.html',
  './manifest.json',
  './midi_stego.js',
  './lyric_data.js',
  './icon.svg',
  './lib/tone.min.js',
  './lib/midi.bundle.js',
  './lib/zxcvbn.js',
  './lib/salamander.tar.gz',
  './midi_pkg/manifest.json'
];

// Install: cache all assets (不影响音色库缓存)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old main caches，但保留音色库
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== TONE_CACHE).map(k => caches.delete(k))
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
  
  // ── Salamander 钢琴采样：独立缓存，不受版本更新影响 ──
  if (url.pathname.includes('/lib/salamander/')) {
    event.respondWith(
      caches.open(TONE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
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
