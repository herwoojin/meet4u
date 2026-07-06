import React, { useEffect, useMemo, useState } from 'react';
import {
    X, FileText, Loader, Copy, Download, RotateCcw, Calendar, Sparkles,
    KeyRound, Save, Check, AlertCircle,
} from 'lucide-react';
import { getGeminiKey, setGeminiKey, hasAdminGeminiKey } from '../../lib/grammar';
import {
    getDefaultPrompt, getSavedPrompt, savePrompt,
    fetchMessagesInRange, generateMinutes,
    dateToInput, inputToStartOfDay, inputToEndOfDay,
} from '../../lib/meetingMinutes';

// GlobalChat 의 LANG_LABEL 과 동일 목록 — 회의록 출력에 사용할 언어명.
const LANG_NAMES = {
    ko: '한국어', en: 'English', ja: '日本語', 'zh-CN': '中文(简)', zh: '中文',
    ru: 'Русский', es: 'Español', vi: 'Tiếng Việt', mn: 'Монгол',
    ar: 'العربية', fr: 'Français', km: 'ភាសាខ្មែរ',
    bn: 'বাংলা', uz: 'Oʻzbek', si: 'සිංහල', my: 'မြန်မာ',
    tl: 'Filipino', th: 'ไทย', id: 'Bahasa Indonesia', ne: 'नेपाली',
};

const PRESETS = [
    { key: 'today',     label: '오늘' },
    { key: 'yesterday', label: '어제' },
    { key: '3days',     label: '최근 3일' },
    { key: '7days',     label: '최근 7일' },
    { key: '30days',    label: '최근 30일' },
    { key: 'custom',    label: '사용자 지정' },
];

const MeetingMinutesModal = ({ open, onClose, roomId, roomName, myLang, isAdmin = false }) => {
    const today = new Date();
    const [preset, setPreset] = useState('today');
    const [startInput, setStartInput] = useState(dateToInput(today));
    const [endInput, setEndInput] = useState(dateToInput(today));
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [msgCount, setMsgCount] = useState(0);
    const [showKey, setShowKey] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [promptSaved, setPromptSaved] = useState(false);
    const [keyVersion, setKeyVersion] = useState(0);

    const langName = LANG_NAMES[myLang] || myLang || '한국어';
    const resolvedKey = useMemo(
        () => getGeminiKey({ isAdmin }),
        [isAdmin, open, keyVersion]
    );
    const adminAvailable = hasAdminGeminiKey() && isAdmin;

    useEffect(() => {
        if (!open) return;
        setError('');
        setResult('');
        setMsgCount(0);
        setCopied(false);
        setShowKey(false);
        setPromptSaved(false);
        const saved = getSavedPrompt();
        setPrompt(saved || getDefaultPrompt(myLang));
        setKeyInput(getGeminiKey({ isAdmin: false }));
    }, [open, myLang]);

    // Esc 로 닫기
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // 프리셋 → 실제 날짜 범위 계산
    const dateRange = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = now.getDate();
        switch (preset) {
            case 'today':
                return { start: new Date(y, m, d, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
            case 'yesterday':
                return { start: new Date(y, m, d - 1, 0, 0, 0, 0), end: new Date(y, m, d - 1, 23, 59, 59, 999) };
            case '3days':
                return { start: new Date(y, m, d - 2, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
            case '7days':
                return { start: new Date(y, m, d - 6, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
            case '30days':
                return { start: new Date(y, m, d - 29, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
            case 'custom':
                return { start: inputToStartOfDay(startInput), end: inputToEndOfDay(endInput) };
            default:
                return { start: new Date(y, m, d, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
        }
    }, [preset, startInput, endInput]);

    const handleGenerate = async () => {
        if (!resolvedKey) { setShowKey(true); return; }
        if (!roomId)     { setError('먼저 대화방을 선택해 주세요.'); return; }

        setLoading(true);
        setError('');
        setResult('');
        setMsgCount(0);
        try {
            const messages = await fetchMessagesInRange(roomId, dateRange.start, dateRange.end);
            setMsgCount(messages.length);
            if (messages.length === 0) {
                setError('선택한 기간에 대화가 없습니다. 기간을 확장하거나 다른 방을 선택해 주세요.');
                return;
            }
            const minutes = await generateMinutes({
                messages,
                prompt,
                targetLanguageName: langName,
                apiKey: resolvedKey,
            });
            setResult(minutes);
        } catch (e) {
            console.error('회의록 생성 실패:', e);
            setError(e?.message || '회의록 생성 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    const handleDownload = () => {
        if (!result) return;
        const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = (roomName || 'room').replace(/[/\\?%*:|"<>]/g, '_');
        a.href = url;
        a.download = `회의록_${safeName}_${dateToInput(dateRange.start)}_${dateToInput(dateRange.end)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const resetPrompt = () => {
        setPrompt(getDefaultPrompt(myLang));
        setPromptSaved(false);
    };

    const persistPrompt = () => {
        savePrompt(prompt);
        setPromptSaved(true);
        setTimeout(() => setPromptSaved(false), 1500);
    };

    const saveMyKey = () => {
        setGeminiKey(keyInput.trim());
        setKeyVersion(v => v + 1);
        setShowKey(false);
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2200] flex items-end sm:items-center justify-center p-2 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-emerald-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText size={18} className="text-emerald-600 shrink-0" />
                        <h2 className="text-sm font-bold text-gray-800 truncate">
                            회의록 만들기 · {roomName || '(대화방)'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="닫기">
                        <X size={18} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* 기간 선택 */}
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1.5 flex items-center gap-1">
                            <Calendar size={11} /> 기간
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.key}
                                    type="button"
                                    onClick={() => setPreset(p.key)}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                                        preset === p.key
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {preset === 'custom' && (
                            <div className="flex items-center gap-2 text-xs">
                                <input
                                    type="date"
                                    value={startInput}
                                    onChange={e => setStartInput(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-200 rounded-md"
                                />
                                <span className="text-gray-400">~</span>
                                <input
                                    type="date"
                                    value={endInput}
                                    onChange={e => setEndInput(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-200 rounded-md"
                                />
                            </div>
                        )}
                        <div className="text-[10px] text-gray-500 mt-1">
                            선택 범위: <span className="font-mono">{dateToInput(dateRange.start)} ~ {dateToInput(dateRange.end)}</span>
                        </div>
                    </div>

                    {/* 출력 언어 */}
                    <div className="text-xs text-gray-600 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wide text-indigo-600 font-bold">출력 언어:</span>
                        <span className="font-semibold text-indigo-800">{langName}</span>
                        <span className="text-gray-500 text-[10px]">(내 설정 언어 기준)</span>
                    </div>

                    {/* 프롬프트 */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
                                프롬프트 (수정 가능 · 저장 시 다음에도 자동 적용)
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={resetPrompt}
                                    className="text-[10px] text-gray-500 hover:text-emerald-600 flex items-center gap-0.5"
                                    title="기본 프롬프트로 되돌리기"
                                >
                                    <RotateCcw size={10} /> 기본값
                                </button>
                                <button
                                    type="button"
                                    onClick={persistPrompt}
                                    className={`text-[10px] flex items-center gap-0.5 ${
                                        promptSaved ? 'text-green-600' : 'text-gray-500 hover:text-emerald-600'
                                    }`}
                                    title="이 프롬프트를 localStorage 에 저장"
                                >
                                    {promptSaved ? <Check size={10} /> : <Save size={10} />}
                                    {promptSaved ? '저장됨' : '저장'}
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={7}
                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400 leading-relaxed"
                        />
                    </div>

                    {/* Gemini 키 상태 */}
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                            {resolvedKey ? (
                                <>
                                    <Check size={12} className="text-green-600" />
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
                                        Gemini 키 준비됨 ({resolvedKey.slice(0, 6)}…)
                                    </span>
                                    {adminAvailable && !localStorage.getItem('meet4u_gemini_api_key') && (
                                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">관리자 공유키</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <AlertCircle size={12} className="text-amber-600" />
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                                        Gemini 키 필요
                                    </span>
                                </>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowKey(s => !s)}
                            className="text-[10px] text-gray-500 hover:text-emerald-600 flex items-center gap-0.5"
                        >
                            <KeyRound size={10} /> {resolvedKey ? '내 키 변경' : '내 키 등록'}
                        </button>
                    </div>

                    {showKey && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                            <div className="text-[11px] text-amber-900 leading-snug">
                                <a
                                    href="https://aistudio.google.com/app/apikey"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline font-bold"
                                >
                                    Google AI Studio → Create API key
                                </a>
                                {' '}로 발급받은 <b>AIza…</b> 형식 키를 붙여넣으세요.
                                본인 브라우저(localStorage)에만 저장됩니다.
                            </div>
                            <input
                                type="password"
                                value={keyInput}
                                onChange={e => setKeyInput(e.target.value)}
                                placeholder="AIzaSy..."
                                className="w-full px-2 py-1.5 text-xs border border-amber-300 rounded bg-white"
                            />
                            <button
                                onClick={saveMyKey}
                                disabled={!keyInput.trim()}
                                className="w-full text-xs font-bold bg-amber-600 text-white rounded px-2 py-1.5 hover:bg-amber-700 disabled:opacity-40"
                            >
                                저장
                            </button>
                        </div>
                    )}

                    {/* 생성 버튼 */}
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-lg hover:opacity-90 disabled:opacity-40 shadow"
                    >
                        {loading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {loading ? '생성 중… (Gemini 호출)' : '회의록 생성'}
                    </button>

                    {error && (
                        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 leading-snug whitespace-pre-wrap">
                            {error}
                        </div>
                    )}

                    {/* 결과 */}
                    {result && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
                                    결과 · {msgCount}개 메시지 기반 · {langName}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleCopy}
                                        className="text-[11px] text-gray-600 hover:text-emerald-700 flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                    >
                                        {copied ? <Check size={11} /> : <Copy size={11} />}
                                        {copied ? '복사됨' : '복사'}
                                    </button>
                                    <button
                                        onClick={handleDownload}
                                        className="text-[11px] text-gray-600 hover:text-emerald-700 flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                    >
                                        <Download size={11} /> .md
                                    </button>
                                </div>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-72 overflow-y-auto text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                {result}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingMinutesModal;
