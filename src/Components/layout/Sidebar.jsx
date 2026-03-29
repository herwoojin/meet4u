import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Home, LogOut, PlusCircle, Settings, X, MapPin, Shield, BarChart3 } from 'lucide-react';

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

const Sidebar = ({ isMobileMenuOpen, closeMobileMenu, toggleMobileMenu }) => {
    const { logout, currentUser, isAdmin } = useAuth();

    return (
        <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            md:relative md:translate-x-0 md:flex md:flex-col md:h-screen md:sticky md:top-0
        `}>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <Link to="/" className="text-2xl font-bold text-gray-900 flex items-center gap-2" onClick={closeMobileMenu}>
                    <Calendar className="text-gray-900" />
                    PromiseU
                </Link>
                <button onClick={toggleMobileMenu} className="md:hidden text-gray-500 hover:text-gray-900">
                    <X size={24} />
                </button>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                <SidebarItem to="/" icon={Home} label="주간캘린더" onClick={closeMobileMenu} />
                <SidebarItem to="/calendar" icon={Calendar} label="월캘린더" onClick={closeMobileMenu} />
                <SidebarItem to="/schedule" icon={PlusCircle} label="미팅 생성" onClick={closeMobileMenu} />
                <SidebarItem to="/my-dashboard" icon={BarChart3} label="My 대시보드" onClick={closeMobileMenu} />
                <div className="pt-4 mt-4 border-t border-gray-200">
                    <SidebarItem to="/settings" icon={Settings} label="설정" onClick={closeMobileMenu} />
                    <SidebarItem to="/admin" icon={Shield} label="관리자" onClick={closeMobileMenu} />
                    <a
                        href="https://whereurl.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-3 p-3 rounded-lg transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        onClick={closeMobileMenu}
                    >
                        <MapPin size={20} />
                        <span className="font-medium">내위치공유(지금가고있어요)</span>
                    </a>
                </div>
            </nav>

            <div className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-4 px-2 hover:bg-gray-100 p-2 rounded-lg transition-colors cursor-pointer">
                    <Link to="/profile" className="flex items-center gap-3 w-full" onClick={closeMobileMenu}>
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
    );
};

export default Sidebar;
