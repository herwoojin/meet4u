import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, BellOff, Settings as SettingsIcon, Calendar, Check, Loader, Link as LinkIcon, Unlink, Type, Palette, Sparkles, FileText } from 'lucide-react';
import { requestFCMToken } from '../hooks/useFCM';
import { useAuth } from '../context/AuthContext';
import useGoogleCalendar from '../hooks/useGoogleCalendar';

const Settings = () => {
    const { t } = useTranslation();
    const [notifPermission, setNotifPermission] = useState('unsupported');
    const { currentUser: user, userProfile, updateUserProfile } = useAuth();
    const gcal = useGoogleCalendar();
    const [clientIdInput, setClientIdInput] = useState(gcal.clientId);
    const [clientIdSavedFlash, setClientIdSavedFlash] = useState(false);

    // App title customization
    const [appTitleInput, setAppTitleInput] = useState(userProfile?.appTitle || '');
    const [appTitleSavedFlash, setAppTitleSavedFlash] = useState(false);
    const [appTitleSaving, setAppTitleSaving] = useState(false);

    // Theme (per-device, localStorage)
    const [theme, setTheme] = useState(() => {
        try { return localStorage.getItem('meet4u_theme') || 'default'; } catch { return 'default'; }
    });
    const applyTheme = (next) => {
        setTheme(next);
        try { localStorage.setItem('meet4u_theme', next); } catch { /* ignore */ }
        const html = document.documentElement;
        html.classList.remove('theme-galaxy', 'theme-paper');
        if (next === 'galaxy' || next === 'paper') {
            html.classList.add(`theme-${next}`);
        }
    };

    useEffect(() => { setClientIdInput(gcal.clientId); }, [gcal.clientId]);
    useEffect(() => { setAppTitleInput(userProfile?.appTitle || ''); }, [userProfile?.appTitle]);

    const handleSaveAppTitle = async () => {
        const trimmed = appTitleInput.trim();
        setAppTitleSaving(true);
        try {
            // Empty string clears the custom title (falls back to default 'PromiseU')
            await updateUserProfile({ appTitle: trimmed });
            setAppTitleSavedFlash(true);
            setTimeout(() => setAppTitleSavedFlash(false), 1500);
        } catch (e) {
            console.error('Failed to save app title:', e);
            alert(t('settings.appTitle.saveFailed'));
        } finally {
            setAppTitleSaving(false);
        }
    };

    const handleSaveClientId = () => {
        gcal.saveClientId(clientIdInput);
        setClientIdSavedFlash(true);
        setTimeout(() => setClientIdSavedFlash(false), 1500);
    };

    const handleConnect = async () => {
        if (!gcal.clientId) {
            alert(t('settings.googleCalendar.needClientId'));
            return;
        }
        try {
            await gcal.connect();
            gcal.setSyncEnabled(true);
        } catch (_) {
            alert(t('settings.googleCalendar.connectFailed'));
        }
    };

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

            {/* App Title customization */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                <div className="p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <Type className="text-indigo-600" size={20} />
                        {t('settings.appTitle.title')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                        {t('settings.appTitle.description')}
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={appTitleInput}
                            onChange={(e) => setAppTitleInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAppTitle(); }}
                            placeholder={t('settings.appTitle.placeholder')}
                            maxLength={40}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            disabled={!user || appTitleSaving}
                        />
                        <button
                            type="button"
                            onClick={handleSaveAppTitle}
                            disabled={!user || appTitleSaving || (appTitleInput.trim() === (userProfile?.appTitle || ''))}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"
                        >
                            {appTitleSaving ? <Loader size={14} className="animate-spin" /> : (appTitleSavedFlash ? <Check size={14} /> : null)}
                            {appTitleSavedFlash ? t('settings.appTitle.saved') : t('settings.appTitle.save')}
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                        {t('settings.appTitle.hint')}
                    </p>
                </div>
            </div>

            {/* Theme picker */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                <div className="p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <Palette className="text-purple-600" size={20} />
                        {t('settings.theme.title')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                        {t('settings.theme.description')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Default */}
                        <button
                            type="button"
                            onClick={() => applyTheme('default')}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${theme === 'default' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div className="h-16 rounded-lg mb-2 bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-100 border border-blue-100"></div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{t('settings.theme.default')}</p>
                                    <p className="text-[11px] text-gray-500">{t('settings.theme.defaultDesc')}</p>
                                </div>
                                {theme === 'default' && <Check size={16} className="text-blue-600" />}
                            </div>
                        </button>
                        {/* Galaxy */}
                        <button
                            type="button"
                            onClick={() => applyTheme('galaxy')}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${theme === 'galaxy' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div
                                className="h-16 rounded-lg mb-2 relative overflow-hidden"
                                style={{
                                    background: 'radial-gradient(ellipse at 25% 30%, rgba(99,50,180,0.5), transparent 60%), radial-gradient(ellipse at 75% 70%, rgba(40,80,200,0.45), transparent 60%), #050514',
                                }}
                            >
                                <span style={{
                                    position: 'absolute', inset: 0,
                                    backgroundImage:
                                        'radial-gradient(1px 1px at 15% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 50%, #fff, transparent), radial-gradient(1.5px 1.5px at 80% 20%, #fff, transparent), radial-gradient(1px 1px at 35% 70%, #fff, transparent), radial-gradient(1px 1px at 90% 80%, #fff, transparent)',
                                    opacity: 0.8
                                }} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                                        <Sparkles size={12} className="text-purple-500" />
                                        {t('settings.theme.galaxy')}
                                    </p>
                                    <p className="text-[11px] text-gray-500">{t('settings.theme.galaxyDesc')}</p>
                                </div>
                                {theme === 'galaxy' && <Check size={16} className="text-purple-600" />}
                            </div>
                        </button>
                        {/* Paper */}
                        <button
                            type="button"
                            onClick={() => applyTheme('paper')}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${theme === 'paper' ? 'border-amber-600 ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div
                                className="h-16 rounded-lg mb-2 border border-amber-200"
                                style={{
                                    background: 'radial-gradient(ellipse at 30% 30%, rgba(248,240,218,0.7), transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(180,165,130,0.4), transparent 55%), #dfd4ba',
                                    backgroundBlendMode: 'multiply'
                                }}
                            />
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                                        <FileText size={12} className="text-amber-700" />
                                        {t('settings.theme.paper')}
                                    </p>
                                    <p className="text-[11px] text-gray-500">{t('settings.theme.paperDesc')}</p>
                                </div>
                                {theme === 'paper' && <Check size={16} className="text-amber-700" />}
                            </div>
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-3">
                        {t('settings.theme.hint')}
                    </p>
                </div>
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

            {/* Google Calendar integration */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <Calendar className="text-emerald-600" size={20} />
                        {t('settings.googleCalendar.title')}
                    </h2>
                    <p className="text-xs text-gray-500">
                        {t('settings.googleCalendar.description')}
                    </p>
                </div>

                <div className="p-6 space-y-5">
                    {/* Client ID input */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            {t('settings.googleCalendar.clientIdLabel')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={clientIdInput}
                                onChange={(e) => setClientIdInput(e.target.value)}
                                placeholder={t('settings.googleCalendar.clientIdPlaceholder')}
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                autoComplete="off"
                                spellCheck="false"
                            />
                            <button
                                type="button"
                                onClick={handleSaveClientId}
                                disabled={!clientIdInput.trim() || clientIdInput.trim() === gcal.clientId}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                            >
                                {clientIdSavedFlash ? <Check size={14} /> : null}
                                {clientIdSavedFlash ? t('settings.googleCalendar.saved') : t('settings.googleCalendar.save')}
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1.5">
                            {t('settings.googleCalendar.clientIdHelp')}
                        </p>
                    </div>

                    {/* Connection status + actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${gcal.isTokenValid
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                                }`}>
                                {gcal.isTokenValid
                                    ? <><Check size={12} /> {t('settings.googleCalendar.connected')}</>
                                    : <>{t('settings.googleCalendar.notConnected')}</>}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            {gcal.isTokenValid ? (
                                <button
                                    type="button"
                                    onClick={() => gcal.disconnect()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-700"
                                >
                                    <Unlink size={14} />
                                    {t('settings.googleCalendar.disconnect')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleConnect}
                                    disabled={gcal.busy || !gcal.clientId}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300"
                                >
                                    {gcal.busy ? <Loader size={14} className="animate-spin" /> : <LinkIcon size={14} />}
                                    {gcal.busy ? t('settings.googleCalendar.connecting') : t('settings.googleCalendar.connect')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Auto-sync toggle */}
                    <label className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-100 rounded-lg cursor-pointer">
                        <span className="text-sm text-gray-800">{t('settings.googleCalendar.autoSync')}</span>
                        <span className="relative inline-flex items-center">
                            <input
                                type="checkbox"
                                checked={gcal.syncEnabled}
                                onChange={(e) => gcal.setSyncEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <span className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-emerald-500 transition-colors"></span>
                            <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></span>
                        </span>
                    </label>

                    {/* Setup guide */}
                    <details className="text-xs text-gray-600">
                        <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                            {t('settings.googleCalendar.guideTitle')}
                        </summary>
                        <ol className="mt-2 ml-4 list-decimal space-y-1 text-gray-500">
                            <li>{t('settings.googleCalendar.guideStep1')}</li>
                            <li>{t('settings.googleCalendar.guideStep2')}</li>
                            <li>{t('settings.googleCalendar.guideStep3')}</li>
                            <li>{t('settings.googleCalendar.guideStep4')}</li>
                            <li>{t('settings.googleCalendar.guideStep5')}</li>
                            <li>{t('settings.googleCalendar.guideStep6')}</li>
                        </ol>
                    </details>
                </div>
            </div>
        </div>
    );
};

export default Settings;
