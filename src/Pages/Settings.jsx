import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, BellOff, Settings as SettingsIcon } from 'lucide-react';
import { requestFCMToken } from '../hooks/useFCM';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
    const { t } = useTranslation();
    const [notifPermission, setNotifPermission] = useState('unsupported');
    const { currentUser: user } = useAuth();

    useEffect(() => {
        if ('Notification' in window) {
            setNotifPermission(Notification.permission);
        }
    }, []);

    const handleRequestPermission = async () => {
        if (!user) {
            alert(t('settings.loginRequired'));
            return;
        }

        const token = await requestFCMToken(user.uid, user.email);

        setNotifPermission(Notification.permission);

        if (token) {
            alert(t('settings.notifEnabledAlert'));
        } else if (Notification.permission === 'denied') {
            alert(t('settings.notifBlockedAlert'));
        } else {
            alert(t('settings.notifTokenError'));
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <SettingsIcon className="text-blue-600" size={28} />
                    {t('settings.title')}
                </h1>
                <p className="text-gray-500 mt-2">{t('settings.subtitle')}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell className="text-gray-600" size={20} />
                        {t('settings.pushTitle')}
                    </h2>

                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-800">{t('settings.mobileNotif')}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {t('settings.mobileNotifDesc')}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className={`text-xs px-3 py-1 rounded-full font-bold border ${notifPermission === 'granted' ? 'bg-green-100 text-green-700 border-green-200' :
                                    notifPermission === 'denied' ? 'bg-red-100 text-red-700 border-red-200' :
                                    'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>
                                {notifPermission === 'granted' ? t('settings.statusGranted') :
                                 notifPermission === 'denied' ? t('settings.statusDenied') :
                                 t('settings.statusDefault')}
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        {notifPermission === 'granted' ? (
                            <div className="flex items-center gap-3 text-green-700">
                                <div className="p-2 bg-green-100 rounded-full">
                                    <BellRing size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">{t('settings.notifActive')}</p>
                                    <p className="text-xs mt-1 text-green-600">{t('settings.notifActiveDesc')}</p>
                                </div>
                            </div>
                        ) : notifPermission === 'denied' ? (
                            <div className="flex items-center gap-3 text-red-700">
                                <div className="p-2 bg-red-100 rounded-full">
                                    <BellOff size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">{t('settings.notifBlocked')}</p>
                                    <p className="text-xs mt-1 text-red-600">{t('settings.notifBlockedDesc')}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-start gap-3">
                                <p className="text-sm text-gray-600">{t('settings.notifNone')}</p>
                                <button
                                    onClick={handleRequestPermission}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition"
                                >
                                    {t('settings.requestPermission')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-blue-50/50">
                    <h3 className="text-sm font-bold text-gray-800 mb-2">{t('settings.iosNote')}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                        {t('settings.iosNoteDesc')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
