import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';
import { HashRouter } from 'react-router-dom'
import ErrorBoundary from './Components/ErrorBoundary';

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

