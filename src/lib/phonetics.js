// Basic phonetics mapper for Japanese Romaji and Chinese Pinyin to Korean Hangul
export const romajiToHangul = (text) => {
  if (!text) return '';
  let res = text.toLowerCase();
  
  // Custom simple replacements for common Japanese greetings / words
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
    "anata": "아나타"
  };
  
  for (const [key, val] of Object.entries(map)) {
    if (res.includes(key)) return val; 
  }

  // Fallback simple character replacements
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
    [/-/g, '']
  ];
  
  // We won't apply full regex replace if it's too complex, just return a note 
  // or a very rough transliteration.
  let transliterated = res;
  for (const [reg, kor] of fallbacks) {
    transliterated = transliterated.replace(reg, kor);
  }
  return transliterated;
};

export const pinyinToHangul = (text) => {
  if (!text) return '';
  let res = text.toLowerCase();
  
  // Strip tones
  res = res.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const map = {
    "ni hao": "니 하오",
    "xiexie": "씨에씨에",
    "zaijian": "짜이찌앤",
    "dui bu qi": "뚜이 부 치",
    "mei guan xi": "메이 관 시",
    "wo ai ni": "워 아이 니",
    "shi": "스",
    "bushi": "부 스",
    "hao": "하오"
  };

  for (const [key, val] of Object.entries(map)) {
    if (res.includes(key)) return val;
  }
  
  // Very rough fallback
  const fallbacks = [
    [/zh/g, '즈'], [/ch/g, '츠'], [/sh/g, '스'],
    [/b/g, '빠'], [/p/g, '파'], [/m/g, '마'], [/f/g, '파'],
    [/d/g, '따'], [/t/g, '타'], [/n/g, '나'], [/l/g, '라'],
    [/g/g, '까'], [/k/g, '카'], [/h/g, '하'],
    [/j/g, '찌'], [/q/g, '치'], [/x/g, '씨'],
    [/z/g, '쯔'], [/c/g, '츠'], [/s/g, '쓰'],
    [/a/g, '아'], [/o/g, '오'], [/e/g, '어'], [/i/g, '이'], [/u/g, '우'], [/v/g, '위'],
    [/ /g, ' ']
  ];
  
  let transliterated = res;
  for (const [reg, kor] of fallbacks) {
    transliterated = transliterated.replace(reg, kor);
  }
  return transliterated;
};
