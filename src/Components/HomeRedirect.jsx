import React, { useMemo } from 'react';
import { Navigate } from 'react-router-dom';

// Smart entry-point for the root "/" route.
//
//  • First-time visitor (no `meet4u_setup_visited` flag yet)
//      → mark the flag and send them to /settings so they configure
//        language, profile, permissions, etc.
//  • Returning visitor
//      → restore the last route they were on (saved by useRouteTracker)
//      → fall back to /global-meeting when nothing is saved.

const SETUP_KEY = 'meet4u_setup_visited';
const LAST_ROUTE_KEY = 'meet4u_last_route';
const FALLBACK = '/global-meeting';

const HomeRedirect = () => {
    const target = useMemo(() => {
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
