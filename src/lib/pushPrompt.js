// 참가·참석처럼 "알림을 받아야 의미가 있는" 동작을 할 때 알림을 켠다
// (권한 요청 + 이 기기의 푸시 토큰을 users.fcmTokens 에 등록).
//
// 브라우저는 클릭 같은 사용자 동작 안에서만 권한 창을 띄우므로, 클릭 핸들러에서
// await 없이 바로 부른다(첫 await 전까지가 클릭 안에서 실행된다). 이미 차단된 기기는 다시 묻지 않는다.

import { requestFCMToken } from '../hooks/useFCM';

export const ensurePushOn = (user) => {
    if (!user?.uid || !user?.email) return Promise.resolve(false);
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return Promise.resolve(false);
    return requestFCMToken(user.uid, user.email).then(Boolean).catch(() => false);
};
