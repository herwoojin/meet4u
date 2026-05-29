// Google Translate API (free, no API key required)
// Uses the same endpoint as Google Translate web interface
// Supports all language pairs with high quality

// Minimal copy of the client-side Latin → Hangul transliteration so that
// new messages get a pronunciation guide for Latin-script target languages
// (French/English/German/Spanish/Italian/Portuguese/Vietnamese/…) without
// needing the client to backfill. Kept intentionally narrow — full rules
// live in src/lib/phonetics.js.
const LATIN_LANGS = new Set([
    'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'no', 'da',
    'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'tr', 'vi', 'id', 'ms',
    'tl', 'sw', 'af', 'ca', 'gl', 'eu', 'is', 'lt', 'lv', 'et',
    'sl', 'hr', 'sr', 'mt', 'ga', 'cy', 'la', 'eo', 'sq',
]);
const NON_LATIN_LANGS = new Set([
    'ko', 'ja', 'zh', 'zh-CN', 'zh-TW', 'th', 'ar', 'ru', 'uk', 'be',
    'el', 'hi', 'bn', 'ta', 'te', 'kn', 'ml', 'gu', 'pa', 'mr', 'ne',
    'si', 'km', 'lo', 'my', 'mn', 'he', 'fa', 'ur', 'ps', 'yi', 'am',
    'ka', 'hy', 'iw',
]);

const isLatin = (lang) => {
    if (!lang) return false;
    const lc = String(lang).toLowerCase();
    if (NON_LATIN_LANGS.has(lc)) return false;
    if (LATIN_LANGS.has(lc)) return true;
    const base = lc.split('-')[0];
    if (NON_LATIN_LANGS.has(base)) return false;
    return LATIN_LANGS.has(base);
};

const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const PREPROCESSORS = {
    fr: (w) => w
        .replace(/œ/g, 'eu').replace(/æ/g, 'ae').replace(/ç/g, 's')
        .replace(/é|è|ê|ë/g, 'e').replace(/à|â/g, 'a').replace(/î|ï/g, 'i')
        .replace(/ô|ö/g, 'o').replace(/û|ù|ü/g, 'u')
        .replace(/eaux?\b/g, 'o').replace(/aux?\b/g, 'o').replace(/eau/g, 'o')
        .replace(/qu/g, 'k').replace(/gn/g, 'ny').replace(/ch/g, 'sh').replace(/ph/g, 'f')
        .replace(/ill/g, 'iy').replace(/oin/g, 'wang').replace(/oi/g, 'wa')
        .replace(/oui/g, 'wi').replace(/ou/g, 'u').replace(/ai|ei/g, 'e').replace(/eu/g, 'oe')
        .replace(/ent\b/g, 'ang').replace(/(an|en|am|em)/g, 'ang')
        .replace(/(on|om)/g, 'ong').replace(/(in|im|yn|ym)/g, 'eng').replace(/(un|um)/g, 'eong')
        .replace(/j/g, 'zh').replace(/^h/, '').replace(/(?<=[aeiou])h/g, '')
        .replace(/s\b/g, '').replace(/d\b/g, '').replace(/t\b/g, '')
        .replace(/x\b/g, '').replace(/z\b/g, '').replace(/p\b/g, ''),
    de: (w) => w
        .replace(/ä/g, 'e').replace(/ö/g, 'oe').replace(/ü/g, 'wi').replace(/ß/g, 'ss')
        .replace(/sch/g, 'sh').replace(/tsch/g, 'ch').replace(/ch/g, 'h').replace(/ck/g, 'k')
        .replace(/sp/g, 'shp').replace(/st/g, 'sht')
        .replace(/ie/g, 'i').replace(/ei/g, 'ai').replace(/eu|äu/g, 'oi')
        .replace(/v/g, 'f').replace(/w/g, 'v').replace(/z/g, 'ts').replace(/j/g, 'y'),
    es: (w) => w
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú|ü/g, 'u')
        .replace(/ñ/g, 'ny').replace(/ll/g, 'y').replace(/rr/g, 'r')
        .replace(/qu/g, 'k').replace(/gu([ei])/g, 'g$1')
        .replace(/c([ei])/g, 's$1').replace(/c/g, 'k').replace(/g([ei])/g, 'h$1')
        .replace(/j/g, 'h').replace(/h/g, '').replace(/z/g, 's').replace(/v/g, 'b'),
    it: (w) => w
        .replace(/à/g, 'a').replace(/è|é/g, 'e').replace(/ì|í/g, 'i').replace(/ò|ó/g, 'o').replace(/ù|ú/g, 'u')
        .replace(/sci(?=[aeou])|sc(?=[ei])/g, 'sh').replace(/sc/g, 'sk')
        .replace(/gn/g, 'ny').replace(/gli/g, 'lyi').replace(/gl(?=[aeiou])/g, 'ly')
        .replace(/ci(?=[aeou])|c(?=[ei])/g, 'ch').replace(/c/g, 'k')
        .replace(/chi/g, 'ki').replace(/che/g, 'ke')
        .replace(/gi(?=[aeou])|g(?=[ei])/g, 'j')
        .replace(/ghi/g, 'gi').replace(/ghe/g, 'ge')
        .replace(/h/g, '').replace(/z/g, 'ts').replace(/qu/g, 'kw'),
    pt: (w) => w
        .replace(/á|à|â/g, 'a').replace(/ã/g, 'ang').replace(/é|ê/g, 'e').replace(/í/g, 'i')
        .replace(/ó|ô/g, 'o').replace(/õ/g, 'ong').replace(/ú/g, 'u').replace(/ç/g, 's')
        .replace(/nh/g, 'ny').replace(/lh/g, 'ly').replace(/ch/g, 'sh')
        .replace(/qu([ei])/g, 'k$1').replace(/qu/g, 'kw').replace(/gu([ei])/g, 'g$1')
        .replace(/c([ei])/g, 's$1').replace(/c/g, 'k').replace(/g([ei])/g, 'j$1')
        .replace(/j/g, 'zh').replace(/x/g, 'sh').replace(/m\b/g, 'ng'),
    vi: (w) => w
        .replace(/đ/g, 'd').replace(/ơ|ô/g, 'o').replace(/ư/g, 'eu').replace(/ă|â/g, 'a').replace(/ê/g, 'e')
        .replace(/[̀-ͯ]/g, '')
        .replace(/qu/g, 'kw').replace(/gi/g, 'zi').replace(/ph/g, 'f').replace(/tr/g, 'ch'),
    en: (w) => w
        .replace(/ough\b/g, 'o').replace(/ought\b/g, 'ot')
        .replace(/tion\b/g, 'shun').replace(/sion\b/g, 'shun').replace(/ture\b/g, 'cheo').replace(/qu/g, 'kw')
        .replace(/th/g, 'd').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/wh/g, 'w')
        .replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/ea/g, 'i').replace(/ai/g, 'ei')
        .replace(/ay\b/g, 'ei').replace(/oy\b/g, 'oi').replace(/ou/g, 'au').replace(/ow/g, 'au')
        .replace(/ing\b/g, 'ing').replace(/er\b/g, 'eo').replace(/y\b/g, 'i')
        .replace(/c(?=[ei])/g, 's').replace(/c/g, 'k').replace(/g(?=[ei])/g, 'j').replace(/x/g, 'ks'),
};

const LATIN_HANGUL_RULES = [
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
    [/ai/g, '아이'], [/ei/g, '에이'], [/oi/g, '오이'], [/au/g, '아우'], [/ou/g, '오우'],
    [/ae/g, '에'], [/oe/g, '외'], [/ie/g, '이에'], [/eo/g, '어'], [/iu/g, '이우'],
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
    [/ng\b/g, 'ㅇ'], [/nk\b/g, 'ㅇ크'], [/nt\b/g, 'ㄴ트'], [/nd\b/g, 'ㄴ드'],
    [/m\b/g, 'ㅁ'], [/n\b/g, 'ㄴ'], [/l\b/g, 'ㄹ'], [/r\b/g, '르'],
    [/a/g, '아'], [/e/g, '에'], [/i/g, '이'], [/o/g, '오'], [/u/g, '우'],
    [/b/g, '브'], [/p/g, '프'], [/d/g, '드'], [/t/g, '트'],
    [/k/g, '크'], [/g/g, '그'], [/f/g, '프'], [/v/g, '브'],
    [/s/g, '스'], [/z/g, '즈'], [/j/g, '즈'], [/h/g, '흐'],
    [/m/g, 'ㅁ'], [/n/g, 'ㄴ'], [/l/g, 'ㄹ'], [/r/g, '르'],
    [/c/g, '크'], [/x/g, '크스'], [/y/g, '이'], [/w/g, '우'], [/q/g, '크'],
];

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

const latinToHangul = (text, lang = '') => {
    if (!text) return '';
    const langBase = String(lang).split('-')[0].toLowerCase();
    return text.split(/(\s+)/).map((part) => {
        if (/^\s+$/.test(part) || !part) return part;
        const match = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}À-ɏḀ-ỿ']*)(.*)$/u);
        if (!match) return part;
        const [, leading, core, trailing] = match;
        if (!core) return part;
        let w = core.toLowerCase();
        const preproc = PREPROCESSORS[langBase];
        if (preproc) w = preproc(w);
        w = stripDiacritics(w);
        let out = w;
        for (const [pat, han] of LATIN_HANGUL_RULES) out = out.replace(pat, han);
        out = out.replace(/[a-z]/g, '');
        out = composeFinalJamo(out);
        return leading + out + trailing;
    }).join('');
};

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { text, sourceLang = 'ko', targetLang } = JSON.parse(event.body);

        if (!text || !targetLang) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing text or targetLang parameters' })
            };
        }

        // Skip API call if source == target
        if (sourceLang === targetLang) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ translatedText: text, skipped: true })
            };
        }

        // Step 1: Translate the text
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Translate API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Google Translate returns nested arrays: data[0] contains translation segments
        // Each segment is [translatedText, originalText, ...]
        let translatedText = '';
        if (data && data[0]) {
            translatedText = data[0]
                .filter(segment => segment && segment[0])
                .map(segment => segment[0])
                .join('');
        }

        if (!translatedText) {
            throw new Error('Empty translation result');
        }

        // Step 2: Get a pronunciation guide for the TRANSLATED text.
        //   - Non-Latin target (ko/ja/zh/ar/ru/th/…): Google's dt=rm gives a
        //     Latin romanization, e.g. "naneun gongbuhanda".
        //   - Latin target (fr/en/de/es/it/pt/vi/…): Google returns nothing
        //     (the text is already Latin). We transliterate the translation
        //     into Korean Hangul so that a Korean reader can sound it out.
        let pronunciation = '';
        if (isLatin(targetLang)) {
            pronunciation = latinToHangul(translatedText, targetLang);
        } else {
            try {
                const romanUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(targetLang)}&tl=en&dt=rm&q=${encodeURIComponent(translatedText)}`;
                const romanRes = await fetch(romanUrl);
                if (romanRes.ok) {
                    const romanData = await romanRes.json();
                    if (romanData && romanData[0]) {
                        const parts = romanData[0]
                            .filter(seg => seg)
                            .map(seg => seg[3] || seg[2] || '')
                            .filter(Boolean);
                        pronunciation = parts.join(' ').trim();
                    }
                }
            } catch (romanErr) {
                console.warn('Romanization fetch failed (translation OK):', romanErr.message);
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ translatedText, pronunciation })
        };
    } catch (error) {
        console.error('Translation error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message || 'Translation failed' })
        };
    }
};
