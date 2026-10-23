// Netlify 함수 공용 — 공유 카드(이미지·링크 미리보기)에 쓸 문서를 Admin SDK 로 읽는다.
// netlify/functions 밖에 두어 함수로 배포되지 않고, import 한 함수에만 번들된다.
//
// 공개 카드용이라 호출부는 제목·일시·인원·금액만 쓴다. 계좌·참가자 이름·이메일은
// 문서에 있지만 절대 응답에 싣지 않는다.

import { getDb } from './adminApp.js';

// Firestore 자동 ID 형태만 받는다 — 임의 경로 조회 방지.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const readDoc = async (collection, id) => {
    if (!ID_RE.test(String(id || ''))) return null;
    const snap = await getDb().collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
};

export const readGuestMeetup = (id) => readDoc('guestMeetups', id);
export const readMeeting = (id) => readDoc('meetings', id);
