// 게스트 모집 — 화면·카톡 카드·카드 이미지·링크 미리보기가 같이 쓰는 순수 계산.
//
// 브라우저와 Netlify 함수(서버) 양쪽에서 import 하므로 firebase 등 어떤
// 런타임 의존성도 두지 않는다. 숫자를 한 곳에서만 계산해야 화면과 공유
// 카드의 인원·금액이 어긋나지 않는다(예전에 실제로 어긋난 적이 있다).

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

const DAY = ['일', '월', '화', '수', '목', '금', '토'];

// 카톡 인앱 브라우저·공유 링크가 # 이하를 보존하는지 클라이언트마다 보장되지
// 않으므로 해시 없는 진입 URL 을 쓴다. main.jsx 가 이를 해시 라우트로 바꾼다.
export const guestShareUrl = (origin, id) => `${origin}/?guest=${encodeURIComponent(id)}`;

/**
 * 공유에 쓰는 요약. 인원은 화면과 같은 기준 — 호스트를 뺀 게스트 수 / 모집인원.
 * 날짜 요일은 서버(UTC)에서도 같게 나오도록 UTC 기준으로 계산한다.
 */
export const summarizeMeetup = (m, origin) => {
    const closed = isClosed(m);
    const cap = Math.max(1, m?.cap ?? 0);
    const guests = Math.max(0, (m?.roster?.length || 0) - (m?.roster?.[0]?.host ? 1 : 0));
    const left = Math.max(0, cap - guests);
    const amount = perHead(m);

    const p = String(m?.date || '').split('-').map(Number);
    const ok = p.length === 3 && p.every(Number.isFinite);
    const day = ok ? DAY[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] : '';
    const dateLong = ok ? `${p[1]}월 ${p[2]}일(${day})` : (m?.date || '');
    const dateShort = ok ? `${p[1]}/${p[2]}(${day})` : (m?.date || '');

    return {
        id: m?.id || '',
        closed, cap, guests, left, amount, dateLong, dateShort,
        time: `${m?.start || ''} ~ ${m?.end || ''}`,
        place: m?.place || '',
        level: m?.level || '-',
        type: m?.type || '-',
        url: guestShareUrl(origin, m?.id || ''),
        status: closed ? '마감 · 대기 신청 가능' : `남은 ${left}자리`,
        priceText: amount > 0 ? `1인 ${amount.toLocaleString('ko-KR')}원` : '',
    };
};

// 카드 이미지 URL 의 버전 값. 이미지에 찍히는 내용이 바뀌면 URL 이 바뀌어
// 카카오·CDN 이 옛 이미지를 계속 보여주지 않는다.
export const cardVersion = (s) => {
    const key = [s.place, s.dateLong, s.time, s.level, s.type, s.status, s.priceText].join('|');
    let h = 2166136261;                                   // FNV-1a 32bit
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
};

// 쿼리를 c=<id>.<버전> 하나로 묶는다. & 가 있으면 og:image 에 &amp; 로 들어가는데,
// 미리보기 스크래퍼마다 엔티티 해석을 믿을 수 없어서. (Firestore 자동 ID 에는 '.' 이 없다)
export const guestCardImageUrl = (origin, s) =>
    `${origin}/.netlify/functions/guest-card?c=${encodeURIComponent(s.id)}.${cardVersion(s)}`;
