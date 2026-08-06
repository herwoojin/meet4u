import admin from 'firebase-admin';

// Initialize Firebase Admin (singleton)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

// Web Push Topic 헤더는 URL-safe base64 · 최대 32자만 허용된다.
// tag 문자열을 안전하게 변환: 영숫자/_/- 만 남기고 32자로 컷.
const sanitizeTopic = (tag) => {
    const s = String(tag || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
    return s || 'default';
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const {
            type, title, body, url,           // url 은 알림 클릭 시 이동할 경로
            tag,                              // 안정 태그 — 같은 tag 는 SW 가 자동 교체
            recipientEmails, recipientUids,   // 둘 중 하나 (게스트 모집은 uid 로 저장)
            senderEmail, senderUid,           // 자기 자신은 알림 제외
        } = JSON.parse(event.body);

        if (!type || !title || !body) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
        }
        if (!recipientEmails?.length && !recipientUids?.length) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'recipientEmails or recipientUids required' }) };
        }

        // 최종 수신자 users 문서 리스트 수집
        const userDocs = new Map(); // uid → { fcmTokens }

        // (a) uid 로 직접 조회
        if (recipientUids?.length) {
            const uids = Array.from(new Set(
                recipientUids.filter(u => u && u !== senderUid)
            ));
            for (let i = 0; i < uids.length; i += 10) {
                const chunk = uids.slice(i, i + 10);
                const snap = await db.collection('users')
                    .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                    .get();
                snap.forEach(doc => userDocs.set(doc.id, doc.data()));
            }
        }

        // (b) email 로 조회 (기존 경로 유지)
        if (recipientEmails?.length) {
            const emails = recipientEmails
                .filter(e => e && e !== senderEmail)
                .map(e => e.toLowerCase());
            for (let i = 0; i < emails.length; i += 10) {
                const chunk = emails.slice(i, i + 10);
                const snap = await db.collection('users')
                    .where('email', 'in', chunk)
                    .get();
                snap.forEach(doc => userDocs.set(doc.id, doc.data()));
            }
        }

        if (userDocs.size === 0) {
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, sent: 0 }) };
        }

        // 사용자당 여러 기기 = 여러 fcmTokens
        const tokens = [];
        for (const [uid, data] of userDocs.entries()) {
            if (Array.isArray(data.fcmTokens)) {
                data.fcmTokens.forEach(t => {
                    if (t) tokens.push({ token: t, userId: uid });
                });
            }
        }

        if (tokens.length === 0) {
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, sent: 0, reason: 'No FCM tokens found' }) };
        }

        // Build FCM message for each token and send in batch
        const messages = tokens.map(({ token }) => ({
            token,
            // data 필드는 string 만 허용. url·tag 는 옵션.
            data: {
                type: String(type),
                title: String(title),
                body: String(body),
                ...(url ? { url: String(url) } : {}),
                ...(tag ? { tag: String(tag) } : {}),
            },
            android: { priority: 'high' },
            apns: {
                headers: { 'apns-priority': '10' },
                payload: {
                    aps: {
                        alert: { title, body },
                        sound: 'default',
                        'content-available': 1,
                    },
                },
            },
            webpush: {
                // Topic 헤더는 web push 사양의 dedup 키. 같은 Topic 을 가진 아직
                // 전달되지 않은 메시지는 서버가 최신 것만 남기고 나머지는 폐기.
                // 오프라인 상태 후 접속 시 예전 알림들이 한꺼번에 밀려오는 문제를
                // 원천 차단. URL-safe base64 형식 · 최대 32자.
                headers: {
                    Urgency: 'high',
                    TTL: '86400',
                    ...(tag ? { Topic: sanitizeTopic(tag) } : {}),
                },
                // notification 필드 제거 — data-only 메시지로 전송
                // 브라우저 자동 알림 방지, SW onBackgroundMessage에서만 알림 표시
            },
        }));

        // sendEach is more efficient than individual send() calls
        const response = await admin.messaging().sendEach(messages);

        console.log(`FCM sendEach: ${response.successCount} success, ${response.failureCount} failure out of ${messages.length}`);

        // Clean up invalid tokens
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code;
                if (code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(tokens[idx]);
                }
                console.error(`FCM send error [${idx}]:`, resp.error?.code, resp.error?.message);
            }
        });

        // Remove invalid tokens from Firestore
        const cleanupPromises = invalidTokens.map(({ userId, token }) =>
            db.collection('users').doc(userId).update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
            }).catch(e => console.error('Failed to remove invalid token:', e))
        );
        await Promise.all(cleanupPromises);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                sent: response.successCount,
                failed: response.failureCount,
                total: messages.length,
            }),
        };
    } catch (error) {
        console.error('Send notification error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
