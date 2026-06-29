import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Mic, MicOff, Loader, Radio, Volume2, VolumeX, KeyRound, Terminal } from 'lucide-react';
import { LiveTranslatorSession, validateGeminiKey } from '../../lib/liveApi';
import { getGeminiKey, setGeminiKey, hasAdminGeminiKey } from '../../lib/grammar';

// Real-time bidirectional voice translation modal powered by Gemini Live API.
// User picks source/target language, taps the mic, speaks, and hears (or
// reads) the translated response in near real-time.

const LANG_OPTIONS = [
    ['ko', '🇰🇷 한국어'], ['en', '🇺🇸 English'], ['ja', '🇯🇵 日本語'],
    ['zh-CN', '🇨🇳 中文'], ['ru', '🇷🇺 Русский'], ['es', '🇪🇸 Español'],
    ['fr', '🇫🇷 Français'], ['vi', '🇻🇳 Tiếng Việt'], ['mn', '🇲🇳 Монгол'],
    ['ar', '🇸🇦 العربية'], ['km', '🇰🇭 ភាសាខ្មែរ'], ['th', '🇹🇭 ไทย'],
    ['id', '🇮🇩 Indonesia'], ['tl', '🇵🇭 Filipino'], ['bn', '🇧🇩 বাংলা'],
    ['uz', '🇺🇿 Oʻzbek'], ['si', '🇱🇰 සිංහල'], ['my', '🇲🇲 မြန်မာ'],
    ['ne', '🇳🇵 नेपाली'],
];

const langLabel = (code) => LANG_OPTIONS.find(([c]) => c === code)?.[1] || code;

const STATE_LABEL = {
    idle: '대기',
    connecting: '연결 중…',
    starting: '준비 중…',
    listening: '듣는 중',
    closed: '종료됨',
};

const LiveTranslatorModal = ({ open, onClose, defaultSourceLang = 'ko', defaultTargetLang = 'en', isAdmin = false }) => {
    const [sourceLang, setSourceLang] = useState(defaultSourceLang);
    const [targetLang, setTargetLang] = useState(defaultTargetLang);
    const [audioOut, setAudioOut] = useState(true);
    const [state, setState] = useState('idle');
    const [transcript, setTranscript] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [keyInput, setKeyInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(true);
    const sessionRef = useRef(null);
    const logsEndRef = useRef(null);

    const resolvedKey = useMemo(() => getGeminiKey({ isAdmin }), [isAdmin, open]);
    const adminAvailable = hasAdminGeminiKey() && isAdmin;
    const canStart = Boolean(resolvedKey) && state === 'idle';

    useEffect(() => {
        if (!open) return;
        setErrorMsg('');
        setTranscript('');
        setLogs([]);
        setKeyInput(getGeminiKey({ isAdmin: false }));
        return () => {
            // Cleanup when modal closes
            sessionRef.current?.stop();
            sessionRef.current = null;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleStart = async () => {
        if (!resolvedKey) { setShowKey(true); return; }

        // 사전 키 형식 검증 — Live API 는 AIza... 형식 Gemini 키가 필요.
        const v = validateGeminiKey(resolvedKey);
        if (!v.ok) {
            setErrorMsg(v.reason + '\nGoogle AI Studio (aistudio.google.com/app/apikey) 에서 발급한 키여야 합니다.');
            return;
        }

        setErrorMsg('');
        setTranscript('');
        setLogs([]);
        try {
            const session = new LiveTranslatorSession({
                apiKey: resolvedKey,
                sourceLang: langLabel(sourceLang),
                targetLang: langLabel(targetLang),
                audioOut,
                onState: setState,
                onText: ({ text, partial }) => {
                    setTranscript(prev => partial ? prev + text : prev + text);
                },
                onTurnComplete: () => {
                    setTranscript(prev => prev.endsWith('\n') ? prev : prev + '\n\n');
                },
                onError: (err) => {
                    console.error('Live error:', err);
                    setErrorMsg(err?.message || 'Live API 오류');
                },
                onLog: (entry) => {
                    setLogs(prev => {
                        const next = [...prev, entry];
                        // 최근 60 개만 유지
                        return next.length > 60 ? next.slice(-60) : next;
                    });
                    // 다음 paint 에서 스크롤 맨 아래로
                    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'auto' }), 0);
                },
            });
            sessionRef.current = session;
            await session.start();
        } catch (err) {
            console.error('Live start failed:', err);
            setErrorMsg(err?.message || '실시간 통역을 시작하지 못했습니다.');
            setState('idle');
        }
    };

    const handleStop = async () => {
        await sessionRef.current?.stop();
        sessionRef.current = null;
        setState('idle');
    };

    const handleClose = async () => {
        await handleStop();
        onClose?.();
    };

    const saveKey = () => {
        const trimmed = keyInput.trim();
        setGeminiKey(trimmed);
        setShowKey(false);
    };

    if (!open) return null;

    const isLive = state === 'listening' || state === 'starting' || state === 'connecting';

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2050] flex items-end sm:items-center justify-center p-2 sm:p-6"
            onClick={handleClose}
        >
            <div
                className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-sky-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <Radio size={18} className={`shrink-0 ${isLive ? 'text-emerald-600 animate-pulse' : 'text-gray-500'}`} />
                        <h2 className="text-sm font-bold text-gray-800 truncate">
                            라이브 통역 · {STATE_LABEL[state] || state}
                        </h2>
                    </div>
                    <button onClick={handleClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="닫기">
                        <X size={18} />
                    </button>
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Language pickers */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">내 언어</div>
                            <select
                                value={sourceLang}
                                onChange={e => setSourceLang(e.target.value)}
                                disabled={isLive}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            >
                                {LANG_OPTIONS.map(([code, label]) => (
                                    <option key={code} value={code}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">상대 언어</div>
                            <select
                                value={targetLang}
                                onChange={e => setTargetLang(e.target.value)}
                                disabled={isLive}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            >
                                {LANG_OPTIONS.map(([code, label]) => (
                                    <option key={code} value={code}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-1.5 text-gray-600 select-none cursor-pointer">
                            <input
                                type="checkbox"
                                checked={audioOut}
                                onChange={e => setAudioOut(e.target.checked)}
                                disabled={isLive}
                                className="accent-emerald-600"
                            />
                            {audioOut ? <Volume2 size={12} /> : <VolumeX size={12} />}
                            음성으로 듣기
                        </label>
                        <div className="flex items-center gap-1">
                            {adminAvailable && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">관리자 공유키</span>
                            )}
                            {!adminAvailable && resolvedKey && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-semibold">내 키</span>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowKey(s => !s)}
                                className="text-[10px] text-gray-500 hover:text-emerald-600 flex items-center gap-1"
                            >
                                <KeyRound size={10} /> 키
                            </button>
                        </div>
                    </div>

                    {showKey && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                            <div className="text-[11px] text-amber-900 leading-snug">
                                Google AI Studio 에서 발급한 무료 Gemini API 키를 입력하세요. 본인 브라우저(localStorage)에만 저장됩니다.
                            </div>
                            <input
                                type="password"
                                value={keyInput}
                                onChange={e => setKeyInput(e.target.value)}
                                placeholder="AIza..."
                                className="w-full px-2 py-1.5 text-xs border border-amber-300 rounded bg-white"
                            />
                            <button
                                onClick={saveKey}
                                disabled={!keyInput.trim()}
                                className="w-full text-xs font-bold bg-amber-600 text-white rounded px-2 py-1.5 hover:bg-amber-700 disabled:opacity-40"
                            >
                                저장
                            </button>
                        </div>
                    )}

                    {/* Transcript */}
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 min-h-[100px] max-h-[28vh] overflow-y-auto text-sm whitespace-pre-wrap leading-relaxed">
                        {transcript ? (
                            <span className="text-gray-800">{transcript}</span>
                        ) : (
                            <span className="text-gray-400 italic text-xs">
                                {isLive ? '듣고 있어요. 자유롭게 말씀하세요…' : '시작 버튼을 누르고 마이크에 말씀해 주세요.'}
                            </span>
                        )}
                    </div>

                    {/* Live diagnostic log */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowLogs(s => !s)}
                            className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-500 font-bold hover:bg-gray-100"
                        >
                            <span className="flex items-center gap-1">
                                <Terminal size={11} /> 진행 로그 ({logs.length})
                            </span>
                            <span>{showLogs ? '▼' : '▶'}</span>
                        </button>
                        {showLogs && (
                            <div className="max-h-48 overflow-y-auto text-[10px] font-mono">
                                {logs.length === 0 ? (
                                    <div className="px-3 py-2 text-gray-400 italic">아직 로그가 없습니다.</div>
                                ) : (
                                    <>
                                        {logs.map((l, i) => (
                                            <div
                                                key={i}
                                                className={`px-3 py-1 border-b border-gray-50 ${l.level === 'error' ? 'text-red-700 bg-red-50' : 'text-gray-700'}`}
                                            >
                                                {l.msg}
                                            </div>
                                        ))}
                                        <div ref={logsEndRef} />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 leading-snug">
                            ⚠️ {errorMsg}
                        </div>
                    )}

                    {!resolvedKey && !showKey && (
                        <div className="text-[11px] text-gray-500 leading-snug">
                            라이브 통역은 무료 Gemini API 키가 필요합니다.
                            {isAdmin ? ' .env 의 VITE_GEMINI_ADMIN_API_KEY 가 비어 있다면 본인 키를 등록하세요.' : ' 위 ⚙️ 키 등록으로 본인 키를 추가하세요.'}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <footer className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                    {state === 'idle' || state === 'closed' ? (
                        <button
                            onClick={handleStart}
                            disabled={!canStart}
                            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-sky-500 rounded-lg px-3 py-2.5 hover:opacity-90 disabled:opacity-40 shadow"
                        >
                            <Mic size={14} /> 통역 시작
                        </button>
                    ) : (
                        <button
                            onClick={handleStop}
                            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-rose-500 rounded-lg px-3 py-2.5 hover:bg-rose-600 shadow"
                        >
                            {state === 'connecting' || state === 'starting' ? <Loader size={14} className="animate-spin" /> : <MicOff size={14} />}
                            통역 종료
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default LiveTranslatorModal;
