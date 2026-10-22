// GET /?guest=<모임ID>.<버전>  (public/_redirects 의 쿼리 매칭 규칙으로 들어온다)
//
// 링크를 카톡·밴드·문자에 붙여넣으면 각 서비스가 이 주소의 og 태그를 읽어
// 미리보기 카드를 만든다. SPA 의 index.html 은 모든 페이지가 같은 og 태그를
// 쓰므로, 이 함수가 index.html 을 받아 그 모임의 제목·일시·금액·카드 이미지로
// og 태그만 바꿔 돌려준다. 사람이 열면 그대로 앱이 뜨고 main.jsx 가
// ?guest= 를 읽어 해당 모임 팝업을 연다.
//
// 어떤 단계가 실패해도 앱 진입은 막지 않는다: og 교체 실패 → 원본 index.html,
// index.html 조차 못 받으면 → 해시 딥링크로 302.

import { readGuestMeetup } from '../lib/guestMeetupStore.js';
import { summarizeMeetup, guestCardImageUrl, parseGuestParam, SNAPSHOT_HINT } from '../../src/lib/guestSummary.js';

const esc = (v) => String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const setMeta = (html, attr, key, value) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
    return re.test(html)
        ? html.replace(re, `$1${esc(value)}$2`)
        : html.replace('</head>', `  <meta ${attr}="${key}" content="${esc(value)}">\n</head>`);
};

export const injectGuestOg = (html, m, origin) => {
    const s = summarizeMeetup(m, origin);
    const title = `🎾 ${s.place} 게스트 모집${s.closed ? ' (마감)' : ''}`;
    // 안내 문구는 맨 뒤 — 카톡 미리보기는 설명이 2줄에서 잘려 앞쪽의 실제 모집 내용이 우선.
    // (안내는 카드 이미지 우상단에 크게 들어가 있다)
    const desc = [`${s.dateLong} ${s.time}`, `NTRP ${s.level}`, s.type, s.status, s.priceText, SNAPSHOT_HINT]
        .filter(Boolean).join(' · ');
    const image = guestCardImageUrl(origin, s);

    let out = html;
    out = setMeta(out, 'property', 'og:title', title);
    out = setMeta(out, 'property', 'og:description', desc);
    out = setMeta(out, 'property', 'og:image', image);
    out = setMeta(out, 'property', 'og:image:width', '1200');
    out = setMeta(out, 'property', 'og:image:height', '600');
    out = setMeta(out, 'property', 'og:url', s.url);
    out = setMeta(out, 'name', 'twitter:image', image);
    return out;
};

export const handler = async (event) => {
    // ?guest=<id>.<버전> — 버전은 카톡 캐시용이라 조회에는 ID 만 쓴다.
    const id = parseGuestParam(event.queryStringParameters?.guest);
    const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'k-app.click';
    const origin = `https://${host}`;

    let html;
    try {
        const r = await fetch(`${origin}/index.html`);
        if (!r.ok) throw new Error(`index.html ${r.status}`);
        html = await r.text();
    } catch (e) {
        console.error('[guest-og] index.html', e);
        return {
            statusCode: 302,
            headers: { Location: `${origin}/#/guest-meetups?open=${encodeURIComponent(id)}` },
            body: '',
        };
    }

    try {
        const m = await readGuestMeetup(id);
        if (m) html = injectGuestOg(html, m, origin);
    } catch (e) {
        console.error('[guest-og] meetup', id, e);
    }

    return {
        statusCode: 200,
        // 배포 후 옛 index.html(옛 에셋 해시)이 남지 않도록 캐시하지 않는다.
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
        body: html,
    };
};
