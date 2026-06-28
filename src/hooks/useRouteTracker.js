import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// On every route change while signed-in, remember the current path so the
// next login can drop the user back where they left off. Login / root
// redirect routes are excluded so we never end up restoring a meaningless
// landing.

const LAST_ROUTE_KEY = 'meet4u_last_route';
const EXCLUDED = new Set(['/', '/login', '/auth/kakao/callback']);

export const useRouteTracker = () => {
    const { currentUser } = useAuth();
    const location = useLocation();

    useEffect(() => {
        if (!currentUser) return;
        const p = location.pathname + (location.search || '');
        if (EXCLUDED.has(location.pathname)) return;
        try { localStorage.setItem(LAST_ROUTE_KEY, p); } catch { /* ignore */ }
    }, [currentUser, location.pathname, location.search]);
};
