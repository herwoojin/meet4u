import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import useCommentNotifications, { requestNotificationPermission } from '../../hooks/useCommentNotifications';
import ChatModal from '../chat/ChatModal';
import Sidebar from './Sidebar';
import { Menu, Calendar, Bell, BellRing, BellOff } from 'lucide-react';

const MainLayout = ({ children }) => {
    const { activeChatUser, closeChat } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [notifPermission, setNotifPermission] = useState(
        'Notification' in window ? Notification.permission : 'unsupported'
    );

    useCommentNotifications();

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 text-gray-900">
            {/* Sidebar */}
            <Sidebar
                isMobileMenuOpen={isMobileMenuOpen}
                toggleMobileMenu={toggleMobileMenu}
                closeMobileMenu={closeMobileMenu}
            />

            {/* Overlay for mobile menu */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
                    onClick={closeMobileMenu}
                ></div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen bg-white">
                {/* Mobile Header */}
                <header className="bg-white p-4 border-b border-gray-200 flex items-center justify-between md:hidden sticky top-0 z-30">
                    <div className="flex items-center">
                        <button onClick={toggleMobileMenu} className="text-gray-500 hover:text-gray-900 mr-4">
                            <Menu size={24} />
                        </button>
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Calendar className="text-gray-900" size={20} />
                            PromiseU
                        </h1>
                    </div>
                    {notifPermission !== 'unsupported' && (
                        <button
                            onClick={async () => {
                                const result = await requestNotificationPermission();
                                setNotifPermission(result);
                                if (result === 'granted') {
                                    alert('알림이 활성화되었습니다! 🔔');
                                } else if (result === 'denied') {
                                    alert('알림이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해 주세요.');
                                }
                            }}
                            className={`p-2 rounded-lg transition-colors ${notifPermission === 'granted'
                                    ? 'text-green-600 bg-green-50'
                                    : notifPermission === 'denied'
                                        ? 'text-red-400 bg-red-50'
                                        : 'text-blue-600 bg-blue-50 animate-pulse'
                                }`}
                            title={notifPermission === 'granted' ? '알림 활성화됨' : '알림 켜기'}
                        >
                            {notifPermission === 'granted' ? <BellRing size={20} /> :
                                notifPermission === 'denied' ? <BellOff size={20} /> :
                                    <Bell size={20} />}
                        </button>
                    )}
                </header>

                <main className="flex-1 p-4 md:p-8">
                    {children}
                </main>

                {/* Restored Footer */}
                <footer className="text-center p-4 text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
                    Wooooo~ JINI (v2.0 - PWA Fix)
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
        </div>
    );
};

export default MainLayout;
