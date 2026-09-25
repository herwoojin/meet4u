// 예약 완료 문자 스크린샷 → 미팅 데이터 자동 추출
//
// 두 가지 엔진을 지원한다.
//   1) Tesseract.js  — 완전 무료 · 오프라인 · API 키 불필요.
//                      한글 인식률이 완벽하진 않지만 숫자/날짜는 잘 잡는다.
//   2) Gemini Vision — 사용자 개인 API 키(useGeminiApiKey) 사용. 무료 티어로
//                      충분하며 구조화 추출까지 한 번에 해서 정확도가 훨씬 높다.
//
// 기본 전략: Gemini 키가 있으면 Gemini 우선, 없으면 Tesseract.
//            Tesseract 결과가 0건이면 사용자에게 Gemini 안내.

// ---------------------------------------------------------------------------
// 1. Tesseract.js (무료 · 클라이언트 사이드)
// ---------------------------------------------------------------------------

// tesseract.js 는 번들이 크므로 실제 사용 시점에만 동적 import 한다.
export const ocrWithTesseract = async (file, onProgress) => {
    const { createWorker } = await import('tesseract.js');
    // kor+eng 동시 인식. 첫 실행 시 언어 데이터(약 15MB)를 CDN 에서 받아
    // IndexedDB 에 캐시하므로 두 번째부터는 빠르다.
    const worker = await createWorker(['kor', 'eng'], 1, {
        logger: (m) => {
            if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                onProgress?.(m.progress);
            }
        },
    });
    try {
        const { data } = await worker.recognize(file);
        return data.text || '';
    } finally {
        await worker.terminate();
    }
};

// ---------------------------------------------------------------------------
// 2. Gemini Vision (사용자 개인 키 · 무료 티어)
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
];

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.split(',')[1] || '');   // data:image/png;base64,XXXX → XXXX
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const VISION_PROMPT = `이 이미지는 테니스 코트 등 시설 "예약 완료" 문자메시지 스크린샷입니다.
이미지 안의 모든 예약 건을 찾아 JSON 배열로만 응답하세요.

각 원소 형식:
{"title":"코트명","date":"YYYY-MM-DD","startTime":"HH:mm","endTime":"HH:mm"}

규칙:
- title 은 코트/시설 이름 그대로 (예: "충장 2번 코트").
- 시간은 반드시 24시간 두 자리 형식. 6:00 → "06:00".
- 날짜가 연도 없이 나오면 올해로 가정.
- "예약이 완료되었습니다" 같은 완료 문구가 있는 건만 추출.
- 취소/대기/실패 메시지는 제외.
- 같은 내용이 중복되면 한 번만.
- 마크다운 코드블록 없이 JSON 배열 원문만 출력.
- 예약 건이 없으면 [] 만 출력.`;

export const ocrWithGemini = async (file, apiKey) => {
    if (!apiKey) throw new Error('Gemini API 키가 필요합니다.');
    const base64 = await fileToBase64(file);
    const body = {
        contents: [{
            parts: [
                { text: VISION_PROMPT },
                { inline_data: { mime_type: file.type || 'image/png', data: base64 } },
            ],
        }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    };

    let lastErr = '';
    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            const data = await res.json();
            const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return normalizeGeminiResult(raw);
        }
        lastErr = await res.text().catch(() => '');
        // 404(모델 없음) 만 다음 모델로. 인증/쿼터 오류는 즉시 중단.
        if (!(res.status === 404 || /not found|NOT_FOUND/i.test(lastErr))) break;
    }
    throw new Error(`Gemini 요청 실패: ${lastErr.slice(0, 200)}`);
};

const normalizeGeminiResult = (raw) => {
    let txt = String(raw || '').trim();
    // 혹시 코드블록으로 감싸 왔으면 벗겨낸다.
    txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let arr;
    try {
        arr = JSON.parse(txt);
    } catch {
        // 배열 부분만 도려내 재시도
        const m = txt.match(/\[[\s\S]*\]/);
        if (!m) return [];
        try { arr = JSON.parse(m[0]); } catch { return []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr.map(sanitizeItem).filter(Boolean);
};

// ---------------------------------------------------------------------------
// 3. 텍스트 파서 (Tesseract 결과용)
// ---------------------------------------------------------------------------

// "2026-08-30 / 6:00 ~ 8:00" 같은 조합을 한 번에 잡는다.
// OCR 노이즈를 감안해 구분자를 넉넉히 허용.
const DATE_TIME_RE = new RegExp(
    [
        '(\\d{4})\\s*[-./년]\\s*(\\d{1,2})\\s*[-./월]\\s*(\\d{1,2})\\s*일?',  // 날짜
        '[\\s/·|,]*',                                                          // 구분자
        '(\\d{1,2})\\s*[:;：]\\s*(\\d{2})',                                    // 시작
        '\\s*[~\\-–—〜]+\\s*',                                                 // 물결
        '(\\d{1,2})\\s*[:;：]\\s*(\\d{2})',                                    // 종료
    ].join(''),
    'g'
);

const pad2 = (n) => String(n).padStart(2, '0');

// 날짜 앞쪽 텍스트에서 코트명을 추려낸다.
// 예) "[Web발신] 충장 2번 코트 2026-08-30 ..." → "충장 2번 코트"
const extractTitle = (before) => {
    let s = String(before || '')
        .replace(/\[?\s*web\s*발신\s*\]?/gi, ' ')
        .replace(/오[전후]\s*\d{1,2}:\d{2}/g, ' ')          // 카톡/문자 타임스탬프
        .replace(/\d+월\s*\d+일\s*[월화수목금토일]요일/g, ' ') // 날짜 구분선
        .replace(/예약이?\s*완료\s*되?었?습?니?다?\.?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!s) return '';
    // 뒤에서부터 한글이 포함된 마지막 덩어리를 코트명으로 본다.
    const chunks = s.split(' ').filter(Boolean);
    const out = [];
    for (let i = chunks.length - 1; i >= 0; i--) {
        const c = chunks[i];
        out.unshift(c);
        // 한글이 들어간 토큰을 만나고, 3토큰 이상 모였으면 충분
        if (/[가-힣]/.test(c) && out.length >= 3) break;
        if (out.length >= 5) break;
    }
    return out.join(' ').trim().slice(0, 40);
};

/**
 * OCR 로 얻은 평문에서 예약 건들을 추출한다.
 * @param {string} text
 * @returns {Array<{title,date,startTime,endTime}>}
 */
export const parseReservations = (text) => {
    const src = String(text || '').replace(/\r/g, '\n');
    // 줄바꿈이 어디서든 끊길 수 있으므로 공백으로 평탄화해서 매칭
    const flat = src.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');

    const results = [];
    let lastIndex = 0;
    let m;
    DATE_TIME_RE.lastIndex = 0;

    while ((m = DATE_TIME_RE.exec(flat)) !== null) {
        const [, y, mo, d, sh, sm, eh, em] = m;
        const before = flat.slice(lastIndex, m.index);
        lastIndex = m.index + m[0].length;

        const item = sanitizeItem({
            title: extractTitle(before),
            date: `${y}-${pad2(mo)}-${pad2(d)}`,
            startTime: `${pad2(sh)}:${sm}`,
            endTime: `${pad2(eh)}:${em}`,
        });
        if (item) results.push(item);
    }
    return dedupe(results);
};

// ---------------------------------------------------------------------------
// 4. 공통 정규화 / 중복 제거
// ---------------------------------------------------------------------------

const sanitizeItem = (raw) => {
    if (!raw || typeof raw !== 'object') return null;

    const dateM = String(raw.date || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!dateM) return null;
    const date = `${dateM[1]}-${pad2(dateM[2])}-${pad2(dateM[3])}`;

    const toHHmm = (v) => {
        const t = String(v || '').match(/(\d{1,2})\D+(\d{2})/);
        if (!t) return '';
        const h = Number(t[1]);
        if (h < 0 || h > 23) return '';
        return `${pad2(h)}:${t[2]}`;
    };
    const startTime = toHHmm(raw.startTime);
    const endTime = toHHmm(raw.endTime);
    if (!startTime || !endTime) return null;

    const title = String(raw.title || '').replace(/\s+/g, ' ').trim().slice(0, 40)
                  || '예약된 일정';

    return { title, date, startTime, endTime };
};

const dedupe = (list) => {
    const seen = new Set();
    return list.filter((it) => {
        const key = `${it.date}|${it.startTime}|${it.endTime}|${it.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

// ---------------------------------------------------------------------------
// 5. 기본값 상수 (UI 와 공유)
// ---------------------------------------------------------------------------

export const DEFAULT_RENTAL_COST = 10000;
export const AUTO_DESCRIPTION =
    '자동 등록 되었습니다. 예약비용을 확인해 주세요.';
