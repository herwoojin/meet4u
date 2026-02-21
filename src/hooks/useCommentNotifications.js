import { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const useCommentNotifications = () => {
    const { currentUser } = useAuth();
    const toast = useToast();
    const isFirstRun = useRef(true);
    const knownIds = useRef(new Set());

    useEffect(() => {
        if (!currentUser?.email) return;

        const userEmail = currentUser.email.toLowerCase();

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

                        // In-app toast notification (always works)
                        if (toast?.addToast) {
                            toast.addToast(commentData.text || '', {
                                title: `💬 ${senderName}님의 새 댓글`,
                                duration: 5000,
                            });
                        }

                        // Also try browser notification (bonus, may not work on all platforms)
                        sendBrowserNotification(
                            `${senderName}님의 새 댓글`,
                            {
                                body: commentData.text || '',
                                icon: '/pwa-192x192.png',
                                badge: '/pwa-192x192.png',
                                tag: `comment-${change.doc.id}`,
                                renotify: true,
                            }
                        );
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [currentUser, toast]);
};

// Browser notification (best-effort, may not work on mobile)
async function sendBrowserNotification(title, options) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
        const registration = await navigator.serviceWorker?.ready;
        if (registration) {
            await registration.showNotification(title, options);
            return;
        }
    } catch (e) { /* fallthrough */ }

    try {
        new Notification(title, options);
    } catch (e) { /* ignore */ }
}

// Export permission helper
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
};

export default useCommentNotifications;
