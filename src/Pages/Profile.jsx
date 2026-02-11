import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Mail, Edit2, Save, X } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

const Profile = () => {
    const { currentUser, logout } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(currentUser?.displayName || "");
    const [loading, setLoading] = useState(false);

    // Update local state when currentUser changes
    useEffect(() => {
        if (currentUser?.displayName) {
            setNewName(currentUser.displayName);
        }
    }, [currentUser]);

    const handleUpdateProfile = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        try {
            // 1. Update Firebase Auth Profile
            await updateProfile(auth.currentUser, {
                displayName: newName
            });

            // 2. Sync with Firestore 'users' collection for global visibility
            await setDoc(doc(db, "users", currentUser.uid), {
                email: currentUser.email,
                displayName: newName,
                photoURL: currentUser.photoURL,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            setIsEditing(false);
            // Force reload to reflect changes
            window.location.reload();
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("프로필 업데이트에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">내 프로필</h2>

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
                                    <div className="flex items-center gap-2 w-full max-w-sm">
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="닉네임을 입력하세요"
                                        />
                                        <button
                                            onClick={handleUpdateProfile}
                                            disabled={loading}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            <Save size={20} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setNewName(currentUser?.displayName || "");
                                            }}
                                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-2xl font-bold text-gray-900">{currentUser?.displayName || "사용자 이름"}</h3>
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="text-gray-400 hover:text-blue-600 transition-colors"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-gray-500 mt-1">가입일: {new Date(currentUser?.metadata?.creationTime).toLocaleDateString()}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <Mail className="text-blue-500" size={20} />
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">이메일</p>
                                    <p className="font-medium">{currentUser?.email}</p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <User className="text-purple-500" size={20} />
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">사용자 ID</p>
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
                                <span className="font-semibold">로그아웃</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
