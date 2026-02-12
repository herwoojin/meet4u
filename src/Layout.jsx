import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Components/Login';
import Dashboard from './Pages/Dashboard';
import MeetingForm from './Components/meeting/MeetingForm';
import CalendarGrid from './Components/calendar/CalendarGrid';
import ProfilePage from './Pages/Profile';
import CreateMeeting from './Pages/CreateMeeting';
import { Calendar, Home, LogOut, PlusCircle, Settings, Menu, X, MapPin } from 'lucide-react';
import useCommentNotifications from './hooks/useCommentNotifications';
import ChatModal from './Components/chat/ChatModal';

const PrivateRoute = ({ children }) => {
    const { currentUser } = useAuth();
    return currentUser ? children : <Navigate to="/login" />;
};

const SidebarItem = ({ to, icon: Icon, label, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link
            to={to}
            onClick={onClick}
            className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
        >
            <Icon size={20} />
            <span className="font-medium">{label}</span>
        </Link>
    );
};

const ProtectedLayout = () => {
    const { logout, currentUser, activeChatUser, closeChat, openChat } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

    useCommentNotifications();

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0 md:flex md:flex-col
            `}>
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="text-gray-900" />
                        PromiseU
                    </h1>
                    <button onClick={toggleMobileMenu} className="md:hidden text-gray-500 hover:text-gray-900">
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <SidebarItem to="/" icon={Home} label="주간캘린더" onClick={() => setIsMobileMenuOpen(false)} />
                    <SidebarItem to="/calendar" icon={Calendar} label="월캘린더" onClick={() => setIsMobileMenuOpen(false)} />
                    <SidebarItem to="/schedule" icon={PlusCircle} label="미팅 생성" onClick={() => setIsMobileMenuOpen(false)} />
                    <div className="pt-4 mt-4 border-t border-gray-200">
                        <SidebarItem to="/profile" icon={Settings} label="설정" onClick={() => setIsMobileMenuOpen(false)} />
                        <a
                            href="https://whereurl.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-3 p-3 rounded-lg transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            <MapPin size={20} />
                            <span className="font-medium">내위치공유(지금가고있어요)</span>
                        </a>
                    </div>
                </nav>

                <div className="p-4 border-t border-gray-200">
                    <div className="flex items-center gap-3 mb-4 px-2 hover:bg-gray-100 p-2 rounded-lg transition-colors cursor-pointer">
                        <Link to="/profile" className="flex items-center gap-3 w-full">
                            <img src={currentUser?.photoURL || "https://ui-avatars.com/api/?name=User"} alt="User" className="w-8 h-8 rounded-full" />
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium truncate text-gray-900">{currentUser?.displayName || "사용자"}</p>
                                <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
                            </div>
                        </Link>
                    </div>
                    <button onClick={logout} className="w-full flex items-center justify-center space-x-2 p-2 rounded bg-gray-100 hover:bg-gray-200 transition-colors text-sm text-gray-700">
                        <LogOut size={16} />
                        <span>로그아웃</span>
                    </button>
                </div>
            </aside>

            {/* Overlay for mobile menu */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
                    onClick={toggleMobileMenu}
                ></div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
                {/* Mobile Header */}
                <header className="bg-white p-4 border-b border-gray-200 flex items-center md:hidden">
                    <button onClick={toggleMobileMenu} className="text-gray-500 hover:text-gray-900 mr-4">
                        <Menu size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="text-gray-900" size={20} />
                        PromiseU
                    </h1>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/calendar" element={<CalendarGrid />} />
                        <Route path="/schedule" element={<MeetingForm />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/create-meeting" element={<CreateMeeting />} />
                        <Route path="/settings" element={<div className="text-center p-10 text-gray-500">설정 (준비 중)</div>} />
                    </Routes>
                </main>
            </div>
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
    )
}

const Layout = () => {
    return (
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/*" element={
                    <PrivateRoute>
                        <ProtectedLayout />
                    </PrivateRoute>
                } />
            </Routes>
        </AuthProvider>
    );
};

export default Layout;
