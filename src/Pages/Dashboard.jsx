import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import WeeklyCalendar from '../Components/calendar/WeeklyCalendar';

const Dashboard = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">대시보드</h2>
                    <p className="text-gray-500">환영합니다, {currentUser?.displayName}님! 오늘의 일정을 확인하세요.</p>
                </div>
                <button
                    onClick={() => navigate('/schedule')}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    + 새 미팅
                </button>
            </header>

            {/* Weekly Calendar Section */}
            <div className="mb-8">
                <WeeklyCalendar />
            </div>
        </div>
    );
};

export default Dashboard;
