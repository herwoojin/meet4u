// 카카오톡 공유 — 게스트 모집 글을 카톡방에 "카드"로 보낸다.
//
// 텍스트 복사로 붙이면 카톡방에 글자로만 보이지만, Kakao JS SDK 의
// 피드 템플릿(Kakao.Share.sendDefault)으로 보내면 이미지 + 제목 + 설명 +
// 버튼이 묶인 메시지 블록으로 보인다. 버튼을 누르면 그 모임 상세가 바로 열린다.
//
// 필요한 설정 (코드 밖):
//   1) .env / Netlify 환경변수에 VITE_KAKAO_JS_KEY (카카오 로그인과 같은 앱의 JavaScript 키)
//   2) 카카오 디벨로퍼스 → 그 앱의 Web 사이트 도메인에 서비스 도메인 등록
// 키가 없거나 SDK 를 못 불러오면 호출부가 텍스트 복사로 폴백한다.

import { perHead, isClosed } from './guestMeetups';

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
const SDK_INTEGRITY = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';
const JS_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_KAKAO_JS_KEY) || '';

// 카카오 서버가 이미지를 직접 받아가므로 localhost 주소는 쓸 수 없다.
const PROD_ORIGIN = 'https://k-app.click';
const SHARE_IMAGE_PATH = '/share/guest-invite.jpg';

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

const DAY = ['일', '월', '화', '수', '목', '금', '토'];

// 카톡 인앱 브라우저·공유 링크가 # 이하를 보존하는지 클라이언트마다 보장되지
// 않으므로 해시 없는 진입 URL 을 쓴다. main.jsx 가 이를 해시 라우트로 바꾼다.
export const guestShareUrl = (id) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : PROD_ORIGIN;
    return `${origin}/?guest=${encodeURIComponent(id)}`;
};

const shareImageUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : PROD_ORIGIN;
    const isLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(origin);
    return `${isLocal ? PROD_ORIGIN : origin}${SHARE_IMAGE_PATH}`;
};

/**
 * 카드와 텍스트 복사가 같은 숫자를 쓰도록 요약을 한 곳에서 만든다.
 * (예전에 공유 텍스트와 화면의 인원 수가 서로 달랐던 적이 있다.)
 * 인원은 화면과 같은 기준 — 호스트를 뺀 게스트 수 / 모집인원.
 */
export const summarizeMeetup = (m) => {
    const closed = isClosed(m);
    const cap = Math.max(1, m.cap ?? 0);
    const guests = Math.max(0, (m.roster?.length || 0) - (m.roster?.[0]?.host ? 1 : 0));
    const left = Math.max(0, cap - guests);
    const amount = perHead(m);

    const p = String(m.date || '').split('-');
    const d = p.length === 3 ? new Date(`${m.date}T00:00:00`) : null;
    const dateLong = d ? `${Number(p[1])}월 ${Number(p[2])}일(${DAY[d.getDay()]})` : (m.date || '');
    const dateShort = d ? `${Number(p[1])}/${Number(p[2])}(${DAY[d.getDay()]})` : (m.date || '');

    return {
        closed, cap, guests, left, amount, dateLong, dateShort,
        time: `${m.start || ''} ~ ${m.end || ''}`,
        place: m.place || '',
        level: m.level || '-',
        type: m.type || '-',
        url: guestShareUrl(m.id),
    };
};

// 카톡에 보낼 카드. 계좌·메모는 넣지 않는다 — 단톡·오픈채팅에 계좌가 그대로
// 남지 않게 하고, 카드를 짧게 유지한다. 세부 정보는 버튼을 누른 뒤 상세에서 본다.
export const shareGuestMeetupToKakao = async (m) => {
    const Kakao = await loadKakaoSdk();
    const s = summarizeMeetup(m);

    const status = s.closed ? '마감 · 대기 신청 가능' : `남은 ${s.left}자리`;
    const price = s.amount > 0 ? ` · 1인 ${s.amount.toLocaleString('ko-KR')}원` : '';
    const link = { mobileWebUrl: s.url, webUrl: s.url };

    Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
            title: `🎾 ${s.place} 게스트 모집${s.closed ? ' (마감)' : ''}`,
            description: `${s.dateLong} ${s.time}\nNTRP ${s.level} · ${s.type} · ${status}${price}`,
            imageUrl: shareImageUrl(),
            imageWidth: 1200,
            imageHeight: 600,
            link,
        },
        buttons: [
            { title: s.closed ? '대기 신청 바로가기' : '참가 신청 바로가기', link },
        ],
    });
};

// 카카오 공유를 못 쓸 때(키 미설정·SDK 실패·밴드/문자 공유)용 텍스트.
export const guestShareText = (m) => {
    const s = summarizeMeetup(m);
    const lines = [
        `🎾 [${s.dateShort}] 게스트 모집`,
        `📍 ${s.place}`,
        `⏰ ${s.time}`,
        `🎯 NTRP ${s.level} · ${s.type}`,
        `👥 ${s.closed ? '마감' : `남은 ${s.left}자리`} · ${s.guests}/${s.cap}명`,
    ];
    if (s.amount > 0) lines.push(`💰 1인 ${s.amount.toLocaleString('ko-KR')}원`);
    if (m.bank?.bank && m.bank?.acc) {
        lines.push(`🏦 ${m.bank.bank} ${m.bank.acc} (${m.bank.holder || ''})`);
    }
    if (m.note) lines.push(`📝 ${m.note}`);
    lines.push('', `👉 참가하기: ${s.url}`);
    return lines.join('\n');
};
