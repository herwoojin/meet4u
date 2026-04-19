import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Mail, Edit2, Save, X, Globe } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

const SUPPORTED_LANGUAGES = [
    { code: 'ko', label: '한국어(Korean)' },
    { code: 'en', label: 'English(영어)' },
    { code: 'zh-CN', label: '中文(Chinese)' },
    { code: 'ja', label: '日本語(Japanese)' },
    { code: 'ru', label: 'Русский(Russian)' },
    { code: 'es', label: 'Español(Spanish)' },
    { code: 'vi', label: 'Tiếng Việt(Vietnamese)' },
    { code: 'mn', label: 'Монгол(Mongolian)' },
    { code: 'ar', label: 'العربية(Arabic)' },
    { code: 'fr', label: 'Français(French)' },
];

const Profile = () => {
    const { t } = useTranslation();
    const { currentUser, userProfile, logout } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(currentUser?.displayName || "");
    const [newLang, setNewLang] = useState(userProfile?.preferredLanguage || "ko");
    const [loading, setLoading] = useState(false);

    // Update local state when currentUser/userProfile changes
    useEffect(() => {
        if (currentUser?.displayName) {
            setNewName(currentUser.displayName);
        }
        if (userProfile?.preferredLanguage) {
            setNewLang(userProfile.preferredLanguage);
        }
    }, [currentUser, userProfile]);

    const handleUpdateProfile = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        const prevLang = userProfile?.preferredLanguage || 'ko';
        const languageChanged = prevLang !== newLang;
        try {
            // 1. Update Firebase Auth Profile
            await updateProfile(auth.currentUser, {
                displayName: newName
            });

            // 2. Sync with Firestore 'users' collection for global visibility
            await setDoc(doc(db, "users", currentUser.uid), {
                email: currentUser.email,
                displayName: newName,
                preferredLanguage: newLang,
                photoURL: currentUser.photoURL,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            setIsEditing(false);
            if (languageChanged) {
                alert(`${t('profile.updated')}\n${t('profile.relogin')}`);
                await logout();
            } else {
                alert(t('profile.updated'));
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            alert(t('profile.updateFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">{t('profile.title')}</h2>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="h-32 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
                <div className="px-8 pb-8 relative">
                    <div className="relative -mt-16 mb-6">
                        <img
                            src={currentUser?.photoURL || "https://ui-avatars.com/api/?name=User"}
                            alt="Profile"
                            className="w-32 h-32 rounded-full border-4 border-white shadow-md object-cover bg-white"
                        />
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center gap-3">
                                {isEditing ? (
                                    <div className="flex flex-col gap-2 w-full max-w-sm">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={newName}
                                                onChange={(e) => setNewName(e.target.value)}
                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder={t('profile.nickname')}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Globe className="text-gray-400" size={16} />
                                            <select
                                                value={newLang}
                                                onChange={(e) => setNewLang(e.target.value)}
                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm h-10"
                                                style={{ WebkitAppearance: 'auto' }}
                                            >
                                                {SUPPORTED_LANGUAGES.map(lang => (
                                                    <option key={lang.code} value={lang.code}>
                                                        {lang.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={handleUpdateProfile}
                                                disabled={loading}
                                                className="flex-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                                            >
                                                <Save size={18} className="mr-1" /> {t('common.save')}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setIsEditing(false);
                                                    setNewName(currentUser?.displayName || "");
                                                    setNewLang(userProfile?.preferredLanguage || "ko");
                                                }}
                                                className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <h3 className="text-2xl font-bold text-gray-900">{currentUser?.displayName || t('nav.user')}</h3>
                                            <div className="flex items-center mt-1 text-sm text-gray-600 font-medium">
                                                <Globe className="text-blue-500 mr-1.5" size={14} />
                                                {t('profile.preferredLanguage')}: {SUPPORTED_LANGUAGES.find(l => l.code === (userProfile?.preferredLanguage || 'ko'))?.label || '한국어'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="text-gray-400 hover:text-blue-600 transition-colors ml-auto self-start mt-2"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-gray-500 mt-1">{t('profile.joinDate')}: {new Date(currentUser?.metadata?.creationTime).toLocaleDateString()}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <Mail className="text-blue-500" size={20} />
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">{t('profile.email')}</p>
                                    <p className="font-medium">{currentUser?.email}</p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <User className="text-purple-500" size={20} />
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">{t('profile.userId')}</p>
                                    <p className="font-mono text-sm">{currentUser?.uid}</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100">
                            <button
                                onClick={logout}
                                className="w-full flex items-center justify-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 py-3 rounded-lg transition-colors border border-red-100"
                            >
                                <LogOut size={20} />
                                <span className="font-semibold">{t('nav.logout')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
