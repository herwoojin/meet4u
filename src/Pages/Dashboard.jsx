import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import WeeklyCalendar from '../Components/calendar/WeeklyCalendar';
import CelestialLoom from '../Components/effects/CelestialLoom';

const Dashboard = () => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="relative -m-4 md:-m-8 min-h-[calc(100vh-4rem)]">
            {/* 가장 아래 레이어 — 글로벌 짐 배경 (투명도 50%) */}
            <div
                aria-hidden
                className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center"
                style={{
                    backgroundImage: 'url(/dashboard-bg.jpg)',
                    opacity: 0.5,
                }}
            />

            {/* 컨텐츠 레이어 */}
            <div className="relative z-10 p-4 md:p-8 space-y-6">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">{t('dashboard.mainTitle')}</h2>
                        <p className="text-gray-700">{t('dashboard.welcome', { name: currentUser?.displayName })}</p>
                    </div>
                    <button
                        onClick={() => navigate('/schedule')}
                        className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        {t('dashboard.newMeeting')}
                    </button>
                </header>

                {/* Weekly Calendar Section */}
                <div className="mb-8">
                    <WeeklyCalendar />
                </div>
            </div>

            {/* Celestial Loom — 주간 모임 페이지에서만 노출되는 우주 배경.
                다른 페이지의 텍스트 가독성 문제로 여기 한 곳에만 국한한다. */}
            <CelestialLoom />
        </div>
    );
};

export default Dashboard;
