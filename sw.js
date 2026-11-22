// NID-GATECARD - Service Worker untuk Dukungan PWA & Instalasi HP
const CACHE_NAME = 'nid-gatecard-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/supabaseClient.js',
  './js/cards.js',
  './js/borrow.js',
  './js/return.js',
  './js/admin.js',
  './js/auth.js',
  './js/scanner.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/menu-dashboard.jpg',
  './assets/icons/menu-verifikasi.jpg',
  './assets/icons/menu-master-kartu.jpg',
  './assets/icons/menu-riwayat.jpg',
  './assets/icons/menu-qr.svg',
  './assets/icons/app-logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => console.warn('PWA Cache warn:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Hanya layani file statis lokal, lewati panggilan API Supabase / CDN luar
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network First: Selalu ambil file terbaru dari jaringan saat online agar tidak tertahan cache lama
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
