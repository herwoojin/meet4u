// 카카오톡 공유 — 게스트 모집 글을 카톡방에 "카드"로 보낸다.
//
// 텍스트 복사로 붙이면 카톡방에 글자로만 보이지만, Kakao JS SDK 의
// 피드 템플릿(Kakao.Share.sendDefault)으로 보내면 이미지 + 제목 + 설명 +
// 버튼이 묶인 메시지 블록 하나만 올라간다. 버튼을 누르면 그 모임 상세가 바로 열린다.
//
// 카드 이미지는 모임마다 서버(netlify/functions/guest-card.js)가 그린다 —
// 장소·날짜·시간·1인당 금액이 이미지 안에 찍힌다.
//
// 필요한 설정 (코드 밖):
//   1) .env / Netlify 환경변수에 VITE_KAKAO_JS_KEY (카카오 로그인과 같은 앱의 JavaScript 키)
//   2) 카카오 디벨로퍼스 → 그 앱의 Web 사이트 도메인에 서비스 도메인 등록
// 키가 없거나 SDK 를 못 불러오면 호출부가 링크 복사로 폴백한다.

import { summarizeMeetup, guestCardImageUrl, SNAPSHOT_HINT, cardContent } from './guestSummary';

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
const SDK_INTEGRITY = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';
const JS_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_KAKAO_JS_KEY) || '';

// 카카오 서버가 이미지를 직접 받아 가고, 이미지 함수는 Netlify 에만 있으므로
// localhost 에서 공유할 때도 이미지는 운영 도메인 것을 쓴다.
const PROD_ORIGIN = 'https://k-app.click';

export const pageOrigin = () =>
    (typeof window !== 'undefined' ? window.location.origin : PROD_ORIGIN);
export const publicOrigin = () => {
    const o = pageOrigin();
    return /localhost|127\.0\.0\.1|\[::1\]/.test(o) ? PROD_ORIGIN : o;
};

export const isKakaoShareConfigured = () => Boolean(JS_KEY);

let sdkPromise = null;

// SDK 는 공유할 때만 필요하므로 처음 쓰는 순간 한 번만 받아온다(88KB).
export const loadKakaoSdk = () => {
    if (!JS_KEY) return Promise.reject(new Error('VITE_KAKAO_JS_KEY 가 설정되지 않았습니다.'));
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise((resolve, reject) => {
        const ready = () => {
            try {
                if (!window.Kakao.isInitialized()) window.Kakao.init(JS_KEY);
                resolve(window.Kakao);
            } catch (e) {
                sdkPromise = null;
                reject(e);
            }
        };
        if (window.Kakao) { ready(); return; }

        const s = document.createElement('script');
        s.src = SDK_URL;
        s.integrity = SDK_INTEGRITY;
        s.crossOrigin = 'anonymous';
        s.async = true;
        s.onload = ready;
        s.onerror = () => {
            s.remove();
            sdkPromise = null;   // 다음 클릭에서 재시도할 수 있게
            reject(new Error('카카오 SDK 를 불러오지 못했습니다.'));
        };
        document.head.appendChild(s);
    });
    return sdkPromise;
};

export const guestShareLink = (m) => summarizeMeetup(m, pageOrigin()).url;

export const guestCardImage = (m) =>
    guestCardImageUrl(publicOrigin(), summarizeMeetup(m, pageOrigin()));

// 팝업이 열릴 때 카드 이미지를 미리 한 번 그려 둔다. 첫 렌더는 서버가 폰트를
// 받아 오느라 1~2초 걸리는데, 카카오가 공유 순간에 그걸 기다리다 이미지를
// 빼먹지 않도록 CDN 에 먼저 올려 두는 용도.
export const warmGuestCardImage = (m) => {
    try { new Image().src = guestCardImage(m); } catch (_) { /* ignore */ }
};

// 카톡에 보낼 카드. 계좌·메모는 넣지 않는다 — 단톡·오픈채팅에 계좌가 그대로
// 남지 않게 하고, 카드를 짧게 유지한다. 세부 정보는 버튼을 누른 뒤 상세에서 본다.
export const shareGuestMeetupToKakao = async (m) => {
    const Kakao = await loadKakaoSdk();
    const s = summarizeMeetup(m, pageOrigin());
    const link = { mobileWebUrl: s.url, webUrl: s.url };
    const price = s.priceText ? ` · ${s.priceText}` : '';

    Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
            title: `🎾 ${s.place} 게스트 모집${s.closed ? ' (마감)' : ''}`,
            description: `${s.dateLong} ${s.time}\nNTRP ${s.level} · ${s.type} · ${s.status}${price}\n${SNAPSHOT_HINT}`,
            imageUrl: guestCardImageUrl(publicOrigin(), s),
            imageWidth: 1200,
            imageHeight: 600,
            link,
        },
        buttons: [
            { title: s.closed ? '대기 신청 바로가기' : '참가 신청 바로가기', link },
        ],
    });
};

// ── 공유 후 현황 변경 감지 ──────────────────────────────────────
// 카톡에 올라간 카드는 갱신되지 않으므로(카카오 정책), 공유한 뒤 현황이 바뀌면
// 다시 공유하도록 알려 준다. 이 기기에서 마지막으로 공유한 내용을 기억해 비교한다.
const sharedKey = (id) => `guest_shared_${id}`;

export const rememberShared = (m) => {
    const s = summarizeMeetup(m, pageOrigin());
    try {
        localStorage.setItem(sharedKey(m.id), JSON.stringify({ content: cardContent(s), status: s.status, at: Date.now() }));
    } catch (_) { /* 저장 불가(사파리 개인정보 모드 등) → 알림만 생략 */ }
};

/** 공유 뒤 바뀌었으면 { from, to } (상태 문구), 아니면 null. 공유한 적 없으면 null. */
export const sharedChange = (m) => {
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(sharedKey(m.id)) || 'null'); } catch (_) { prev = null; }
    if (!prev?.content) return null;
    const s = summarizeMeetup(m, pageOrigin());
    return prev.content === cardContent(s) ? null : { from: prev.status, to: s.status };
};

// 밴드·문자 등 카카오 외 공유용 전체 텍스트 (상세 팝업 헤더의 📋 복사).
export const guestShareText = (m) => {
    const s = summarizeMeetup(m, pageOrigin());
    const lines = [
        `🎾 [${s.dateShort}] 게스트 모집`,
        `📍 ${s.place}`,
        `⏰ ${s.time}`,
        `🎯 NTRP ${s.level} · ${s.type}`,
        `👥 ${s.closed ? '마감' : `남은 ${s.left}자리`} · ${s.guests}/${s.cap}명`,
    ];
    if (s.priceText) lines.push(`💰 ${s.priceText}`);
    if (m.bank?.bank && m.bank?.acc) {
        lines.push(`🏦 ${m.bank.bank} ${m.bank.acc} (${m.bank.holder || ''})`);
    }
    if (m.note) lines.push(`📝 ${m.note}`);
    lines.push('', `👉 참가하기: ${s.url}`);
    return lines.join('\n');
};
