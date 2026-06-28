// Kakao OAuth (Authorization Code flow) → Firebase Custom Token.
//
// 1) 클라이언트가 kauth.kakao.com 으로 리다이렉트되어 사용자 동의를 받음
// 2) Kakao 가 /auth/kakao/callback?code=... 로 우리 SPA 로 돌아옴
// 3) SPA 가 이 함수에 code 를 POST
// 4) 함수가
//    a. code → access_token 교환 (kauth.kakao.com/oauth/token)
//    b. access_token → 사용자 정보 (kapi.kakao.com/v2/user/me)
//    c. Firebase Auth 에 uid=kakao_{kakaoId} 사용자 생성/갱신
//    d. createCustomToken 으로 토큰 발행
// 5) SPA 는 받은 토큰으로 signInWithCustomToken 호출
//
// 필요 환경 변수 (Netlify Site → Settings → Environment variables):
//   KAKAO_REST_API_KEY   — Kakao Developers 의 REST API 키
//   FIREBASE_PROJECT_ID  — (FCM 함수와 공유)
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY (개행은 \n 으로 인코딩)

import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST')   return json(405, { error: 'Method not allowed' });

    try {
        const { code, redirectUri } = JSON.parse(event.body || '{}');
        if (!code) return json(400, { error: 'Missing code' });
        if (!redirectUri) return json(400, { error: 'Missing redirectUri' });

        const restKey = process.env.KAKAO_REST_API_KEY;
        if (!restKey) return json(500, { error: 'KAKAO_REST_API_KEY not configured on the server' });

        // ── Step 1: code → access_token ───────────────────────────────────
        const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: restKey,
                redirect_uri: redirectUri,
                code,
            }).toString(),
        });
        if (!tokenRes.ok) {
            const t = await tokenRes.text();
            console.error('Kakao token exchange failed:', tokenRes.status, t);
            return json(502, { error: 'Kakao token exchange failed', detail: t });
        }
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) return json(502, { error: 'Kakao returned no access_token' });

        // ── Step 2: access_token → user info ──────────────────────────────
        const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userRes.ok) {
            const t = await userRes.text();
            console.error('Kakao user info failed:', userRes.status, t);
            return json(502, { error: 'Kakao user info failed', detail: t });
        }
        const me = await userRes.json();
        const kakaoId = me.id;
        const account = me.kakao_account || {};
        const profile = account.profile || {};
        const email = account.email || null;
        const displayName = profile.nickname || `Kakao User ${kakaoId}`;
        const photoURL = profile.profile_image_url || null;

        // ── Step 3: Firebase Auth — create or update ──────────────────────
        const uid = `kakao_${kakaoId}`;
        const updateFields = {
            displayName,
            ...(photoURL ? { photoURL } : {}),
            ...(email ? { email, emailVerified: !!account.is_email_verified } : {}),
        };
        try {
            await admin.auth().getUser(uid);
            await admin.auth().updateUser(uid, updateFields);
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                await admin.auth().createUser({ uid, ...updateFields });
            } else {
                console.error('Firebase user upsert failed:', e);
                return json(500, { error: 'Firebase user upsert failed', detail: e.message });
            }
        }

        // ── Step 4: Mint custom token ─────────────────────────────────────
        const customToken = await admin.auth().createCustomToken(uid, {
            provider: 'kakao',
            kakaoId: String(kakaoId),
        });

        return json(200, {
            customToken,
            profile: {
                uid,
                email,
                displayName,
                photoURL,
            },
        });
    } catch (err) {
        console.error('Kakao login handler error:', err);
        return json(500, { error: err.message || 'Internal error' });
    }
};
