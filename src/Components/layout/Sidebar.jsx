import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import { useMenuPermissions, canAccessMenu } from '../../lib/menuPermissions';
import { Calendar, Home, LogOut, PlusCircle, Settings, X, Shield, BarChart3, Globe, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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
    const displayAppTitle = (userProfile?.appTitle && userProfile.appTitle.trim()) || t('app.name');

    const allItems = [
        { key: 'weeklyCalendar', to: '/weekly', icon: Home, label: t('nav.weeklyCalendar') },
        { key: 'monthlyCalendar', to: '/calendar', icon: Calendar, label: t('nav.monthlyCalendar') },
        { key: 'createMeeting', to: '/schedule', icon: PlusCircle, label: t('nav.createMeeting') },
        { key: 'globalMeeting', to: '/global-meeting', icon: Globe, label: t('nav.globalMeeting') },
        { key: 'myDashboard', to: '/my-dashboard', icon: BarChart3, label: t('nav.myDashboard') },
    ];

    const footerItems = [
        { key: 'settings', to: '/settings', icon: Settings, label: t('nav.settings') },
        { key: 'admin', to: '/admin', icon: Shield, label: t('nav.admin') },
    ];

    const visibleMain = allItems.filter(item => canAccessMenu(item.key, userProfile, permissions, isAdmin));
    const visibleFooter = footerItems.filter(item => canAccessMenu(item.key, userProfile, permissions, isAdmin));

    return (
        <aside className={`
            fixed inset-y-0 left-0 z-[1100] ${isCollapsed ? 'md:w-20' : 'w-64'} bg-gradient-to-b from-blue-50 via-indigo-50 to-sky-100 border-r border-blue-100 transform transition-all duration-300 ease-in-out
            ${isCollapsed ? '' : 'w-64'}
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
                <button
                    onClick={toggleCollapsed}
                    className="hidden md:flex text-blue-500 hover:text-blue-700 p-1 rounded-md hover:bg-white/60 transition-colors"
                    title={isCollapsed ? t('nav.expand') : t('nav.collapse')}
                >
                    {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
                <button onClick={toggleMobileMenu} className="md:hidden text-blue-400 hover:text-blue-700">
                    <X size={24} />
                </button>
            </div>

            {!isCollapsed && (
                <div className="px-4 pt-3 hidden md:flex justify-end">
                    <LanguageSwitcher compact />
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
                                <p className="text-sm font-medium truncate text-blue-900">{currentUser?.displayName || t('nav.user')}</p>
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
