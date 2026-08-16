import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useCommentNotifications, { requestNotificationPermission } from '../../hooks/useCommentNotifications';
import useAttendanceNotifications from '../../hooks/useAttendanceNotifications';
import useGlobalChatNotifications from '../../hooks/useGlobalChatNotifications';
import ChatModal from '../chat/ChatModal';
import Sidebar from './Sidebar';
import LanguageSwitcher from './LanguageSwitcher';
import ServerCapacityIndicator from './ServerCapacityIndicator';
import { useRouteTracker } from '../../hooks/useRouteTracker';
import { Calendar, Bell, BellRing, BellOff, LayoutGrid } from 'lucide-react';

const MainLayout = ({ children }) => {
    const { t } = useTranslation();
    const { activeChatUser, closeChat, userProfile } = useAuth();
    // 라우트가 바뀔 때마다 마지막 화면을 기억해 다음 로그인 시 복원
    useRouteTracker();
    const displayAppTitle = (userProfile?.appTitle && userProfile.appTitle.trim()) || t('app.name');

    // Sync browser tab title (next to favicon) with the user's custom app title
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.title = displayAppTitle;
        }
    }, [displayAppTitle]);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('meet4u_sidebar_collapsed') === 'true'; } catch { return false; }
    });
    const [notifPermission, setNotifPermission] = useState(
        'Notification' in window ? Notification.permission : 'unsupported'
    );

    useCommentNotifications();
    useAttendanceNotifications();
    useGlobalChatNotifications();

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);
    const toggleSidebarCollapsed = () => {
        setIsSidebarCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem('meet4u_sidebar_collapsed', String(next)); } catch { /* ignore */ }
            return next;
        });
    };

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 text-gray-900">
            {/* Sidebar */}
            <Sidebar
                isMobileMenuOpen={isMobileMenuOpen}
                toggleMobileMenu={toggleMobileMenu}
                closeMobileMenu={closeMobileMenu}
                isCollapsed={isSidebarCollapsed}
                toggleCollapsed={toggleSidebarCollapsed}
            />

            {/* Overlay for mobile menu */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-[1090] md:hidden"
                    onClick={closeMobileMenu}
                ></div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen bg-white">
                {/* Mobile Header */}
                <header className="bg-white p-4 border-b border-gray-200 flex items-center justify-between md:hidden sticky top-0 z-30">
                    <div className="flex items-center gap-2">
                        {/* 홈(메뉴) 아이콘 — /menu 로 이동해 큰 카드 홈 화면으로 돌아간다.
                            /menu 에 있을 때는 노출하지 않는다. 햄버거 사이드바 버튼은
                            메인 메뉴와 기능이 겹쳐 삭제. */}
                        <MobileMenuButton />
                        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                            <Calendar className="text-gray-900" size={18} />
                            <span className="truncate max-w-[160px]">{displayAppTitle}</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <LanguageSwitcher compact />
                        {notifPermission !== 'unsupported' && (
                            <button
                                onClick={async () => {
                                    const result = await requestNotificationPermission();
                                    setNotifPermission(result);
                                    if (result === 'granted') {
                                        alert(t('notification.enabled'));
                                    } else if (result === 'denied') {
                                        alert(t('notification.blocked'));
                                    }
                                }}
                                className={`p-2 rounded-lg transition-colors ${notifPermission === 'granted'
                                        ? 'text-green-600 bg-green-50'
                                        : notifPermission === 'denied'
                                            ? 'text-red-400 bg-red-50'
                                            : 'text-blue-600 bg-blue-50 animate-pulse'
                                    }`}
                                title={notifPermission === 'granted' ? t('notification.activated') : t('notification.turnOn')}
                            >
                                {notifPermission === 'granted' ? <BellRing size={20} /> :
                                    notifPermission === 'denied' ? <BellOff size={20} /> :
                                        <Bell size={20} />}
                            </button>
                        )}
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8">
                    {children}
                </main>

                {/* Footer */}
                <footer className="text-center p-4 text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
                    {t('app.footer')}
                </footer>
            </div>

            {/* Chat Modal */}
            {
                activeChatUser && (
                    <ChatModal
                        targetUserEmail={activeChatUser.email}
                        targetUserName={activeChatUser.name}
                        onClose={closeChat}
                    />
                )
            }

            {/* Backend capacity traffic-light — always visible bottom-right */}
            <ServerCapacityIndicator />
        </div>
    );
};

// 모바일 헤더의 홈(메뉴) 버튼. 현재 페이지가 /menu 면 노출하지 않는다.
// 큰 카드 홈으로 즉시 돌아가서 다른 화면으로 이동할 수 있게 해 준다.
const MobileMenuButton = () => {
    const location = useLocation();
    if (location.pathname === '/menu') return null;
    return (
        <Link
            to="/menu"
            title="메뉴로 돌아가기"
            aria-label="메뉴로 돌아가기"
            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
        >
            <LayoutGrid size={22} />
        </Link>
    );
};

export default MainLayout;
