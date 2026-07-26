// PromiseU PWA Service Worker
// - PWA 오프라인 캐싱 + Firebase Cloud Messaging 통합

const CACHE_NAME = 'promiseu-v1';
const OFFLINE_URL = '/offline.html';

// 프리캐시할 핵심 자원 (앱 셸)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/manifest.json',
];

// ─── Install: 프리캐시 ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache partial fail (non-critical):', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: 오래된 캐시 정리 ──────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && !name.startsWith('firestore'))
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch: Network-First 전략 ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST, non-http(s) 요청은 무시
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  // API / Firestore / Firebase 요청은 캐시하지 않음
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('gstatic')
  ) {
    return;
  }

  // Navigation 요청 (HTML 페이지)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL) || caches.match('/index.html');
      })
    );
    return;
  }

  // 정적 자원: Network-First → 캐시 fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 유효한 응답만 캐시
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ─── Firebase Cloud Messaging ────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyB4b-G7Ps-hnQiwZhjBOWE6tpxnRw7a4iE",
  authDomain: "gen-lang-client-0283055211.firebaseapp.com",
  projectId: "gen-lang-client-0283055211",
  storageBucket: "gen-lang-client-0283055211.firebasestorage.app",
  messagingSenderId: "997651572284",
  appId: "1:997651572284:web:e7ed3b4a88e480b0eac539",
  measurementId: "G-D210VT6KP7",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 백그라운드 메시지 (앱 닫힘/다른 탭)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Meet4U 새 알림';
  const body = payload.notification?.body || payload.data?.body || '새 알림이 도착했습니다.';
  const type = payload.data?.type || 'general';

  const options = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: type + '-' + Date.now(),
    renotify: true,
    data: { type, url: payload.data?.url || '/' },
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(title, options);
});

// Raw web push fallback
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (payload?.from || payload?.messageId || payload?.collapseKey) return;

    const title = payload?.notification?.title || payload?.title || 'Meet4U 새 알림';
    const body = payload?.notification?.body || payload?.body || '새 알림이 도착했습니다.';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: (payload?.type || 'general') + '-' + Date.now(),
        vibrate: [200, 100, 200],
      })
    );
  } catch (_) {
    // Non-JSON push — ignore
  }
});

// 알림 클릭 → 앱 열기/포커스
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
