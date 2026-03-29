import { getToken } from 'firebase/messaging';
import { messaging, db } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

const VAPID_KEY = "BLCZf7PaIXOSY2EU5LU-h4s-fA6k0Str_2kEyKr2gtZzj9HeEBBV5QxPj9VR8Ci7kXoFG4aGZlk-mhlJLKaKx0g";

export const requestFCMToken = async (userId) => {
    if (!userId) return null;

    try {
        console.log('Requesting FCM notification permission...');
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            // 현재 등록된 서비스 워커 가져오기 (vite-plugin-pwa가 등록한 워커)
            const registration = await navigator.serviceWorker.ready;

            const currentToken = await getToken(messaging, { 
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (currentToken) {
                console.log('FCM Token received by client.');
                
                // Firestore users 컬렉션에 토큰 저장 (배열로 저장하여 여러 기기 지원)
                const userRef = doc(db, 'users', userId);
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken)
                });
                
                return currentToken;
            } else {
                console.log('No registration token available. Request permission to generate one.');
                return null;
            }
        } else {
            console.log('Unable to get permission to notify.');
            return null;
        }
    } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
        return null; // VAPID 키가 입력되지 않으면 에러가 발생합니다.
    }
};
