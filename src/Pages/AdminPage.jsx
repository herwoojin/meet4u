import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldOff, Users, Eye, EyeOff, Calendar, Lock, LogOut, BarChart2 } from 'lucide-react';
import MeetingDetailModal from '../Components/meeting/MeetingDetailModal';
import AttendanceStats from '../Components/admin/AttendanceStats';
import { useNavigate } from 'react-router-dom';

const AdminPage = () => {
    const { currentUser, isAdmin, adminLogin, adminLogout } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users');
    const [selectedMeeting, setSelectedMeeting] = useState(null);

    // Admin login form state
    const [adminId, setAdminId] = useState('');
    const [adminPw, setAdminPw] = useState('');
    const [loginError, setLoginError] = useState('');

    // Fetch all users
    useEffect(() => {
        if (!isAdmin) return;
        const fetchUsers = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'users'));
                const usersData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(usersData);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
            setLoading(false);
        };
        fetchUsers();
    }, [isAdmin]);

    // Fetch all meetings (including hidden)
    useEffect(() => {
        if (!isAdmin) return;
        const q = query(collection(db, 'meetings'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const meetingsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMeetings(meetingsData);
        });
        return () => unsubscribe();
    }, [isAdmin]);

    const handleAdminLogin = (e) => {
        e.preventDefault();
        const success = adminLogin(adminId, adminPw);
        if (success) {
            setLoginError('');
            setAdminId('');
            setAdminPw('');
        } else {
            setLoginError('관리자 ID 또는 비밀번호가 올바르지 않습니다.');
        }
    };

    const toggleAdmin = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        try {
            await updateDoc(doc(db, 'users', userId), { role: newRole });
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, role: newRole } : u
            ));
        } catch (error) {
            console.error('Error updating role:', error);
            alert('권한 변경 실패');
        }
    };

    const toggleMeetingHidden = async (meetingId, currentHidden) => {
        try {
            await updateDoc(doc(db, 'meetings', meetingId), { hidden: !currentHidden });
        } catch (error) {
            console.error('Error toggling meeting visibility:', error);
            alert('상태 변경 실패');
        }
    };

    const handleEditMeeting = (meeting) => {
        setSelectedMeeting(null);
        navigate('/schedule', { state: { meetingToEdit: meeting } });
    };

    // Not admin → show login form
    if (!isAdmin) {
        return (
            <div className="max-w-md mx-auto mt-20">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock className="text-purple-600" size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">관리자 모드</h2>
                        <p className="text-gray-500 text-sm mt-1">관리자 계정으로 로그인하세요</p>
                    </div>
                    <form onSubmit={handleAdminLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">관리자 ID</label>
                            <input
                                type="text"
                                value={adminId}
                                onChange={(e) => setAdminId(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-900"
                                placeholder="관리자 ID를 입력하세요"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                            <input
                                type="password"
                                value={adminPw}
                                onChange={(e) => setAdminPw(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-900"
                                placeholder="비밀번호를 입력하세요"
                            />
                        </div>
                        {loginError && (
                            <p className="text-red-500 text-sm text-center">{loginError}</p>
                        )}
                        <button
                            type="submit"
                            className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-md"
                        >
                            로그인
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Admin view
    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">관리자</h2>
                    <p className="text-gray-500">회원 관리 및 전체 미팅을 확인할 수 있습니다.</p>
                </div>
                <button
                    onClick={adminLogout}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                >
                    <LogOut size={16} /> 관리자 로그아웃
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'users'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <Users size={16} /> 회원 관리
                </button>
                <button
                    onClick={() => setActiveTab('meetings')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'meetings'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <Calendar size={16} /> 전체 미팅
                    {meetings.filter(m => m.hidden).length > 0 && (
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full">
                            {meetings.filter(m => m.hidden).length} 숨김
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'stats'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <BarChart2 size={16} /> 월별 참석 통계
                </button>
            </div>

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="p-10 text-center text-gray-400">로딩 중...</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {users.map(user => (
                                <div key={user.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <img
                                            src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=random`}
                                            alt={user.displayName}
                                            className="w-10 h-10 rounded-full border border-gray-200"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-gray-900 truncate">{user.displayName || '이름 없음'}</p>
                                                {user.role === 'admin' && (
                                                    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-bold border border-purple-200">
                                                        관리자
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleAdmin(user.id, user.role)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border shadow-sm ${user.role === 'admin'
                                            ? 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                                            : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50'
                                            }`}
                                    >
                                        {user.role === 'admin' ? (
                                            <><ShieldOff size={14} /> 해제</>
                                        ) : (
                                            <><Shield size={14} /> 관리자 지정</>
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Meetings Tab */}
            {activeTab === 'meetings' && (
                <div className="space-y-3">
                    {meetings.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100">
                            <p className="text-gray-500">생성된 미팅이 없습니다.</p>
                        </div>
                    ) : (
                        meetings
                            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                            .map(meeting => (
                                <div
                                    key={meeting.id}
                                    className={`bg-white p-4 rounded-lg border shadow-sm transition-all hover:shadow-md cursor-pointer ${meeting.hidden
                                        ? 'border-yellow-200 bg-yellow-50'
                                        : meeting.status === 'completed'
                                            ? 'border-red-100 opacity-70'
                                            : 'border-gray-200'
                                        }`}
                                    onClick={() => setSelectedMeeting(meeting)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className={`font-bold text-sm truncate ${meeting.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                                    {meeting.title}
                                                </h4>
                                                {meeting.hidden && (
                                                    <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full border border-yellow-200 font-bold shrink-0">
                                                        숨김
                                                    </span>
                                                )}
                                                {meeting.status === 'completed' && (
                                                    <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full border border-red-200 font-bold shrink-0">
                                                        완료
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {meeting.date} • {meeting.startTime} - {meeting.endTime}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMeetingHidden(meeting.id, meeting.hidden);
                                            }}
                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border shadow-sm ml-3 shrink-0 ${meeting.hidden
                                                ? 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                                                : 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50'
                                                }`}
                                        >
                                            {meeting.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                                            {meeting.hidden ? '표시' : '숨기기'}
                                        </button>
                                    </div>
                                </div>
                            ))
                    )}
                </div>
            )}

            {/* Attendance Stats Tab */}
            {activeTab === 'stats' && (
                <AttendanceStats meetings={meetings} users={users} />
            )}

            {selectedMeeting && (
                <MeetingDetailModal
                    meeting={selectedMeeting}
                    onClose={() => setSelectedMeeting(null)}
                    onEdit={handleEditMeeting}
                />
            )}
        </div>
    );
};

export default AdminPage;
