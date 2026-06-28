import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { completeKakaoLogin } from '../../lib/kakao';

// 카카오에서 /auth/kakao/callback?code=... 으로 돌아오는 경유 페이지.
// 처음 마운트되면 한 번만 completeKakaoLogin 을 호출하고 결과에 따라
// 홈(또는 로그인 화면)으로 보낸다.

const KakaoCallback = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const code = params.get('code');
        const errorParam = params.get('error');
        const errorDesc = params.get('error_description');

        if (errorParam) {
            setError(`카카오 로그인 거부됨 (${errorParam}) ${errorDesc || ''}`.trim());
            setTimeout(() => navigate('/login', { replace: true }), 2500);
            return;
        }

        if (!code) {
            setError('인증 코드(code)가 없습니다.');
            setTimeout(() => navigate('/login', { replace: true }), 2500);
            return;
        }

        completeKakaoLogin(code)
            .then(() => navigate('/', { replace: true }))
            .catch(err => {
                console.error('Kakao callback failed:', err);
                setError(err.message || '로그인 실패');
                setTimeout(() => navigate('/login', { replace: true }), 4000);
            });
    }, [params, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
                {error ? (
                    <>
                        <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
                        <div className="text-red-600 font-bold mb-2">로그인 실패</div>
                        <div className="text-sm text-gray-600 break-words">{error}</div>
                        <div className="text-xs text-gray-400 mt-4">로그인 화면으로 돌아갑니다…</div>
                    </>
                ) : (
                    <>
                        <Loader size={32} className="animate-spin text-yellow-500 mx-auto mb-3" />
                        <div className="text-lg font-bold text-gray-800">카카오 로그인 중…</div>
                        <div className="text-xs text-gray-500 mt-1">잠시만 기다려 주세요.</div>
                    </>
                )}
            </div>
        </div>
    );
};

export default KakaoCallback;
