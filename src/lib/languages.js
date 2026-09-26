// 사용자 선호 언어(users/{uid}.preferredLanguage) 목록 — 단일 출처.
//
// 주의: 이 목록은 "내가 받을 채팅 메시지를 번역할 대상 언어" 이다.
// 사이드바/헤더의 LanguageSwitcher 가 바꾸는 "UI 자체의 언어"(i18next, ko/en/zh)
// 와는 다른 개념이므로 혼동하지 말 것.
export const SUPPORTED_LANGUAGES = [
    { code: 'ko',    label: '🇰🇷 한국어(Korean)' },
    { code: 'en',    label: '🇺🇸 English(영어)' },
    { code: 'zh-CN', label: '🇨🇳 中文(Chinese)' },
    { code: 'ja',    label: '🇯🇵 日本語(Japanese)' },
    { code: 'ru',    label: '🇷🇺 Русский(Russian)' },
    { code: 'es',    label: '🇪🇸 Español(Spanish)' },
    { code: 'vi',    label: '🇻🇳 Tiếng Việt(Vietnamese)' },
    { code: 'mn',    label: '🇲🇳 Монгол(Mongolian)' },
    { code: 'ar',    label: '🇸🇦 العربية(Arabic)' },
    { code: 'fr',    label: '🇫🇷 Français(French)' },
    { code: 'km',    label: '🇰🇭 ភាសាខ្មែរ(Cambodian)' },
    { code: 'bn',    label: '🇧🇩 বাংলা(Bengali / 방글라데시)' },
    { code: 'uz',    label: '🇺🇿 Oʻzbek(Uzbek / 우즈베키스탄)' },
    { code: 'si',    label: '🇱🇰 සිංහල(Sinhala / 스리랑카)' },
    { code: 'my',    label: '🇲🇲 မြန်မာ(Burmese / 미얀마)' },
    { code: 'tl',    label: '🇵🇭 Filipino(Tagalog / 필리핀)' },
    { code: 'th',    label: '🇹🇭 ไทย(Thai / 태국)' },
    { code: 'id',    label: '🇮🇩 Bahasa Indonesia(인도네시아)' },
    { code: 'ne',    label: '🇳🇵 नेपाली(Nepali / 네팔)' },
];

// 짧은 표기 (카드/뱃지용). 예: 'ko' → '🇰🇷 한국어'
export const shortLangLabel = (code) => {
    const full = SUPPORTED_LANGUAGES.find(l => l.code === code)?.label;
    if (!full) return code || 'ko';
    return full.replace(/\s*\(.*\)$/, '');   // 괄호 안 영문 설명 제거
};
