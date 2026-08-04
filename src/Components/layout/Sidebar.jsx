import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import { useMenuPermissions, canAccessMenu, getUserGroup, GROUP_LABEL_KEY } from '../../lib/menuPermissions';
import { useProjects } from '../../context/ProjectContext';
import { Calendar, Home, LogOut, PlusCircle, Settings, X, Shield, BarChart3, Globe, PanelLeftClose, PanelLeftOpen, Folder, FolderPlus, Check, Trophy } from 'lucide-react';

const SidebarItem = ({ to, icon: Icon, label, onClick, collapsed }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link
            to={to}
            onClick={onClick}
            title={collapsed ? label : undefined}
            className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} p-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-white/90 text-blue-700 shadow-sm font-semibold' : 'text-blue-900/60 hover:bg-white/50 hover:text-blue-800'}`}
        >
            <Icon size={20} />
            {!collapsed && <span className="font-medium">{label}</span>}
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
        { key: 'myDashboard', to: '/my-dashboard', icon: BarChart3, label: t('nav.myDashboard') },
    ];

    const footerItems = [
        { key: 'settings', to: '/settings', icon: Settings, label: t('nav.settings') },
        { key: 'admin', to: '/admin', icon: Shield, label: t('nav.admin') },
    ];

    const visibleMain = allItems.filter(item => canAccessMenu(item.key, userProfile, permissions, isAdmin));
    const visibleFooter = footerItems.filter(item => canAccessMenu(item.key, userProfile, permissions, isAdmin));

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
            fixed inset-y-0 left-0 z-[1100] ${isCollapsed ? 'w-20' : 'w-64'} bg-gradient-to-b from-blue-50 via-indigo-50 to-sky-100 border-r border-blue-100 transform transition-all duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            md:relative md:translate-x-0 md:flex md:flex-col md:h-screen md:sticky md:top-0 md:z-auto
        `}>
            <div className={`${isCollapsed ? 'p-3' : 'p-6'} border-b border-blue-100/60 flex ${isCollapsed ? 'justify-center' : 'justify-between'} items-center`}>
                {!isCollapsed && (
                    <Link to="/" className="text-2xl font-bold text-blue-800 flex items-center gap-2" onClick={closeMobileMenu} title={displayAppTitle}>
                        <Calendar className="text-blue-600" />
                        <span className="truncate max-w-[160px]">{displayAppTitle}</span>
                    </Link>
                )}
                {/* 접기/펼치기 토글 — 모바일 · 데스크톱 모두 표시. 아이콘만 보이는
                    상태에서 이 버튼(또는 우측 힌트 화살표) 한 번 더 누르면 매뉴
                    제목이 보인다. */}
                <button
                    onClick={toggleCollapsed}
                    className="flex text-blue-500 hover:text-blue-700 p-1 rounded-md hover:bg-white/60 transition-colors"
                    title={isCollapsed ? t('nav.expand') : t('nav.collapse')}
                    aria-label={isCollapsed ? t('nav.expand') : t('nav.collapse')}
                >
                    {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
                {/* X는 모바일에서만 사이드바 자체를 닫는다. */}
                <button onClick={toggleMobileMenu} className="md:hidden text-blue-400 hover:text-blue-700" aria-label={t('nav.close') || 'close'}>
                    <X size={24} />
                </button>
            </div>

            {!isCollapsed && (
                <div className="px-4 pt-3 hidden md:flex justify-end">
                    <LanguageSwitcher compact />
                </div>
            )}

            {/* Project switcher — visible only when user has at least one project */}
            {!isCollapsed && projects.length > 0 && (
                <div className="px-4 pt-2 pb-1">
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
                <div className="px-2 pt-2 flex justify-center">
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

            <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-4'} space-y-2 overflow-y-auto`}>
                {visibleMain.map(item => (
                    <SidebarItem key={item.key} to={item.to} icon={item.icon} label={item.label} onClick={closeMobileMenu} collapsed={isCollapsed} />
                ))}
                {visibleFooter.length > 0 && (
                    <div className="pt-4 mt-4 border-t border-blue-100/60">
                        {visibleFooter.map(item => (
                            <SidebarItem key={item.key} to={item.to} icon={item.icon} label={item.label} onClick={closeMobileMenu} collapsed={isCollapsed} />
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
                <button
                    onClick={logout}
                    title={isCollapsed ? t('nav.logout') : undefined}
                    className={`w-full flex items-center justify-center ${isCollapsed ? '' : 'space-x-2'} p-2 rounded-lg bg-white/60 hover:bg-white/90 transition-all duration-200 text-sm text-blue-700 border border-blue-100`}
                >
                    <LogOut size={16} />
                    {!isCollapsed && <span>{t('nav.logout')}</span>}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
