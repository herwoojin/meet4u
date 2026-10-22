// 게스트 모집 카드 이미지(1200×600 PNG) 렌더러.
//
// satori 로 레이아웃 → SVG, resvg(wasm) 로 SVG → PNG.
// 한글 폰트는 Google Fonts 에서 "이 카드에 쓰인 글자만" 잘라 받아(약 30KB)
// 함수 번들에 수 MB 짜리 폰트를 넣지 않는다.
// 디자인은 정적 배너(public/share/guest-invite.jpg)와 같은 코트·공 구성을 유지하고,
// 왼쪽 문구 자리에 실제 모임 정보를 넣는다. satori 는 이모지를 그리지 못하므로 쓰지 않는다.

import satori from 'satori';
import { SNAPSHOT_HINT } from '../../src/lib/guestSummary.js';
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
// 함수 핸들러가 Firestore 조회와 동시에 미리 불러 두도록 export (콜드 스타트 단축).
export const ensureWasm = () => {
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

// 맥박처럼 퍼지는 링을 두른 점 (정지 화면에서 "지금 살아 있음"을 표현)
// 링이 점보다 size*0.75 만큼 바깥으로 퍼지므로, 그만큼 + 여백을 두어 옆 글자와 겹치지 않게 한다.
const pulseDot = (size, color) => h(
    { position: 'relative', width: size, height: size, marginLeft: size * 0.5, marginRight: Math.round(size * 0.75 + 12) },
    h({ position: 'absolute', left: -size * 0.75, top: -size * 0.75, width: size * 2.5, height: size * 2.5,
        borderRadius: 999, border: `2px solid ${color}`, opacity: 0.35 }),
    h({ position: 'absolute', left: -size * 0.35, top: -size * 0.35, width: size * 1.7, height: size * 1.7,
        borderRadius: 999, background: color, opacity: 0.25 }),
    h({ width: size, height: size, borderRadius: 999, background: color }),
);

// 공 하나 (left/top 은 상자의 왼쪽 위, d 는 지름). ghost 면 솔기 없이 흐린 잔상.
const ball = (left, top, d, opacity, solid) => h(
    {
        position: 'absolute', left, top, width: d, height: d, borderRadius: 999, opacity,
        backgroundImage: 'radial-gradient(circle at 34% 30%, #f6fb9a 0%, #dfe955 38%, #b8c832 100%)',
        ...(solid ? { boxShadow: '0 22px 50px rgba(0,0,0,.45)' } : {}),
    },
    ...(solid ? [{ type: 'img', props: { src: BALL_SEAM, width: d, height: d } }] : []),
);

// 코트에 맞고 오른쪽 위로 튀어 오르는 순간: 바운드 자국 → 속도선 → 잔상 3개 → 공
const flyingBall = () => [
    h({ position: 'absolute', left: 640, top: 500, width: 150, height: 34, borderRadius: 999, transform: 'rotate(-14deg)',
        backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,.55), rgba(255,255,255,0))' }),
    ...[[600, 430, 190], [628, 468, 140], [664, 396, 120]].map(([left, top, w]) => h({
        position: 'absolute', left, top, width: w, height: 6, borderRadius: 3, transform: 'rotate(-32deg)',
        backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.6))',
    })),
    ball(700, 412, 110, 0.13),
    ball(742, 362, 130, 0.22),
    ball(790, 312, 150, 0.34),
    ball(842, 252, 170, 1, true),
];

const tree = (s) => {
    const statusChip = s.closed
        ? { bg: 'rgba(192,73,43,.25)', border: 'rgba(240,140,110,.65)', dot: '#f08c6e', color: '#ffd9cc', glow: 'rgba(240,140,110,.35)' }
        : { bg: 'rgba(47,143,91,.28)', border: 'rgba(110,214,150,.6)', dot: '#6ed696', color: '#cdf3da', glow: 'rgba(110,214,150,.45)' };

    // 마감이면 본문을 흐리게 하고 큰 "마감" 도장을 찍는다 (앱의 LiveGuestCard 와 같은 연출의 정지판).
    const dim = s.closed ? { opacity: 0.55 } : {};

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
        // 공 — 카톡은 이미지를 움직이게 보여주지 않으므로(GIF 도 첫 프레임만) 정지 화면 안에
        // "튀어 오르는 순간"을 그린다. 마감이면 공이 멈춘 원래 자리 (앱 라이브 카드와 같은 의미).
        ...(s.closed ? [ball(780, 350, 170, 1, true)] : flyingBall()),
        // 우상단: 이 카드는 공유 시점의 정지 화면이라는 안내 (앱 라이브 카드의 LIVE 배지 자리)
        h(
            {
                position: 'absolute', right: 36, top: 34, alignItems: 'center', padding: '10px 22px',
                borderRadius: 999, background: 'rgba(10,12,28,.78)', border: '2px solid rgba(255,255,255,.25)',
                fontSize: 28, fontWeight: 800, color: '#fff',
            },
            pulseDot(12, '#ff4d4f'),
            SNAPSHOT_HINT,
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
                    boxShadow: `0 0 28px ${statusChip.glow}`,
                },
                pulseDot(14, statusChip.dot),
                s.closed ? '마감 · 대기 신청 가능' : `모집중 · ${s.status}`,
            ),
            h({
                ...dim,
                marginTop: 22, fontSize: placeSize(s.place), fontWeight: 800, color: '#fff',
                lineHeight: 1.12, letterSpacing: -1,
                maxWidth: 620, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',   // 620: 코트와 겹치지 않는 폭
            }, s.place || '게스트 모집'),
            h({ ...dim, marginTop: 14, fontSize: 50, fontWeight: 800, color: C.paper }, s.dateLong),
            h({ ...dim, marginTop: 2, fontSize: 50, fontWeight: 800, color: C.amber }, s.time),
            h({ ...dim, marginTop: 30, gap: 12 }, ...chips),
        ),
        // satori 는 transform 이 걸린 요소를 형제보다 먼저 칠해 공 밑에 깔린다.
        // 위치는 변형 없는 바깥 층이 잡고, 회전은 안쪽에만 건다.
        ...(s.closed ? [h(
            { position: 'absolute', left: 0, top: 0, width: W, height: H },
            h({ position: 'absolute', left: 640, top: 175 },
                h({
                    padding: '6px 40px', borderRadius: 20,
                    border: '10px solid #ff5a4e', color: '#ff5a4e', background: 'rgba(23,26,51,.6)',
                    fontSize: 160, fontWeight: 800, lineHeight: 1.1, letterSpacing: 8,
                    transform: 'rotate(-12deg)', boxShadow: '0 0 40px rgba(255,90,78,.35)',
                }, '마감')),
        )] : []),
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
