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
import InstallAppButton from './InstallAppButton';
import ServerCapacityIndicator from './ServerCapacityIndicator';
import { useRouteTracker } from '../../hooks/useRouteTracker';
import { Bell, BellRing, BellOff, LayoutGrid, LogOut, User } from 'lucide-react';

const MainLayout = ({ children }) => {
    const { t } = useTranslation();
    const { activeChatUser, closeChat, currentUser, userProfile, logout } = useAuth();
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
                {/* 오른쪽 버튼이 늘어 360px 폭에서 원형 버튼이 찌그러지고 화면 밖으로 밀려났다 →
                    버튼은 shrink-0 로 고정하고, 모자란 폭은 왼쪽 앱 제목이 말줄임으로 양보한다.
                    (설치 후에는 설치 버튼이 사라져 360px 에서도 제목이 다 보인다) */}
                <header className="bg-white px-3 py-4 border-b border-gray-200 flex items-center justify-between gap-2 md:hidden sticky top-0 z-30">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* 홈(메뉴) 아이콘 — /menu 로 이동해 큰 카드 홈 화면으로 돌아간다.
                            /menu 에 있을 때는 노출하지 않는다. 햄버거 사이드바 버튼은
                            메인 메뉴와 기능이 겹쳐 삭제. */}
                        <MobileMenuButton />
                        {/* 제목 앞 달력 아이콘은 뺐다 — 장식인데 24px 를 먹어 제목이 먼저 잘렸다 */}
                        <h1 className="text-lg font-bold text-gray-900 flex items-center min-w-0">
                            <span className="truncate min-w-0">{displayAppTitle}</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <LanguageSwitcher compact />
                        {/* 앱 설치(PWA) — 이미 앱으로 열려 있으면 자동으로 숨는다 */}
                        <InstallAppButton />
                        {/* 내 프로필(별명·사용 언어) — 모바일엔 사이드바 진입로가 없어
                            여기가 설정 화면으로 가는 상시 통로다. */}
                        <Link
                            to="/profile"
                            title={t('nav.profile', '내 프로필')}
                            aria-label={t('nav.profile', '내 프로필')}
                            className="w-9 h-9 flex items-center justify-center rounded-full overflow-hidden bg-white border border-blue-200 hover:bg-blue-50 transition-colors shrink-0"
                        >
                            {currentUser?.photoURL
                                ? <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
                                : <User size={16} className="text-blue-600" />}
                        </Link>
                        {/* 로그아웃 — 한국어 옆 원형 아이콘 버튼 */}
                        <button
                            onClick={() => {
                                if (window.confirm(t('nav.logout') + '?')) logout();
                            }}
                            title={t('nav.logout')}
                            aria-label={t('nav.logout')}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-red-500 border border-red-200 hover:bg-red-50 transition-colors shrink-0"
                        >
                            <LogOut size={16} />
                        </button>
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
                                className={`p-2 rounded-lg transition-colors shrink-0 ${notifPermission === 'granted'
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
