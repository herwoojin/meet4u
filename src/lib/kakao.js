import { signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// Kakao OAuth (Authorization Code) — 서버리스 함수와 함께 동작.
//
// REST API 키는 OAuth redirect URL 의 client_id 로 노출되므로 공개해도
// 안전하지만, 운영 단계 일관성을 위해 .env(VITE_KAKAO_REST_API_KEY)
// 로도 덮어쓸 수 있게 했다.

const REST_API_KEY = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_KAKAO_REST_API_KEY) ||
    'a15ab09cb34eaefea6dfcfbeace979bc'
);
const REDIRECT_PATH = '/auth/kakao/callback';

export const getKakaoRedirectUri = () =>
    `${window.location.origin}${REDIRECT_PATH}`;

// 카카오 로그인 시작 — 브라우저를 카카오 동의 화면으로 보냄.
export const loginWithKakao = () => {
    const redirectUri = getKakaoRedirectUri();
    const params = new URLSearchParams({
        client_id: REST_API_KEY,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'profile_nickname profile_image account_email',
    });
    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
};

// 카카오에서 돌아온 code 를 Netlify 함수에 넘기고, 받은 custom token 으로
// Firebase 에 로그인한 뒤 users/{uid} 프로필이 없으면 생성한다.
export const completeKakaoLogin = async (code) => {
    const redirectUri = getKakaoRedirectUri();
    const res = await fetch('/.netlify/functions/kakao-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`서버 응답 ${res.status}: ${text.slice(0, 200)}`);
    }
    const { customToken, profile } = await res.json();
    if (!customToken) throw new Error('서버에서 토큰을 받지 못했습니다.');

    const userCred = await signInWithCustomToken(auth, customToken);

    // 첫 로그인이면 users/{uid} 도큐먼트 생성 (Google 로그인 흐름과 동일 스키마)
    const userDocRef = doc(db, 'users', userCred.user.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
        const email = profile.email || `${userCred.user.uid}@kakao.local`;
        await setDoc(userDocRef, {
            email,
            displayName: profile.displayName || '카카오 사용자',
            photoURL: profile.photoURL || '',
            role: 'user',
            preferredLanguage: 'ko',
            provider: 'kakao',
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            emailSanitized: email.replace(/\./g, '_'),
        });
    } else {
        // 기존 사용자는 lastSeen 만 업데이트
        await setDoc(userDocRef, { lastSeen: new Date().toISOString() }, { merge: true });
    }

    return userCred.user;
};
