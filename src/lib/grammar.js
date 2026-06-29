import { latinToHangul, isLatinScript, isNonLatinScript } from './phonetics.js';

// Multi-language grammar analyzer for chat translations.
//
// The goal is to help a learner break a translated sentence into its
// grammatical parts (subject / object / predicate / particles / function
// words) and read short Korean explanations of each.
//
// Architecture:
//   - analyzeSentence(text, lang) is the entry point. It dispatches to a
//     language-specific local analyzer (no API key required) and returns
//     a unified result shape that the popup component renders.
//   - For languages we don't have a hand-written analyzer for, we fall
//     back to a generic token-level breakdown and recommend Gemini for
//     a richer analysis.
//   - analyzeWithGemini(text, lang, apiKey) is optional. When the user
//     stores a Gemini free-tier API key in localStorage, the popup calls
//     this to enrich the local result.
//
// Result shape (all analyzers):
//   {
//     language: string,         // base language code
//     original: string,         // the analyzed sentence
//     phrases: Phrase[],        // ordered breakdown
//     structure: string,        // "주제 + 주어 + 목적어 + 술어" style summary
//     summary: string,          // one-line description
//     note?: string,            // free-form Korean hint shown above tokens
//   }
//   Phrase = {
//     text: string,             // surface form
//     particle?: string,        // function word that follows (ja/ko)
//     punct?: string,           // trailing punctuation
//     label?: {
//       role: string,           // 주제 / 주어 / 목적어 / 술어 / 부사어 / 보어 / 연결어 / 어휘
//       detail: string,         // Korean explanation
//       color: string,          // Tailwind color name token (see GrammarPopup)
//     }
//   }

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const baseLang = (lang) => String(lang || '').split('-')[0].toLowerCase();

// Group phrases into clauses based on punctuation that ends a phrase
// (commas / periods / exclamation / question / semicolon). Each chunk has
// its own structure summary so the popup can show numbered clauses like
// "① 주제 + 주어 + 술어 ② 주제 + 술어" instead of one long line.
const CLAUSE_PUNCT_RE = /[、。，．,.!?！？;；]/;

// CJK languages run words together without spaces. Everything else (including
// Korean, which separates eojeols with whitespace) needs a space between
// phrases when we reconstruct a clause.
const SPACE_JOINED_LANGS = new Set(['ja', 'zh']);

const chunkPhrases = (phrases, language) => {
    const useSpaces = !SPACE_JOINED_LANGS.has(language);
    const chunks = [];
    let cur = { phrases: [], originalChunk: '', structure: '' };
    const append = (piece) => {
        if (!piece) return;
        if (useSpaces && cur.originalChunk && !/\s$/.test(cur.originalChunk)) cur.originalChunk += ' ';
        cur.originalChunk += piece;
    };
    for (const p of phrases) {
        cur.phrases.push(p);
        append((p.text || '') + (p.particle || ''));
        if (p.punct) cur.originalChunk += p.punct;
        if (p.punct && CLAUSE_PUNCT_RE.test(p.punct)) {
            cur.structure = cur.phrases.map(x => x.label?.role).filter(Boolean).join(' + ');
            chunks.push(cur);
            cur = { phrases: [], originalChunk: '', structure: '' };
        }
    }
    if (cur.phrases.length) {
        cur.structure = cur.phrases.map(x => x.label?.role).filter(Boolean).join(' + ');
        chunks.push(cur);
    }
    return chunks;
};

const buildResult = (language, original, phrases, structurePartsFn, extras = {}) => {
    const structureParts = phrases.map(p => p.label?.role).filter(Boolean);
    const structure = structurePartsFn
        ? structurePartsFn(phrases)
        : structureParts.join(' + ');
    const chunks = chunkPhrases(phrases, language);
    return {
        language,
        original,
        phrases,
        structure,
        chunks,
        summary: phrases.length === 0
            ? '문장이 비어 있습니다.'
            : `${phrases.length}개 어절. ${structure || '구조 분석 불가'}.`,
        ...extras,
    };
};

const ROLES = {
    topic:    { role: '주제',     color: 'blue'    },
    subject:  { role: '주어',     color: 'green'   },
    object:   { role: '목적어',   color: 'red'     },
    predicate:{ role: '술어',     color: 'emerald' },
    adverb:   { role: '부사어',   color: 'orange'  },
    complement:{ role: '보어',    color: 'purple'  },
    article:  { role: '관사',     color: 'slate'   },
    pronoun:  { role: '대명사',   color: 'cyan'    },
    prep:     { role: '전치사',   color: 'amber'   },
    conj:     { role: '접속사',   color: 'rose'    },
    aux:      { role: '조동사',   color: 'teal'    },
    modifier: { role: '수식어',   color: 'lime'    },
    classifier:{ role: '양사·분류사', color: 'indigo' },
    particle: { role: '조사',     color: 'slate'   },
    marker:   { role: '시제·상 표지', color: 'fuchsia' },
    word:     { role: '어휘',     color: 'gray'    },
};

const phraseFor = (text, kind, detailOverride) => {
    const base = ROLES[kind] || ROLES.word;
    return {
        text,
        label: {
            role: base.role,
            detail: detailOverride || base.role,
            color: base.color,
        },
    };
};

// ===========================================================================
// Japanese (ja)
// ===========================================================================

const JA_PARTICLE_INFO = {
    'は':   { role: '주제',         detail: '주제 표시 (은/는)',           color: 'blue'    },
    'が':   { role: '주어',         detail: '주어 표시 (이/가)',           color: 'green'   },
    'を':   { role: '목적어',       detail: '직접 목적어 (을/를)',         color: 'red'     },
    'に':   { role: '대상·장소·시간', detail: '도착점·시간·간접목적어 (에/에게)', color: 'purple' },
    'で':   { role: '수단·장소',    detail: '수단·도구·장소(에서/로)',    color: 'orange'  },
    'へ':   { role: '방향',         detail: '방향 (으로)',                color: 'indigo'  },
    'と':   { role: '동반·인용',    detail: '와/과·라고',                color: 'pink'    },
    'も':   { role: '역시',         detail: '도(또한)',                   color: 'teal'    },
    'の':   { role: '연결·소유',    detail: '의(소유/연결)',              color: 'slate'   },
    'や':   { role: '예시 나열',    detail: '~이나, ~와 같은',           color: 'rose'    },
    'か':   { role: '의문',         detail: '의문 (~?) / ~인지',          color: 'fuchsia' },
    'から': { role: '시작·원인',    detail: '~부터, ~때문에',             color: 'amber'   },
    'まで': { role: '종점',         detail: '~까지',                      color: 'cyan'    },
    'より': { role: '비교 기준',    detail: '~보다',                      color: 'lime'    },
    'には': { role: '강조 대상',    detail: '~에는 (한정·강조)',          color: 'purple'  },
    'では': { role: '장소 한정',    detail: '~에서는',                    color: 'orange'  },
    'への': { role: '방향+연결',    detail: '~로의',                      color: 'indigo'  },
    'ね':   { role: '확인',         detail: '~지? (동의 구함)',           color: 'slate'   },
    'よ':   { role: '강조',         detail: '~야 (강조)',                color: 'slate'   },
    'な':   { role: '금지·감탄',    detail: '~지 마 / 감탄',             color: 'slate'   },
};
export const PARTICLE_INFO = JA_PARTICLE_INFO; // legacy export

const JA_COMPOUND = ['からも', 'までも', 'よりも', 'には', 'では', 'への', 'から', 'まで', 'より'];
const JA_SINGLE = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'や'];
const JA_END = ['か', 'ね', 'よ', 'な', 'ぞ', 'ぜ'];
const PUNCT_ANY = ['、', '。', '！', '？', '「', '」', '『', '』', ',', '.', '!', '?', '·', '；', ';', ':'];

const tokenizeJa = (text) => {
    const tokens = [];
    let buf = '';
    let i = 0;
    const flush = () => { if (buf) { tokens.push({ type: 'word', text: buf }); buf = ''; } };
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) { flush(); i++; continue; }
        if (PUNCT_ANY.includes(ch)) { flush(); tokens.push({ type: 'punct', text: ch }); i++; continue; }
        let matched = null;
        for (const p of JA_COMPOUND) {
            if (text.substr(i, p.length) === p && buf.length > 0) { matched = p; break; }
        }
        if (matched) { flush(); tokens.push({ type: 'particle', text: matched }); i += matched.length; continue; }
        if (JA_SINGLE.includes(ch) && buf.length > 0) { flush(); tokens.push({ type: 'particle', text: ch }); i++; continue; }
        if (JA_END.includes(ch) && buf.length > 0) {
            const nx = text[i + 1];
            if (!nx || PUNCT_ANY.includes(nx) || /\s/.test(nx)) {
                flush(); tokens.push({ type: 'particle', text: ch }); i++; continue;
            }
        }
        buf += ch; i++;
    }
    flush();
    return tokens;
};

const classifyJaPredicate = (w) => {
    if (!w) return null;
    if (/ませんでした$/.test(w)) return { type: '동사·정중·과거부정', detail: '~지 않았습니다' };
    if (/ました$/.test(w))      return { type: '동사·정중·과거',     detail: '~했습니다' };
    if (/ません$/.test(w))      return { type: '동사·정중·부정',     detail: '~하지 않습니다' };
    if (/ましょう$/.test(w))    return { type: '동사·정중·권유',     detail: '~합시다' };
    if (/ます$/.test(w))        return { type: '동사·정중·현재',     detail: '~합니다' };
    if (/ではありません$/.test(w)) return { type: '명사·부정',     detail: '~이 아닙니다' };
    if (/でした$/.test(w))         return { type: '명사·과거',     detail: '~이었습니다' };
    if (/です$/.test(w))           return { type: '명사·서술',     detail: '~입니다' };
    if (/だった$/.test(w))         return { type: '명사·과거(반말)', detail: '~이었다' };
    if (/たい$/.test(w))    return { type: '희망', detail: '~하고 싶다' };
    if (/ている$|てる$/.test(w)) return { type: '동사·진행', detail: '~하고 있다' };
    if (/てください$/.test(w))   return { type: '의뢰', detail: '~해 주세요' };
    if (/なかった$/.test(w)) return { type: '동사·과거부정(반말)', detail: '~하지 않았다' };
    if (/ない$/.test(w))     return { type: '동사·부정(반말)',    detail: '~하지 않다' };
    if (/かった$/.test(w))   return { type: '형용사·과거',        detail: '~았다/었다' };
    if (/くない$/.test(w))   return { type: '형용사·부정',        detail: '~지 않다' };
    if (/[^しちじにひびみり]い$/.test(w)) return { type: '형용사(い)', detail: '~한/~다' };
    if (/[うくぐすつぬぶむる]$/.test(w))   return { type: '동사·기본형',  detail: '~한다' };
    if (/た$/.test(w))       return { type: '동사·과거(반말)', detail: '~했다' };
    if (/て$/.test(w))       return { type: '동사·て형',       detail: '~하고/해서' };
    return { type: '체언/기타', detail: '명사 또는 분류 어려움' };
};

export const analyzeJapanese = (text) => {
    if (!text || !text.trim()) return buildResult('ja', '', []);
    const tokens = tokenizeJa(text);
    const phrases = [];
    let cur = { text: '', particle: null, label: null };
    for (const tok of tokens) {
        if (tok.type === 'word') cur.text += tok.text;
        else if (tok.type === 'particle') {
            const info = JA_PARTICLE_INFO[tok.text] || { role: '조사', detail: tok.text, color: 'slate' };
            cur.particle = tok.text;
            cur.label = { role: info.role, detail: info.detail, color: info.color };
            phrases.push({ ...cur });
            cur = { text: '', particle: null, label: null };
        } else if (tok.type === 'punct') {
            if (cur.text || cur.particle) { phrases.push({ ...cur, punct: tok.text }); cur = { text: '', particle: null, label: null }; }
            else if (phrases.length) phrases[phrases.length - 1].punct = (phrases[phrases.length - 1].punct || '') + tok.text;
        }
    }
    if (cur.text) phrases.push({ ...cur });
    let predIdx = -1;
    for (let i = phrases.length - 1; i >= 0; i--) {
        if (phrases[i].text && !phrases[i].particle) { predIdx = i; break; }
    }
    if (predIdx >= 0) {
        const p = classifyJaPredicate(phrases[predIdx].text);
        phrases[predIdx].label = { role: '술어', detail: p ? `${p.type} · ${p.detail}` : '술어', color: 'emerald' };
        phrases[predIdx].predicate = p;
    }
    return buildResult('ja', text, phrases, null, {
        note: '🇯🇵 일본어는 조사가 단어의 역할을 정해 줍니다. 색이 칠해진 표지를 보면 무엇이 주어·목적어·술어인지 한눈에 보입니다.',
    });
};

// ===========================================================================
// Korean (ko)
// ===========================================================================

const KO_PARTICLES_TWO = ['에서', '에게', '한테', '으로', '까지', '부터', '에도', '에는', '에서는', '에서도', '으로는', '으로도', '보다', '처럼', '같이', '마저', '조차', '이라', '라고', '이라고'];
const KO_PARTICLES_ONE = ['은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '만', '로', '며', '랑'];

const KO_PARTICLE_INFO = {
    '은': { role: '주제', detail: '주제(은)', color: 'blue' },
    '는': { role: '주제', detail: '주제(는)', color: 'blue' },
    '이': { role: '주어', detail: '주어(이)', color: 'green' },
    '가': { role: '주어', detail: '주어(가)', color: 'green' },
    '을': { role: '목적어', detail: '직접 목적어(을)', color: 'red' },
    '를': { role: '목적어', detail: '직접 목적어(를)', color: 'red' },
    '에': { role: '부사어', detail: '장소·시간(~에)', color: 'orange' },
    '에서': { role: '부사어', detail: '장소(~에서)', color: 'orange' },
    '에게': { role: '부사어', detail: '대상(~에게)', color: 'purple' },
    '한테': { role: '부사어', detail: '대상(~한테)', color: 'purple' },
    '으로': { role: '부사어', detail: '수단·방향(~으로)', color: 'indigo' },
    '로': { role: '부사어', detail: '수단·방향(~로)', color: 'indigo' },
    '의': { role: '연결', detail: '소유·관계(~의)', color: 'slate' },
    '와': { role: '동반', detail: '~와', color: 'pink' },
    '과': { role: '동반', detail: '~과', color: 'pink' },
    '랑': { role: '동반', detail: '~랑(구어)', color: 'pink' },
    '도': { role: '역시', detail: '~도(또한)', color: 'teal' },
    '만': { role: '한정', detail: '~만(한정)', color: 'amber' },
    '까지': { role: '종점', detail: '~까지', color: 'cyan' },
    '부터': { role: '시작', detail: '~부터', color: 'amber' },
    '보다': { role: '비교', detail: '~보다', color: 'lime' },
    '처럼': { role: '비유', detail: '~처럼', color: 'rose' },
    '같이': { role: '비유', detail: '~같이', color: 'rose' },
    '라고': { role: '인용', detail: '~라고', color: 'fuchsia' },
    '이라고': { role: '인용', detail: '~이라고', color: 'fuchsia' },
};

const classifyKoPredicate = (w) => {
    if (!w) return null;
    if (/(습니다|ㅂ니다)$/.test(w)) return { type: '동사·정중', detail: '~합니다' };
    if (/(었습니다|았습니다|였습니다)$/.test(w)) return { type: '동사·정중·과거', detail: '~했습니다' };
    if (/(겠습니다)$/.test(w)) return { type: '동사·정중·의지/추측', detail: '~겠습니다' };
    if (/(어요|아요|여요|예요|이에요)$/.test(w)) return { type: '동사·해요체', detail: '~해요' };
    if (/(었|았|였)다$/.test(w)) return { type: '동사·과거', detail: '~했다' };
    if (/다$/.test(w)) return { type: '동사·기본형', detail: '~다' };
    if (/지$/.test(w)) return { type: '확인', detail: '~지' };
    return { type: '기타', detail: '명사 또는 분류 어려움' };
};

export const analyzeKorean = (text) => {
    if (!text || !text.trim()) return buildResult('ko', '', []);
    // Tokenize by whitespace, then peel off particles from the end of each eojeol.
    const eojeols = text.split(/\s+/).filter(Boolean);
    const phrases = [];
    for (const raw of eojeols) {
        const trail = raw.match(/[\p{P}]+$/u);
        const trailing = trail ? trail[0] : '';
        const core = trailing ? raw.slice(0, -trailing.length) : raw;
        let matchedParticle = '';
        for (const p of KO_PARTICLES_TWO.concat(KO_PARTICLES_ONE)) {
            if (core.endsWith(p) && core.length > p.length) { matchedParticle = p; break; }
        }
        if (matchedParticle) {
            const stem = core.slice(0, -matchedParticle.length);
            const info = KO_PARTICLE_INFO[matchedParticle] || { role: '조사', detail: matchedParticle, color: 'slate' };
            phrases.push({
                text: stem,
                particle: matchedParticle,
                punct: trailing,
                label: { role: info.role, detail: info.detail, color: info.color },
            });
        } else {
            phrases.push({ text: core, particle: null, punct: trailing, label: null });
        }
    }
    // Mark the last phrase without particle as predicate
    for (let i = phrases.length - 1; i >= 0; i--) {
        if (phrases[i].text && !phrases[i].particle) {
            const p = classifyKoPredicate(phrases[i].text);
            phrases[i].label = { role: '술어', detail: p ? `${p.type} · ${p.detail}` : '술어', color: 'emerald' };
            phrases[i].predicate = p;
            break;
        }
    }
    return buildResult('ko', text, phrases, null, {
        note: '🇰🇷 한국어 어절은 보통 [체언 + 조사] 또는 [용언 + 어미] 입니다. 어절 끝의 조사가 역할을 결정합니다.',
    });
};

// ===========================================================================
// Chinese (zh, zh-CN, zh-TW)
// ===========================================================================

const ZH_FUNC_WORDS = {
    '的': { role: '연결', detail: '소유·수식(의)', color: 'slate' },
    '了': { role: '시제·상 표지', detail: '완료·변화(~했다/되었다)', color: 'fuchsia' },
    '吗': { role: '의문', detail: '예/아니오 의문(~?)', color: 'fuchsia' },
    '呢': { role: '의문·여운', detail: '~은?/~는데', color: 'fuchsia' },
    '吧': { role: '청유·추측', detail: '~하자/일 거다', color: 'rose' },
    '也': { role: '부사어', detail: '~도(또한)', color: 'teal' },
    '都': { role: '부사어', detail: '모두', color: 'teal' },
    '还': { role: '부사어', detail: '아직·또', color: 'teal' },
    '就': { role: '부사어', detail: '바로·곧', color: 'teal' },
    '在': { role: '부사어·진행', detail: '~에서/~하고 있다', color: 'fuchsia' },
    '把': { role: '목적어 전치', detail: '把-구문(목적어 강조)', color: 'red' },
    '被': { role: '피동', detail: '~에게 당하다', color: 'purple' },
    '是': { role: '술어(be)', detail: '~이다', color: 'emerald' },
    '不': { role: '부정', detail: '~하지 않다', color: 'orange' },
    '没': { role: '부정·과거', detail: '~하지 않았다', color: 'orange' },
    '有': { role: '술어(have)', detail: '있다·가지다', color: 'emerald' },
    '和': { role: '접속사', detail: '~와/과', color: 'pink' },
    '跟': { role: '접속사', detail: '~와/과', color: 'pink' },
    '与': { role: '접속사', detail: '~와/과', color: 'pink' },
    '或': { role: '접속사', detail: '또는', color: 'pink' },
    '但': { role: '접속사', detail: '그러나', color: 'rose' },
    '可是': { role: '접속사', detail: '하지만', color: 'rose' },
    '所以': { role: '접속사', detail: '그래서', color: 'rose' },
    '因为': { role: '접속사', detail: '왜냐하면', color: 'rose' },
    '如果': { role: '접속사', detail: '만약', color: 'rose' },
    '虽然': { role: '접속사', detail: '비록', color: 'rose' },
    '从': { role: '전치사', detail: '~에서/~로부터', color: 'amber' },
    '对': { role: '전치사', detail: '~에 대해', color: 'amber' },
    '给': { role: '전치사', detail: '~에게', color: 'amber' },
    '比': { role: '전치사', detail: '~보다', color: 'lime' },
};
const ZH_MULTI = ['可是', '所以', '因为', '如果', '虽然'].sort((a, b) => b.length - a.length);
const ZH_PRONOUNS = new Set(['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '咱们', '自己', '这', '那', '这个', '那个', '哪个', '什么', '谁', '哪里', '怎么']);
const ZH_PUNCT = new Set(['，', '。', '！', '？', '、', '；', '：', '「', '」', '『', '』', '（', '）', '·', ',', '.', '!', '?']);

const tokenizeZh = (text) => {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ZH_PUNCT.has(ch)) { tokens.push({ type: 'punct', text: ch }); i++; continue; }
        // Try multi-char function words
        let matched = null;
        for (const w of ZH_MULTI) {
            if (text.substr(i, w.length) === w) { matched = w; break; }
        }
        if (matched) { tokens.push({ type: 'func', text: matched }); i += matched.length; continue; }
        if (ZH_FUNC_WORDS[ch]) { tokens.push({ type: 'func', text: ch }); i++; continue; }
        // Pronoun (2-char first)
        if (i + 1 < text.length && ZH_PRONOUNS.has(text.substr(i, 2))) { tokens.push({ type: 'pron', text: text.substr(i, 2) }); i += 2; continue; }
        if (ZH_PRONOUNS.has(ch)) { tokens.push({ type: 'pron', text: ch }); i++; continue; }
        // Otherwise: greedy 2-character chunks (most Chinese words are 1-2 chars)
        // Stop at next function-word/punct/pronoun.
        let chunk = ch;
        let j = i + 1;
        while (j < text.length && chunk.length < 4) {
            const c = text[j];
            if (ZH_PUNCT.has(c) || ZH_FUNC_WORDS[c] || /\s/.test(c)) break;
            const peek2 = text.substr(j, 2);
            if (ZH_PRONOUNS.has(c) || ZH_PRONOUNS.has(peek2)) break;
            if (ZH_MULTI.some(w => text.substr(j, w.length) === w)) break;
            chunk += c;
            j++;
            if (chunk.length >= 2) break; // prefer 2-char chunks
        }
        tokens.push({ type: 'word', text: chunk });
        i += chunk.length;
    }
    return tokens;
};

export const analyzeChinese = (text) => {
    if (!text || !text.trim()) return buildResult('zh', '', []);
    const tokens = tokenizeZh(text);
    const phrases = [];
    let subjectAssigned = false;
    let verbAssigned = false;
    for (const tok of tokens) {
        if (tok.type === 'punct') {
            if (phrases.length) phrases[phrases.length - 1].punct = (phrases[phrases.length - 1].punct || '') + tok.text;
            continue;
        }
        if (tok.type === 'func') {
            const info = ZH_FUNC_WORDS[tok.text] || { role: '기능어', detail: tok.text, color: 'slate' };
            phrases.push({ text: tok.text, label: { role: info.role, detail: info.detail, color: info.color } });
            if (info.role.startsWith('술어')) verbAssigned = true;
            continue;
        }
        if (tok.type === 'pron') {
            if (!subjectAssigned) {
                phrases.push(phraseFor(tok.text, 'subject', '주어(대명사) — 동작의 주체'));
                subjectAssigned = true;
            } else {
                phrases.push(phraseFor(tok.text, 'object', '목적어(대명사) — 동작의 대상'));
            }
            continue;
        }
        if (!subjectAssigned) {
            phrases.push(phraseFor(tok.text, 'subject', '주어 — 보통 문장 맨 앞'));
            subjectAssigned = true;
        } else if (!verbAssigned) {
            phrases.push(phraseFor(tok.text, 'predicate', '술어(동사/형용사) — 동작이나 상태'));
            verbAssigned = true;
        } else {
            phrases.push(phraseFor(tok.text, 'object', '목적어 — 동사의 대상'));
        }
    }
    return buildResult('zh', text, phrases, null, {
        note: '🇨🇳 중국어는 어순(SVO)이 의미를 결정합니다. 的 (수식), 了 (완료/변화), 吗 (의문), 把/被 (구문 표시) 같은 기능어를 잘 보세요.',
    });
};

// ===========================================================================
// Indo-European space-delimited shared infra
// ===========================================================================

const splitByWord = (text) => {
    // Keep punctuation attached to the previous word.
    const out = [];
    const re = /([^\s]+)(\s+)?/g;
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
    return out;
};

const peelTrailingPunct = (w) => {
    const m = w.match(/^(.*?)([\p{P}]*)$/u);
    if (!m) return [w, ''];
    return [m[1], m[2]];
};

// ===========================================================================
// English (en)
// ===========================================================================

const EN_ARTICLES = new Set(['the', 'a', 'an']);
const EN_PRONOUNS_SUBJ = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'who']);
const EN_PRONOUNS_OBJ = new Set(['me', 'him', 'her', 'us', 'them', 'whom']);
const EN_AUX = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", "won't", "wouldn't", "shouldn't", "can't", "couldn't"]);
const EN_PREP = new Set(['in', 'on', 'at', 'to', 'from', 'with', 'by', 'for', 'of', 'about', 'into', 'onto', 'over', 'under', 'between', 'through', 'during', 'before', 'after', 'against', 'within', 'without', 'across', 'around', 'behind']);
const EN_CONJ = new Set(['and', 'but', 'or', 'so', 'because', 'if', 'when', 'while', 'although', 'though', 'since', 'unless', 'until', 'whereas', 'yet']);
const EN_NEG = new Set(['not', "n't", 'no', 'never']);
const EN_DET = new Set(['this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'some', 'any', 'all', 'every', 'each', 'much', 'many', 'few', 'several']);

const classifyEnWord = (raw) => {
    const w = raw.toLowerCase();
    if (EN_ARTICLES.has(w)) return ['article', '관사 — 명사를 한정'];
    if (EN_AUX.has(w)) return ['aux', '조동사·be동사 — 시제·태·서법'];
    if (EN_PRONOUNS_SUBJ.has(w)) return ['subject', '주격 대명사 — 보통 주어'];
    if (EN_PRONOUNS_OBJ.has(w)) return ['object', '목적격 대명사 — 동사·전치사의 대상'];
    if (EN_NEG.has(w)) return ['adverb', '부정어 — 의미 부정'];
    if (EN_DET.has(w)) return ['modifier', '한정사 — 뒤 명사 수식'];
    if (EN_PREP.has(w)) return ['prep', '전치사 — 뒤 명사구의 관계'];
    if (EN_CONJ.has(w)) return ['conj', '접속사 — 문장·구 연결'];
    if (/(ly)$/.test(w)) return ['adverb', '부사(-ly) — 동사·형용사 수식'];
    if (/(ing|ed|s)$/.test(w) && w.length > 3) return ['predicate', '동사형(보통 술어)'];
    if (/[A-Z]/.test(raw[0])) return ['subject', '고유명사 — 주어/객체로 자주 등장'];
    return ['word', '내용어 — 문맥에서 역할 파악'];
};

export const analyzeEnglish = (text) => {
    if (!text || !text.trim()) return buildResult('en', '', []);
    const words = splitByWord(text);
    const phrases = [];
    let predicateSet = false;
    for (const raw of words) {
        const [core, trailing] = peelTrailingPunct(raw);
        if (!core) continue;
        const [kind, detail] = classifyEnWord(core);
        const ph = phraseFor(core, kind, detail);
        if (kind === 'predicate' && !predicateSet) predicateSet = true;
        if (trailing) ph.punct = trailing;
        phrases.push(ph);
    }
    if (!predicateSet) {
        const auxIdx = phrases.findIndex(p => p.label.role === '조동사');
        if (auxIdx >= 0) phrases[auxIdx].label = { role: '술어(보조)', detail: '조동사/be — 술부의 핵심', color: 'emerald' };
    }
    return buildResult('en', text, phrases, null, {
        note: '🇺🇸 영어는 어순(SVO)이 기본입니다. 관사·조동사·전치사 같은 기능어가 문법 관계를 표시합니다.',
    });
};

// ===========================================================================
// French (fr)
// ===========================================================================

const FR_ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', "l'", "d'"]);
const FR_PRONOUNS_SUBJ = new Set(['je', "j'", 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', "c'"]);
const FR_PRONOUNS_OBJ = new Set(['me', 'te', 'le', 'la', 'lui', 'leur', 'les', 'se', 'en', 'y', 'moi', 'toi', 'soi', 'eux']);
const FR_AUX = new Set(['suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'ai', 'as', 'a', 'avons', 'avez', 'ont', 'étais', 'étais', 'était', 'étions', 'étiez', 'étaient', 'serai', 'seras', 'sera', 'serons', 'serez', 'seront', 'serait']);
const FR_PREP = new Set(['à', 'de', "d'", 'dans', 'sur', 'avec', 'par', 'pour', 'sans', 'sous', 'vers', 'chez', 'entre', 'depuis', 'pendant', 'avant', 'après', 'contre', 'jusqu', "jusqu'", 'parmi']);
const FR_CONJ = new Set(['et', 'ou', 'mais', 'car', 'donc', 'or', 'ni', 'parce', 'que', "qu'", 'si', 'quand', 'lorsque', 'comme', 'puisque', 'tandis']);
const FR_NEG = new Set(['ne', "n'", 'pas', 'plus', 'jamais', 'rien', 'aucun']);

const classifyFrWord = (raw) => {
    const w = raw.toLowerCase().replace(/^[«»"']+|[«»"']+$/g, '');
    if (FR_ARTICLES.has(w)) return ['article', '관사(le/la/un…) — 명사 한정'];
    if (FR_AUX.has(w)) return ['aux', '조동사 être/avoir — 시제/태'];
    if (FR_PRONOUNS_SUBJ.has(w)) return ['subject', '주격 대명사'];
    if (FR_PRONOUNS_OBJ.has(w)) return ['object', '목적격 대명사 — 동사 앞/뒤에 위치'];
    if (FR_NEG.has(w)) return ['adverb', '부정 표지(ne…pas)'];
    if (FR_PREP.has(w)) return ['prep', '전치사 — 뒤 명사구의 관계'];
    if (FR_CONJ.has(w)) return ['conj', '접속사 — 절 연결'];
    if (/^(très|bien|trop|peu|aussi|beaucoup|toujours|souvent|déjà|maintenant)$/.test(w)) return ['adverb', '부사 — 정도/시간/빈도'];
    return ['word', '내용어 — 문맥에서 역할 파악'];
};

export const analyzeFrench = (text) => {
    if (!text || !text.trim()) return buildResult('fr', '', []);
    const words = splitByWord(text);
    const phrases = [];
    let predicateSet = false;
    for (const raw of words) {
        const [core, trailing] = peelTrailingPunct(raw);
        if (!core) continue;
        const [kind, detail] = classifyFrWord(core);
        const ph = phraseFor(core, kind, detail);
        if (trailing) ph.punct = trailing;
        phrases.push(ph);
        if (kind === 'aux' && !predicateSet) {
            ph.label = { role: '술어(보조)', detail: '조동사 — 시제·완료', color: 'emerald' };
            predicateSet = true;
        }
    }
    return buildResult('fr', text, phrases, null, {
        note: '🇫🇷 프랑스어는 SVO이며 관사·대명사·전치사가 풍부합니다. 동사 être/avoir 가 시제(복합과거 등)의 보조 역할을 합니다.',
    });
};

// ===========================================================================
// Spanish (es)
// ===========================================================================

const ES_ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas']);
const ES_PRONOUNS = new Set(['yo', 'tú', 'él', 'ella', 'usted', 'nosotros', 'vosotros', 'ellos', 'ellas', 'ustedes', 'me', 'te', 'lo', 'la', 'le', 'nos', 'os', 'los', 'las', 'les', 'se']);
const ES_AUX = new Set(['soy', 'eres', 'es', 'somos', 'sois', 'son', 'fui', 'fuiste', 'fue', 'fuimos', 'fueron', 'estoy', 'estás', 'está', 'estamos', 'están', 'he', 'has', 'ha', 'hemos', 'han', 'había', 'habrá', 'sería']);
const ES_PREP = new Set(['a', 'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'según', 'contra', 'bajo']);
const ES_CONJ = new Set(['y', 'e', 'o', 'u', 'pero', 'sino', 'porque', 'si', 'cuando', 'aunque', 'mientras', 'que']);
const ES_NEG = new Set(['no', 'nunca', 'jamás', 'nada', 'nadie', 'ningún', 'ninguna']);

const classifyEsWord = (raw) => {
    const w = raw.toLowerCase();
    if (ES_ARTICLES.has(w)) return ['article', '관사 — 명사 한정'];
    if (ES_AUX.has(w)) return ['aux', '동사 ser/estar/haber — 시제·태·계사'];
    if (ES_PRONOUNS.has(w)) return ['subject', '대명사 — 주어/목적어'];
    if (ES_NEG.has(w)) return ['adverb', '부정어'];
    if (ES_PREP.has(w)) return ['prep', '전치사'];
    if (ES_CONJ.has(w)) return ['conj', '접속사'];
    if (/mente$/.test(w)) return ['adverb', '부사(-mente)'];
    return ['word', '내용어'];
};

export const analyzeSpanish = (text) => {
    if (!text || !text.trim()) return buildResult('es', '', []);
    const phrases = [];
    for (const raw of splitByWord(text)) {
        const [core, trailing] = peelTrailingPunct(raw);
        if (!core) continue;
        const [kind, detail] = classifyEsWord(core);
        const ph = phraseFor(core, kind, detail);
        if (trailing) ph.punct = trailing;
        phrases.push(ph);
    }
    return buildResult('es', text, phrases, null, {
        note: '🇪🇸 스페인어 동사는 인칭·시제로 활용됩니다. ser/estar 의 차이(영속 vs 상태)에 주목하세요.',
    });
};

// ===========================================================================
// Vietnamese (vi)
// ===========================================================================

const VI_MARKERS = {
    'là': { kind: 'predicate', detail: '~이다 (be 동사)' },
    'của': { kind: 'prep', detail: '~의(소유)' },
    'được': { kind: 'aux', detail: '~할 수 있다 / 피동' },
    'bị': { kind: 'aux', detail: '~당하다 (부정적 피동)' },
    'đang': { kind: 'marker', detail: '진행(~하고 있다)' },
    'đã': { kind: 'marker', detail: '과거(~했다)' },
    'sẽ': { kind: 'marker', detail: '미래(~할 것이다)' },
    'vừa': { kind: 'marker', detail: '방금 ~했다' },
    'mới': { kind: 'marker', detail: '막 ~한' },
    'không': { kind: 'adverb', detail: '~지 않다 (부정)' },
    'chưa': { kind: 'adverb', detail: '아직 ~하지 않다' },
    'rất': { kind: 'adverb', detail: '매우' },
    'thì': { kind: 'conj', detail: '~면, 그렇다면' },
    'mà': { kind: 'conj', detail: '~인데, 그런데' },
    'và': { kind: 'conj', detail: '그리고' },
    'hoặc': { kind: 'conj', detail: '또는' },
    'nhưng': { kind: 'conj', detail: '그러나' },
    'vì': { kind: 'conj', detail: '왜냐하면' },
    'nếu': { kind: 'conj', detail: '만약' },
    'tôi': { kind: 'subject', detail: '나' },
    'bạn': { kind: 'subject', detail: '너/당신' },
    'anh': { kind: 'subject', detail: '형/오빠/너(남)' },
    'chị': { kind: 'subject', detail: '누나/언니/너(여)' },
    'em': { kind: 'subject', detail: '동생/너' },
    'họ': { kind: 'subject', detail: '그들' },
};
const VI_CLASSIFIERS = new Set(['cái', 'con', 'chiếc', 'người', 'quyển', 'cuốn', 'cây', 'tờ', 'bộ']);

const classifyViWord = (raw) => {
    const w = raw.toLowerCase();
    if (VI_MARKERS[w]) {
        const m = VI_MARKERS[w];
        return [m.kind, m.detail];
    }
    if (VI_CLASSIFIERS.has(w)) return ['classifier', '분류사(loại từ) — 뒤 명사의 종류'];
    return ['word', '내용어'];
};

export const analyzeVietnamese = (text) => {
    if (!text || !text.trim()) return buildResult('vi', '', []);
    const phrases = [];
    for (const raw of splitByWord(text)) {
        const [core, trailing] = peelTrailingPunct(raw);
        if (!core) continue;
        const [kind, detail] = classifyViWord(core);
        const ph = phraseFor(core, kind, detail);
        if (trailing) ph.punct = trailing;
        phrases.push(ph);
    }
    return buildResult('vi', text, phrases, null, {
        note: '🇻🇳 베트남어는 어순이 SVO 이며 굴절이 없습니다. đã/đang/sẽ 같은 시제 표지와 분류사(cái/con/chiếc…)에 주목하세요.',
    });
};

// ===========================================================================
// Generic fallback (any other language)
// ===========================================================================

export const analyzeGeneric = (text, lang) => {
    if (!text || !text.trim()) return buildResult(baseLang(lang) || 'xx', '', []);
    // For scripts without spaces, fall back to per-character chunks; otherwise per-word.
    const hasSpaces = /\s/.test(text);
    const phrases = [];
    if (hasSpaces) {
        for (const raw of splitByWord(text)) {
            const [core, trailing] = peelTrailingPunct(raw);
            if (!core) continue;
            const ph = phraseFor(core, 'word', '단어 — 문맥에서 역할 파악');
            if (trailing) ph.punct = trailing;
            phrases.push(ph);
        }
    } else {
        // Chunk every 2 characters for readability (CJK-like)
        for (let i = 0; i < text.length; i += 2) {
            const chunk = text.substr(i, 2);
            if (!chunk.trim()) continue;
            phrases.push(phraseFor(chunk, 'word', '글자 단위 — 정확한 분절은 Gemini 필요'));
        }
    }
    return buildResult(baseLang(lang) || 'xx', text, phrases, null, {
        note: '이 언어에는 내장된 정밀 분석기가 없어 어휘 단위만 보여 드립니다. 더 정확한 분석은 ⚙️ 에서 Gemini 무료 API 키를 추가하세요.',
    });
};

// ===========================================================================
// Pronunciation helpers — used by the GrammarPopup to show phrase-level
// readings next to each token so a learner can practice speaking.
// ===========================================================================

const ROMAN_CACHE = new Map();

const fetchRomanizationOnce = async (text, lang) => {
    const key = `${lang}:${text}`;
    if (ROMAN_CACHE.has(key)) return ROMAN_CACHE.get(key);
    if (!text || !text.trim()) return '';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(lang)}&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) { ROMAN_CACHE.set(key, ''); return ''; }
        const data = await res.json();
        if (data && data[0]) {
            const parts = data[0]
                .filter(seg => seg)
                .map(seg => seg[3] || seg[2] || '')
                .filter(Boolean);
            const result = parts.join(' ').trim();
            ROMAN_CACHE.set(key, result);
            return result;
        }
    } catch { /* network errors are non-fatal */ }
    ROMAN_CACHE.set(key, '');
    return '';
};

// Compute pronunciation for a single phrase synchronously when possible.
// Returns '' when an async fetch is required (caller must use
// getPhrasePronunciations for that path).
export const computePhrasePronunciation = (text, lang) => {
    if (!text) return '';
    if (isLatinScript(lang)) return latinToHangul(text, lang);
    return '';
};

// Fetch per-phrase pronunciations for the entire phrase list, with a
// concurrency cap so we don't fire 30+ simultaneous Google requests.
// onProgress is called with a partial map as results trickle in so the UI
// can render progressively. Returns the final map { key -> pronunciation }.
export const getPhrasePronunciations = async (phrases, lang, onProgress, concurrency = 6) => {
    const map = {};
    if (!phrases || phrases.length === 0) return map;

    if (isLatinScript(lang)) {
        for (const p of phrases) {
            const key = (p.text || '') + (p.particle || '');
            const surface = (p.text || '') + (p.particle || '');
            map[key] = latinToHangul(surface, lang);
        }
        if (onProgress) onProgress({ ...map });
        return map;
    }

    if (!isNonLatinScript(lang) && !lang) return map;

    const tasks = phrases.map(p => {
        const key = (p.text || '') + (p.particle || '');
        const query = (p.text || '') + (p.particle || '');
        return { key, query };
    });

    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => (async () => {
        while (idx < tasks.length) {
            const i = idx++;
            const { key, query } = tasks[i];
            const rom = await fetchRomanizationOnce(query, lang);
            map[key] = rom;
            if (onProgress) onProgress({ ...map });
        }
    })());
    await Promise.all(workers);
    return map;
};

// Fetch a single full-sentence romanization (used when no cached
// pronunciation is available on the chat message itself).
export const fetchFullPronunciation = async (text, lang) => {
    if (!text) return '';
    if (isLatinScript(lang)) return latinToHangul(text, lang);
    if (isNonLatinScript(lang) || !lang) return await fetchRomanizationOnce(text, lang);
    return '';
};

// ---------------------------------------------------------------------------
// Translation helpers (for unified per-clause study layout)
//
// When the original message was Korean and the viewer reads a different
// language, the popup pairs every translated clause with its Korean
// equivalent and every word with its Korean meaning. We use Google
// Translate (the same gtx endpoint used elsewhere) and cache results.
// ---------------------------------------------------------------------------

const TRANSLATION_CACHE = new Map();

const fetchTranslationOnce = async (text, sourceLang, targetLang) => {
    if (!text || !text.trim()) return '';
    if (sourceLang === targetLang) return text;
    const key = `${sourceLang}>${targetLang}:${text}`;
    if (TRANSLATION_CACHE.has(key)) return TRANSLATION_CACHE.get(key);
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) { TRANSLATION_CACHE.set(key, ''); return ''; }
        const data = await res.json();
        if (data && data[0]) {
            const parts = data[0]
                .filter(seg => seg && seg[0])
                .map(seg => seg[0])
                .join('');
            const result = parts.trim();
            TRANSLATION_CACHE.set(key, result);
            return result;
        }
    } catch { /* network errors are non-fatal */ }
    TRANSLATION_CACHE.set(key, '');
    return '';
};

// Fetch per-phrase translations (e.g. each Japanese word → Korean meaning).
// Concurrency-limited so we don't overload Google's unofficial gtx endpoint.
export const getPhraseTranslations = async (phrases, sourceLang, targetLang, onProgress, concurrency = 6) => {
    const map = {};
    if (!phrases || phrases.length === 0) return map;
    if (sourceLang === targetLang) {
        for (const p of phrases) {
            const key = (p.text || '') + (p.particle || '');
            map[key] = p.text || '';
        }
        if (onProgress) onProgress({ ...map });
        return map;
    }
    const tasks = phrases.map(p => ({
        key: (p.text || '') + (p.particle || ''),
        query: (p.text || '').trim(),
    }));
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => (async () => {
        while (idx < tasks.length) {
            const i = idx++;
            const { key, query } = tasks[i];
            if (!query) { map[key] = ''; continue; }
            const t = await fetchTranslationOnce(query, sourceLang, targetLang);
            map[key] = t;
            if (onProgress) onProgress({ ...map });
        }
    })());
    await Promise.all(workers);
    return map;
};

// Pair each translated chunk with its Korean equivalent. If the analyzer's
// Korean chunk count matches, we use the user's actual original wording.
// Otherwise we fall back to back-translating each translated chunk.
export const pairKoreanChunks = async (translatedChunks, koreanLocal, sourceLang) => {
    if (!translatedChunks?.length) return [];
    const koChunks = koreanLocal?.chunks || [];
    if (koChunks.length === translatedChunks.length) {
        return koChunks.map(c => c.originalChunk.trim());
    }
    // Fallback: back-translate each translated chunk to Korean
    const result = await Promise.all(
        translatedChunks.map(c => fetchTranslationOnce(c.originalChunk.trim(), sourceLang, 'ko'))
    );
    return result;
};

// Re-apply CLAUSE_PUNCT_RE so the popup can split the full pronunciation
// string into the same number of chunks as the original text.
export const splitPronunciationByChunks = (fullPron, chunks) => {
    if (!fullPron || !chunks || chunks.length <= 1) return [fullPron || ''];
    // If pronunciation contains "/", trust it.
    if (fullPron.includes(' / ')) return fullPron.split(' / ');
    // Otherwise distribute proportionally based on chunk character count.
    const total = chunks.reduce((s, c) => s + (c.originalChunk?.length || 0), 0) || 1;
    let cursor = 0;
    const slices = [];
    for (let i = 0; i < chunks.length; i++) {
        const ratio = (chunks[i].originalChunk?.length || 0) / total;
        const take = i === chunks.length - 1
            ? fullPron.length - cursor
            : Math.round(fullPron.length * ratio);
        slices.push(fullPron.slice(cursor, cursor + take).trim());
        cursor += take;
    }
    return slices;
};

// ===========================================================================
// Dispatcher
// ===========================================================================

const LANG_DISPLAY = {
    ja: '🇯🇵 일본어', ko: '🇰🇷 한국어', zh: '🇨🇳 중국어',
    en: '🇺🇸 영어', fr: '🇫🇷 프랑스어', es: '🇪🇸 스페인어',
    vi: '🇻🇳 베트남어', de: '🇩🇪 독일어', it: '🇮🇹 이탈리아어',
    pt: '🇵🇹 포르투갈어', ru: '🇷🇺 러시아어', ar: '🇸🇦 아랍어',
    mn: '🇲🇳 몽골어', km: '🇰🇭 크메르어', th: '🇹🇭 태국어',
    hi: '🇮🇳 힌디어', id: '🇮🇩 인도네시아어', tr: '🇹🇷 터키어',
    // 추가 8개
    bn: '🇧🇩 벵골어', uz: '🇺🇿 우즈베크어', si: '🇱🇰 신할라어',
    my: '🇲🇲 미얀마어', tl: '🇵🇭 타갈로그어', ne: '🇳🇵 네팔어',
};

export const getLanguageDisplay = (lang) => LANG_DISPLAY[baseLang(lang)] || `🌐 ${lang || 'unknown'}`;

export const analyzeSentence = (text, lang) => {
    const b = baseLang(lang);
    let res;
    switch (b) {
        case 'ja': res = analyzeJapanese(text); break;
        case 'ko': res = analyzeKorean(text); break;
        case 'zh': res = analyzeChinese(text); break;
        case 'en': res = analyzeEnglish(text); break;
        case 'fr': res = analyzeFrench(text); break;
        case 'es': res = analyzeSpanish(text); break;
        case 'vi': res = analyzeVietnamese(text); break;
        default:   res = analyzeGeneric(text, lang); break;
    }
    return { ...res, languageLabel: getLanguageDisplay(lang) };
};

// ===========================================================================
// Optional: Gemini-powered analysis
// ===========================================================================

const GEMINI_KEY_STORAGE = 'meet4u_gemini_api_key';
const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Resolve the Gemini key in priority order:
//   1) Admin shared key (VITE_GEMINI_ADMIN_API_KEY) — when caller is admin
//      AND that key looks like a real Gemini API key (AIza prefix).
//   2) The user's personal key from localStorage.
//   3) Empty string when neither is available.
//
// 잘못된 형식의 admin 키가 set 되어 있으면 사용자 본인 키로 폴백한다.
// (.env 에 OAuth 토큰 같은 게 잘못 들어 있는 경우 방지)
const looksLikeGeminiKey = (k) => typeof k === 'string' && k.trim().startsWith('AIza') && k.trim().length >= 30;

export const getGeminiKey = ({ isAdmin = false } = {}) => {
    if (isAdmin) {
        const adminKey = (import.meta?.env?.VITE_GEMINI_ADMIN_API_KEY || '').trim();
        if (adminKey && looksLikeGeminiKey(adminKey)) return adminKey;
    }
    try { return localStorage.getItem(GEMINI_KEY_STORAGE) || ''; } catch { return ''; }
};

export const setGeminiKey = (key) => {
    try {
        if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
        else localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch { /* ignore */ }
};

export const hasAdminGeminiKey = () => {
    const k = (import.meta?.env?.VITE_GEMINI_ADMIN_API_KEY || '').trim();
    return k.length > 0;
};

const buildGeminiPrompt = (sentence, lang) => `다음 문장을 한국어 학습자의 관점에서 문법 분석해 주세요. 문장의 언어는 "${lang}" 입니다.
JSON 으로만 답변하세요. 마크다운/코드블록 금지.

문장: "${sentence}"

요구 형식:
{
  "structure": "문장 구조 한 줄 설명 (한국어, 예: 주제 + 주어 + 목적어 + 술어)",
  "tokens": [
    {
      "surface": "원문 토큰",
      "reading": "필요한 경우 발음 표기 (한자권은 한자/병음/가나 등)",
      "pos": "품사 (명사/동사/형용사/관사/전치사/조사 등)",
      "role": "문장에서의 역할 (주어/목적어/술어/부사어/보어/연결어/관사 등) — 한국어",
      "meaning": "한국어 뜻",
      "note": "초보자를 위한 짧은 설명 (한국어, 옵션)"
    }
  ],
  "overall": "전체 의미와 학습 포인트를 2-3 문장으로 한국어로 요약"
}`;

export const analyzeWithGemini = async (sentence, lang, apiKey) => {
    if (!sentence || !apiKey) return null;
    const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
    const body = {
        contents: [{ parts: [{ text: buildGeminiPrompt(sentence, lang) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch {
        const cleaned = raw.replace(/^```(?:json)?\s*|```\s*$/g, '').trim();
        return JSON.parse(cleaned);
    }
};
