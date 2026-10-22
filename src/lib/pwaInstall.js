// PWA 설치 — 브라우저마다 설치 방법이 달라 환경을 판별해 맞는 방법을 고른다.
//   · 안드로이드 크롬·삼성 인터넷·PC 크롬/엣지: beforeinstallprompt → 버튼 한 번에 설치 창
//   · iOS(사파리·크롬 등): 설치 API 가 없음 → 공유 → '홈 화면에 추가' 안내
//   · 카카오톡·네이버·인스타 등 앱 안 브라우저: 설치 불가 → 외부 브라우저로 열기
//
// beforeinstallprompt 는 페이지 로드 직후 한 번 오므로 React 가 뜨기 전에
// main.jsx 에서 capturePwaInstallPrompt() 로 잡아 둔다.

let deferred = null;          // 브라우저가 준 설치 이벤트 (한 번만 쓸 수 있다)
let installedNow = false;     // 이 탭에서 방금 설치됨
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const capturePwaInstallPrompt = () => {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();   // 브라우저 기본 미니 배너 대신 헤더 버튼으로 띄운다
        deferred = e;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        installedNow = true;
        emit();
    });
};

export const subscribePwaInstall = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

export const canPromptInstall = () => Boolean(deferred);

// 홈 화면 아이콘(또는 플레이스토어 TWA)으로 열렸으면 이미 앱이다.
export const isRunningAsApp = () => {
    if (installedNow) return true;
    if (typeof window === 'undefined') return false;
    const mm = (q) => window.matchMedia?.(q)?.matches;
    return Boolean(
        mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)')
        || window.navigator.standalone === true                  // iOS 홈 화면
        || document.referrer.startsWith('android-app://'),       // 안드로이드 TWA
    );
};

/** @returns {Promise<'accepted'|'dismissed'|'unavailable'>} */
export const promptInstall = async () => {
    const e = deferred;
    if (!e) return 'unavailable';
    deferred = null;          // 같은 이벤트로 두 번 prompt() 하면 예외
    e.prompt();
    const { outcome } = await e.userChoice;
    emit();
    return outcome;
};

/** @returns {'kakao'|'inapp'|'ios'|'other'} */
export const detectInstallEnv = () => {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/KAKAOTALK/i.test(ua)) return 'kakao';
    if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|BAND\//i.test(ua)) return 'inapp';
    const iOS = /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS
    return iOS ? 'ios' : 'other';
};

// 카카오톡 인앱 브라우저 → 기본 브라우저(크롬·사파리)로 지금 페이지를 연다.
export const openExternalFromKakao = () => {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
};
