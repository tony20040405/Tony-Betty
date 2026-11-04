/* 寶鼻專屬空間 - PWA Service Worker (支援離線快取與加速) */
const CACHE_NAME = 'tony-betty-pwa-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './park.html',
  './daily.html',
  './timeline.html',
  './games.html',
  './quiz.html',
  './army.html',
  './capsule.html',
  './login.html',
  './style.css',
  './site-config.js',
  './firebase-init.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(e => console.warn('PWA 快取部分略過:', e));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Firebase Auth / Firestore API 必須直接走網路
  if (url.includes('firestore') || url.includes('googleapis') || url.includes('identitytoolkit') || event.request.method !== 'GET') {
    return;
  }

  // 靜態資源優先走網路，斷網時由快取即時接手 (NetworkFirst)
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
