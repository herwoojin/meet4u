import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { completeKakaoLogin } from '../../lib/kakao';
import { useAuth } from '../../context/AuthContext';

// 카카오에서 /auth/kakao/callback?code=... 으로 돌아오는 경유 페이지.
//
// signInWithCustomToken 의 Promise 가 resolve 되더라도 React 의
// AuthContext.currentUser 가 갱신되기까지 한 틱 정도 시차가 있다.
// 그 사이에 navigate('/') 가 실행되면 PrivateRoute 가 currentUser=null
// 을 보고 /login 으로 되돌려 버린다.
//
// 그래서 (1) 함수 호출 성공 + (2) AuthContext.currentUser 세팅이
// 모두 만족됐을 때만 navigate 한다.

const KakaoCallback = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [error, setError] = useState('');
    // 'exchanging' → 코드 교환 + Firebase sign-in 진행 중
    // 'waitingAuth' → 완료, AuthContext 갱신 대기
    // 'done' → navigate 호출 완료
    const [phase, setPhase] = useState('exchanging');
    const ran = useRef(false);

    // 1) 한 번만 토큰 교환 시도
    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const code = params.get('code');
        const errorParam = params.get('error');
        const errorDesc = params.get('error_description');

        if (errorParam) {
            setError(`카카오 로그인 거부됨 (${errorParam}) ${errorDesc || ''}`.trim());
            return;
        }
        if (!code) {
            setError('인증 코드(code) 가 없습니다. 카카오 로그인부터 다시 시작해 주세요.');
            return;
        }

        completeKakaoLogin(code)
            .then(() => setPhase('waitingAuth'))
            .catch(err => {
                console.error('Kakao callback failed:', err);
                setError(err.message || '로그인 처리 중 알 수 없는 오류');
            });
    }, [params]);

    // 2) AuthContext.currentUser 가 세팅된 뒤에만 홈으로 이동
    useEffect(() => {
        if (phase === 'waitingAuth' && currentUser) {
            setPhase('done');
            navigate('/', { replace: true });
        }
    }, [phase, currentUser, navigate]);

    // 안전장치: waitingAuth 인데 5초 안에 currentUser 가 안 오면
    // 디버깅 정보를 보여 준다 (Firebase 인증 상태 미동기화 의심).
    useEffect(() => {
        if (phase !== 'waitingAuth') return;
        const timer = setTimeout(() => {
            if (!currentUser) {
                setError(
                    '서버 토큰은 받았지만 Firebase 로그인이 완료되지 않았습니다. ' +
                    '잠시 뒤 다시 시도하거나 콘솔(F12) 에러를 확인해 주세요.'
                );
            }
        }, 5000);
        return () => clearTimeout(timer);
    }, [phase, currentUser]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
                {error ? (
                    <>
                        <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
                        <div className="text-red-600 font-bold mb-2">로그인 실패</div>
                        <div className="text-sm text-gray-700 break-words whitespace-pre-wrap">{error}</div>
                        <button
                            type="button"
                            onClick={() => navigate('/login', { replace: true })}
                            className="mt-5 px-4 py-2 text-sm font-bold text-white bg-gray-800 rounded-lg hover:bg-gray-700"
                        >
                            로그인 화면으로
                        </button>
                    </>
                ) : (
                    <>
                        <Loader size={32} className="animate-spin text-yellow-500 mx-auto mb-3" />
                        <div className="text-lg font-bold text-gray-800">
                            {phase === 'exchanging' ? '카카오 로그인 중…' : '계정 동기화 중…'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">잠시만 기다려 주세요.</div>
                    </>
                )}
            </div>
        </div>
    );
};

export default KakaoCallback;
