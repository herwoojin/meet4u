import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle, CheckCircle, ArrowRight, Activity } from 'lucide-react';
import { completeKakaoLogin } from '../../lib/kakao';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../lib/firebase';

// 버전 라벨 — 화면 좌상단에 크게 표시. 사용자가 이 라벨을 확인해
// 새 코드가 로드되었는지 즉시 검증할 수 있다. 이번 빌드는 'k9-DIAG'.
const VERSION = 'k9-DIAG';

const KakaoCallback = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [steps, setSteps] = useState([]);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const [diag, setDiag] = useState(null);
    const ran = useRef(false);

    const addStep = (msg, ok = true) => {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        console.log('[Kakao]', line);
        setSteps(prev => [...prev, { msg: line, ok }]);
    };

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const code = params.get('code');
        const errorParam = params.get('error');
        const errorDesc = params.get('error_description');

        addStep('콜백 페이지 진입');
        addStep(`현재 URL: ${window.location.href.slice(0, 120)}`);

        if (errorParam) {
            const m = `카카오 로그인 거부됨 (${errorParam}) ${errorDesc || ''}`.trim();
            addStep(m, false);
            setError(m);
            return;
        }
        if (!code) {
            const m = '인증 코드(code) 가 URL 에 없습니다.';
            addStep(m, false);
            setError(m);
            return;
        }

        addStep(`code 수신: ${code.slice(0, 16)}…`);
        addStep('Netlify 함수에 code POST');

        completeKakaoLogin(code)
            .then((user) => {
                addStep(`Firebase signInWithCustomToken 성공 — uid=${user?.uid}`);
                addStep(`auth.currentUser.uid (Firebase 동기) = ${auth.currentUser?.uid || 'null'}`);
                addStep('AuthContext 동기화 300ms 대기');
                return new Promise(r => setTimeout(r, 300));
            })
            .then(() => {
                addStep('완료 — 아래 버튼으로 진입');
                setReady(true);
            })
            .catch(err => {
                console.error('Kakao callback failed:', err);
                addStep(`실패: ${err?.message || err}`, false);
                setError(err?.message || '로그인 처리 중 오류');
            });
    }, [params]);

    const runDiag = async () => {
        try {
            const res = await fetch('/.netlify/functions/kakao-login?diag=1', { method: 'GET' });
            const json = await res.json();
            setDiag(json);
            addStep(`진단: env=${JSON.stringify(json.env)} init=${json.adminInitialized}`);
        } catch (e) {
            addStep(`진단 실패: ${e.message}`, false);
        }
    };

    const isAuthed = Boolean(currentUser || auth.currentUser);

    return (
        <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full overflow-hidden border-4 border-yellow-400">
                {/* 큰 노란색 헤더 — 옛 코드와 절대 헷갈리지 않게 */}
                <header className="bg-[#FEE500] px-5 py-3 flex items-center justify-between border-b-4 border-yellow-500">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">💬</span>
                        <h2 className="text-lg font-extrabold text-[#3C1E1E]">카카오 로그인 콜백</h2>
                    </div>
                    <span className="text-xs font-mono bg-[#3C1E1E] text-[#FEE500] px-2 py-1 rounded font-bold">
                        v {VERSION}
                    </span>
                </header>

                <div className="p-5 space-y-3">
                    {error ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-1">
                                <AlertCircle size={14} /> 로그인 실패
                            </div>
                            <div className="text-xs text-red-700 break-words whitespace-pre-wrap">{error}</div>
                        </div>
                    ) : ready && isAuthed ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-emerald-700 font-bold text-sm">
                            <CheckCircle size={14} /> 로그인 성공. 아래 버튼으로 진입하세요.
                        </div>
                    ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-gray-700 text-sm">
                            <Loader size={14} className="animate-spin" /> 처리 중…
                        </div>
                    )}

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-1.5 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 font-bold border-b border-gray-200">
                            진행 로그
                        </div>
                        <ol className="max-h-72 overflow-y-auto text-[11px] font-mono divide-y divide-gray-50">
                            {steps.map((s, i) => (
                                <li key={i} className={`px-3 py-1.5 ${s.ok ? 'text-gray-700' : 'text-red-700 bg-red-50'}`}>
                                    {s.msg}
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* 진단 결과 */}
                    {diag && (
                        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                            <div className="text-[10px] uppercase tracking-wide text-blue-700 font-bold mb-1">함수 진단</div>
                            <pre className="text-[10px] text-blue-900 overflow-x-auto">{JSON.stringify(diag, null, 2)}</pre>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {ready && isAuthed ? (
                            <button
                                type="button"
                                onClick={() => navigate('/', { replace: true })}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                            >
                                홈으로 들어가기 <ArrowRight size={14} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => navigate('/login', { replace: true })}
                                className="flex-1 px-3 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                로그인 화면으로
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={runDiag}
                            className="px-3 py-2.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1"
                        >
                            <Activity size={12} /> 함수 진단
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KakaoCallback;
