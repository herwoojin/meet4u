// 게스트 모집 카드 이미지(1200×600 PNG) 렌더러.
//
// satori 로 레이아웃 → SVG, resvg(wasm) 로 SVG → PNG.
// 한글 폰트는 Google Fonts 에서 "이 카드에 쓰인 글자만" 잘라 받아(약 30KB)
// 함수 번들에 수 MB 짜리 폰트를 넣지 않는다.
// 디자인은 정적 배너(public/share/guest-invite.jpg)와 같은 코트·공 구성을 유지하고,
// 왼쪽 문구 자리에 실제 모임 정보를 넣는다. satori 는 이모지를 그리지 못하므로 쓰지 않는다.

import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';

// package.json 의 @resvg/resvg-wasm 버전과 반드시 같아야 한다(JS 글루 ↔ wasm).
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const W = 1200;
const H = 600;
const C = {
    bg: '#171a33', paper: '#f2ecdd', amber: '#e0a13c', sub: '#cfc8b6',
    green: '#2f8f5b', greenDeep: '#246f47',
};

let wasmReady = null;
const ensureWasm = () => {
    if (!wasmReady) {
        wasmReady = initWasm(fetch(WASM_URL)).catch((e) => { wasmReady = null; throw e; });
    }
    return wasmReady;
};

const fontCache = new Map();
const loadFont = async (weight, text) => {
    const key = `${weight}:${text}`;
    if (fontCache.has(key)) return fontCache.get(key);
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(cssUrl)).text();
    const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!m) throw new Error(`font css 파싱 실패 (weight ${weight})`);
    const res = await fetch(m[1]);
    if (!res.ok) throw new Error(`font 다운로드 실패 ${res.status}`);
    const data = await res.arrayBuffer();
    fontCache.set(key, data);
    return data;
};

// satori 는 JSX 대신 이 형태의 객체 트리를 받는다. 자식이 둘 이상이면 display:flex 필수.
const h = (style, ...children) => ({
    type: 'div',
    props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
});

const BALL_SEAM = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="170" height="170" viewBox="0 0 170 170">'
    + '<path d="M30 18 C 78 60, 78 110, 30 152" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".92"/>'
    + '<path d="M140 18 C 92 60, 92 110, 140 152" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".92"/>'
    + '</svg>',
).toString('base64');

// 장소명이 길수록 글자를 줄이고, 그래도 넘치면 말줄임.
const placeSize = (t) => {
    const n = [...t].length;
    if (n <= 7) return 92;
    if (n <= 10) return 76;
    if (n <= 14) return 62;
    return 54;
};

const chip = (text, strong) => h({
    padding: '10px 24px', borderRadius: 999, fontSize: 28, fontWeight: strong ? 800 : 600,
    background: strong ? C.amber : 'rgba(255,255,255,.08)',
    border: `2px solid ${strong ? C.amber : 'rgba(255,255,255,.2)'}`,
    color: strong ? C.bg : C.paper,
}, text);

const courtLine = (style) => h({ position: 'absolute', background: 'rgba(255,255,255,.28)', ...style });

const tree = (s) => {
    const statusChip = s.closed
        ? { bg: 'rgba(192,73,43,.25)', border: 'rgba(240,140,110,.65)', dot: '#f08c6e', color: '#ffd9cc' }
        : { bg: 'rgba(47,143,91,.28)', border: 'rgba(110,214,150,.6)', dot: '#6ed696', color: '#cdf3da' };

    const chips = [chip(`NTRP ${s.level}`), chip(s.type)];
    if (s.priceText) chips.push(chip(s.priceText, true));

    return h(
        {
            position: 'relative', width: W, height: H, overflow: 'hidden',
            background: C.bg, fontFamily: 'Noto Sans KR',
            backgroundImage: 'radial-gradient(70% 90% at 82% 50%, rgba(47,143,91,.38), rgba(23,26,51,0) 70%)',
        },
        // 코트 (위에서 내려다본 모습, 오른쪽에 비스듬히)
        h(
            {
                position: 'absolute', right: -110, top: 70, width: 560, height: 460,
                transform: 'rotate(-14deg)', borderRadius: 6,
                border: '5px solid rgba(255,255,255,.22)',
                backgroundImage: `linear-gradient(160deg, ${C.green} 0%, ${C.greenDeep} 100%)`,
            },
            courtLine({ left: 0, right: 0, top: 223, height: 5, background: 'rgba(255,255,255,.55)' }),
            courtLine({ left: 62, top: 0, bottom: 0, width: 4 }),
            courtLine({ right: 62, top: 0, bottom: 0, width: 4 }),
            courtLine({ left: 62, right: 62, top: 120, height: 4 }),
            courtLine({ left: 62, right: 62, bottom: 120, height: 4 }),
            courtLine({ left: 273, top: 120, bottom: 120, width: 4 }),
        ),
        // 공
        h(
            {
                position: 'absolute', right: 250, top: 350, width: 170, height: 170, borderRadius: 999,
                backgroundImage: 'radial-gradient(circle at 34% 30%, #f6fb9a 0%, #dfe955 38%, #b8c832 100%)',
                boxShadow: '0 22px 50px rgba(0,0,0,.45)',
            },
            { type: 'img', props: { src: BALL_SEAM, width: 170, height: 170 } },
        ),
        // 상단 브랜드 라벨
        h({
            position: 'absolute', left: 72, top: 44, fontSize: 22, fontWeight: 800,
            letterSpacing: 6, color: C.amber,
        }, 'TENNIS · GUEST'),
        // 본문
        h(
            {
                position: 'absolute', left: 72, top: 0, bottom: 0, width: 680,
                flexDirection: 'column', justifyContent: 'center', paddingTop: 30,
            },
            h(
                {
                    alignSelf: 'flex-start', alignItems: 'center', padding: '10px 22px', borderRadius: 999,
                    background: statusChip.bg, border: `2px solid ${statusChip.border}`,
                    color: statusChip.color, fontSize: 28, fontWeight: 800,
                },
                h({ width: 14, height: 14, borderRadius: 999, background: statusChip.dot, marginRight: 12 }),
                s.closed ? '마감 · 대기 신청 가능' : `모집중 · ${s.status}`,
            ),
            h({
                marginTop: 22, fontSize: placeSize(s.place), fontWeight: 800, color: '#fff',
                lineHeight: 1.12, letterSpacing: -1,
                maxWidth: 620, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',   // 620: 코트와 겹치지 않는 폭
            }, s.place || '게스트 모집'),
            h({ marginTop: 14, fontSize: 50, fontWeight: 800, color: C.paper }, s.dateLong),
            h({ marginTop: 2, fontSize: 50, fontWeight: 800, color: C.amber }, s.time),
            h({ marginTop: 30, gap: 12 }, ...chips),
        ),
    );
};

// 트리에 쓰인 모든 글자 — 폰트 서브셋 요청용.
const collectText = (node, out = []) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((n) => collectText(n, out));
    else if (node?.props?.children != null) collectText(node.props.children, out);
    return out;
};

/** @param s summarizeMeetup() 결과 @returns {Promise<Uint8Array>} PNG */
export const renderGuestCard = async (s) => {
    const t = tree(s);
    // '…' 는 satori 가 말줄임할 때 스스로 넣는 글자라 트리에 없다 → 서브셋에 직접 추가.
    const chars = Array.from(new Set(collectText(t).join('') + '…')).join('');
    const [bold, semi] = await Promise.all([loadFont(800, chars), loadFont(600, chars), ensureWasm()]);
    const svg = await satori(t, {
        width: W,
        height: H,
        fonts: [
            { name: 'Noto Sans KR', data: bold, weight: 800, style: 'normal' },
            { name: 'Noto Sans KR', data: semi, weight: 600, style: 'normal' },
        ],
    });
    return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
};
