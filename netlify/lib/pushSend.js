// Netlify 함수 공용 — 사용자 문서의 fcmTokens 로 푸시를 보낸다(예약 알림용).
//
// 메시지 형식은 send-notification.js 와 같다: data 만 담아 보내고(서비스워커가 알림을 그림),
// tag 를 Web Push Topic 헤더로도 넣어 같은 알림이 쌓이지 않게 한다.
// 만료된 토큰은 보내는 김에 지운다.

import { getAdmin, getDb } from './adminApp.js';

const sanitizeTopic = (tag) => String(tag || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'default';

// 응답 키(이메일의 '.'→'_')에서 도메인 부분만 되돌린다 — MeetingDetailModal 과 같은 규칙.
const unsanitizeEmail = (key) => {
    const at = String(key).indexOf('@');
    return at === -1 ? key : key.slice(0, at) + '@' + key.slice(at + 1).replace(/_/g, '.');
};

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** 모임 응답 키들 → 사용자 문서 Map(uid → data) */
export const findUsersByResponseKeys = async (keys) => {
    const db = getDb();
    const users = new Map();
    // 1) emailSanitized 로 (로그인할 때마다 기록되는 필드)
    const sanitized = Array.from(new Set(keys.flatMap((k) => [k, k.toLowerCase()])));
    for (const c of chunks(sanitized, 10)) {
        const snap = await db.collection('users').where('emailSanitized', 'in', c).get();
        snap.forEach((d) => users.set(d.id, d.data()));
    }
    // 2) 그 필드가 없는 옛 사용자 대비: 이메일로 한 번 더
    const emails = Array.from(new Set(keys.map((k) => unsanitizeEmail(k).toLowerCase())));
    for (const c of chunks(emails, 10)) {
        const snap = await db.collection('users').where('email', 'in', c).get();
        snap.forEach((d) => users.set(d.id, d.data()));
    }
    return users;
};

/** @returns {{ users, tokens, sent, failed }} */
export const sendPushToUsers = async (users, { type, title, body, url, tag }) => {
    const admin = getAdmin();
    const tokens = [];
    for (const [uid, data] of users.entries()) {
        (Array.isArray(data.fcmTokens) ? data.fcmTokens : []).forEach((t) => t && tokens.push({ token: t, uid }));
    }
    if (tokens.length === 0) return { users: users.size, tokens: 0, sent: 0, failed: 0 };

    const messages = tokens.map(({ token }) => ({
        token,
        data: {
            type: String(type), title: String(title), body: String(body),
            ...(url ? { url: String(url) } : {}),
            ...(tag ? { tag: String(tag) } : {}),
        },
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { alert: { title, body }, sound: 'default', 'content-available': 1 } } },
        webpush: { headers: { Urgency: 'high', TTL: '3600', ...(tag ? { Topic: sanitizeTopic(tag) } : {}) } },
    }));

    const res = await admin.messaging().sendEach(messages);
    const db = getDb();
    await Promise.all(res.responses.map((r, i) => {
        const code = r.error?.code;
        if (r.success || (code !== 'messaging/invalid-registration-token' && code !== 'messaging/registration-token-not-registered')) return null;
        return db.collection('users').doc(tokens[i].uid)
            .update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(tokens[i].token) })
            .catch((e) => console.error('[pushSend] token cleanup', e));
    }));
    return { users: users.size, tokens: tokens.length, sent: res.successCount, failed: res.failureCount };
};
