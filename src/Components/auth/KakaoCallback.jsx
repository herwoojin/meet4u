import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { completeKakaoLogin } from '../../lib/kakao';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const KakaoCallback = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
    const [error, setError] = useState('');
    const ran = useRef(false);

    // 로그인 성공 후 AuthContext가 currentUser를 감지하면 자동 이동
    useEffect(() => {
        if (status === 'success' && currentUser) {
            console.log('[Kakao] AuthContext currentUser 감지 → 홈으로 이동');
            navigate('/', { replace: true });
        }
    }, [status, currentUser, navigate]);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const code = params.get('code');
        const errorParam = params.get('error');
        const errorDesc = params.get('error_description');

        if (errorParam) {
            setError(`카카오 로그인 거부됨 (${errorParam}) ${errorDesc || ''}`.trim());
            setStatus('error');
            return;
        }
        if (!code) {
            setError('인증 코드(code)가 URL에 없습니다.');
            setStatus('error');
            return;
        }

        console.log('[Kakao] code 수신, Netlify 함수에 POST 시작');

        completeKakaoLogin(code)
            .then((user) => {
                console.log('[Kakao] signInWithCustomToken 성공 — uid=', user?.uid);

                // signInWithCustomToken은 완료됐지만, AuthContext의 onAuthStateChanged가
                // 아직 fire 안 됐을 수 있다. 두 가지 전략으로 확실하게 대기:
                // 1) auth.currentUser가 이미 있으면 즉시
                // 2) 아니면 onAuthStateChanged를 한 번 더 기다림
                if (auth.currentUser) {
                    setStatus('success');
                    // currentUser가 AuthContext에서도 준비되면 위 useEffect가 navigate
                    return;
                }

                // Firebase SDK가 아직 동기화 안 된 경우 — 최대 5초 대기
                return new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        // 5초 후에도 안 되면 강제 이동 시도
                        console.log('[Kakao] 5초 대기 후 강제 이동');
                        setStatus('success');
                        resolve();
                    }, 5000);

                    const unsub = onAuthStateChanged(auth, (u) => {
                        if (u) {
                            clearTimeout(timeout);
                            unsub();
                            console.log('[Kakao] onAuthStateChanged 감지 — uid=', u.uid);
                            setStatus('success');
                            resolve();
                        }
                    });
                });
            })
            .catch(err => {
                console.error('[Kakao] callback failed:', err);
                setError(err?.message || '로그인 처리 중 오류가 발생했습니다.');
                setStatus('error');
            });
    }, [params]);

    // 5초 후에도 AuthContext가 안 되면 강제 이동 (fallback)
    useEffect(() => {
        if (status !== 'success') return;

        const fallback = setTimeout(() => {
            if (auth.currentUser) {
                console.log('[Kakao] fallback: auth.currentUser 있음, 강제 이동');
                navigate('/', { replace: true });
            }
        }, 2000);

        return () => clearTimeout(fallback);
    }, [status, navigate]);

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
                {status === 'error' ? (
                    <>
                        <div className="flex justify-center mb-4">
                            <AlertCircle size={48} className="text-red-400" />
                        </div>
                        <h2 className="text-xl font-bold text-red-400 mb-2">로그인 실패</h2>
                        <p className="text-gray-400 text-sm mb-6 break-words">{error}</p>
                        <button
                            type="button"
                            onClick={() => navigate('/login', { replace: true })}
                            className="w-full py-3 px-4 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                            로그인 화면으로 돌아가기
                        </button>
                    </>
                ) : (
                    <>
                        <Loader size={48} className="animate-spin text-[#FEE500] mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-[#FEE500] mb-2">카카오 로그인 처리 중…</h2>
                        <p className="text-gray-400 text-sm">잠시만 기다려주세요.</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default KakaoCallback;
