// 모바일 홈 — 구글 로그인 직후 첫 화면.
//
// 참조 사이트(k-road.asia) 처럼 큰 카드 매뉴만 전체 화면에 노출한다.
// 각 카드는 해당 페이지로 이동, 각 페이지의 모바일 헤더에 있는 홈 아이콘으로
// 다시 이 화면으로 돌아올 수 있다.
//
// 데스크톱에서는 App 라우터가 이 페이지를 굳이 안 열지만, 열려도 카드 리스트만
// 렌더되므로 큰 문제는 없다(사이드바가 옆에 함께 표시됨).

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useMenuPermissions, canAccessMenu, minRequiredGroup, GROUP_BADGE_SHORT } from '../lib/menuPermissions';
import {
    Calendar, Home, PlusCircle, Settings, Shield, BarChart3, Globe,
    Trophy, MessageSquare, ChevronRight,
} from 'lucide-react';

const MENU_META = {
    weeklyCalendar:  { bg: 'bg-indigo-500', sub: '이번 주 약속 한눈에' },
    monthlyCalendar: { bg: 'bg-cyan-500',   sub: '월별 캘린더 보기' },
    createMeeting:   { bg: 'bg-orange-500', sub: '새 약속 등록하기' },
    guestMeetups:    { bg: 'bg-lime-500',   sub: '테니스 게스트 모집' },
    globalMeeting:   { bg: 'bg-sky-500',    sub: '실시간 위치 공유' },
    chatCheck:       { bg: 'bg-purple-500', sub: '그룹 대화방' },
    myDashboard:     { bg: 'bg-rose-500',   sub: '내 활동 통계' },
    settings:        { bg: 'bg-slate-500',  sub: '앱 설정 관리' },
    admin:           { bg: 'bg-amber-500',  sub: '회원 · 미팅 관리' },
};

const TIER_BADGE_STYLE = {
    full:    { active: 'bg-blue-100 text-blue-700 border-blue-200',       disabled: 'bg-gray-100 text-gray-400 border-gray-200' },
    special: { active: 'bg-purple-100 text-purple-700 border-purple-200', disabled: 'bg-gray-100 text-gray-400 border-gray-200' },
    admin:   { active: 'bg-amber-100 text-amber-800 border-amber-300',    disabled: 'bg-gray-100 text-gray-400 border-gray-200' },
};

const BigCard = ({ item }) => {
    const meta = MENU_META[item.key] || { bg: 'bg-blue-500', sub: '' };
    const tierStyle = item.tierKey ? TIER_BADGE_STYLE[item.tierKey] : null;
    const badgeCls = tierStyle ? (item.disabled ? tierStyle.disabled : tierStyle.active) : '';

    const inner = (
        <>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${item.disabled ? 'bg-gray-300' : meta.bg}`}>
                <item.icon size={32} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <div className={`font-bold text-lg truncate ${item.disabled ? 'text-blue-900/40' : 'text-blue-900'}`}>
                        {item.label}
                    </div>
                    {item.tierBadge && (
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badgeCls}`}>
                            {item.tierBadge}
                        </span>
                    )}
                </div>
                <div className={`text-sm truncate ${item.disabled ? 'text-blue-900/25' : 'text-blue-700/60'}`}>
                    {item.disabled ? '권한이 없어요 · 잠금' : meta.sub}
                </div>
            </div>
            <ChevronRight size={22} className={item.disabled ? 'text-blue-900/20 shrink-0' : 'text-blue-400 shrink-0'} />
        </>
    );

    const clsBase = 'w-full flex items-center gap-4 p-4 rounded-2xl border shadow-sm transition-all';
    const clsState = item.disabled
        ? 'bg-white/60 border-white/60 cursor-not-allowed select-none'
        : 'bg-white/90 border-white/70 hover:bg-white active:scale-[0.98]';

    if (item.disabled) {
        return <div aria-disabled="true" className={`${clsBase} ${clsState}`}>{inner}</div>;
    }
    return <Link to={item.to} className={`${clsBase} ${clsState}`}>{inner}</Link>;
};

const MobileHome = () => {
    const { t } = useTranslation();
    const { userProfile, isAdmin } = useAuth();
    const { permissions } = useMenuPermissions();

    const allItems = [
        { key: 'weeklyCalendar', to: '/weekly', icon: Home, label: t('nav.weeklyCalendar') },
        { key: 'monthlyCalendar', to: '/calendar', icon: Calendar, label: t('nav.monthlyCalendar') },
        { key: 'createMeeting', to: '/schedule', icon: PlusCircle, label: t('nav.createMeeting') },
        { key: 'guestMeetups', to: '/guest-meetups', icon: Trophy, label: t('nav.guestMeetups') },
        { key: 'globalMeeting', to: '/global-meeting', icon: Globe, label: t('nav.globalMeeting') },
        { key: 'chatCheck', to: '/chat-check', icon: MessageSquare, label: t('nav.chatCheck') },
        { key: 'myDashboard', to: '/my-dashboard', icon: BarChart3, label: t('nav.myDashboard') },
    ];
    const footerItems = [
        { key: 'settings', to: '/settings', icon: Settings, label: t('nav.settings') },
        { key: 'admin', to: '/admin', icon: Shield, label: t('nav.admin') },
    ];

    const decorate = (item) => {
        const tierKey = minRequiredGroup(item.key, permissions);
        return {
            ...item,
            disabled: !canAccessMenu(item.key, userProfile, permissions, isAdmin),
            tierKey,
            tierBadge: GROUP_BADGE_SHORT[tierKey] || null,
        };
    };
    const mainItems = allItems.map(decorate);
    const sysItems = footerItems.map(decorate);
    const displayAppTitle = (userProfile?.appTitle && userProfile.appTitle.trim()) || t('app.name');

    return (
        <div className="min-h-[calc(100vh-6rem)] -m-4 md:-m-8 p-4 md:p-6 bg-gradient-to-b from-blue-50 via-indigo-50 to-sky-100">
            <header className="text-center pt-2 pb-5">
                <h1 className="text-2xl font-extrabold text-blue-900 leading-snug">
                    어디로 가볼까요? 👋
                </h1>
                <p className="text-sm text-blue-700/70 mt-1.5">
                    큰 버튼을 눌러 원하는 화면을 여세요
                </p>
            </header>

            <div className="max-w-md mx-auto space-y-3">
                {mainItems.map(item => (
                    <BigCard key={item.key} item={item} />
                ))}
                <div className="pt-3 pb-1 text-[10px] uppercase tracking-wide text-blue-700/50 font-bold text-center">
                    시스템
                </div>
                {sysItems.map(item => (
                    <BigCard key={item.key} item={item} />
                ))}
            </div>

            <footer className="text-center text-[11px] text-blue-700/40 mt-6 pb-3">
                🇰🇷 {displayAppTitle} · 안전하고 즐거운 모임 되세요
            </footer>
        </div>
    );
};

export default MobileHome;
