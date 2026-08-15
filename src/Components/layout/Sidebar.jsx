import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import { useMenuPermissions, canAccessMenu, getUserGroup, GROUP_LABEL_KEY, minRequiredGroup, GROUP_BADGE_SHORT } from '../../lib/menuPermissions';
import { useProjects } from '../../context/ProjectContext';
import { Calendar, Home, LogOut, PlusCircle, Settings, X, Shield, BarChart3, Globe, PanelLeftClose, PanelLeftOpen, Folder, FolderPlus, Check, Trophy, MessageSquare, Mail, ChevronRight } from 'lucide-react';

// 모바일 카드용 색상/서브카피 — 요청 참조 이미지처럼 큰 컬러 아이콘 + 설명
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

// 모바일 큰 카드 — 참조 이미지 스타일. 컬러 아이콘 박스 + 제목 + 서브카피 + 우측 화살표
const MobileMenuCard = ({ item, onClick }) => {
    const meta = MENU_META[item.key] || { bg: 'bg-blue-500', sub: '' };
    const tierStyle = item.tierKey ? TIER_BADGE_STYLE[item.tierKey] : null;
    const badgeCls = tierStyle ? (item.disabled ? tierStyle.disabled : tierStyle.active) : '';

    const inner = (
        <>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${item.disabled ? 'bg-gray-300' : meta.bg}`}>
                <item.icon size={28} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <div className={`font-bold text-base truncate ${item.disabled ? 'text-blue-900/40' : 'text-blue-900'}`}>
                        {item.label}
                    </div>
                    {item.tierBadge && (
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badgeCls}`}>
                            {item.tierBadge}
                        </span>
                    )}
                </div>
                <div className={`text-xs truncate ${item.disabled ? 'text-blue-900/25' : 'text-blue-700/60'}`}>
                    {item.disabled ? '권한이 없어요 · 잠금' : meta.sub}
                </div>
            </div>
            <ChevronRight size={20} className={item.disabled ? 'text-blue-900/20 shrink-0' : 'text-blue-400 shrink-0'} />
        </>
    );

    const clsBase = 'w-full flex items-center gap-4 p-3.5 rounded-2xl border shadow-sm transition-all';
    const clsState = item.disabled
        ? 'bg-white/40 border-white/40 cursor-not-allowed select-none'
        : 'bg-white/85 border-white/60 hover:bg-white active:scale-[0.98]';

    if (item.disabled) {
        return <div aria-disabled="true" className={`${clsBase} ${clsState}`}>{inner}</div>;
    }
    return <Link to={item.to} onClick={onClick} className={`${clsBase} ${clsState}`}>{inner}</Link>;
};

// SidebarItem
//  - disabled=true 이면 <Link> 대신 <div> 로 렌더, 클릭 불가, 회색 톤.
//  - tierBadge (정/특/관) 이 있으면 라벨 오른쪽에 작은 원형 뱃지 표시.
//  - tierColor 는 배지 색상을 결정 (full=파랑 / special=보라 / admin=앰버 / disabled=회색).
const TIER_BADGE_STYLE = {
    full:    { active: 'bg-blue-100   text-blue-700   border-blue-200',   disabled: 'bg-gray-100 text-gray-400 border-gray-200' },
    special: { active: 'bg-purple-100 text-purple-700 border-purple-200', disabled: 'bg-gray-100 text-gray-400 border-gray-200' },
    admin:   { active: 'bg-amber-100  text-amber-800  border-amber-300',  disabled: 'bg-gray-100 text-gray-400 border-gray-200' },
};

const SidebarItem = ({ to, icon: Icon, label, onClick, collapsed, disabled = false, tierBadge = null, tierKey = null }) => {
    const location = useLocation();
    const isActive = !disabled && location.pathname === to;

    const baseCls = `flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} p-3 rounded-lg transition-all duration-200 relative`;
    const stateCls = disabled
        ? 'text-blue-900/25 cursor-not-allowed select-none'
        : isActive
            ? 'bg-white/90 text-blue-700 shadow-sm font-semibold'
            : 'text-blue-900/60 hover:bg-white/50 hover:text-blue-800';

    const tierStyle = tierKey ? TIER_BADGE_STYLE[tierKey] : null;
    const badgeCls = tierStyle ? (disabled ? tierStyle.disabled : tierStyle.active) : '';

    const badgeEl = tierBadge && (
        collapsed
            ? <span className={`absolute -top-0.5 -right-0.5 text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border ${badgeCls}`}>{tierBadge}</span>
            : <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badgeCls}`}>{tierBadge}</span>
    );

    const content = (
        <>
            <Icon size={20} />
            {!collapsed && <span className="font-medium">{label}</span>}
            {badgeEl}
        </>
    );

    if (disabled) {
        return (
            <div
                title={collapsed ? `${label} · 권한 없음` : '권한 없음'}
                aria-disabled="true"
                className={`${baseCls} ${stateCls}`}
            >
                {content}
            </div>
        );
    }

    return (
        <Link
            to={to}
            onClick={onClick}
            title={collapsed ? label : undefined}
            className={`${baseCls} ${stateCls}`}
        >
            {content}
        </Link>
    );
};

const Sidebar = ({ isMobileMenuOpen, closeMobileMenu, toggleMobileMenu, isCollapsed, toggleCollapsed }) => {
    const { t } = useTranslation();
    const { logout, currentUser, userProfile, isAdmin } = useAuth();
    const { permissions } = useMenuPermissions();
    const { projects, currentProjectId, currentProject, setCurrentProjectId } = useProjects();
    const displayAppTitle = (userProfile?.appTitle && userProfile.appTitle.trim()) || t('app.name');

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

    // 요구사항: 모든 매뉴 글자는 그대로 노출하되, 권한 없는 매뉴는 회색 톤 +
    // 비활성화(클릭 불가) 로만 처리. 각 매뉴에는 최소 접근 등급 뱃지(정/특/관)
    // 를 붙여 왜 비활성화됐는지 시각적으로 보여준다.
    const decorate = (item) => {
        const tierKey = minRequiredGroup(item.key, permissions); // 'full' | 'special' | 'admin' | null
        return {
            ...item,
            disabled: !canAccessMenu(item.key, userProfile, permissions, isAdmin),
            tierKey,
            tierBadge: GROUP_BADGE_SHORT[tierKey] || null,
        };
    };
    const visibleMain = allItems.map(decorate);
    const visibleFooter = footerItems.map(decorate);

    // 회원 등급 뱃지 — 일반회원/정회원/특별회원/관리자
    const userGroup = isAdmin ? 'admin' : getUserGroup(userProfile);
    const groupLabel = t(GROUP_LABEL_KEY[userGroup] || 'admin.groupGeneral');
    const GROUP_BADGE_STYLE = {
        general: 'bg-gray-100 text-gray-600 border-gray-200',
        full:    'bg-blue-100 text-blue-700 border-blue-200',
        special: 'bg-purple-100 text-purple-700 border-purple-200',
        admin:   'bg-amber-100 text-amber-800 border-amber-300',
    };
    const badgeCls = GROUP_BADGE_STYLE[userGroup] || GROUP_BADGE_STYLE.general;

    return (
        <aside className={`
            fixed inset-y-0 left-0 z-[1100]
            w-[min(88vw,360px)]
            ${isCollapsed ? 'md:w-20' : 'md:w-64'}
            bg-gradient-to-b from-blue-50 via-indigo-50 to-sky-100 border-r border-blue-100
            transform transition-all duration-300 ease-in-out flex flex-col
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            md:relative md:translate-x-0 md:flex md:flex-col md:h-screen md:sticky md:top-0 md:z-auto
        `}>
            <div className={`${isCollapsed ? 'md:p-3 p-4' : 'md:p-6 p-4'} border-b border-blue-100/60 flex ${isCollapsed ? 'md:justify-center justify-between' : 'justify-between'} items-center`}>
                {/* 모바일에선 항상 title 노출(카드 뷰 컨텍스트). 데스크톱은 collapsed 시 숨김 */}
                <Link
                    to="/"
                    onClick={closeMobileMenu}
                    title={displayAppTitle}
                    className={`text-2xl font-bold text-blue-800 flex items-center gap-2 ${isCollapsed ? 'md:hidden' : ''}`}
                >
                    <Calendar className="text-blue-600" />
                    <span className="truncate max-w-[160px]">{displayAppTitle}</span>
                </Link>
                {/* 접기/펼치기 토글 — 모바일 · 데스크톱 모두 표시. 아이콘만 보이는
                    상태에서 이 버튼(또는 우측 힌트 화살표) 한 번 더 누르면 매뉴
                    제목이 보인다. */}
                <div className="flex items-center gap-1">
                    {/* 접기 토글은 데스크톱에서만. 모바일은 카드 뷰라 접기 상태 무의미. */}
                    <button
                        onClick={toggleCollapsed}
                        className="hidden md:flex text-blue-500 hover:text-blue-700 p-1 rounded-md hover:bg-white/60 transition-colors"
                        title={isCollapsed ? t('nav.expand') : t('nav.collapse')}
                        aria-label={isCollapsed ? t('nav.expand') : t('nav.collapse')}
                    >
                        {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                    </button>
                    {/* X는 모바일에서만 사이드바 자체를 닫는다. */}
                    <button onClick={toggleMobileMenu} className="md:hidden text-blue-400 hover:text-blue-700 p-1" aria-label={t('nav.close') || 'close'}>
                        <X size={24} />
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <div className="px-4 pt-3 hidden md:flex justify-end">
                    <LanguageSwitcher compact />
                </div>
            )}

            {/* ── 모바일 전용 안내 헤더 ── */}
            <div className="md:hidden px-5 pt-4 pb-3">
                <h2 className="text-lg font-bold text-blue-900 leading-snug">어디로 가볼까요? 👋</h2>
                <p className="text-xs text-blue-700/70 mt-1">큰 버튼을 눌러 원하는 화면을 여세요</p>
            </div>

            {/* ── 모바일 전용: 프로젝트 스위처 (컴팩트 chip 형태) ── */}
            {projects.length > 0 && (
                <div className="md:hidden px-4 pb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {projects.map(p => {
                            const active = p.id === currentProjectId;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setCurrentProjectId(p.id)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${active
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white/70 text-blue-800 border-blue-200 hover:bg-white'
                                    }`}
                                >
                                    <span>{p.icon || '📁'}</span>
                                    <span className="truncate max-w-[100px]">{p.name}</span>
                                </button>
                            );
                        })}
                        <Link
                            to="/projects"
                            onClick={closeMobileMenu}
                            className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-[11px] font-semibold text-blue-700 bg-white/70 border border-blue-100"
                        >
                            <FolderPlus size={11} />
                        </Link>
                    </div>
                </div>
            )}

            {/* ── 모바일 전용: 큰 카드 매뉴 리스트 ── */}
            <div className="md:hidden flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
                {visibleMain.map(item => (
                    <MobileMenuCard key={item.key} item={item} onClick={closeMobileMenu} />
                ))}
                {visibleFooter.length > 0 && (
                    <>
                        <div className="pt-2 pb-1 text-[10px] uppercase tracking-wide text-blue-700/50 font-bold">
                            시스템
                        </div>
                        {visibleFooter.map(item => (
                            <MobileMenuCard key={item.key} item={item} onClick={closeMobileMenu} />
                        ))}
                    </>
                )}
            </div>

            {/* Project switcher — visible only when user has at least one project */}
            {!isCollapsed && projects.length > 0 && (
                <div className="hidden md:block px-4 pt-2 pb-1">
                    <div className="text-[10px] uppercase tracking-wide text-blue-500/70 font-bold mb-1.5 flex items-center gap-1">
                        <Folder size={11} /> 프로젝트
                    </div>
                    <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
                        {projects.map(p => {
                            const active = p.id === currentProjectId;
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentProjectId(p.id)}
                                        title={p.name}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${active
                                            ? 'bg-white shadow-sm text-blue-800 font-bold border border-blue-200'
                                            : 'text-blue-900/70 hover:bg-white/60'
                                        }`}
                                    >
                                        <span className="text-sm shrink-0">{p.icon || '📁'}</span>
                                        <span className="flex-1 truncate">{p.name}</span>
                                        {active && <Check size={10} className="text-blue-600 shrink-0" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <Link
                        to="/projects"
                        onClick={closeMobileMenu}
                        className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold text-blue-700 bg-white/70 hover:bg-white border border-blue-100"
                    >
                        <FolderPlus size={11} /> 프로젝트 관리
                    </Link>
                </div>
            )}

            {isCollapsed && currentProject && (
                <div className="hidden md:flex px-2 pt-2 justify-center">
                    <Link
                        to="/projects"
                        onClick={closeMobileMenu}
                        title={currentProject.name}
                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/70 hover:bg-white border border-blue-100 text-lg"
                    >
                        {currentProject.icon || '📁'}
                    </Link>
                </div>
            )}

            {/* 데스크톱 전용: 기존 컴팩트 nav (모바일은 위 카드 뷰) */}
            <nav className={`hidden md:flex flex-1 ${isCollapsed ? 'p-2' : 'p-4'} flex-col space-y-2 overflow-y-auto`}>
                {visibleMain.map(item => (
                    <SidebarItem
                        key={item.key}
                        to={item.to}
                        icon={item.icon}
                        label={item.label}
                        onClick={closeMobileMenu}
                        collapsed={isCollapsed}
                        disabled={item.disabled}
                        tierBadge={item.tierBadge}
                        tierKey={item.tierKey}
                    />
                ))}
                {visibleFooter.length > 0 && (
                    <div className="pt-4 mt-4 border-t border-blue-100/60">
                        {visibleFooter.map(item => (
                            <SidebarItem
                                key={item.key}
                                to={item.to}
                                icon={item.icon}
                                label={item.label}
                                onClick={closeMobileMenu}
                                collapsed={isCollapsed}
                                disabled={item.disabled}
                                tierBadge={item.tierBadge}
                                tierKey={item.tierKey}
                            />
                        ))}
                    </div>
                )}
            </nav>

            <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-blue-100/60`}>
                {isCollapsed ? (
                    <Link to="/profile" onClick={closeMobileMenu} className="flex justify-center mb-2" title={currentUser?.displayName || t('nav.user')}>
                        <img src={currentUser?.photoURL || "https://ui-avatars.com/api/?name=User"} alt="User" className="w-10 h-10 rounded-full" />
                    </Link>
                ) : (
                    <div className="flex items-center gap-3 mb-4 px-2 hover:bg-white/50 p-2 rounded-lg transition-all duration-200 cursor-pointer">
                        <Link to="/profile" className="flex items-center gap-3 w-full" onClick={closeMobileMenu}>
                            <img src={currentUser?.photoURL || "https://ui-avatars.com/api/?name=User"} alt="User" className="w-8 h-8 rounded-full" />
                            <div className="flex-1 overflow-hidden">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-sm font-medium truncate text-blue-900">{currentUser?.displayName || t('nav.user')}</p>
                                    <span
                                        title={groupLabel}
                                        className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${badgeCls}`}
                                    >
                                        {groupLabel}
                                    </span>
                                </div>
                                <p className="text-xs text-blue-500/70 truncate">{currentUser?.email}</p>
                            </div>
                        </Link>
                    </div>
                )}
                <div className={`flex items-center ${isCollapsed ? 'flex-col' : 'flex-row'} gap-2`}>
                    <button
                        onClick={logout}
                        title={isCollapsed ? t('nav.logout') : undefined}
                        className={`flex-1 flex items-center justify-center ${isCollapsed ? '' : 'space-x-2'} p-2 rounded-lg bg-white/60 hover:bg-white/90 transition-all duration-200 text-sm text-blue-700 border border-blue-100`}
                    >
                        <LogOut size={16} />
                        {!isCollapsed && <span>{t('nav.logout')}</span>}
                    </button>
                    {/* 주인장에게 이메일 보내기 — 작은 원형 버튼. 클릭 시 기본 메일 클라이언트가 열린다. */}
                    <a
                        href={`mailto:iam@k-ai.top?subject=${encodeURIComponent('[PromiseU] 문의')}`}
                        title="주인장에게 이메일 보내기"
                        aria-label="주인장에게 이메일 보내기"
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-blue-600 border border-blue-100 transition-colors"
                    >
                        <Mail size={16} />
                    </a>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
