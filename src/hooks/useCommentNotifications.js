import { useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const useCommentNotifications = () => {
    const { currentUser } = useAuth();
    const isFirstRun = useRef(true);
    const knownIds = useRef(new Set());

    useEffect(() => {
        if (!currentUser?.email) return;

        const userEmail = currentUser.email.toLowerCase();

        // Query comments where current user is in recipients list
        const q = query(
            collection(db, 'comments'),
            where('recipients', 'array-contains', userEmail)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            // On first run, just record existing comment IDs
            if (isFirstRun.current) {
                isFirstRun.current = false;
                snapshot.docs.forEach(doc => knownIds.current.add(doc.id));
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && !knownIds.current.has(change.doc.id)) {
                    knownIds.current.add(change.doc.id);
                    const commentData = change.doc.data();

                    // Only notify if the sender is NOT the current user
                    if (commentData.senderEmail?.toLowerCase() !== userEmail) {
                        const senderName = commentData.senderName || '알 수 없음';
                        const title = `${senderName}님의 새 댓글`;
                        const options = {
                            body: commentData.text || '',
                            icon: '/pwa-192x192.png',
                            badge: '/pwa-192x192.png',
                            tag: `comment-${change.doc.id}`,
                            renotify: true,
                        };

                        sendNotification(title, options);
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [currentUser]);
};

// Send notification using the best available method
async function sendNotification(title, options) {
    // Check if Notification API is available
    if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return;
    }

    // If permission not granted, skip silently
    if (Notification.permission !== 'granted') {
        console.log('Notification permission not granted:', Notification.permission);
        return;
    }

    // Method 1: Try Service Worker showNotification (works on Chrome + mobile)
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, options);
            return;
        } catch (e) {
            console.warn('SW showNotification failed, trying fallback:', e);
        }
    }

    // Method 2: Fallback to Notification constructor (desktop Safari)
    try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch (e) {
        console.error('All notification methods failed:', e);
    }
}

// Export a helper to request permission (must be called from a user gesture like button click)
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        return 'unsupported';
    }
    if (Notification.permission === 'granted') {
        return 'granted';
    }
    if (Notification.permission === 'denied') {
        return 'denied';
    }
    const result = await Notification.requestPermission();
    return result;
};

export default useCommentNotifications;
