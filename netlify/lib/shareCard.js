// 카톡 공유 카드 이미지(1200×600 PNG) 렌더러 — 게스트 모집 · 정기 모임 공용.
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

// 아래쪽 정보 칩. tone: amber(강조 금액) · green(참석) · red(불참) · 기본(회색 테두리)
const CHIP_TONE = {
    amber: { bg: C.amber, border: C.amber, color: C.bg, weight: 800 },
    green: { bg: C.green, border: '#6ed696', color: '#fff', weight: 800 },
    red: { bg: 'rgba(192,73,43,.28)', border: 'rgba(240,140,110,.65)', color: '#ffd9cc', weight: 700 },
    plain: { bg: 'rgba(255,255,255,.08)', border: 'rgba(255,255,255,.2)', color: C.paper, weight: 600 },
};
const chip = ({ text, tone = 'plain' }) => {
    const t = CHIP_TONE[tone] || CHIP_TONE.plain;
    return h({
        padding: '10px 24px', borderRadius: 999, fontSize: 28, fontWeight: t.weight,
        background: t.bg, border: `2px solid ${t.border}`, color: t.color,
    }, text);
};

// 상단 상태 칩 색
const STATUS_TONE = {
    green: { bg: 'rgba(47,143,91,.28)', border: 'rgba(110,214,150,.6)', dot: '#6ed696', color: '#cdf3da', glow: 'rgba(110,214,150,.45)' },
    red: { bg: 'rgba(192,73,43,.25)', border: 'rgba(240,140,110,.65)', dot: '#f08c6e', color: '#ffd9cc', glow: 'rgba(240,140,110,.35)' },
    gray: { bg: 'rgba(255,255,255,.08)', border: 'rgba(255,255,255,.3)', dot: '#b8bfd6', color: '#e3e6f2', glow: 'rgba(184,191,214,.25)' },
};

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

/**
 * 카드 한 장의 구성.
 * @param spec {
 *   eyebrow, status: { text, tone }, title, date, time,
 *   chips: [{ text, tone }], stamp: { text, color, glow } | null,
 *   moving: 공이 튀어 오르는 연출 여부, dim: 본문 흐림 여부(마감·완료)
 * }
 */
const cardTree = (spec) => {
    const st = STATUS_TONE[spec.status.tone] || STATUS_TONE.green;
    const dim = spec.dim ? { opacity: 0.55 } : {};

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
        // "튀어 오르는 순간"을 그린다. 마감·완료면 공이 멈춘 원래 자리 (앱 라이브 카드와 같은 의미).
        ...(spec.moving ? flyingBall() : [ball(780, 350, 170, 1, true)]),
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
        }, spec.eyebrow),
        // 본문
        h(
            {
                position: 'absolute', left: 72, top: 0, bottom: 0, width: 680,
                flexDirection: 'column', justifyContent: 'center', paddingTop: 30,
            },
            h(
                {
                    alignSelf: 'flex-start', alignItems: 'center', padding: '10px 22px', borderRadius: 999,
                    background: st.bg, border: `2px solid ${st.border}`,
                    color: st.color, fontSize: 28, fontWeight: 800,
                    boxShadow: `0 0 28px ${st.glow}`,
                },
                pulseDot(14, st.dot),
                spec.status.text,
            ),
            h({
                ...dim,
                marginTop: 22, fontSize: placeSize(spec.title), fontWeight: 800, color: '#fff',
                lineHeight: 1.12, letterSpacing: -1,
                maxWidth: 620, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',   // 620: 코트와 겹치지 않는 폭
            }, spec.title),
            h({ ...dim, marginTop: 14, fontSize: 50, fontWeight: 800, color: C.paper }, spec.date),
            h({ ...dim, marginTop: 2, fontSize: 50, fontWeight: 800, color: C.amber }, spec.time),
            h({ ...dim, marginTop: 30, gap: 12 }, ...spec.chips.map(chip)),
        ),
        // satori 는 transform 이 걸린 요소를 형제보다 먼저 칠해 공 밑에 깔린다.
        // 위치는 변형 없는 바깥 층이 잡고, 회전은 안쪽에만 건다.
        ...(spec.stamp ? [h(
            { position: 'absolute', left: 0, top: 0, width: W, height: H },
            h({ position: 'absolute', left: 640, top: 175 },
                h({
                    padding: '6px 40px', borderRadius: 20,
                    border: `10px solid ${spec.stamp.color}`, color: spec.stamp.color, background: 'rgba(23,26,51,.6)',
                    fontSize: 160, fontWeight: 800, lineHeight: 1.1, letterSpacing: 8,
                    transform: 'rotate(-12deg)', boxShadow: `0 0 40px ${spec.stamp.glow}`,
                }, spec.stamp.text)),
        )] : []),
    );
};

// 게스트 모집 (summarizeMeetup 결과 → 카드 구성)
const guestSpec = (s) => {
    const chips = [{ text: `NTRP ${s.level}` }, { text: s.type }];
    if (s.priceText) chips.push({ text: s.priceText, tone: 'amber' });
    return {
        eyebrow: 'TENNIS · GUEST',
        status: s.closed ? { text: '마감 · 대기 신청 가능', tone: 'red' } : { text: `모집중 · ${s.status}`, tone: 'green' },
        title: s.place || '게스트 모집',
        date: s.dateLong, time: s.time, chips,
        stamp: s.closed ? { text: '마감', color: '#ff5a4e', glow: 'rgba(255,90,78,.35)' } : null,
        moving: !s.closed, dim: s.closed,
    };
};

// 정기 모임 참석 체크 (summarizeMeeting 결과 → 카드 구성)
// 참석자 이름·비용은 넣지 않는다 — 링크만 있으면 누구나 볼 수 있는 미리보기라서.
const meetingSpec = (s) => {
    const chips = [{ text: `참석 ${s.attend}`, tone: 'green' }, { text: `불참 ${s.decline}`, tone: 'red' }];
    if (s.pending > 0) chips.push({ text: `미응답 ${s.pending}` });
    return {
        eyebrow: 'TENNIS · MEETING',
        status: s.completed ? { text: '완료된 모임', tone: 'gray' } : { text: '참석 · 불참 체크 중', tone: 'green' },
        title: s.title,
        date: s.dateLong, time: s.time, chips,
        stamp: s.completed ? { text: '완료', color: '#8fb3ff', glow: 'rgba(143,179,255,.35)' } : null,
        moving: !s.completed, dim: s.completed,
    };
};

// 트리에 쓰인 모든 글자 — 폰트 서브셋 요청용.
const collectText = (node, out = []) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((n) => collectText(n, out));
    else if (node?.props?.children != null) collectText(node.props.children, out);
    return out;
};

const renderTree = async (t) => {
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

/** @param s summarizeMeetup() 결과 @returns {Promise<Uint8Array>} PNG */
export const renderGuestCard = (s) => renderTree(cardTree(guestSpec(s)));

/** @param s summarizeMeeting() 결과 @returns {Promise<Uint8Array>} PNG */
export const renderMeetingCard = (s) => renderTree(cardTree(meetingSpec(s)));
