import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import useCommentNotifications from '../../hooks/useCommentNotifications';
import ChatModal from '../chat/ChatModal';
import Sidebar from './Sidebar';
import { Menu, Calendar } from 'lucide-react';

const MainLayout = ({ children }) => {
    const { activeChatUser, closeChat } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
                <header className="bg-white p-4 border-b border-gray-200 flex items-center md:hidden sticky top-0 z-30">
                    <button onClick={toggleMobileMenu} className="text-gray-500 hover:text-gray-900 mr-4">
                        <Menu size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="text-gray-900" size={20} />
                        PromiseU
                    </h1>
                </header>

                <main className="flex-1 p-4 md:p-8">
                    {children}
                </main>

                {/* Restored Footer */}
                <footer className="text-center p-4 text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
                    Wooooo~ JINI
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
