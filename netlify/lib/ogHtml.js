// Netlify 함수 공용 — SPA 의 index.html 을 받아 og 태그만 바꿔 돌려준다.
//
// 링크를 카톡·밴드·문자에 붙여넣으면 각 서비스가 그 주소의 og 태그로 미리보기 카드를
// 만든다. SPA 는 모든 페이지가 같은 og 태그를 쓰므로, 공유 링크(/?guest= · /?meeting=)만
// 함수가 받아 해당 문서의 내용으로 바꿔 준다. 사람이 열면 그대로 앱이 뜬다.

const esc = (v) => String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const setMeta = (html, attr, key, value) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
    return re.test(html)
        ? html.replace(re, `$1${esc(value)}$2`)
        : html.replace('</head>', `  <meta ${attr}="${key}" content="${esc(value)}">\n</head>`);
};

/** og 태그 교체. 값은 모두 HTML 이스케이프된다(제목에 < > " 가 있어도 안전). */
export const injectOg = (html, { title, description, image, url }) => {
    let out = html;
    out = setMeta(out, 'property', 'og:title', title);
    out = setMeta(out, 'property', 'og:description', description);
    out = setMeta(out, 'property', 'og:image', image);
    out = setMeta(out, 'property', 'og:image:width', '1200');
    out = setMeta(out, 'property', 'og:image:height', '600');
    out = setMeta(out, 'property', 'og:url', url);
    out = setMeta(out, 'name', 'twitter:image', image);
    return out;
};

export const originOf = (event) =>
    `https://${event.headers?.['x-forwarded-host'] || event.headers?.host || 'k-app.click'}`;

/**
 * index.html 을 받아 og 를 바꿔 응답. 어떤 단계가 실패해도 앱 진입은 막지 않는다:
 * og 교체 실패 → 원본 index.html, index.html 조차 못 받으면 → fallbackLocation 으로 302.
 * @param buildOg async () => ({ title, description, image, url }) | null
 */
export const respondWithOg = async (origin, buildOg, fallbackLocation, logTag) => {
    let html;
    try {
        const r = await fetch(`${origin}/index.html`);
        if (!r.ok) throw new Error(`index.html ${r.status}`);
        html = await r.text();
    } catch (e) {
        console.error(`[${logTag}] index.html`, e);
        return { statusCode: 302, headers: { Location: fallbackLocation }, body: '' };
    }
    try {
        const og = await buildOg();
        if (og) html = injectOg(html, og);
    } catch (e) {
        console.error(`[${logTag}] og`, e);
    }
    return {
        statusCode: 200,
        // 배포 후 옛 index.html(옛 에셋 해시)이 남지 않도록 캐시하지 않는다.
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
        body: html,
    };
};
