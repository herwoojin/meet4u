import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';
import { HashRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';
import { capturePwaInstallPrompt } from './lib/pwaInstall';

// 헤더의 "앱 설치" 버튼용 — beforeinstallprompt 는 로드 직후 한 번만 오므로
// React 가 마운트되기 전에 잡아 둔다.
capturePwaInstallPrompt();

// ── 카카오 OAuth 콜백 → HashRouter 경로 변환 ──────────────────────────
// 카카오가 /auth/kakao/callback?code=xxx 로 리다이렉트하면
// HashRouter 가 이 경로를 인식하지 못한다 (# 이 없으므로).
// 앱 마운트 전에 URL 을 /#/auth/kakao/callback?code=xxx 로 변환한다.
if (
    window.location.pathname === '/auth/kakao/callback' &&
    !window.location.hash // 이미 hash 로 변환된 게 아닌 경우만
) {
    const search = window.location.search; // ?code=xxx&...
    window.location.replace(
        window.location.origin + '/#/auth/kakao/callback' + search
    );
    // replace 후 페이지가 리로드되므로 아래 코드는 실행되지 않음
}

// ── 카카오톡 공유 카드 진입 ────────────────────────────────────────
// 카드 버튼 URL 은 https://k-app.click/?guest=<id>.<버전> 처럼 해시가 없다
// (카톡이 # 이하를 보존한다는 보장이 없어서). 렌더 전에 해시 라우트로 바꿔
// 두면 아래 딥링크 캡처가 그대로 이어받는다. replaceState 라 새로고침 없음.
// '.' 뒤 버전은 카톡 미리보기 캐시를 깨기 위한 값이라 앱에서는 버린다.
try {
    const gid = (new URLSearchParams(window.location.search).get('guest') || '').split('.')[0];
    if (gid && !window.location.hash) {
        window.history.replaceState(null, '', `/#/guest-meetups?open=${encodeURIComponent(gid)}`);
    }
} catch (_) { /* ignore */ }

// ── 정기 모임 참석 체크 링크 진입 ─────────────────────────────────
// https://k-app.click/?meeting=<id>.<버전> — 어느 페이지에서든 그 모임 팝업을 띄우도록
// ID 만 기억해 두고 홈으로 보낸다. 로그인이 필요하면 로그인 후에도 이 값이 남아 있어
// MainLayout 의 MeetingLinkOpener 가 팝업(참석·불참 체크)을 연다.
try {
    const mid = (new URLSearchParams(window.location.search).get('meeting') || '').split('.')[0];
    if (mid && !window.location.hash) {
        sessionStorage.setItem('meeting_pending_open', mid);
        window.history.replaceState(null, '', '/#/');
    }
} catch (_) { /* ignore */ }

// ── 게스트 모집 딥링크 캡처 ────────────────────────────────────────
// 카톡에서 공유된 URL 형태: https://hanguk.netlify.app/#/guest-meetups?open=<id>
// 로그인이 필요한 상태였다면 PrivateRoute 가 /login 으로 리다이렉트하며
// hash 에서 ?open=<id> 부분이 사라진다. 앱 마운트 전에 미리 sessionStorage
// 에 stash 해 두고, GuestMeetups 페이지가 로드되면 자동으로 상세 팝업을 연다.
try {
    const h = window.location.hash || '';
    const m = h.match(/[?&]open=([^&]+)/);
    if (m && m[1]) {
        sessionStorage.setItem('guest_pending_open', decodeURIComponent(m[1]));
    }
} catch (_) { /* ignore */ }

// Clear old workbox/SW caches (but preserve Firestore offline cache)
if ('caches' in window) {
    caches.keys().then(names => {
        names.forEach(name => {
            // Firestore 캐시는 삭제하지 않음
            if (!name.startsWith('firestore')) {
                caches.delete(name);
            }
        });
    });
}

// Ensure service workers update immediately
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.update());
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <HashRouter>
                <App />
            </HashRouter>
        </ErrorBoundary>
    </React.StrictMode>,
)

