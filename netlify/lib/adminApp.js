// Netlify 함수 공용 — Firebase Admin 앱과 Firestore 를 한 번만 만든다.
//
// Firestore 는 gRPC 대신 REST 로 통신한다(preferRest). esbuild 로 번들하면 gRPC 모듈이
// 깨져 "GrpcClient is not a constructor" 로 실패하고, 단건 조회에는 REST 가 콜드 스타트도
// 빠르다. settings() 는 인스턴스당 한 번만 호출할 수 있다.

import admin from 'firebase-admin';

let db = null;

export const getAdmin = () => {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    }
    return admin;
};

export const getDb = () => {
    if (db) return db;
    db = getAdmin().firestore();
    db.settings({ preferRest: true });
    return db;
};
