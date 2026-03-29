import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from '../lib/firebase';
import { doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

const VAPID_KEY = "BLCZf7PaIXOSY2EU5LU-h4s-fA6k0Str_2kEyKr2gtZzj9HeEBBV5QxPj9VR8Ci7kXoFG4aGZlk-mhlJLKaKx0g";

/**
 * 앱 로드 시 자동으로 FCM 토큰을 갱신하고,
 * 포그라운드 메시지를 수신하여 알림을 표시하는 훅
 */
export const useFCM = (user) => {
    useEffect(() => {
        if (!user?.uid || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        let unsubscribe = null;

        const setup = async () => {
            try {
                const registration = await navigator.serviceWorker.ready;
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration,
                });

                if (token) {
                    // 토큰을 Firestore에 저장 (앱 열 때마다 갱신)
                    const userRef = doc(db, 'users', user.uid);
                    await setDoc(userRef, {
                        fcmTokens: arrayUnion(token),
                        email: user.email?.toLowerCase(),
                    }, { merge: true });
                }
            } catch (err) {
                console.error('FCM token refresh failed:', err);
            }

            // 포그라운드 메시지 핸들러 - 앱이 열려있을 때 수신 확인만 (알림 표시 안 함)
            // 앱이 열려있으면 Firestore 실시간 리스너로 이미 화면에 반영되므로 중복 알림 방지
            unsubscribe = onMessage(messaging, (payload) => {
                console.log('[Foreground] Message received (suppressed notification):', payload);
            });
        };

        setup();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user?.uid]);
};

/**
 * 설정 페이지에서 수동으로 FCM 권한 요청 + 토큰 등록
 */
export const requestFCMToken = async (userId, email) => {
    if (!userId) return null;

    try {
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            const currentToken = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration,
            });

            if (currentToken) {
                const userRef = doc(db, 'users', userId);
                await setDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken),
                    email: email?.toLowerCase(),
                }, { merge: true });

                return currentToken;
            }
            return null;
        }
        return null;
    } catch (err) {
        console.error('An error occurred while retrieving token:', err);
        return null;
    }
};
