// This service worker is ready for Firebase Cloud Messaging (FCM).
// Since we are currently using client-side notifications (when the app is open),
// this file is a placeholder for future backend integration.

self.addEventListener('push', function (event) {
    if (event.data) {
        const payload = event.data.json();
        const notificationTitle = payload.notification.title;
        const notificationOptions = {
            body: payload.notification.body,
            icon: '/pwa-192x192.png'
        };

        event.waitUntil(
            self.registration.showNotification(notificationTitle, notificationOptions)
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
