import React, { useMemo } from 'react';
import { Navigate } from 'react-router-dom';

// Smart entry-point for the root "/" route.
//
//  • Mobile viewport (< md, 768px)
//      → 로그인 후 항상 /menu (모바일 큰 카드 홈) 로 진입. 사용자는 카드에서
//        원하는 화면을 골라 이동하고, 각 페이지 헤더의 홈 아이콘으로 다시 /menu
//        로 돌아온다.
//  • First-time desktop visitor (no `meet4u_setup_visited` flag yet)
//      → mark the flag and send them to /settings so they configure
//        language, profile, permissions, etc.
//  • Returning desktop visitor
//      → restore the last route they were on (saved by useRouteTracker)
//      → fall back to /global-meeting when nothing is saved.

const SETUP_KEY = 'meet4u_setup_visited';
const LAST_ROUTE_KEY = 'meet4u_last_route';
const FALLBACK = '/global-meeting';

const isMobileViewport = () => {
    try {
        return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    } catch { return false; }
};

const HomeRedirect = () => {
    const target = useMemo(() => {
        // 모바일: 로그인 직후 항상 큰 카드 홈으로.
        if (isMobileViewport()) return '/menu';

        try {
            const setupVisited = localStorage.getItem(SETUP_KEY);
            if (!setupVisited) {
                localStorage.setItem(SETUP_KEY, '1');
                return '/settings';
            }
            const lastRoute = localStorage.getItem(LAST_ROUTE_KEY);
            if (lastRoute && lastRoute !== '/' && lastRoute !== '/login') {
                return lastRoute;
            }
        } catch { /* localStorage may be disabled in private mode */ }
        return FALLBACK;
    }, []);

    return <Navigate to={target} replace />;
};

export default HomeRedirect;
