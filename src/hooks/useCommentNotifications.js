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
                // Check if this is a new comment (added)
                if (change.type === 'added') {
                    const commentData = change.doc.data();

                    // Only notify if the sender is NOT the current user
                    if (commentData.senderEmail !== currentUser.email) {
                        const senderName = commentData.senderName || 'Anonymous';

                        if (Notification.permission === 'granted') {
                            const notification = new Notification(`${senderName}님의 새 댓글`, {
                                body: commentData.text,
                                icon: '/pwa-192x192.png'
                            });

                            notification.onclick = (e) => {
                                e.preventDefault();
                                window.focus();
                                notification.close();
                            };
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

export default useCommentNotifications;
