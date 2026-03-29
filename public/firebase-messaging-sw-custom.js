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

// Handle background messages (app closed or in background)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    // Extract from webpush notification or data payload
    const title = payload.notification?.title || payload.data?.title || 'Meet4U 새 알림';
    const body = payload.notification?.body || payload.data?.body || '새 알림이 도착했습니다.';
    const type = payload.data?.type || 'general';

    const options = {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: type + '-' + Date.now(), // Unique tag to prevent notification stacking
        renotify: true,
        data: {
            type,
            url: '/',
        },
        // Vibrate pattern for mobile
        vibrate: [200, 100, 200],
    };

    self.registration.showNotification(title, options);
});

// Handle notification click - open/focus the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing window if available
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
