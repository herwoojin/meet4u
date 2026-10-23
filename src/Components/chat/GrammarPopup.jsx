import React, { useEffect, useState } from 'react';
import { X, BookOpen, Sparkles, Loader, KeyRound, Save, Eye, EyeOff, Trash2, Printer } from 'lucide-react';
import { analyzeWithGemini, getLanguageDisplay } from '../../lib/grammar';
import { buildStudy } from '../../lib/studyPipeline';
import { StudyCards, openStudyPrint } from './StudyCards';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';

// 대화 메시지 "문법 분석" 팝업 — 언어 공부용.
//
// 예전엔 번역문을 글자 수로 잘라(중국어 2글자씩, 일본어 2~3글자씩) 주어/동사 역할을
// 위치로 추측했고, 한국어 원문은 번역을 거꾸로 돌려 만들어 이름이 바뀌곤 했다.
// 지금은 studyPipeline 이 한국어 원문을 문장 단위로 나눠 문장마다 따로 번역하고,
// 단어는 언어별 사전 분절(Intl.Segmenter) + 구글 사전 뜻·품사·발음으로 채운다.
const GrammarPopup = ({ open, onClose, text, lang, koreanOriginal = '', isAdmin = false }) => {
    const [geminiResult, setGeminiResult] = useState(null);
    const [geminiLoading, setGeminiLoading] = useState(false);
    const [geminiError, setGeminiError] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [keyVisible, setKeyVisible] = useState(false);
    const [study, setStudy] = useState(null);

    const languageLabel = getLanguageDisplay(lang);

    const gemini = useGeminiApiKey();
    const adminAvailable = gemini.hasAdminKey && isAdmin;
    const resolvedKey = gemini.key;
    const canUseGemini = Boolean(resolvedKey);

    useEffect(() => {
        if (!open) return;
        setGeminiResult(null);
        setGeminiError('');
        setShowSettings(false);
        setKeyInput(gemini.key || '');
    }, [open, text, lang, isAdmin, gemini.key]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // 문장 나누기 → 문장별 번역 → 단어 뜻. 단계마다 화면을 갱신해 바로 읽기 시작할 수 있다.
    useEffect(() => {
        setStudy(null);
        if (!open || !text) return;
        let cancelled = false;
        buildStudy({ text, lang, koreanOriginal }, (m) => { if (!cancelled) setStudy(m); })
            .catch((err) => console.error('study build failed:', err));
        return () => { cancelled = true; };
    }, [open, text, lang, koreanOriginal]);

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

    const saveKey = async () => {
        const trimmed = keyInput.trim();
        await gemini.saveKey(trimmed);
        setShowSettings(false);
    };

    const clearKey = async () => {
        await gemini.clearKey();
        setKeyInput('');
    };

    if (!open) return null;

    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}월${String(now.getDate()).padStart(2, '0')}일`;

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
                            문법 분석 · {languageLabel}
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

                {/* Quick action: Today's study PDF — 단어 뜻까지 다 채워진 뒤에 연다 */}
                <div className="px-4 pt-3">
                    <button
                        type="button"
                        onClick={() => openStudyPrint(study, languageLabel)}
                        disabled={!study?.done}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-40 shadow"
                        title="A4 인쇄용 학습지로 변환 후 PDF로 저장"
                    >
                        {study?.done ? <Printer size={14} /> : <Loader size={14} className="animate-spin" />}
                        오늘({mmdd})의 공부 — A4 PDF로 저장
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <StudyCards study={study} languageLabel={languageLabel} />

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
