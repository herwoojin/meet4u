// Phonetic helpers that convert a translated text into a Korean-Hangul
// pronunciation guide.
//
// Strategy:
//   1) For non-Latin target languages we rely on Google Translate's
//      romanization (dt=rm), which already returns Latin characters like
//      "annyeong haseyo" for Korean or "ni hao" for Chinese. We then apply
//      romajiToHangul / pinyinToHangul to convert the romanized text back
//      into Hangul so a Korean reader can sound it out.
//   2) For Latin-script target languages (French, English, German, Spanish,
//      Italian, Portuguese, Vietnamese, …) Google returns an empty
//      romanization, so we transliterate the translated text directly into
//      Hangul via latinToHangul(text, lang). The mapping is best-effort —
//      it favors readability over linguistic accuracy.
//
// All public helpers are safe to call with an empty / null input.

const SCRIPT_LATIN = new Set([
    'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'no', 'da',
    'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'tr', 'vi', 'id', 'ms',
    'tl', 'sw', 'af', 'ca', 'gl', 'eu', 'is', 'lt', 'lv', 'et',
    'sl', 'hr', 'sr', 'mt', 'ga', 'cy', 'la', 'eo', 'sq',
    'uz', // 우즈베크어(현대 라틴 표기)
]);

const SCRIPT_NON_LATIN = new Set([
    'ko', 'ja', 'zh', 'zh-CN', 'zh-TW', 'th', 'ar', 'ru', 'uk', 'be',
    'el', 'hi', 'bn', 'ta', 'te', 'kn', 'ml', 'gu', 'pa', 'mr', 'ne',
    'si', 'km', 'lo', 'my', 'mn', 'he', 'fa', 'ur', 'ps', 'yi', 'am',
    'ka', 'hy', 'iw',
]);

export const isLatinScript = (lang) => {
    if (!lang) return false;
    const lc = lang.toLowerCase();
    if (SCRIPT_NON_LATIN.has(lc)) return false;
    if (SCRIPT_LATIN.has(lc)) return true;
    const base = lc.split('-')[0];
    if (SCRIPT_NON_LATIN.has(base)) return false;
    if (SCRIPT_LATIN.has(base)) return true;
    return true; // unknown — assume Latin as a safe default for fallback
};

export const isNonLatinScript = (lang) => {
    if (!lang) return false;
    const lc = lang.toLowerCase();
    if (SCRIPT_NON_LATIN.has(lc)) return true;
    const base = lc.split('-')[0];
    return SCRIPT_NON_LATIN.has(base);
};

// ---------------------------------------------------------------------------
// Existing helpers — kept for backward compatibility
// ---------------------------------------------------------------------------

export const romajiToHangul = (text) => {
    if (!text) return '';
    let res = text.toLowerCase();

    const map = {
        "kon'nichiwa": "콘니치와",
        "arigatou": "아리가토",
        "ohayou": "오하요",
        "gozaimasu": "고자이마스",
        "sumimasen": "스미마셍",
        "hai": "하이",
        "iie": "이이에",
        "onegai": "오네가이",
        "shimasu": "시마스",
        "sayounara": "사요우나라",
        "konbanwa": "콘반와",
        "watashi": "와타시",
        "anata": "아나타",
    };
    for (const [key, val] of Object.entries(map)) {
        if (res.includes(key)) return val;
    }

    const fallbacks = [
        [/sh/g, '시'], [/ch/g, '치'], [/ts/g, '츠'],
        [/ka/g, '카'], [/ki/g, '키'], [/ku/g, '쿠'], [/ke/g, '케'], [/ko/g, '코'],
        [/sa/g, '사'], [/si/g, '시'], [/su/g, '스'], [/se/g, '세'], [/so/g, '소'],
        [/ta/g, '타'], [/ti/g, '티'], [/tu/g, '투'], [/te/g, '테'], [/to/g, '토'],
        [/na/g, '나'], [/ni/g, '니'], [/nu/g, '누'], [/ne/g, '네'], [/no/g, '노'],
        [/ha/g, '하'], [/hi/g, '히'], [/hu/g, '후'], [/he/g, '헤'], [/ho/g, '호'], [/fu/g, '후'],
        [/ma/g, '마'], [/mi/g, '미'], [/mu/g, '무'], [/me/g, '메'], [/mo/g, '모'],
        [/ya/g, '야'], [/yu/g, '유'], [/yo/g, '요'],
        [/ra/g, '라'], [/ri/g, '리'], [/ru/g, '루'], [/re/g, '레'], [/ro/g, '로'],
        [/wa/g, '와'], [/wo/g, '오'], [/nn/g, '응'], [/n'/g, '응'],
        [/ga/g, '가'], [/gi/g, '기'], [/gu/g, '구'], [/ge/g, '게'], [/go/g, '고'],
        [/za/g, '자'], [/ji/g, '지'], [/zu/g, '즈'], [/ze/g, '제'], [/zo/g, '조'],
        [/da/g, '다'], [/de/g, '데'], [/do/g, '도'],
        [/ba/g, '바'], [/bi/g, '비'], [/bu/g, '부'], [/be/g, '베'], [/bo/g, '보'],
        [/pa/g, '파'], [/pi/g, '피'], [/pu/g, '푸'], [/pe/g, '페'], [/po/g, '포'],
        [/a/g, '아'], [/i/g, '이'], [/u/g, '우'], [/e/g, '에'], [/o/g, '오'],
        [/-/g, ''],
    ];

    let out = res;
    for (const [reg, kor] of fallbacks) out = out.replace(reg, kor);
    return out;
};

export const pinyinToHangul = (text) => {
    if (!text) return '';
    let res = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const map = {
        "ni hao": "니 하오",
        "xiexie": "씨에씨에",
        "zaijian": "짜이찌앤",
        "dui bu qi": "뚜이 부 치",
        "mei guan xi": "메이 관 시",
        "wo ai ni": "워 아이 니",
        "shi": "스",
        "bushi": "부 스",
        "hao": "하오",
    };
    for (const [key, val] of Object.entries(map)) {
        if (res.includes(key)) return val;
    }

    const fallbacks = [
        [/zh/g, '즈'], [/ch/g, '츠'], [/sh/g, '스'],
        [/b/g, '빠'], [/p/g, '파'], [/m/g, '마'], [/f/g, '파'],
        [/d/g, '따'], [/t/g, '타'], [/n/g, '나'], [/l/g, '라'],
        [/g/g, '까'], [/k/g, '카'], [/h/g, '하'],
        [/j/g, '찌'], [/q/g, '치'], [/x/g, '씨'],
        [/z/g, '쯔'], [/c/g, '츠'], [/s/g, '쓰'],
        [/a/g, '아'], [/o/g, '오'], [/e/g, '어'], [/i/g, '이'], [/u/g, '우'], [/v/g, '위'],
        [/ /g, ' '],
    ];
    let out = res;
    for (const [reg, kor] of fallbacks) out = out.replace(reg, kor);
    return out;
};

// ---------------------------------------------------------------------------
// Latin script → Hangul phonetic guide
// ---------------------------------------------------------------------------

const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Per-language preprocessors: rewrite the raw word into a pseudo-romaji-ish
// form whose pronunciation is closer to how a Korean reader would sound it
// out. We deliberately keep this small and predictable.
const PREPROCESSORS = {
    fr: (w) => w
        .replace(/œ/g, 'eu').replace(/æ/g, 'ae')
        .replace(/ç/g, 's')
        .replace(/é|è|ê|ë/g, 'e').replace(/à|â/g, 'a').replace(/î|ï/g, 'i')
        .replace(/ô|ö/g, 'o').replace(/û|ù|ü/g, 'u')
        .replace(/eaux?\b/g, 'o').replace(/aux?\b/g, 'o').replace(/eau/g, 'o')
        .replace(/qu/g, 'k').replace(/gn/g, 'ny')
        .replace(/ch/g, 'sh').replace(/ph/g, 'f')
        .replace(/ill/g, 'iy')
        .replace(/oin/g, 'wang').replace(/oi/g, 'wa')
        .replace(/oui/g, 'wi').replace(/ou/g, 'u')
        .replace(/ai|ei/g, 'e')
        .replace(/eu/g, 'oe')
        .replace(/ent\b/g, 'ang').replace(/(an|en|am|em)/g, 'ang')
        .replace(/(on|om)/g, 'ong').replace(/(in|im|yn|ym)/g, 'eng')
        .replace(/(un|um)/g, 'eong')
        .replace(/r/g, 'r')
        .replace(/j/g, 'zh')
        .replace(/^h/, '').replace(/(?<=[aeiou])h/g, '')
        .replace(/s\b/g, '').replace(/d\b/g, '').replace(/t\b/g, '')
        .replace(/x\b/g, '').replace(/z\b/g, '').replace(/p\b/g, ''),

    de: (w) => w
        .replace(/ä/g, 'e').replace(/ö/g, 'oe').replace(/ü/g, 'wi')
        .replace(/ß/g, 'ss')
        .replace(/sch/g, 'sh').replace(/tsch/g, 'ch')
        .replace(/ch/g, 'h').replace(/ck/g, 'k')
        .replace(/sp/g, 'shp').replace(/st/g, 'sht')
        .replace(/ie/g, 'i').replace(/ei/g, 'ai').replace(/eu|äu/g, 'oi')
        .replace(/v/g, 'f').replace(/w/g, 'v').replace(/z/g, 'ts')
        .replace(/j/g, 'y'),

    es: (w) => w
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
        .replace(/ó/g, 'o').replace(/ú|ü/g, 'u')
        .replace(/ñ/g, 'ny')
        .replace(/ll/g, 'y').replace(/rr/g, 'r')
        .replace(/qu/g, 'k').replace(/gu([ei])/g, 'g$1').replace(/gü/g, 'gu')
        .replace(/c([ei])/g, 's$1').replace(/c/g, 'k')
        .replace(/g([ei])/g, 'h$1')
        .replace(/j/g, 'h')
        .replace(/h/g, '')
        .replace(/z/g, 's')
        .replace(/v/g, 'b'),

    it: (w) => w
        .replace(/à/g, 'a').replace(/è|é/g, 'e').replace(/ì|í/g, 'i')
        .replace(/ò|ó/g, 'o').replace(/ù|ú/g, 'u')
        .replace(/sci(?=[aeou])|sc(?=[ei])/g, 'sh').replace(/sc/g, 'sk')
        .replace(/gn/g, 'ny').replace(/gli/g, 'lyi').replace(/gl(?=[aeiou])/g, 'ly')
        .replace(/ci(?=[aeou])|c(?=[ei])/g, 'ch').replace(/c/g, 'k')
        .replace(/chi/g, 'ki').replace(/che/g, 'ke')
        .replace(/gi(?=[aeou])|g(?=[ei])/g, 'j').replace(/g/g, 'g')
        .replace(/ghi/g, 'gi').replace(/ghe/g, 'ge')
        .replace(/h/g, '')
        .replace(/z/g, 'ts')
        .replace(/qu/g, 'kw'),

    pt: (w) => w
        .replace(/á|à|â/g, 'a').replace(/ã/g, 'ang').replace(/é|ê/g, 'e')
        .replace(/í/g, 'i').replace(/ó|ô/g, 'o').replace(/õ/g, 'ong')
        .replace(/ú/g, 'u').replace(/ç/g, 's')
        .replace(/nh/g, 'ny').replace(/lh/g, 'ly')
        .replace(/ch/g, 'sh')
        .replace(/qu([ei])/g, 'k$1').replace(/qu/g, 'kw')
        .replace(/gu([ei])/g, 'g$1')
        .replace(/c([ei])/g, 's$1').replace(/c/g, 'k')
        .replace(/g([ei])/g, 'j$1')
        .replace(/j/g, 'zh').replace(/x/g, 'sh')
        .replace(/ão\b/g, 'ang').replace(/m\b/g, 'ng'),

    vi: (w) => w
        .replace(/đ/g, 'd')
        .replace(/ơ|ô/g, 'o').replace(/ư/g, 'eu').replace(/ă|â/g, 'a').replace(/ê/g, 'e')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ng\b/g, 'ng').replace(/nh\b/g, 'ng')
        .replace(/qu/g, 'kw').replace(/gi/g, 'zi').replace(/ph/g, 'f')
        .replace(/ch/g, 'ch').replace(/kh/g, 'k').replace(/th/g, 't').replace(/tr/g, 'ch'),

    en: (w) => w
        .replace(/ough\b/g, 'o').replace(/ought\b/g, 'ot')
        .replace(/tion\b/g, 'shun').replace(/sion\b/g, 'shun')
        .replace(/ture\b/g, 'cheo').replace(/qu/g, 'kw')
        .replace(/ch/g, 'ch').replace(/sh/g, 'sh').replace(/th/g, 'd').replace(/ph/g, 'f')
        .replace(/ck/g, 'k').replace(/wh/g, 'w')
        .replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/ea/g, 'i').replace(/ai/g, 'ei')
        .replace(/ay\b/g, 'ei').replace(/oy\b/g, 'oi').replace(/ou/g, 'au').replace(/ow/g, 'au')
        .replace(/ing\b/g, 'ing').replace(/er\b/g, 'eo').replace(/y\b/g, 'i')
        .replace(/c(?=[ei])/g, 's').replace(/c/g, 'k')
        .replace(/g(?=[ei])/g, 'j').replace(/x/g, 'ks')
        .replace(/j/g, 'j'),
};

// Sequential CV (Consonant + Vowel) mapping used as the final stage. The
// order matters — longer sequences must be tried first so that "sh", "ch",
// "ng" win over "s", "c", "n".
const LATIN_HANGUL_RULES = [
    // 3-letter / digraph + vowel combinations
    [/sha/g, '샤'], [/she/g, '셰'], [/shi/g, '시'], [/sho/g, '쇼'], [/shu/g, '슈'],
    [/cha/g, '차'], [/che/g, '체'], [/chi/g, '치'], [/cho/g, '초'], [/chu/g, '추'],
    [/zha/g, '쟈'], [/zhe/g, '제'], [/zhi/g, '지'], [/zho/g, '죠'], [/zhu/g, '쥬'],
    [/nya/g, '냐'], [/nye/g, '녜'], [/nyi/g, '니'], [/nyo/g, '뇨'], [/nyu/g, '뉴'],
    [/lya/g, '랴'], [/lye/g, '례'], [/lyi/g, '리'], [/lyo/g, '료'], [/lyu/g, '류'],
    [/kya/g, '캬'], [/kyu/g, '큐'], [/kyo/g, '쿄'],
    [/tsa/g, '차'], [/tse/g, '체'], [/tsi/g, '치'], [/tso/g, '초'], [/tsu/g, '쯔'],
    [/kwa/g, '콰'], [/kwe/g, '퀘'], [/kwi/g, '퀴'], [/kwo/g, '쿼'], [/kwu/g, '쿠'],
    [/wa/g, '와'], [/we/g, '웨'], [/wi/g, '위'], [/wo/g, '워'], [/wu/g, '우'],
    [/ya/g, '야'], [/ye/g, '예'], [/yi/g, '이'], [/yo/g, '요'], [/yu/g, '유'],

    // Common diphthongs / vowel pairs
    [/ai/g, '아이'], [/ei/g, '에이'], [/oi/g, '오이'], [/au/g, '아우'], [/ou/g, '오우'],
    [/ae/g, '에'], [/oe/g, '외'], [/ie/g, '이에'], [/eo/g, '어'], [/iu/g, '이우'],

    // 2-letter consonant + vowel
    [/ba/g, '바'], [/be/g, '베'], [/bi/g, '비'], [/bo/g, '보'], [/bu/g, '부'],
    [/pa/g, '파'], [/pe/g, '페'], [/pi/g, '피'], [/po/g, '포'], [/pu/g, '푸'],
    [/da/g, '다'], [/de/g, '데'], [/di/g, '디'], [/do/g, '도'], [/du/g, '두'],
    [/ta/g, '타'], [/te/g, '테'], [/ti/g, '티'], [/to/g, '토'], [/tu/g, '투'],
    [/ka/g, '카'], [/ke/g, '케'], [/ki/g, '키'], [/ko/g, '코'], [/ku/g, '쿠'],
    [/ga/g, '가'], [/ge/g, '게'], [/gi/g, '기'], [/go/g, '고'], [/gu/g, '구'],
    [/fa/g, '파'], [/fe/g, '페'], [/fi/g, '피'], [/fo/g, '포'], [/fu/g, '푸'],
    [/va/g, '바'], [/ve/g, '베'], [/vi/g, '비'], [/vo/g, '보'], [/vu/g, '부'],
    [/sa/g, '사'], [/se/g, '세'], [/si/g, '시'], [/so/g, '소'], [/su/g, '수'],
    [/za/g, '자'], [/ze/g, '제'], [/zi/g, '지'], [/zo/g, '조'], [/zu/g, '주'],
    [/ja/g, '자'], [/je/g, '제'], [/ji/g, '지'], [/jo/g, '조'], [/ju/g, '주'],
    [/ha/g, '하'], [/he/g, '헤'], [/hi/g, '히'], [/ho/g, '호'], [/hu/g, '후'],
    [/ma/g, '마'], [/me/g, '메'], [/mi/g, '미'], [/mo/g, '모'], [/mu/g, '무'],
    [/na/g, '나'], [/ne/g, '네'], [/ni/g, '니'], [/no/g, '노'], [/nu/g, '누'],
    [/la/g, '라'], [/le/g, '레'], [/li/g, '리'], [/lo/g, '로'], [/lu/g, '루'],
    [/ra/g, '라'], [/re/g, '레'], [/ri/g, '리'], [/ro/g, '로'], [/ru/g, '루'],

    // Final consonant clusters at word end (preceded by vowel) — simple endings
    [/ng\b/g, 'ㅇ'], [/nk\b/g, 'ㅇ크'], [/nt\b/g, 'ㄴ트'], [/nd\b/g, 'ㄴ드'],
    [/m\b/g, 'ㅁ'], [/n\b/g, 'ㄴ'], [/l\b/g, 'ㄹ'], [/r\b/g, '르'],

    // Standalone vowels (fallback for leftover vowels)
    [/a/g, '아'], [/e/g, '에'], [/i/g, '이'], [/o/g, '오'], [/u/g, '우'],

    // Standalone consonants that survived
    [/b/g, '브'], [/p/g, '프'], [/d/g, '드'], [/t/g, '트'],
    [/k/g, '크'], [/g/g, '그'], [/f/g, '프'], [/v/g, '브'],
    [/s/g, '스'], [/z/g, '즈'], [/j/g, '즈'], [/h/g, '흐'],
    [/m/g, 'ㅁ'], [/n/g, 'ㄴ'], [/l/g, 'ㄹ'], [/r/g, '르'],
    [/c/g, '크'], [/x/g, '크스'], [/y/g, '이'], [/w/g, '우'], [/q/g, '크'],
];

// Combine trailing standalone jamo (ㅇ ㄹ ㄴ ㅁ ㄱ ㄷ ㅂ ㅅ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ)
// into the preceding complete syllable so "보ㅇ쥬르" becomes "봉쥬르" and
// "헤ㄹ로" becomes "헬로".
const JONG_OF_JAMO = {
    'ㄱ': 1, 'ㄲ': 2, 'ㄴ': 4, 'ㄷ': 7, 'ㄹ': 8, 'ㅁ': 16, 'ㅂ': 17,
    'ㅅ': 19, 'ㅆ': 20, 'ㅇ': 21, 'ㅈ': 22, 'ㅊ': 23, 'ㅋ': 24,
    'ㅌ': 25, 'ㅍ': 26, 'ㅎ': 27,
};
const composeFinalJamo = (text) => {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const cur = text[i];
        const next = text[i + 1];
        const code = cur.charCodeAt(0);
        if (next && JONG_OF_JAMO[next] && code >= 0xAC00 && code <= 0xD7A3) {
            const idx = code - 0xAC00;
            const cho = Math.floor(idx / (21 * 28));
            const jung = Math.floor(idx / 28) % 21;
            const jong = idx % 28;
            if (jong === 0) {
                const composed = 0xAC00 + (cho * 21 + jung) * 28 + JONG_OF_JAMO[next];
                out += String.fromCharCode(composed);
                i++;
                continue;
            }
        }
        out += cur;
    }
    return out;
};

const transliterateLatinWord = (rawWord, langBase) => {
    if (!rawWord) return '';
    const match = rawWord.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}À-ɏḀ-ỿ']*)(.*)$/u);
    if (!match) return rawWord;
    const [, leading, core, trailing] = match;
    if (!core) return rawWord;

    let w = core.toLowerCase();
    const preproc = PREPROCESSORS[langBase];
    if (preproc) w = preproc(w);
    w = stripDiacritics(w);

    let out = w;
    for (const [pat, han] of LATIN_HANGUL_RULES) out = out.replace(pat, han);
    // Anything left (rare) — strip it so we don't leak raw Latin.
    out = out.replace(/[a-z]/g, '');
    out = composeFinalJamo(out);

    return leading + out + trailing;
};

export const latinToHangul = (text, lang = '') => {
    if (!text) return '';
    const langBase = (lang || '').split('-')[0].toLowerCase();
    // Split on whitespace but preserve it so spacing is faithful.
    return text.split(/(\s+)/).map((part) => {
        if (/^\s+$/.test(part) || !part) return part;
        return transliterateLatinWord(part, langBase);
    }).join('');
};

// ---------------------------------------------------------------------------
// Universal entry point used by the UI
// ---------------------------------------------------------------------------

export const getPronunciationDisplay = ({ translatedText, targetLang, romanFromServer }) => {
    if (!translatedText) return '';
    const lang = targetLang || '';

    if (isNonLatinScript(lang)) {
        if (romanFromServer && romanFromServer.trim()) return romanFromServer.trim();
        return '';
    }

    if (isLatinScript(lang)) {
        return latinToHangul(translatedText, lang);
    }

    return romanFromServer || '';
};
