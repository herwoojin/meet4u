// 게스트 모집(테니스) 도메인 데이터 계층.
//
// 기존 meet4u 의 meetings 컬렉션은 그대로 두고, 이 신규 스펙만을 위한
// 별도 컬렉션 guestMeetups 를 사용한다. 스키마:
//
//   guestMeetups/{id} {
//     date: "YYYY-MM-DD", start: "HH:mm", end: "HH:mm",
//     place: string, region: "고양"|"파주"|"김포",
//     level: "2.0"|"2.5"|"3.0"|"3.5",
//     type:  "여단"|"남단"|"혼복"|"남복"|"여복",
//     cap:   number,   // 호스트 제외 게스트 정원
//     roster:[{uid,name,host,paid,joinedAt}], // 첫 원소가 호스트
//     wait:  [{uid,name,at}],                 // 대기 순번 = 배열 인덱스
//     cost:  {court,ball,etc},
//     bank:  {bank,acc,holder},
//     closed:boolean, note:string,
//     createdBy: uid, createdAt, updatedAt
//   }
//
// 정원 계산 규칙: capTotal = cap + 1 (호스트 1명 + 게스트 cap 명).
//   roster.length >= capTotal 이면 closed=true.
//
// 참가/취소/대기 승격은 반드시 runTransaction 안에서 처리해 read-modify-write
// race 를 봉쇄한다.

import { db } from './firebase';
import {
    collection, doc, addDoc, deleteDoc, updateDoc,
    runTransaction, serverTimestamp,
} from 'firebase/firestore';

export const COLLECTION = 'guestMeetups';

export const PLACES  = ['충장 1번', '충장 2번', '삼송 2번', '원흥 3번', '파주 운정A', '김포 아라1번'];

// 장소명에서 코트 번호를 잘라내고 "구 이름" 만 남기는 헬퍼.
//   충장 1번   → 충장
//   충장 2번   → 충장
//   삼송 2번   → 삼송
//   원흥 3번   → 원흥
//   파주 운정A → 파주 운정   (숫자 없으면 뒤 알파벳만 잘라냄)
//   김포 아라1번 → 김포 아라
// 규칙: (1) 뒤쪽 공백+숫자로 시작하는 구간을 통째로 삭제,
//       (2) 그래도 뒤에 알파벳 접미(A/B) 가 있다면 마저 삭제, (3) trim.
export const placePrefix = (place) =>
    String(place || '')
        .replace(/\s*\d+.*$/, '')
        .replace(/[A-Za-z]+$/, '')
        .trim();

// 프리셋 PLACES 를 기준으로 중복 제거한 코트 그룹명 목록 (필터 chip 용).
export const PLACE_PREFIXES = Array.from(
    new Set(PLACES.map(placePrefix).filter(Boolean))
);
export const LEVELS  = ['2.0', '2.5', '3.0', '3.5'];
export const TYPES   = ['여단', '남단', '혼복', '남복', '여복'];
export const REGIONS = ['고양', '파주', '김포'];
export const BANKS   = [
    '카카오뱅크', '카톡입금', '국민은행', '신한은행', '우리은행', '하나은행',
    '농협', '기업은행', '새마을금고', '토스뱅크',
];

// ────────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────────

export const capTotal = (m) => (m?.cap ?? 0) + 1;
export const isRosterFull = (m) => (m?.roster?.length ?? 0) >= capTotal(m);
export const isClosed = (m) => Boolean(m?.closed) || isRosterFull(m);

export const totalCost = (m) => {
    const c = m?.cost || {};
    return (c.court || 0) + (c.ball || 0) + (c.etc || 0);
};

// 1인당 부담금.
//   1) 호스트가 perHeadAmount 로 직접 지정한 값이 있으면 그대로 사용.
//   2) 없으면(레거시 데이터) 총액 / capTotal 을 100원 단위 올림 (구 계산식).
export const perHead = (m) => {
    if (typeof m?.perHeadAmount === 'number' && m.perHeadAmount > 0) {
        return Math.round(m.perHeadAmount);
    }
    const n = Math.max(1, capTotal(m));
    return Math.ceil(totalCost(m) / n / 100) * 100;
};

export const paidCount = (m) => (m?.roster || []).filter(r => r.paid).length;

export const findRosterIndex = (m, uid) =>
    (m?.roster || []).findIndex(r => r.uid === uid);

export const findWaitIndex = (m, uid) =>
    (m?.wait || []).findIndex(w => w.uid === uid);

// ────────────────────────────────────────────────────────────────
// CRUD
// ────────────────────────────────────────────────────────────────

// 호스트 = 로그인 사용자. 첫 roster 원소로 자동 추가.
export const createMeetup = async ({ user, ...data }) => {
    if (!user?.uid) throw new Error('로그인이 필요합니다.');
    const hostEntry = {
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || '호스트',
        host: true,
        paid: false,
        joinedAt: Date.now(),
    };
    const payload = {
        date: data.date || '',
        start: data.start || '06:00',
        end: data.end || '08:00',
        place: data.place || PLACES[0],
        // region 은 폼에서 제거된 필드. 넘어오면 저장, 없으면 빈 문자열.
        // 기존 문서는 그대로 값을 유지하므로 상세 화면 하위호환은 유지된다.
        region: data.region || '',
        level: data.level || '3.0',
        type: data.type || '혼복',
        cap: Number(data.cap) || 3,
        roster: [hostEntry],
        wait: [],
        // 호스트가 직접 지정한 1인당 금액. 이 값이 있으면 perHead 는 이 값을
        // 그대로 사용한다. cost 세분류(코트/공/기타) 는 레거시 문서 하위호환용.
        perHeadAmount: Number(data.perHeadAmount) || 0,
        cost: {
            court: Number(data.cost?.court) || 0,
            ball: Number(data.cost?.ball) || 0,
            etc: Number(data.cost?.etc) || 0,
        },
        bank: {
            bank: data.bank?.bank || '카카오뱅크',
            acc: data.bank?.acc || '',
            holder: data.bank?.holder || hostEntry.name,
        },
        closed: false,
        note: data.note || '',
        // 모임이 자동 마감될 때 참가자 전원(발신자 제외) 에게 푸시로
        // 전송할 안내 문구. 호스트가 폼에서 미리 지정.
        closingMessage: data.closingMessage || '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return ref.id;
};

// 호스트가 편집. roster/wait 는 편집 대상에서 제외.
export const updateMeetupMeta = async (id, patch) => {
    const clean = { ...patch };
    delete clean.roster;
    delete clean.wait;
    delete clean.closed;
    delete clean.createdBy;
    delete clean.createdAt;
    await updateDoc(doc(db, COLLECTION, id), {
        ...clean,
        updatedAt: serverTimestamp(),
    });
};

export const deleteMeetup = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
};

// ────────────────────────────────────────────────────────────────
// 참가 / 취소 / 대기 — 트랜잭션 (동시성 안전)
// ────────────────────────────────────────────────────────────────

// 참가 시도. 정원 다 찼으면 자동으로 대기열로 이동.
// 반환: { status: 'joined' | 'waiting' | 'already-in' | 'already-waiting' }
export const joinMeetup = async (id, user) => {
    if (!user?.uid) throw new Error('로그인이 필요합니다.');
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('없는 모임입니다.');
        const m = snap.data();

        if (findRosterIndex(m, user.uid) >= 0) return { status: 'already-in' };
        if (findWaitIndex(m, user.uid) >= 0) return { status: 'already-waiting' };

        const name = user.displayName || user.email?.split('@')[0] || '게스트';

        if (isRosterFull(m) || m.closed) {
            const wait = [...(m.wait || []), { uid: user.uid, name, at: Date.now() }];
            tx.update(ref, { wait, updatedAt: serverTimestamp() });
            return { status: 'waiting', position: wait.length };
        }

        const newRoster = [
            ...(m.roster || []),
            { uid: user.uid, name, host: false, paid: false, joinedAt: Date.now() },
        ];
        const closed = newRoster.length >= (m.cap ?? 0) + 1;
        tx.update(ref, { roster: newRoster, closed, updatedAt: serverTimestamp() });
        // finalRoster / closingMessage 를 함께 리턴 — 호출측이 마감 알림
        // 대상(전원)을 정확히 알 수 있도록.
        return {
            status: 'joined',
            closed,
            finalRoster: newRoster,
            closingMessage: m.closingMessage || '',
        };
    });
};

// 참가 취소. 자리 나면 wait[0] 자동 승격.
// 반환: { status, promoted? }
export const leaveMeetup = async (id, user) => {
    if (!user?.uid) throw new Error('로그인이 필요합니다.');
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('없는 모임입니다.');
        const m = snap.data();

        const idx = findRosterIndex(m, user.uid);
        if (idx < 0) return { status: 'not-in' };
        if (m.roster[idx].host) throw new Error('호스트는 취소할 수 없습니다. 모임을 삭제해 주세요.');

        let roster = (m.roster || []).filter((_, i) => i !== idx);
        let wait = m.wait || [];
        let promoted = null;

        // 자리 났고 대기자 있으면 1번 승격.
        // promotedFromWait / promotedAt 을 함께 저장해서 상세 화면에서
        // "🎉 대기에서 자동 참가" 뱃지로 명확히 알 수 있도록 한다.
        const cap = m.cap ?? 0;
        if (roster.length < cap + 1 && wait.length > 0) {
            const [head, ...rest] = wait;
            promoted = head;
            roster = [
                ...roster,
                {
                    uid: head.uid,
                    name: head.name,
                    host: false,
                    paid: false,
                    joinedAt: Date.now(),
                    promotedFromWait: true,
                    promotedAt: Date.now(),
                },
            ];
            wait = rest;
        }

        const closed = roster.length >= cap + 1;
        tx.update(ref, { roster, wait, closed, updatedAt: serverTimestamp() });
        return { status: 'left', promoted };
    });
};

// 대기 등록. (마감 상태에서만 의미 있음 — 굳이 마감 아니어도 등록은 허용)
export const waitMeetup = async (id, user) => {
    if (!user?.uid) throw new Error('로그인이 필요합니다.');
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('없는 모임입니다.');
        const m = snap.data();
        if (findRosterIndex(m, user.uid) >= 0) return { status: 'already-in' };
        if (findWaitIndex(m, user.uid) >= 0) return { status: 'already-waiting' };
        const name = user.displayName || user.email?.split('@')[0] || '게스트';
        const wait = [...(m.wait || []), { uid: user.uid, name, at: Date.now() }];
        tx.update(ref, { wait, updatedAt: serverTimestamp() });
        return { status: 'waiting', position: wait.length };
    });
};

export const cancelWait = async (id, user) => {
    if (!user?.uid) throw new Error('로그인이 필요합니다.');
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('없는 모임입니다.');
        const m = snap.data();
        const wait = (m.wait || []).filter(w => w.uid !== user.uid);
        tx.update(ref, { wait, updatedAt: serverTimestamp() });
        return { status: 'cancelled' };
    });
};

// 입금 완료 토글. 본인 것 또는 호스트가 임의 대상 변경.
export const setPaid = async (id, targetUid, paid, actorUid) => {
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('없는 모임입니다.');
        const m = snap.data();
        const isHost = m.createdBy === actorUid;
        if (!isHost && targetUid !== actorUid) {
            throw new Error('본인 입금만 변경할 수 있습니다.');
        }
        const roster = (m.roster || []).map(r =>
            r.uid === targetUid ? { ...r, paid: Boolean(paid) } : r
        );
        tx.update(ref, { roster, updatedAt: serverTimestamp() });
        return { status: 'ok' };
    });
};

// 호스트 수동 마감/재개
export const setClosed = async (id, closed) => {
    await updateDoc(doc(db, COLLECTION, id), {
        closed: Boolean(closed),
        updatedAt: serverTimestamp(),
    });
};
