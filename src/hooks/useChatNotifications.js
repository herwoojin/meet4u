import { useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const useChatNotifications = () => {
    const { currentUser } = useAuth();

    useEffect(() => {
        if (!currentUser?.email) return;

        // Query chats where current user is a participant
        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', currentUser.email)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const chatData = change.doc.data();

                // Check if this is a modification (new message)
                if (change.type === 'modified') {
                    // Only notify if the last sender is NOT the current user
                    if (chatData.lastSender && chatData.lastSender !== currentUser.email) {
                        const senderName = chatData.lastSender.split('@')[0]; // Simple fallback name

                        // 1. Browser Notification
                        if (Notification.permission === 'granted') {
                            new Notification(`New message from ${senderName}`, {
                                body: chatData.lastMessage,
                                icon: '/pwa-192x192.png'
                            });
                        }
                    }
                }
            });
        });

        // Request permission on mount
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => unsubscribe();
    }, [currentUser]);
};

export default useChatNotifications;
