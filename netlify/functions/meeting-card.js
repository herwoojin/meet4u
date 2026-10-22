// GET /.netlify/functions/meeting-card?c=<모임ID>.<버전>
// → 정기 모임의 제목·날짜·시간·참석/불참/미응답 수가 찍힌 1200×600 PNG.
//
// 카톡 공유 카드(Kakao SDK imageUrl)와 링크 미리보기(og:image)가 이 URL 을 쓴다.
// 숨김 모임·없는 ID·렌더 실패는 정적 배너로 302 — 카드에 이미지가 비는 일은 없게 한다.

import { readMeeting } from '../lib/publicDocs.js';
import { renderMeetingCard, ensureWasm } from '../lib/shareCard.js';
import { summarizeMeeting, parseMeetingParam } from '../../src/lib/meetingSummary.js';

export const handler = async (event) => {
    const raw = String(event.queryStringParameters?.c || '');
    const id = parseMeetingParam(raw);
    const v = raw.split('.')[1] || '';
    const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'k-app.click';
    const fallback = () => ({
        statusCode: 302,
        headers: { Location: `https://${host}/share/guest-invite.jpg`, 'Cache-Control': 'no-store' },
        body: '',
    });

    // 렌더 엔진(wasm)을 모임 조회와 동시에 받아 둔다.
    ensureWasm().catch(() => {});

    try {
        const m = await readMeeting(id);
        if (!m || m.hidden) return fallback();

        const s = summarizeMeeting(m, `https://${host}`);
        const png = await renderMeetingCard(s);

        // 버전이 지금 내용과 같을 때만 오래 캐시 (그 사이 참석 현황이 바뀌었으면 짧게).
        const fresh = v && v === s.version;
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': fresh ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
                'Netlify-CDN-Cache-Control': fresh ? 'public, max-age=31536000, durable' : 'public, max-age=300',
            },
            body: Buffer.from(png).toString('base64'),
            isBase64Encoded: true,
        };
    } catch (e) {
        console.error('[meeting-card]', id, e);
        return fallback();
    }
};
