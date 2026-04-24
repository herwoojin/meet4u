import { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// In-app (foreground) notifier for global chat room messages.
// Subscribes to every room the user belongs to and fires a toast on new
// messages that aren't from the user themselves.
const useGlobalChatNotifications = () => {
    const { currentUser } = useAuth();
    const toast = useToast();
    const roomListenersRef = useRef(new Map()); // roomId -> unsubscribe()
    const knownIds = useRef(new Set());
    const initializedRooms = useRef(new Set());

    useEffect(() => {
        if (!currentUser?.email) return;
        const myEmail = currentUser.email.toLowerCase();

        const roomsQ = query(
            collection(db, 'globalChatRooms'),
            where('members', 'array-contains', myEmail)
        );

        const unsubRooms = onSnapshot(roomsQ, (snap) => {
            const seen = new Set();
            snap.docs.forEach((roomDoc) => {
                const roomId = roomDoc.id;
                seen.add(roomId);
                if (roomListenersRef.current.has(roomId)) return;

                const roomData = roomDoc.data();
                const roomName = roomData.name || '';

                const msgsQ = collection(db, 'globalChatRooms', roomId, 'messages');
                const unsubMsgs = onSnapshot(msgsQ, (msnap) => {
                    if (!initializedRooms.current.has(roomId)) {
                        initializedRooms.current.add(roomId);
                        msnap.docs.forEach(d => knownIds.current.add(`${roomId}:${d.id}`));
                        return;
                    }

                    msnap.docChanges().forEach((change) => {
                        if (change.type !== 'added') return;
                        const key = `${roomId}:${change.doc.id}`;
                        if (knownIds.current.has(key)) return;
                        knownIds.current.add(key);

                        const data = change.doc.data();
                        if (!data?.senderEmail) return;
                        if (data.senderEmail.toLowerCase() === myEmail) return;

                        const senderName = data.senderName || '알 수 없음';
                        const title = roomName
                            ? `💬 [${roomName}] ${senderName}`
                            : `💬 ${senderName}`;

                        if (toast?.addToast) {
                            toast.addToast(data.text || '', {
                                title,
                                duration: 5000,
                            });
                        }

                        sendBrowserNotification(title, {
                            body: data.text || '',
                            icon: '/pwa-192x192.png',
                            badge: '/pwa-192x192.png',
                            tag: `globalChat-${roomId}-${change.doc.id}`,
                            renotify: true,
                        });
                    });
                }, (err) => {
                    console.error('global chat room msgs listen error:', err);
                });

                roomListenersRef.current.set(roomId, unsubMsgs);
            });

            // Cleanup listeners for rooms we were removed from
            for (const [roomId, unsub] of roomListenersRef.current.entries()) {
                if (!seen.has(roomId)) {
                    try { unsub(); } catch (_) { /* ignore */ }
                    roomListenersRef.current.delete(roomId);
                    initializedRooms.current.delete(roomId);
                }
            }
        }, (err) => {
            console.error('global chat rooms listen error:', err);
        });

        return () => {
            unsubRooms();
            for (const unsub of roomListenersRef.current.values()) {
                try { unsub(); } catch (_) { /* ignore */ }
            }
            roomListenersRef.current.clear();
            initializedRooms.current.clear();
        };
    }, [currentUser, toast]);
};

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

export default useGlobalChatNotifications;
