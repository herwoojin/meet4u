// Netlify 함수 공용 — 공유 카드(이미지·링크 미리보기)에 쓸 문서를 Admin SDK 로 읽는다.
// netlify/functions 밖에 두어 함수로 배포되지 않고, import 한 함수에만 번들된다.
//
// 공개 카드용이라 호출부는 제목·일시·인원·금액만 쓴다. 계좌·참가자 이름·이메일은
// 문서에 있지만 절대 응답에 싣지 않는다.

import admin from 'firebase-admin';

// gRPC 대신 REST 로 통신한다. esbuild 로 번들하면 Firestore 의 gRPC 모듈이
// 깨져 "GrpcClient is not a constructor" 로 실패하고, 단건 조회에는 REST 가
// 콜드 스타트도 더 빠르다. settings() 는 인스턴스당 한 번만 호출할 수 있다.
let db = null;
const getDb = () => {
    if (db) return db;
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    }
    db = admin.firestore();
    db.settings({ preferRest: true });
    return db;
};

// Firestore 자동 ID 형태만 받는다 — 임의 경로 조회 방지.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const readDoc = async (collection, id) => {
    if (!ID_RE.test(String(id || ''))) return null;
    const snap = await getDb().collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
};

export const readGuestMeetup = (id) => readDoc('guestMeetups', id);
export const readMeeting = (id) => readDoc('meetings', id);
