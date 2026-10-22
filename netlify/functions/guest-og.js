// GET /?guest=<모임ID>.<버전>  (public/_redirects 의 쿼리 매칭 규칙으로 들어온다)
//
// 게스트 모집 링크를 붙여넣었을 때 미리보기 카드가 그 모임의 제목·일시·금액·카드
// 이미지로 뜨도록 index.html 의 og 태그를 바꿔 준다. 사람이 열면 그대로 앱이 뜨고
// main.jsx 가 ?guest= 를 읽어 해당 모임 팝업을 연다. (공통 처리: ../lib/ogHtml.js)

import { readGuestMeetup } from '../lib/publicDocs.js';
import { injectOg, originOf, respondWithOg } from '../lib/ogHtml.js';
import { summarizeMeetup, guestCardImageUrl, parseGuestParam, SNAPSHOT_HINT } from '../../src/lib/guestSummary.js';

const guestOg = (m, origin) => {
    const s = summarizeMeetup(m, origin);
    return {
        title: `🎾 ${s.place} 게스트 모집${s.closed ? ' (마감)' : ''}`,
        // 안내 문구는 맨 뒤 — 카톡 미리보기는 설명이 2줄에서 잘려 앞쪽의 실제 모집 내용이 우선.
        // (안내는 카드 이미지 우상단에 크게 들어가 있다)
        description: [`${s.dateLong} ${s.time}`, `NTRP ${s.level}`, s.type, s.status, s.priceText, SNAPSHOT_HINT]
            .filter(Boolean).join(' · '),
        image: guestCardImageUrl(origin, s),
        url: s.url,
    };
};

// 테스트에서 직접 쓰는 진입점 (앱이 카카오에 보내는 이미지 URL 과 같은지 확인용)
export const injectGuestOg = (html, m, origin) => injectOg(html, guestOg(m, origin));

export const handler = async (event) => {
    // ?guest=<id>.<버전> — 버전은 카톡 캐시용이라 조회에는 ID 만 쓴다.
    const id = parseGuestParam(event.queryStringParameters?.guest);
    const origin = originOf(event);
    return respondWithOg(
        origin,
        async () => {
            const m = await readGuestMeetup(id);
            return m ? guestOg(m, origin) : null;
        },
        `${origin}/#/guest-meetups?open=${encodeURIComponent(id)}`,
        'guest-og',
    );
};
