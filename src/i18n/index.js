import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import zh from './locales/zh.json';

export const SUPPORTED_UI_LANGUAGES = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
];

const UI_LANG_WHITELIST = ['ko', 'en', 'zh'];

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            ko: { translation: ko },
            en: { translation: en },
            zh: { translation: zh },
        },
        fallbackLng: 'ko',
        supportedLngs: UI_LANG_WHITELIST,
        nonExplicitSupportedLngs: true, // "zh-CN" → matches "zh"
        load: 'languageOnly',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'meet4u_ui_lang',
            caches: ['localStorage'],
        },
    });

export default i18n;
