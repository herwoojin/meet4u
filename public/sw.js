// PromiseU PWA Service Worker
// - PWA 오프라인 캐싱 + Firebase Cloud Messaging 통합

const CACHE_NAME = 'promiseu-v2';   // v2: 앱 아이콘을 테니스 코트 일러스트로 교체
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
// 안정 태그: server 가 data.tag 를 명시적으로 넘긴다. 같은 tag 를 가진 알림은
// 브라우저가 자동으로 교체하므로, 예전 알림이 계속 쌓이는 문제가 사라진다.
// 사용자 여러 기기에서 동일 event 를 delivery 받아도, 태그가 같으면 하나로 통합.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Meet4U 새 알림';
  const body = payload.notification?.body || payload.data?.body || '새 알림이 도착했습니다.';
  const type = payload.data?.type || 'general';
  const tag = payload.data?.tag || type; // server 가 tag 를 안 보내면 type 을 폴백으로

  const options = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    renotify: true, // 새 이벤트가 도착하면 다시 알림음/진동 울림
    data: { type, tag, url: payload.data?.url || '/' },
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(title, options);
});

// Raw web push fallback (FCM 우회 경로)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (payload?.from || payload?.messageId || payload?.collapseKey) return;

    const title = payload?.notification?.title || payload?.title || 'Meet4U 새 알림';
    const body = payload?.notification?.body || payload?.body || '새 알림이 도착했습니다.';
    const tag = payload?.tag || payload?.type || 'general';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag,
        renotify: true,
        vibrate: [200, 100, 200],
      })
    );
  } catch (_) {
    // Non-JSON push — ignore
  }
});

// 앱이 열려 focus 를 얻는 순간, 서버가 SW 로 보낸 알림 중 이제 유효하지 않은
// (사용자가 이미 앱에서 확인할 것이므로) 알림들을 정리한다. 특정 tag 로 좁혀
// 정리하고 싶으면 postMessage 로 { type: 'CLEAR_NOTIF', tag } 를 SW 에 보내면
// 아래 리스너가 처리한다.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'CLEAR_NOTIF') {
    const tag = msg.tag;
    event.waitUntil(
      self.registration.getNotifications(tag ? { tag } : {}).then((list) => {
        list.forEach((n) => n.close());
      })
    );
  }
});

// 알림 클릭 → 앱 열기/포커스
// 알림의 url 을 해시 라우터 주소로 바꾼다. '/guest-meetups?open=x' → '/#/guest-meetups?open=x'.
// 루트('/', '/?meeting=x')와 이미 '#' 가 있는 주소는 그대로 (main.jsx 가 쿼리를 처리).
const toAppUrl = (u) => {
  if (!u) return '/';
  if (u.includes('#')) return u;
  const path = u.split('?')[0];
  return (path === '/' || path === '') ? u : '/#' + u;
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = toAppUrl(event.notification.data?.url);
  const target = new URL(url, self.location.origin).href;
  const hasTarget = url !== '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url || !('focus' in client)) continue;
        // 앱이 이미 열려 있으면 그 창을 알림의 화면으로 옮긴 뒤 앞으로 (예전엔 앞으로만 가져와
        // '30분 전 위치 공유' 같은 알림을 눌러도 해당 화면으로 가지 않았다)
        if (hasTarget && 'navigate' in client) {
          return client.navigate(target).then((c) => (c || client).focus()).catch(() => client.focus());
        }
        return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
