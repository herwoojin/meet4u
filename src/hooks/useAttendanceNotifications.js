import { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { requestNotificationPermission } from './useCommentNotifications';

// Helper: convert sanitized email key (dots→underscores) back to real email
const unsanitizeEmail = (key) => {
    if (!key) return key;
    const atIndex = key.indexOf('@');
    if (atIndex === -1) return key;
    const localPart = key.substring(0, atIndex);
    const domainPart = key.substring(atIndex + 1).replace(/_/g, '.');
    return localPart + '@' + domainPart;
};

const useAttendanceNotifications = () => {
    const { currentUser } = useAuth();
    const toast = useToast();
    const isFirstRun = useRef(true);
    
    // meetingId -> Set of attending emails (unsanitized)
    const knownAttendees = useRef({});

    useEffect(() => {
        if (!currentUser?.email) return;

        const userEmail = currentUser.email.toLowerCase();

        // Listen to all meetings. We could filter by where we are attendees,
        // but Firestore limitations on map queries make it easier to listen to all and filter locally,
        // or just rely on the fact that meeting volume is low.
        const q = query(collection(db, 'meetings'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isFirstRun.current) {
                isFirstRun.current = false;
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const attendees = new Set();
                    if (data.responses) {
                        Object.entries(data.responses).forEach(([key, status]) => {
                            if (status === 'attend') {
                                attendees.add(unsanitizeEmail(key).toLowerCase());
                            }
                        });
                    }
                    knownAttendees.current[doc.id] = attendees;
                });
                return;
            }

            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                const meetingId = change.doc.id;
                
                // Parse current attendees
                const currentAttendees = new Set();
                let iAmAttending = false;
                
                if (data.responses) {
                    Object.entries(data.responses).forEach(([key, status]) => {
                        const email = unsanitizeEmail(key).toLowerCase();
                        if (status === 'attend') {
                            currentAttendees.add(email);
                            if (email === userEmail) {
                                iAmAttending = true;
                            }
                        }
                    });
                }

                if (change.type === 'added' || change.type === 'modified') {
                    const previous = knownAttendees.current[meetingId] || new Set();
                    
                    // Only notify if I am attending or I'm the creator
                    const isCreator = data.createdBy === currentUser.uid;
                    
                    if (iAmAttending || isCreator) {
                        currentAttendees.forEach(attendeeEmail => {
                            // If it's a new attendee and it's not me
                            if (!previous.has(attendeeEmail) && attendeeEmail !== userEmail) {
                                // Extract simple nickname from email
                                const attendeeName = attendeeEmail.split('@')[0];
                                const title = `🤝 참석 알림`;
                                const body = `${attendeeName}님이 '${data.title}'에 참석합니다!`;
                                
                                // Show in-app toast
                                if (toast?.addToast) {
                                    toast.addToast(body, {
                                        title: title,
                                        duration: 5000,
                                    });
                                }

                                // Show browser/mobile notification
                                sendBrowserNotification(title, {
                                    body: body,
                                    icon: '/pwa-192x192.png',
                                    badge: '/pwa-192x192.png',
                                    tag: `attend-${meetingId}-${attendeeEmail}`,
                                    renotify: true,
                                });
                            }
                        });
                    }
                    
                    // Update known attendees
                    knownAttendees.current[meetingId] = currentAttendees;
                }
                
                if (change.type === 'removed') {
                    delete knownAttendees.current[meetingId];
                }
            });
        });

        return () => unsubscribe();
    }, [currentUser, toast]);
};

// Browser notification helper
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

export default useAttendanceNotifications;
