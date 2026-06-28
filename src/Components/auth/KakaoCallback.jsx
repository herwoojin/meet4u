import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { completeKakaoLogin } from '../../lib/kakao';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../lib/firebase';

// 카카오 콜백 — 자동 redirect 가 race condition 으로 실패할 수 있어
// 모든 단계를 화면에 표시하고, 완료 후 사용자가 명시적으로 버튼을 눌러
// 진입하도록 한다. version 라벨로 캐시된 옛 코드 여부도 확인 가능.

const VERSION = 'k8';

const KakaoCallback = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [steps, setSteps] = useState([]);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
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
                // Firebase 의 동기 API 로 currentUser 직접 확인
                addStep(`auth.currentUser.uid (직접) = ${auth.currentUser?.uid || 'null'}`);
                addStep('AuthContext 동기화 대기 (최대 3 초)');
                // AuthContext.onAuthStateChanged 가 fire 될 시간을 잠시 줌
                return new Promise(r => setTimeout(r, 300));
            })
            .then(() => {
                setReady(true);
            })
            .catch(err => {
                console.error('Kakao callback failed:', err);
                addStep(`실패: ${err?.message || err}`, false);
                setError(err?.message || '로그인 처리 중 오류');
            });
    }, [params]);

    // currentUser 가 set 되면 자동 진입 시도 (실패해도 수동 버튼이 있음)
    useEffect(() => {
        if (ready && currentUser) {
            addStep(`AuthContext.currentUser 확인 — 자동 진입`);
            const t = setTimeout(() => navigate('/', { replace: true }), 200);
            return () => clearTimeout(t);
        }
    }, [ready, currentUser, navigate]);

    const goManually = () => {
        navigate('/', { replace: true });
    };

    const isAuthed = Boolean(currentUser || auth.currentUser);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white rounded-2xl p-6 shadow-lg max-w-lg w-full">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-gray-800">카카오 로그인</h2>
                    <span className="text-[10px] text-gray-300">v{VERSION}</span>
                </div>

                {error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-1">
                            <AlertCircle size={14} /> 로그인 실패
                        </div>
                        <div className="text-xs text-red-700 break-words whitespace-pre-wrap">{error}</div>
                    </div>
                ) : ready && isAuthed ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3 flex items-center gap-2 text-emerald-700 font-bold text-sm">
                        <CheckCircle size={14} /> 로그인 완료 — 잠시 후 자동 이동합니다.
                    </div>
                ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 flex items-center gap-2 text-gray-700 text-sm">
                        <Loader size={14} className="animate-spin" /> 처리 중…
                    </div>
                )}

                <div className="border border-gray-100 rounded-lg overflow-hidden mb-3">
                    <div className="px-3 py-1.5 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 font-bold border-b border-gray-100">
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

                <div className="flex items-center gap-2">
                    {ready && isAuthed ? (
                        <button
                            type="button"
                            onClick={goManually}
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
                </div>
            </div>
        </div>
    );
};

export default KakaoCallback;
