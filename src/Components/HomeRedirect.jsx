import React, { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserGroup } from '../lib/menuPermissions';

// 로그인 직후 첫 화면 라우팅 — 회원 등급 기반
//
//  • 정회원(full) · 특별회원(special) · 관리자(admin)
//      → /calendar (월간 모임) + 모아보기(list) 뷰 자동 적용
//        localStorage.meet4u_calendar_view = 'list' 를 미리 세팅해 두면
//        CalendarGrid 가 mount 될 때 그 값을 읽어 곧바로 list 모드로 열림.
//  • 일반회원(general) · 프로필 미확정
//      → /guest-meetups (게스트 모집)
//
// 모바일에서도 동일 규칙 적용. /menu 큰 카드 홈은 각 페이지 헤더의 격자
// 아이콘 버튼으로 언제든 다시 열 수 있음.

const HomeRedirect = () => {
    const { userProfile, isAdmin } = useAuth();

    const target = useMemo(() => {
        const group = isAdmin ? 'admin' : getUserGroup(userProfile);
        const isPremium = group === 'full' || group === 'special' || group === 'admin';
        if (isPremium) {
            try { localStorage.setItem('meet4u_calendar_view', 'list'); } catch (_) { /* ignore */ }
            return '/calendar';
        }
        return '/guest-meetups';
    }, [userProfile, isAdmin]);

    return <Navigate to={target} replace />;
};

export default HomeRedirect;
