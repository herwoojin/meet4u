// Firebase Messaging Service Worker (default path for FCM)
// Handles both 'notification' and data-only payloads coming from FCM.

importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyB4b-G7Ps-hnQiwZhjBOWE6tpxnRw7a4iE",
    authDomain: "gen-lang-client-0283055211.firebaseapp.com",
    projectId: "gen-lang-client-0283055211",
    storageBucket: "gen-lang-client-0283055211.firebasestorage.app",
    messagingSenderId: "997651572284",
    appId: "1:997651572284:web:e7ed3b4a88e480b0eac539",
    measurementId: "G-D210VT6KP7"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Background messages (app closed or in another tab) — data-only payloads
// are delivered here so the SW must call showNotification explicitly.
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
        data: {
            type,
            url: payload.data?.url || '/',
        },
        vibrate: [200, 100, 200],
    };

    self.registration.showNotification(title, options);
});

// Fallback: raw web push events (some browsers deliver via `push` directly).
// Only show if onBackgroundMessage wouldn't have picked it up.
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        // If FCM shape (has `from` field), skip — onBackgroundMessage will handle it.
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
    } catch (e) {
        // Non-JSON push — ignore
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
