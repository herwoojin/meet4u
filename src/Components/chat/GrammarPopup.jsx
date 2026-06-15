import React, { useEffect, useMemo, useState } from 'react';
import { X, BookOpen, Sparkles, Loader, KeyRound, Save, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
    analyzeSentence,
    analyzeWithGemini,
    getGeminiKey,
    setGeminiKey,
    hasAdminGeminiKey,
} from '../../lib/grammar';

// Tailwind color → bg/text/border lookup. Tailwind needs full class names
// at build time, so we maintain an explicit map rather than templating.
const COLOR_CLASSES = {
    blue:    { bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-300',     pill: 'bg-blue-100 text-blue-700' },
    green:   { bg: 'bg-green-50',    text: 'text-green-700',    border: 'border-green-300',    pill: 'bg-green-100 text-green-700' },
    red:     { bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-300',      pill: 'bg-red-100 text-red-700' },
    purple:  { bg: 'bg-purple-50',   text: 'text-purple-700',   border: 'border-purple-300',   pill: 'bg-purple-100 text-purple-700' },
    orange:  { bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-300',   pill: 'bg-orange-100 text-orange-700' },
    indigo:  { bg: 'bg-indigo-50',   text: 'text-indigo-700',   border: 'border-indigo-300',   pill: 'bg-indigo-100 text-indigo-700' },
    pink:    { bg: 'bg-pink-50',     text: 'text-pink-700',     border: 'border-pink-300',     pill: 'bg-pink-100 text-pink-700' },
    teal:    { bg: 'bg-teal-50',     text: 'text-teal-700',     border: 'border-teal-300',     pill: 'bg-teal-100 text-teal-700' },
    slate:   { bg: 'bg-slate-50',    text: 'text-slate-700',    border: 'border-slate-300',    pill: 'bg-slate-100 text-slate-700' },
    rose:    { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-300',     pill: 'bg-rose-100 text-rose-700' },
    fuchsia: { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  border: 'border-fuchsia-300',  pill: 'bg-fuchsia-100 text-fuchsia-700' },
    amber:   { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-300',    pill: 'bg-amber-100 text-amber-700' },
    cyan:    { bg: 'bg-cyan-50',     text: 'text-cyan-700',     border: 'border-cyan-300',     pill: 'bg-cyan-100 text-cyan-700' },
    lime:    { bg: 'bg-lime-50',     text: 'text-lime-700',     border: 'border-lime-300',     pill: 'bg-lime-100 text-lime-700' },
    emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-400',  pill: 'bg-emerald-100 text-emerald-700' },
    gray:    { bg: 'bg-gray-50',     text: 'text-gray-700',     border: 'border-gray-300',     pill: 'bg-gray-100 text-gray-700' },
};
const cls = (color) => COLOR_CLASSES[color] || COLOR_CLASSES.gray;

const GrammarPopup = ({ open, onClose, text, lang, isAdmin = false }) => {
    const [geminiResult, setGeminiResult] = useState(null);
    const [geminiLoading, setGeminiLoading] = useState(false);
    const [geminiError, setGeminiError] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [keyVisible, setKeyVisible] = useState(false);
    const [keyVersion, setKeyVersion] = useState(0); // bump to re-resolve key after save

    // Local analysis is instant — recompute when text/lang changes.
    const local = useMemo(() => analyzeSentence(text || '', lang), [text, lang]);

    const adminAvailable = hasAdminGeminiKey() && isAdmin;
    const resolvedKey = useMemo(() => getGeminiKey({ isAdmin }), [isAdmin, keyVersion, open]);
    const canUseGemini = Boolean(resolvedKey);

    useEffect(() => {
        if (!open) return;
        setGeminiResult(null);
        setGeminiError('');
        setShowSettings(false);
        setKeyInput(getGeminiKey({ isAdmin: false }));
    }, [open, text, lang, isAdmin]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const runGemini = async () => {
        if (!text || !lang) return;
        if (!resolvedKey) { setShowSettings(true); return; }
        setGeminiLoading(true);
        setGeminiError('');
        setGeminiResult(null);
        try {
            const out = await analyzeWithGemini(text, lang, resolvedKey);
            setGeminiResult(out);
        } catch (err) {
            console.error('Gemini analysis failed:', err);
            setGeminiError(err?.message || 'Gemini 분석에 실패했습니다.');
        } finally {
            setGeminiLoading(false);
        }
    };

    const saveKey = () => {
        const trimmed = keyInput.trim();
        setGeminiKey(trimmed);
        setKeyVersion(v => v + 1);
        setShowSettings(false);
    };

    const clearKey = () => {
        setGeminiKey('');
        setKeyInput('');
        setKeyVersion(v => v + 1);
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2000] flex items-end sm:items-center justify-center p-2 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-teal-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <BookOpen size={18} className="text-indigo-600 shrink-0" />
                        <h2 className="text-sm font-bold text-gray-800 truncate">
                            문법 분석 · {local.languageLabel}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="닫기"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Original sentence */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">원문</div>
                        <div className="text-base text-gray-900 break-words leading-snug">{local.original || '(빈 문장)'}</div>
                        {local.structure && (
                            <div className="text-xs text-gray-500 mt-2">구조: <span className="font-semibold text-gray-700">{local.structure}</span></div>
                        )}
                    </div>

                    {/* Note */}
                    {local.note && (
                        <div className="text-xs leading-relaxed bg-indigo-50 text-indigo-900 rounded-lg px-3 py-2 border border-indigo-100">
                            {local.note}
                        </div>
                    )}

                    {/* Phrase breakdown */}
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">어절 분해</div>
                        <div className="space-y-2">
                            {local.phrases.length === 0 ? (
                                <div className="text-sm text-gray-400 italic">분석할 어절이 없습니다.</div>
                            ) : local.phrases.map((p, idx) => {
                                const c = cls(p.label?.color || 'gray');
                                return (
                                    <div
                                        key={idx}
                                        className={`flex items-start gap-2 p-2.5 rounded-lg border ${c.border} ${c.bg}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-base font-semibold ${c.text} break-words`}>
                                                {p.text}
                                                {p.particle && (
                                                    <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-white/60 border border-current">
                                                        +{p.particle}
                                                    </span>
                                                )}
                                                {p.punct && <span className="text-gray-400 ml-0.5">{p.punct}</span>}
                                            </div>
                                            {p.label && (
                                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.pill}`}>
                                                        {p.label.role}
                                                    </span>
                                                    <span className="text-xs text-gray-600 leading-snug">{p.label.detail}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Gemini section */}
                    <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                                <Sparkles size={14} className="text-amber-500" />
                                <span className="text-xs font-bold text-gray-800">Gemini 정밀 분석</span>
                                {adminAvailable && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">관리자 공유키</span>
                                )}
                                {!adminAvailable && canUseGemini && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-semibold">내 키</span>
                                )}
                            </div>
                            <button
                                onClick={() => setShowSettings(s => !s)}
                                className="text-[10px] text-gray-500 hover:text-indigo-600 flex items-center gap-1"
                            >
                                <KeyRound size={11} />
                                {canUseGemini ? '키 변경' : '내 키 등록'}
                            </button>
                        </div>

                        {showSettings && (
                            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                <div className="text-[11px] text-amber-900 leading-snug">
                                    Google AI Studio (aistudio.google.com) 에서 무료 Gemini API 키를 발급받아 붙여넣으세요.
                                    이 키는 본인의 브라우저(localStorage)에만 저장되며 서버에 전송되지 않습니다.
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type={keyVisible ? 'text' : 'password'}
                                        value={keyInput}
                                        onChange={e => setKeyInput(e.target.value)}
                                        placeholder="AIza... 또는 발급받은 키"
                                        className="flex-1 px-2 py-1.5 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setKeyVisible(v => !v)}
                                        className="p-1.5 rounded text-amber-700 hover:bg-amber-100"
                                        title={keyVisible ? '숨기기' : '보기'}
                                    >
                                        {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={saveKey}
                                        disabled={!keyInput.trim()}
                                        className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold bg-amber-600 text-white rounded px-2 py-1.5 hover:bg-amber-700 disabled:opacity-40"
                                    >
                                        <Save size={12} /> 저장
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearKey}
                                        className="flex items-center justify-center gap-1 text-xs font-semibold text-amber-700 border border-amber-300 rounded px-2 py-1.5 hover:bg-amber-100"
                                    >
                                        <Trash2 size={12} /> 삭제
                                    </button>
                                </div>
                            </div>
                        )}

                        {!canUseGemini && !showSettings && (
                            <div className="text-[11px] text-gray-500 leading-snug">
                                Gemini 정밀 분석은 무료 API 키가 필요합니다.
                                {isAdmin
                                    ? ' 관리자 공유 키가 설정되어 있지 않습니다. 본인 키를 등록하거나 .env 의 VITE_GEMINI_ADMIN_API_KEY 를 확인하세요.'
                                    : ' 위 “내 키 등록” 으로 본인 키를 추가하면 더 정밀한 분석을 받을 수 있습니다.'}
                            </div>
                        )}

                        {canUseGemini && (
                            <button
                                type="button"
                                onClick={runGemini}
                                disabled={geminiLoading}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded px-3 py-2 hover:opacity-90 disabled:opacity-50"
                            >
                                {geminiLoading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {geminiLoading ? '분석 중…' : (geminiResult ? '다시 분석' : '정밀 분석 실행')}
                            </button>
                        )}

                        {geminiError && (
                            <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 leading-snug">
                                {geminiError}
                            </div>
                        )}

                        {geminiResult && (
                            <div className="mt-3 space-y-2">
                                {geminiResult.structure && (
                                    <div className="text-xs text-gray-700">
                                        <span className="font-bold">구조:</span> {geminiResult.structure}
                                    </div>
                                )}
                                {Array.isArray(geminiResult.tokens) && geminiResult.tokens.length > 0 && (
                                    <div className="space-y-1.5">
                                        {geminiResult.tokens.map((t, i) => (
                                            <div key={i} className="rounded border border-gray-200 p-2 bg-white">
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-gray-900">{t.surface}</span>
                                                    {t.reading && t.reading !== t.surface && (
                                                        <span className="text-[11px] text-indigo-600 font-mono">[{t.reading}]</span>
                                                    )}
                                                    {t.pos && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">{t.pos}</span>
                                                    )}
                                                    {t.role && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">{t.role}</span>
                                                    )}
                                                </div>
                                                {t.meaning && <div className="text-xs text-gray-700 mt-1">{t.meaning}</div>}
                                                {t.note && <div className="text-[11px] text-gray-500 italic mt-0.5">💡 {t.note}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {geminiResult.overall && (
                                    <div className="text-xs text-gray-800 bg-emerald-50 border border-emerald-200 rounded p-2.5 leading-relaxed">
                                        <span className="font-bold">요약:</span> {geminiResult.overall}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GrammarPopup;
