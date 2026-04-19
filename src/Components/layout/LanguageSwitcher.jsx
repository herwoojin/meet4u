import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { SUPPORTED_UI_LANGUAGES } from '../../i18n';

const LanguageSwitcher = ({ compact = false }) => {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    // Normalize things like "zh-CN" → "zh", "en-US" → "en"
    const currentBase = (i18n.language || 'ko').split('-')[0];
    const current = SUPPORTED_UI_LANGUAGES.find(l => l.code === currentBase) || SUPPORTED_UI_LANGUAGES[0];

    useEffect(() => {
        const handleOutside = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleOutside);
        }
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isOpen]);

    const changeLang = (code) => {
        i18n.changeLanguage(code);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}
                title="Change language"
            >
                <Globe size={compact ? 14 : 16} className="text-gray-500" />
                <span className="font-medium text-gray-700">{current.label}</span>
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    {SUPPORTED_UI_LANGUAGES.map(lang => (
                        <button
                            key={lang.code}
                            onClick={() => changeLang(lang.code)}
                            className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-gray-50 ${lang.code === currentBase ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}
                        >
                            <span>{lang.label}</span>
                            {lang.code === currentBase && <Check size={14} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LanguageSwitcher;
