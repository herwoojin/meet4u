// Service Worker for Push Notifications
// Handles both FCM push events and messages from the main thread

self.addEventListener('push', function (event) {
    if (event.data) {
        const payload = event.data.json();
        const notificationTitle = payload.notification.title;
        const notificationOptions = {
            body: payload.notification.body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png'
        };

        event.waitUntil(
            self.registration.showNotification(notificationTitle, notificationOptions)
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Focus existing window if available
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// Allow the SW to take control immediately
self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});
