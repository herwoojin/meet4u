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
// 병음(중국어) · 로마자(일본어) → 한글 발음
//
// 예전 구현은 통문장 사전 몇 개 + 글자 치환이라 대부분의 문장을 망가뜨렸다
// (실측: "Jīntiān de tiānqì zhēn hǎo." → "하오", "Watashi no namae wa …" → "와타시").
// 이제 음절 단위로 파싱해 외래어 표기법에 가깝게 자모를 조립한다.
// 병음·로마자가 아닌 단어(GS, Retail 등)는 원래 모양 그대로 둔다.
// ---------------------------------------------------------------------------

// 초성: ㄱ0 ㄲ1 ㄴ2 ㄷ3 ㄸ4 ㄹ5 ㅁ6 ㅂ7 ㅃ8 ㅅ9 ㅆ10 ㅇ11 ㅈ12 ㅉ13 ㅊ14 ㅋ15 ㅌ16 ㅍ17 ㅎ18
// 중성: ㅏ0 ㅐ1 ㅑ2 ㅒ3 ㅓ4 ㅔ5 ㅕ6 ㅖ7 ㅗ8 ㅘ9 ㅙ10 ㅚ11 ㅛ12 ㅜ13 ㅝ14 ㅞ15 ㅟ16 ㅠ17 ㅡ18 ㅢ19 ㅣ20
// 종성: 없음0 ㄴ4 ㄹ8 ㅅ19 ㅇ21
const syl = (cho, jung, jong = 0) => String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28 + jong);
const V = { a: 0, ya: 2, eo: 4, e: 5, ye: 7, o: 8, wa: 9, yo: 12, u: 13, wo: 14, we: 15, wi: 16, yu: 17, eu: 18, i: 20 };
const J = { n: 4, l: 8, s: 19, ng: 21 };
const COMBINING = /[̀-ͯ]/g;
const WORD_RE = /[A-Za-z̀-ͯ']+/g;

// --- 중국어 병음 -----------------------------------------------------------
const PY_INITIAL = { b: 7, p: 17, m: 6, f: 17, d: 3, t: 16, n: 2, l: 5, g: 0, k: 15, h: 18, j: 12, q: 14, x: 9, zh: 12, ch: 14, sh: 9, r: 5, z: 13, c: 14, s: 10 };
// 운모 → [[중성, 종성?], …] (첫 음절에 성모가 붙고 나머지는 ㅇ 으로 시작)
const PY_FINAL = {
    a: [['a']], o: [['o']], e: [['eo']], er: [['eo', 'l']], i: [['i']], u: [['u']], v: [['wi']],
    ai: [['a'], ['i']], ei: [['e'], ['i']], ao: [['a'], ['o']], ou: [['eo'], ['u']],
    an: [['a', 'n']], en: [['eo', 'n']], ang: [['a', 'ng']], eng: [['eo', 'ng']], ong: [['u', 'ng']],
    ia: [['ya']], ie: [['ye']], iao: [['ya'], ['o']], iu: [['yu']], iou: [['yu']], ian: [['ye', 'n']],
    in: [['i', 'n']], iang: [['ya', 'ng']], ing: [['i', 'ng']], iong: [['yu', 'ng']],
    ua: [['wa']], uo: [['wo']], uai: [['wa'], ['i']], ui: [['u'], ['i']], uei: [['we'], ['i']],
    uan: [['wa', 'n']], un: [['u', 'n']], uen: [['wo', 'n']], uang: [['wa', 'ng']], ueng: [['wo', 'ng']],
    ue: [['we']], ve: [['we']], van: [['wi'], ['a', 'n']], vn: [['wi', 'n']],
};
const PY_FINAL_KEYS = Object.keys(PY_FINAL).sort((a, b) => b.length - a.length);
const PY_INIT_KEYS = ['zh', 'ch', 'sh', ...'bpmfdtnlgkhjqxrzcsyw'.split('')];

const parsePinyinSyllable = (w, i) => {
    let init = '';
    for (const k of PY_INIT_KEYS) if (w.startsWith(k, i)) { init = k; break; }
    const j = i + init.length;
    for (const f of PY_FINAL_KEYS) {
        if (!w.startsWith(f, j)) continue;
        // 운모 끝 n/ng 뒤에 모음이 오면 그 n/g 는 다음 음절의 성모 (예: zhōngguó → zhong+guo)
        const next = w[j + f.length];
        if (/[ng]$/.test(f) && next && /[aeiouv]/.test(next)) continue;
        return { init, fin: f, len: init.length + f.length };
    }
    return null;
};

const pinyinSyllableToHangul = (init, fin) => {
    // y · w 는 성모가 아니라 운모의 일부 (ya=ia, wo=uo, yu=ü …)
    if (init === 'y') {
        init = '';
        if (fin.startsWith('u')) fin = 'v' + fin.slice(1);          // yu yue yuan yun
        else if (fin === 'ou') fin = 'iu';
        else if (!fin.startsWith('i')) fin = 'i' + fin;             // ya ye yao yan yang yong
    } else if (init === 'w') {
        init = '';
        if (fin === 'ei') fin = 'uei';
        else if (fin === 'en') fin = 'uen';
        else if (fin === 'eng') fin = 'ueng';
        else if (fin !== 'u') fin = 'u' + fin;                      // wa wo wai wan wang
    }
    if (/^[jqx]$/.test(init) && fin.startsWith('u')) fin = 'v' + fin.slice(1);   // j q x 뒤 u = ü
    if (!PY_FINAL[fin]) return null;
    let parts = PY_FINAL[fin].map((x) => [...x]);
    if (fin === 'i' && /^(zh|ch|sh|r|z|c|s)$/.test(init)) parts = [['eu']];       // zhi 즈, shi 스, si 쓰
    const cho = init ? PY_INITIAL[init] : 11;
    // ㅈ ㅉ ㅊ + ㅑㅖㅛㅠ → ㅏㅔㅗㅜ (표기법: jia 자, jie 제, jiu 주, qiao 차오)
    if (cho === 12 || cho === 13 || cho === 14) {
        const soften = { ya: 'a', ye: 'e', yo: 'o', yu: 'u' };
        if (soften[parts[0][0]]) parts[0][0] = soften[parts[0][0]];
    }
    return parts.map(([v, f], k) => syl(k === 0 ? cho : 11, V[v], f ? J[f] : 0)).join('');
};

const convertPinyinWord = (w) => {
    let out = '', i = 0;
    while (i < w.length) {
        const p = parsePinyinSyllable(w, i);
        if (!p) return null;
        const h = pinyinSyllableToHangul(p.init, p.fin);
        if (!h) return null;
        out += h;
        i += p.len;
    }
    return out;
};

export const pinyinToHangul = (text) => {
    if (!text) return '';
    // 단어마다 ü 를 v 로 보존하고 성조 부호를 지운 소문자 사본으로 파싱. 아포스트로피는 음절 경계(Xī'ān 시안).
    return String(text).normalize('NFD').replace(WORD_RE, (raw) => {
        const lower = raw.toLowerCase().replace(/ü/g, 'v').replace(COMBINING, '');
        const parts = lower.split("'").filter(Boolean).map(convertPinyinWord);
        return parts.length && parts.every((x) => x != null) ? parts.join('') : raw;
    }).normalize('NFC');
};

// --- 일본어 로마자(헵번식) -------------------------------------------------
const RJ_CONS = {
    k: 15, g: 0, s: 9, z: 12, t: 16, d: 3, n: 2, h: 18, f: 18, b: 7, p: 17, m: 6, r: 5, w: 11, y: 11,
    sh: 9, ch: 14, ts: 14, j: 12,
    ky: 15, gy: 0, ny: 2, hy: 18, by: 7, py: 17, my: 6, ry: 5,
};
const RJ_CONS_KEYS = Object.keys(RJ_CONS).sort((a, b) => b.length - a.length);
const RJ_VOWELS = 'aiueo';

const romajiSyllable = (cons, vowel) => {
    let v = { a: 'a', i: 'i', u: 'u', e: 'e', o: 'o' }[vowel];
    if (vowel === 'u' && /^(s|z|ts)$/.test(cons)) v = 'eu';                    // su 스, zu 즈, tsu 츠
    if (cons === 'w' && vowel === 'a') v = 'wa';                               // wa 와 (wo 는 오)
    if (cons === 'y' || /y$/.test(cons) || cons === 'sh') {                    // ya 야, kyo 쿄, sha 샤
        v = { a: 'ya', u: 'yu', o: 'yo', e: 'ye', i: 'i' }[vowel];
    }
    return syl(cons ? RJ_CONS[cons] : 11, V[v]);                             // ch·j 는 ㅊ·ㅈ + 단모음 (cha 차, jo 조)
};

// 앞 음절에 받침을 붙인다 (ん → ㄴ, っ → ㅅ)
const addJong = (str, jong) => {
    if (!str) return str;
    const code = str.charCodeAt(str.length - 1) - 0xAC00;
    if (code < 0 || code > 11171 || code % 28 !== 0) return str;
    return str.slice(0, -1) + String.fromCharCode(0xAC00 + code + jong);
};

const convertRomajiWord = (word) => {
    let out = '', i = 0;
    while (i < word.length) {
        const c = word[i];
        if (c === "'") { i++; continue; }
        // ん: n 뒤에 모음·y 가 오지 않으면 받침
        if (c === 'n' && (i + 1 >= word.length || !/[aiueoy]/.test(word[i + 1]))) {
            out = out ? addJong(out, J.n) : '응';
            i++; continue;
        }
        // っ: 같은 자음 두 번(kk tt ss pp …) 또는 tch → 앞 음절 ㅅ 받침
        if (/[kstpgdzbhfmr]/.test(c) && (word[i + 1] === c || (c === 't' && word.startsWith('ch', i + 1)))) {
            out = addJong(out, J.s);
            i++; continue;
        }
        if (RJ_VOWELS.includes(c)) { out += romajiSyllable('', c); i++; continue; }
        let cons = '';
        for (const k of RJ_CONS_KEYS) if (word.startsWith(k, i)) { cons = k; break; }
        const vowel = word[i + cons.length];
        if (!cons || !vowel || !RJ_VOWELS.includes(vowel)) return null;      // 로마자가 아닌 단어
        out += romajiSyllable(cons, vowel);
        i += cons.length + 1;
    }
    return out;
};

export const romajiToHangul = (text) => {
    if (!text) return '';
    // 장음 부호(ō ū ā …)는 표기법대로 길이를 적지 않는다
    return String(text).normalize('NFD').replace(WORD_RE, (raw) => {
        const conv = convertRomajiWord(raw.toLowerCase().replace(COMBINING, ''));
        return conv == null ? raw : conv;
    }).normalize('NFC');
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
