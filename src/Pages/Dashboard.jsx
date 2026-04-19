import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import WeeklyCalendar from '../Components/calendar/WeeklyCalendar';

const Dashboard = () => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">{t('dashboard.mainTitle')}</h2>
                    <p className="text-gray-500">{t('dashboard.welcome', { name: currentUser?.displayName })}</p>
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
    );
};

export default Dashboard;
