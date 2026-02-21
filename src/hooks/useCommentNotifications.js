import { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const useCommentNotifications = () => {
    const { currentUser } = useAuth();
    const isFirstRun = useRef(true);

    useEffect(() => {
        if (!currentUser?.email) return;

        // Query comments where current user is in recipients list
        const q = query(
            collection(db, 'comments'),
            where('recipients', 'array-contains', currentUser.email)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isFirstRun.current) {
                isFirstRun.current = false;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const commentData = change.doc.data();

                    // Only notify if the sender is NOT the current user
                    if (commentData.senderEmail !== currentUser.email) {
                        const senderName = commentData.senderName || '알 수 없음';
                        const title = `${senderName}님의 새 댓글`;
                        const options = {
                            body: commentData.text,
                            icon: '/pwa-192x192.png',
                            badge: '/pwa-192x192.png',
                            tag: `comment-${change.doc.id}`,
                            renotify: true,
                        };

                        showNotification(title, options);
                    }
                }
            });
        });

        // Request permission on mount
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => unsubscribe();
    }, [currentUser]);
};

// Use Service Worker showNotification for mobile/Chrome, fallback to Notification API
async function showNotification(title, options) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }

    try {
        // Try Service Worker notification first (works on mobile + Chrome)
        const registration = await navigator.serviceWorker?.ready;
        if (registration) {
            await registration.showNotification(title, options);
            return;
        }
    } catch (e) {
        // SW not available, fall through to legacy API
    }

    // Fallback: legacy Notification API (desktop Safari etc.)
    try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch (e) {
        console.error('Notification failed:', e);
    }
}

export default useCommentNotifications;
