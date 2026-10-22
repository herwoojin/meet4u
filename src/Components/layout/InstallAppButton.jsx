// 모바일 헤더의 "앱으로 설치" 버튼.
//
// 설치 창을 바로 띄울 수 있는 브라우저(안드로이드 크롬 등)는 누르면 곧바로 설치 창,
// 그렇지 않으면 환경에 맞는 설치 방법을 바텀시트로 안내한다(lib/pwaInstall.js 참고).
// 이미 앱으로 열려 있으면(홈 화면 아이콘으로 실행) 버튼 자체를 숨긴다.

import React, { useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share, PlusSquare, X, ExternalLink, Copy, Check, MoreVertical } from 'lucide-react';
import {
    subscribePwaInstall, canPromptInstall, promptInstall, isRunningAsApp,
    detectInstallEnv, openExternalFromKakao,
} from '../../lib/pwaInstall';

const Step = ({ n, children }) => (
    <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
        <span className="text-sm text-gray-700 leading-relaxed">{children}</span>
    </li>
);

const Kbd = ({ children }) => (
    <span className="inline-flex items-center gap-1 align-middle px-1.5 py-0.5 mx-0.5 rounded-md border border-gray-300 bg-gray-50 text-gray-800 text-xs font-semibold">
        {children}
    </span>
);

const InstallSheet = ({ env, onClose }) => {
    const [copied, setCopied] = useState(false);
    const copyLink = async () => {
        try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch (_) { /* ignore */ }
    };

    return (
        <div className="fixed inset-0 z-[1100] bg-black/45 flex items-end justify-center" onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white rounded-t-2xl px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
                <div className="flex items-center gap-3 mb-4">
                    <img src="/pwa-192x192.png" alt="" className="w-12 h-12 rounded-xl shadow-sm" />
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900">앱으로 설치하기</div>
                        <div className="text-xs text-gray-500">홈 화면 아이콘으로 앱처럼 바로 열려요</div>
                    </div>
                    <button onClick={onClose} aria-label="닫기" className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                {env === 'kakao' && (
                    <>
                        <p className="text-sm text-gray-700 mb-3">
                            카카오톡 안에서 연 화면에서는 앱을 설치할 수 없어요.
                            기본 브라우저로 연 뒤, 위쪽 <Kbd><Download size={12} /></Kbd> 버튼을 한 번 더 눌러 주세요.
                        </p>
                        <button
                            onClick={openExternalFromKakao}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FEE500] text-black/85 font-bold"
                        >
                            <ExternalLink size={18} /> 외부 브라우저로 열기
                        </button>
                    </>
                )}

                {env === 'inapp' && (
                    <>
                        <ol className="space-y-3 mb-4">
                            <Step n={1}>지금 화면은 앱 안의 브라우저라 설치할 수 없어요.</Step>
                            <Step n={2}>오른쪽 위 메뉴 <Kbd><MoreVertical size={12} /> 또는 ···</Kbd> 에서 <b>다른 브라우저로 열기</b>를 눌러 주세요.</Step>
                            <Step n={3}>열린 브라우저에서 위쪽 <Kbd><Download size={12} /></Kbd> 버튼을 다시 눌러 주세요.</Step>
                        </ol>
                        <button onClick={copyLink} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-300 font-semibold text-gray-700">
                            {copied ? <><Check size={18} className="text-green-600" /> 링크 복사됨</> : <><Copy size={18} /> 링크 복사 (브라우저에 붙여넣기)</>}
                        </button>
                    </>
                )}

                {env === 'ios' && (
                    <ol className="space-y-3">
                        <Step n={1}>화면 아래쪽(크롬은 주소창 오른쪽)의 공유 버튼 <Kbd><Share size={12} /></Kbd> 을 눌러요.</Step>
                        <Step n={2}>목록을 내려 <Kbd><PlusSquare size={12} /> 홈 화면에 추가</Kbd> 를 눌러요.</Step>
                        <Step n={3}>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 앱 아이콘이 생겨요.</Step>
                    </ol>
                )}

                {env === 'other' && (
                    <ol className="space-y-3">
                        <Step n={1}>브라우저 오른쪽 위 메뉴 <Kbd><MoreVertical size={12} /></Kbd> 를 눌러요.</Step>
                        <Step n={2}><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요.</Step>
                        <Step n={3}>이미 설치했다면 홈 화면의 <b>PromiseU</b> 아이콘으로 열어 주세요.</Step>
                    </ol>
                )}
            </div>
        </div>
    );
};

const InstallAppButton = () => {
    const { t } = useTranslation();
    const [, rerender] = useReducer((x) => x + 1, 0);
    const [sheetEnv, setSheetEnv] = useState(null);

    // 설치 이벤트 도착·설치 완료·표시 모드(브라우저↔앱) 변화 때 다시 그린다.
    useEffect(() => subscribePwaInstall(rerender), []);
    useEffect(() => {
        const mq = window.matchMedia?.('(display-mode: standalone)');
        mq?.addEventListener?.('change', rerender);
        return () => mq?.removeEventListener?.('change', rerender);
    }, []);

    if (isRunningAsApp()) return null;

    const onClick = async () => {
        if (canPromptInstall()) {
            await promptInstall();     // 설치 창 → 설치되면 appinstalled 로 버튼이 사라진다
            return;
        }
        setSheetEnv(detectInstallEnv());
    };

    const label = t('nav.installApp', '앱 설치');
    return (
        <>
            <button
                onClick={onClick}
                title={label}
                aria-label={label}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition-colors shrink-0"
            >
                <Download size={16} />
            </button>
            {sheetEnv && <InstallSheet env={sheetEnv} onClose={() => setSheetEnv(null)} />}
        </>
    );
};

export default InstallAppButton;
