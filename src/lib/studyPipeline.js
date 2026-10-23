// 언어 공부(챗.첵 문법 분석 팝업) — 문장 단위로 원문 · 번역 · 발음 · 단어를 정확히 맞춘다.
//
// 예전 방식에서 실제로 확인된 문제:
//  · 번역 전체를 구두점으로 잘라, 원문과 개수가 안 맞으면 한국어를 '역번역'해서 채웠다
//    → 원문이 바뀌어 보였다 (허우진 → 호진).
//  · 전체 발음을 글자 수 비율로 잘라 문장마다 나눴다 → 앞 문장 끝이 다음 문장에 붙었다.
//  · 중국어는 2글자씩 기계적으로 끊고(很高/兴见, Re/ta/il), 일본어는 단어 속 조사 글자에서
//    끊었다(とて/も, で/す). 품사는 위치로 추측(첫 단어=주어…), 뜻은 문맥 없는 한 단어 번역.
//  · 영어 발음을 철자대로 한글로 적었다(nice → 니세).
//
// 새 방식:
//  1) 원문을 단락(빈 줄) → 문장으로 나눈다. 문장 중간에서는 절대 자르지 않는다.
//  2) 문장마다 따로 번역하고 같은 요청으로 그 문장의 발음(병음·로마자)을 받는다 → 어긋날 수 없다.
//  3) 단어는 브라우저 내장 사전 분절(Intl.Segmenter)로 나누고, 일본어는 활용 어미를 다시 붙인다.
//  4) 단어 뜻은 사전 모드로 품사 · 대표 뜻 · 다른 뜻을 받는다(제공되는 언어쌍). 조사·기능어는 정리된 설명.
//  5) 영어처럼 철자와 발음이 다른 언어는 한글 발음을 지어내지 않고 🔊 듣기로 대신한다.

import { PARTICLE_INFO as JA_PARTICLE_INFO, ZH_FUNC_WORDS } from './grammar.js';
import { pinyinToHangul, romajiToHangul, latinToHangul, isNonLatinScript } from './phonetics.js';

const baseOf = (l) => String(l || '').split('-')[0].toLowerCase();
const GTX = 'https://translate.googleapis.com/translate_a/single';
const cache = new Map();

/** 구글 번역(gtx) 한 번 호출 — 번역문 · 발음(병음/로마자) · 사전 항목. 같은 요청은 캐시. */
export const gtx = (q, sl, tl, dts = ['t']) => {
    const key = `${sl}>${tl}|${dts.join(',')}|${q}`;
    if (cache.has(key)) return cache.get(key);
    const p = (async () => {
        const url = `${GTX}?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&hl=ko&${dts.map((d) => `dt=${d}`).join('&')}&q=${encodeURIComponent(q)}`;
        // 비공식 엔드포인트라 동시에 많이 부르면 가끔 실패한다 → 잠깐 쉬었다 두 번까지 다시
        let d = null;
        for (let attempt = 0; attempt < 3 && !d; attempt++) {
            if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
            try {
                const res = await fetch(url);
                if (res.ok) d = await res.json();
            } catch (_) { /* 다시 시도 */ }
        }
        if (!d) throw new Error('translate failed');
        const rows = Array.isArray(d?.[0]) ? d[0] : [];
        const text = rows.filter((r) => r && typeof r[0] === 'string').map((r) => r[0]).join('').trim();
        const rm = rows.find((r) => r && r[0] == null && (r[2] || r[3]));     // [null, null, 번역문 발음, 원문 발음]
        const dict = Array.isArray(d?.[1])
            ? d[1].map((e) => ({ pos: e?.[0] || '', terms: Array.isArray(e?.[1]) ? e[1] : [] })).filter((e) => e.terms.length)
            : [];
        return { text, targetRoman: rm?.[2] || '', sourceRoman: rm?.[3] || '', dict };
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    return p;
};

// ---------------------------------------------------------------------------
// 단락 · 문장 나누기
// ---------------------------------------------------------------------------
const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';

export const splitSentences = (line, lang) => {
    if (hasSegmenter) {
        try {
            return [...new Intl.Segmenter(lang || 'ko', { granularity: 'sentence' }).segment(line)]
                .map((s) => s.segment.trim()).filter(Boolean);
        } catch (_) { /* 지원 안 하는 언어 태그 → 아래 */ }
    }
    return line.split(/(?<=[.!?。！？])\s+/).map((s) => s.trim()).filter(Boolean);
};

/** 빈 줄로 단락을 나누고, 단락 안의 줄바꿈도 문장 경계로 본다(채팅은 한 줄이 한 생각인 경우가 많다). */
export const splitParagraphs = (text, lang) =>
    String(text || '').replace(/\r/g, '').split(/\n\s*\n+/)
        .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => splitSentences(l, lang)))
        .filter((p) => p.length);

// ---------------------------------------------------------------------------
// 단어 나누기
// ---------------------------------------------------------------------------
const JA_PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'や', 'か', 'ね', 'よ', 'な',
    'から', 'まで', 'より', 'には', 'では', 'とは', 'でも', 'けど', 'ので', 'のに', 'など', 'だけ']);
const JA_COPULA = { 'です': '정중한 서술 — ~입니다', 'でした': '정중한 과거 — ~이었습니다', 'だ': '반말 서술 — ~이다',
    'だった': '반말 과거 — ~이었다', 'でしょう': '추측 — ~이겠지요', 'である': '문어체 서술 — ~이다' };
// 활용 어미로 착각해 앞 단어에 붙이면 안 되는 독립 히라가나 단어
const JA_STANDALONE = new Set(['とても', 'もう', 'まだ', 'よく', 'いい', 'すごく', 'もっと', 'ちょっと', 'たくさん', 'いつも',
    'また', 'さらに', 'ぜひ', 'どう', 'なに', 'なぜ', 'こと', 'もの', 'ところ', 'ため', 'よう', 'ありがとう', 'こんにちは',
    'すみません', 'はい', 'いいえ', 'これ', 'それ', 'あれ', 'ここ', 'そこ', 'この', 'その', 'あの', 'みんな', 'わたし',
    'あなた', 'しかし', 'そして', 'だから', 'けれども', 'ください']);
const JA_AUX_JOIN = ['ございます', 'ございました', 'ください', 'でしょう', 'ません', 'ました', 'ましょう', 'でした'];

/** ICU 는 일본어 활용을 잘게 쪼갠다(嬉/しか/っ/た, ご/ざ/い/ます) → 학습 단위로 다시 붙인다. */
export const mergeJapanese = (segs) => {
    const out = [];
    for (let i = 0; i < segs.length; i++) {
        let s = segs[i];
        for (const ph of JA_AUX_JOIN) {                      // ご+ざ+い+ます → ございます
            if (s === ph || !ph.startsWith(s)) continue;
            let acc = s, j = i;
            while (acc.length < ph.length && j + 1 < segs.length && ph.startsWith(acc + segs[j + 1])) { j++; acc += segs[j]; }
            if (acc === ph) { s = acc; i = j; break; }
        }
        const prev = out[out.length - 1];
        const isHira = /^[ぁ-ゟ]+$/.test(s);
        const prevStem = prev && !prev.fn && (/[一-鿿々ァ-ヿ]/.test(prev.text) || prev.inflected);
        if (isHira && prevStem && !JA_PARTICLES.has(s) && !JA_COPULA[s] && !JA_STANDALONE.has(s)) {
            prev.text += s; prev.inflected = true; continue;  // 会+って, 嬉+しか+っ+た, 担当+し+て+いる
        }
        if (prev && !prev.fn && /^ございま(す|した)$/.test(s)) { prev.text += s; continue; }   // ありがとう+ございます
        out.push({ text: s, fn: JA_PARTICLES.has(s) || Boolean(JA_COPULA[s]), inflected: false });
    }
    return out.map((x) => x.text);
};

const ZH_PRONOUNS = ['我们', '你们', '他们', '她们', '咱们', '我', '你', '他', '她', '它', '您'];
const splitChinese = (segs) => segs.flatMap((s) => {
    const pr = ZH_PRONOUNS.find((p) => s.startsWith(p) && s.length > p.length);
    const rest = pr && s.slice(pr.length);
    return pr && (rest === '是' || ZH_FUNC_WORDS[rest]) ? [pr, rest] : [s];
});

export const segmentWords = (sentence, lang) => {
    let segs = null;
    if (hasSegmenter) {
        try {
            segs = [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(sentence)]
                .filter((s) => s.isWordLike).map((s) => s.segment);
        } catch (_) { segs = null; }
    }
    if (!segs) {
        segs = sentence.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
    }
    if (baseOf(lang) === 'ja') return mergeJapanese(segs);
    if (baseOf(lang) === 'zh') return splitChinese(segs);
    return segs;
};

// ---------------------------------------------------------------------------
// 발음 · 단어 정보
// ---------------------------------------------------------------------------
/** { roman, hangul, audioOnly } — 영어는 철자와 발음이 달라 한글로 적지 않고 듣기만 */
export const readingFor = (lang, text, roman) => {
    const b = baseOf(lang);
    if (b === 'en') return { roman: '', hangul: '', audioOnly: true };
    if (b === 'zh') return { roman, hangul: roman ? pinyinToHangul(roman) : '' };
    if (b === 'ja') return { roman, hangul: roman ? romajiToHangul(roman) : '' };
    if (isNonLatinScript(lang)) return { roman, hangul: '' };
    return { roman: '', hangul: text ? latinToHangul(text, lang) : '' };   // 스페인어·베트남어 등 철자대로 읽는 언어
};

// 영어: 사전의 대표 뜻이 문맥과 자주 어긋나는 기능어 (so → "그래서" 로만 나오던 문제 등)
const EN_FUNC = {
    the: '정관사 — 특정한 것을 가리킴 (보통 따로 해석하지 않음)',
    a: '부정관사 — "하나의" (보통 따로 해석하지 않음)', an: '부정관사 — "하나의" (모음 앞)',
    to: 'to + 동사 = to부정사 "~하는 것/~하기 위해", to + 명사 = 전치사 "~에게/~로"',
    so: '부사 "정말·그렇게" (so nice = 정말 좋은) / 접속사 "그래서"',
    since: '접속사 "~이므로·~이래로" / 전치사 "~이래로"',
    that: '관계대명사·접속사 "~하는/~라는" / 지시어 "저것"',
    is: 'be동사 현재 — ~이다/~있다', am: 'be동사 현재(I) — ~이다', are: 'be동사 현재 — ~이다/~있다',
    was: 'be동사 과거 — ~였다', were: 'be동사 과거 — ~였다', be: 'be동사 원형 — ~이다/~되다', been: 'be동사 과거분사',
    "don't": 'do not — ~하지 않다 (부정)', "doesn't": 'does not — ~하지 않다 (부정)', "didn't": 'did not — ~하지 않았다',
    will: '조동사 — ~할 것이다 (미래)', can: '조동사 — ~할 수 있다', would: '조동사 — ~할 것이다/~하고 싶다(정중)',
    should: '조동사 — ~해야 한다', could: '조동사 — ~할 수 있었다/~해도 될까요(정중)',
    of: '전치사 — ~의', in: '전치사 — ~에(서)/~안에', on: '전치사 — ~위에/~에', at: '전치사 — ~에(지점·시각)',
    for: '전치사 — ~을 위해/~에게', with: '전치사 — ~와 함께/~로', and: '접속사 — 그리고', but: '접속사 — 하지만',
    or: '접속사 — 또는', if: '접속사 — 만약 ~라면', because: '접속사 — ~때문에',
    it: '대명사 — 그것 (It was … 처럼 뜻 없이 자리만 채우는 경우도 많음)',
    i: '대명사 — 나(는)', you: '대명사 — 너·당신 (주어/목적어 둘 다)', my: '소유격 — 나의',
};
// 영어 숙어 — 문장에 있으면 카드에 따로 보여 준다
export const EN_PHRASES = [
    ['in charge of', '~을 담당하는 · 책임지는'], ['nice to meet you', '만나서 반가워요'],
    ['look forward to', '~을 기대하다'], ['looking forward to', '~을 기대하고 있다'], ['take care of', '~을 돌보다 · 처리하다'],
    ['in order to', '~하기 위해'], ['as well as', '~뿐만 아니라'], ['a lot of', '많은'], ['thank you', '고맙습니다'],
    ['what to', '무엇을 ~할지'], ['how to', '~하는 방법'], ['so that', '~하도록'], ['as soon as', '~하자마자'],
];

export const findPhrases = (sentence, lang) => {
    if (baseOf(lang) !== 'en') return [];
    const s = ` ${String(sentence).toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ')} `;
    return EN_PHRASES.filter(([ph]) => s.includes(` ${ph} `)).map(([phrase, meaning]) => ({ phrase, meaning }));
};

export const functionNote = (word, lang) => {
    const b = baseOf(lang);
    if (b === 'en' && EN_FUNC[word.toLowerCase()]) return EN_FUNC[word.toLowerCase()];
    if (b === 'ja' && JA_PARTICLE_INFO[word]) return `조사 · ${JA_PARTICLE_INFO[word].role} — ${JA_PARTICLE_INFO[word].detail}`;
    if (b === 'ja' && JA_COPULA[word]) return `조동사 · ${JA_COPULA[word]}`;
    if (b === 'zh' && ZH_FUNC_WORDS[word]) return `${ZH_FUNC_WORDS[word].role} — ${ZH_FUNC_WORDS[word].detail}`;
    return '';
};

/** 단어 → { meaning, pos[], alts[], reading, note } */
export const lookupWord = async (word, lang) => {
    const note = functionNote(word, lang);
    if (baseOf(lang) === 'ko') return { meaning: '', pos: [], alts: [], reading: null, note };
    // 영어 기능어는 사전의 대표 뜻이 문맥과 어긋나기 쉬워(the → 그만큼) 문맥 설명만 보여 준다
    if (baseOf(lang) === 'en' && EN_FUNC[word.toLowerCase()]) return { meaning: '', pos: [], alts: [], reading: null, note };
    const r = await gtx(word, lang, 'ko', ['t', 'bd', 'rm']);
    // 일본어 조사도 단독 번역은 엉뚱하다(と → 그리고) — 읽기는 두고 뜻은 조사 설명으로 대신한다
    if (baseOf(lang) === 'ja' && JA_PARTICLES.has(word)) {
        return { meaning: '', pos: [], alts: [], reading: readingFor(lang, word, r.sourceRoman), note };
    }
    const meaning = r.text.replace(/[.。]$/, '');
    const pos = [...new Set(r.dict.map((d) => d.pos).filter(Boolean))].slice(0, 2);
    const alts = [...new Set(r.dict.flatMap((d) => d.terms))].filter((t) => t && t !== meaning).slice(0, 5);
    const reading = isNonLatinScript(lang) ? readingFor(lang, word, r.sourceRoman) : null;
    return { meaning, pos, alts, reading, note };
};

// ---------------------------------------------------------------------------
// 전체 조립
// ---------------------------------------------------------------------------
const pool = async (items, n, fn) => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (next < items.length) { const i = next++; await fn(items[i], i); }
    }));
};

/**
 * @param text           공부할 언어로 된 문장(번역문 또는 원문)
 * @param lang           공부할 언어
 * @param koreanOriginal 한국어 원문이 있으면 원문 문장마다 번역해 짝을 맞춘다(paired)
 * @param onUpdate       진행되는 대로 모델을 넘겨 화면이 바로 채워지게
 */
export const buildStudy = async ({ text, lang, koreanOriginal }, onUpdate) => {
    const paired = Boolean(koreanOriginal);
    const srcLang = paired ? 'ko' : lang;
    let n = 0;
    const model = {
        lang, paired, done: false,
        paragraphs: splitParagraphs(paired ? koreanOriginal : text, srcLang).map((p) => p.map((s) => ({
            idx: n++, source: s, target: paired ? '' : s, meaningKo: '', reading: null, words: [], phrases: [], error: false,
        }))),
    };
    const snapshot = () => ({ ...model, paragraphs: model.paragraphs.map((p) => p.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) }))) });
    const emit = () => onUpdate?.(snapshot());
    emit();
    const cards = model.paragraphs.flat();

    // 1) 문장마다 따로 번역 + 그 문장의 발음
    await pool(cards, 4, async (c) => {
        try {
            if (paired) {
                const r = await gtx(c.source, 'ko', lang, ['t', 'rm']);
                // 짧은 인사는 소문자로 오기도 한다(안녕하세요. → hello.) — 문장 첫 글자는 대문자로
                c.target = r.text.replace(/^\p{Ll}/u, (ch) => ch.toUpperCase());
                c.reading = readingFor(lang, c.target, r.targetRoman);
            } else if (baseOf(lang) === 'ko') {
                const r = await gtx(c.source, 'ko', 'en', ['t', 'rm']);
                c.reading = { roman: r.sourceRoman, hangul: '' };
            } else {
                const r = await gtx(c.source, lang, 'ko', ['t', 'rm']);
                c.meaningKo = r.text;
                c.reading = readingFor(lang, c.target, r.sourceRoman);
            }
        } catch (_) {
            c.error = true;
            if (!c.target) c.target = '';
        }
        c.words = c.target ? segmentWords(c.target, lang).map((w) => ({ text: w, info: null })) : [];
        emit();
    });

    // 2) 단어 뜻 — 같은 단어는 한 번만 조회
    const all = cards.flatMap((c) => c.words);
    const uniq = [...new Set(all.map((w) => w.text))];
    let pending = 0;
    await pool(uniq, 4, async (w) => {
        let info;
        try { info = await lookupWord(w, lang); } catch (_) { info = { meaning: '', pos: [], alts: [], reading: null, note: functionNote(w, lang) }; }
        all.forEach((x) => { if (x.text === w) x.info = info; });
        if (++pending % 4 === 0) emit();      // 너무 잦은 다시 그리기 방지
    });
    // 일본어: 구글의 문장 로마자는 조사 は 를 ha 로 적고 띄어쓰기가 없다(Watashinonamaeha…)
    // → 단어별 발음이 다 있으면 그것을 이어 문장 발음으로 쓴다(watashi no namae wa …).
    if (baseOf(lang) === 'ja') {
        cards.forEach((c) => {
            const romans = c.words.map((w) => (w.info?.reading?.roman || '').toLowerCase());
            if (romans.length && romans.every(Boolean)) {
                const joined = romans.join(' ');
                c.reading = readingFor(lang, c.target, joined.charAt(0).toUpperCase() + joined.slice(1));
            }
        });
    }
    // 숙어: 카드에 모아 보여 주고, 숙어를 이루는 내용어에도 표시 (charge → in charge of)
    cards.forEach((c) => {
        c.phrases = findPhrases(c.target, lang);
        c.phrases.forEach(({ phrase, meaning }) => {
            const parts = phrase.split(' ');
            c.words.forEach((w) => {
                const lw = w.text.toLowerCase();
                if (parts.includes(lw) && !EN_FUNC[lw]) w.phraseNote = `숙어 "${phrase}" = ${meaning}`;
            });
        });
    });
    model.done = true;
    emit();
    return snapshot();
};
