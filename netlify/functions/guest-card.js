// GET /.netlify/functions/guest-card?c=<모임ID>.<버전>   (디버깅용으로 ?id=&v= 도 받음)
// → 그 모임의 장소·날짜·시간·1인당 금액이 찍힌 1200×600 PNG.
//
// 카카오톡 공유 카드(Kakao SDK imageUrl)와 링크 미리보기(og:image)가 이 URL 을 쓴다.
// 실패하면 정적 배너로 302 — 카드에 이미지가 비는 일은 없게 한다.

import { readGuestMeetup } from '../lib/guestMeetupStore.js';
import { renderGuestCard } from '../lib/guestCard.js';
import { summarizeMeetup, cardVersion } from '../../src/lib/guestSummary.js';

export const handler = async (event) => {
    const q = event.queryStringParameters || {};
    const [id = '', v = ''] = q.c ? String(q.c).split('.') : [q.id, q.v];
    const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'k-app.click';
    const fallback = () => ({
        statusCode: 302,
        headers: { Location: `https://${host}/share/guest-invite.jpg`, 'Cache-Control': 'no-store' },
        body: '',
    });

    try {
        const m = await readGuestMeetup(id);
        if (!m) return fallback();

        const s = summarizeMeetup(m, `https://${host}`);
        const png = await renderGuestCard(s);

        // v 가 지금 내용과 같을 때만 오래 캐시한다. 요청한 v 와 실제 내용이 다르면
        // (그 사이 모임이 수정됨) 옛 URL 에 새 그림이 영구 캐시되지 않게 짧게.
        const fresh = v && v === cardVersion(s);
        const cache = fresh ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': cache,
                'Netlify-CDN-Cache-Control': fresh ? 'public, max-age=31536000, durable' : 'public, max-age=300',
            },
            body: Buffer.from(png).toString('base64'),
            isBase64Encoded: true,
        };
    } catch (e) {
        console.error('[guest-card]', id, e);
        return fallback();
    }
};
