import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, query, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldOff, Users, Eye, EyeOff, Calendar, Lock, LogOut, UserMinus, KeyRound, Edit2, Trash2, Folder } from 'lucide-react';
import MeetingDetailModal from '../Components/meeting/MeetingDetailModal';
// AttendanceStats · CostManagement 는 MyDashboard 로 이동됨
import { useNavigate } from 'react-router-dom';
// date-fns 는 옮겨간 컴포넌트에서만 사용
import { GROUPS, MENU_KEYS, useMenuPermissions, saveMenuPermissions, getUserGroup } from '../lib/menuPermissions';

// Helper: convert sanitized email key back to real email
const unsanitizeEmail = (key) => {
    if (!key) return key;
    const atIndex = key.indexOf('@');
    if (atIndex === -1) return key;
    const localPart = key.substring(0, atIndex);
    const domainPart = key.substring(atIndex + 1).replace(/_/g, '.');
    return localPart + '@' + domainPart;
};
const PermissionsManagement = () => {
    const { t } = useTranslation();
    const { permissions, loaded } = useMenuPermissions();
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (loaded) setDraft(permissions);
    }, [loaded, permissions]);

    const toggleCell = (menuKey, group) => {
        setDraft(prev => ({
            ...prev,
            [menuKey]: {
                ...prev[menuKey],
                [group]: !prev[menuKey]?.[group],
            },
        }));
    };

    const handleSave = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            await saveMenuPermissions(draft);
            alert(t('admin.permissionsSaved'));
        } catch (e) {
            console.error('Save permissions failed:', e);
            const code = e?.code || '';
            if (code === 'permission-denied') {
                alert('권한 저장에 실패했습니다.\n\n원인: Firestore 보안 규칙이 쓰기를 거부했습니다.\n해결 방법:\n1) "회원 관리" 탭에서 본인 계정의 "관리자 지정" 버튼을 눌러 user 문서에 role: admin 부여\n2) 그 다음, 업데이트된 firestore.rules 를 배포 (firebase deploy --only firestore:rules)');
            } else {
                alert(`${t('admin.permissionsSaveFailed')}${code ? `\n(${code})` : ''}`);
            }
        }
        setSaving(false);
    };

    if (!draft) {
        return <div className="p-10 text-center text-gray-400">{t('admin.loading')}</div>;
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-2">
                <KeyRound size={20} className="text-purple-600" />
                <h3 className="text-lg font-bold text-gray-900">{t('admin.permissionsTitle')}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">{t('admin.permissionsHint')}</p>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 text-gray-600 font-medium">메뉴</th>
                            {GROUPS.map(g => (
                                <th key={g} className="py-2 px-3 text-gray-600 font-medium text-center">
                                    {t(`admin.group${g.charAt(0).toUpperCase() + g.slice(1)}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {MENU_KEYS.map(menuKey => (
                            <tr key={menuKey} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-2 px-3 text-gray-900 font-medium">
                                    {t(`nav.${menuKey}`)}
                                </td>
                                {GROUPS.map(g => {
                                    const checked = !!draft[menuKey]?.[g];
                                    const isAdminGroup = g === 'admin';
                                    return (
                                        <td key={g} className="py-2 px-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={isAdminGroup ? true : checked}
                                                disabled={isAdminGroup}
                                                onChange={() => !isAdminGroup && toggleCell(menuKey, g)}
                                                className="w-4 h-4 accent-purple-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
                >
                    {t('admin.permissionsSave')}
                </button>
            </div>
        </div>
    );
};

const AdminPage = () => {
    const { t } = useTranslation();
    const { currentUser, isAdmin, adminLogin, adminLogout } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [meetings, setMeetings] = useState([]);
    // 각 미팅의 projectId → project 정보(name/icon/color) 매핑에 필요.
    const [projects, setProjects] = useState([]);
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

    // Fetch all projects — 각 미팅의 소속 프로젝트 뱃지 표시용
    useEffect(() => {
        if (!isAdmin) return;
        const unsub = onSnapshot(collection(db, 'projects'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setProjects(list.filter(p => !p.deleted));
        }, (err) => console.error('projects fetch failed', err));
        return () => unsub();
    }, [isAdmin]);

    // projectId → project 매핑
    const projectMap = useMemo(() => {
        const m = new Map();
        projects.forEach(p => m.set(p.id, p));
        return m;
    }, [projects]);

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        const success = await adminLogin(adminId, adminPw);
        if (success) {
            setLoginError('');
            setAdminId('');
            setAdminPw('');
        } else {
            setLoginError(t('admin.loginError'));
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
            alert(t('admin.roleChangeFailed'));
        }
    };

    const handleChangeGroup = async (userId, newGroup) => {
        try {
            await updateDoc(doc(db, 'users', userId), { group: newGroup });
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, group: newGroup } : u
            ));
        } catch (error) {
            console.error('Error updating group:', error);
            alert(t('admin.groupChangeFailed'));
        }
    };

    const handleDeleteUser = async (userId, userEmail) => {
        if (!window.confirm(t('admin.confirmDeleteUser', { email: userEmail, defaultValue: `정말 ${userEmail} 회원을 삭제하시겠습니까? 관련된 데이터가 손실될 수 있습니다.` }))) return;
        try {
            await deleteDoc(doc(db, 'users', userId));
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch (error) {
            console.error('Error deleting user:', error);
            alert(t('admin.deleteUserFailed') || '회원 삭제에 실패했습니다.');
        }
    };

    const toggleMeetingHidden = async (meetingId, currentHidden) => {
        try {
            await updateDoc(doc(db, 'meetings', meetingId), { hidden: !currentHidden });
        } catch (error) {
            console.error('Error toggling meeting visibility:', error);
            alert(t('admin.hideFailed'));
        }
    };

    const handleEditMeeting = (meeting) => {
        setSelectedMeeting(null);
        navigate('/schedule', { state: { meetingToEdit: meeting } });
    };

    const handleDeleteMeeting = async (meeting) => {
        const label = `${meeting.title || '(제목 없음)'} · ${meeting.date || ''}`;
        if (!window.confirm(`정말 이 약속을 삭제하시겠습니까?\n\n${label}\n\n삭제 후에는 복구할 수 없습니다.`)) return;
        try {
            await deleteDoc(doc(db, 'meetings', meeting.id));
        } catch (err) {
            console.error('Error deleting meeting:', err);
            alert('삭제에 실패했습니다: ' + (err.message || err));
        }
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
                        <h2 className="text-2xl font-bold text-gray-900">{t('admin.title')}</h2>
                        <p className="text-gray-500 text-sm mt-1">{t('admin.loginSubtitle')}</p>
                    </div>
                    <form onSubmit={handleAdminLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.adminId')}</label>
                            <input
                                type="text"
                                value={adminId}
                                onChange={(e) => setAdminId(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-900"
                                placeholder={t('admin.adminIdPlaceholder')}
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.adminPassword')}</label>
                            <input
                                type="password"
                                value={adminPw}
                                onChange={(e) => setAdminPw(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-900"
                                placeholder={t('admin.adminPwPlaceholder')}
                            />
                        </div>
                        {loginError && (
                            <p className="text-red-500 text-sm text-center">{loginError}</p>
                        )}
                        <button
                            type="submit"
                            className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-md"
                        >
                            {t('admin.loginBtn')}
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
                    <h2 className="text-3xl font-bold text-gray-900">{t('admin.pageTitle')}</h2>
                    <p className="text-gray-500">{t('admin.pageSubtitle')}</p>
                </div>
                <button
                    onClick={adminLogout}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                >
                    <LogOut size={16} /> {t('admin.adminLogout')}
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
                    <Users size={16} /> {t('admin.tabUsers')}
                </button>
                <button
                    onClick={() => setActiveTab('meetings')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'meetings'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <Calendar size={16} /> {t('admin.tabMeetings')}
                    {meetings.filter(m => m.hidden).length > 0 && (
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full">
                            {meetings.filter(m => m.hidden).length} {t('admin.hiddenBadge')}
                        </span>
                    )}
                </button>
                {/* '월별 참석 통계' / '월별 비용 관리' 탭은 My 대시보드로 이동됨 */}
                <button
                    onClick={() => setActiveTab('permissions')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'permissions'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <KeyRound size={16} /> {t('admin.tabPermissions')}
                </button>
            </div>

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="p-10 text-center text-gray-400">{t('admin.loading')}</div>
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
                                                <p className="font-medium text-gray-900 truncate">{user.displayName || t('admin.unnamed')}</p>
                                                {user.role === 'admin' && (
                                                    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-bold border border-purple-200">
                                                        {t('admin.adminBadge')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        <select
                                            value={getUserGroup(user)}
                                            onChange={(e) => handleChangeGroup(user.id, e.target.value)}
                                            className="px-2 py-2 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200"
                                            title={t('admin.memberGroup')}
                                        >
                                            {GROUPS.map(g => (
                                                <option key={g} value={g}>
                                                    {t(`admin.group${g.charAt(0).toUpperCase() + g.slice(1)}`)}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => toggleAdmin(user.id, user.role)}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border shadow-sm ${user.role === 'admin'
                                                ? 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                                                : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50'
                                                }`}
                                        >
                                            {user.role === 'admin' ? (
                                                <><ShieldOff size={14} /> {t('admin.revokeAdmin')}</>
                                            ) : (
                                                <><Shield size={14} /> {t('admin.makeAdmin')}</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id, user.email)}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border shadow-sm bg-white text-red-600 border-red-200 hover:bg-red-50"
                                        >
                                            <UserMinus size={14} /> {t('admin.deleteUser') || '삭제'}
                                        </button>
                                    </div>
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
                            <p className="text-gray-500">{t('admin.noMeetings')}</p>
                        </div>
                    ) : (
                        meetings
                            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                            .map(meeting => {
                                const project = projectMap.get(meeting.projectId);
                                return (
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
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <h4 className={`font-bold text-sm truncate ${meeting.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                                    {meeting.title}
                                                </h4>
                                                {/* 프로젝트 뱃지 */}
                                                {project ? (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-semibold shrink-0"
                                                        style={{
                                                            background: project.color ? `${project.color}18` : '#eef2ff',
                                                            borderColor: project.color ? `${project.color}55` : '#c7d2fe',
                                                            color: project.color || '#4338ca',
                                                        }}
                                                        title={`프로젝트: ${project.name}`}
                                                    >
                                                        <span>{project.icon || '📁'}</span>
                                                        <span className="truncate max-w-[140px]">{project.name}</span>
                                                    </span>
                                                ) : meeting.projectId ? (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-400 font-semibold shrink-0" title={meeting.projectId}>
                                                        <Folder size={10} className="inline mr-0.5" />프로젝트 없음
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-400 font-semibold shrink-0">
                                                        미분류
                                                    </span>
                                                )}
                                                {meeting.hidden && (
                                                    <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full border border-yellow-200 font-bold shrink-0">
                                                        {t('admin.hiddenBadge')}
                                                    </span>
                                                )}
                                                {meeting.status === 'completed' && (
                                                    <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full border border-red-200 font-bold shrink-0">
                                                        {t('admin.completedBadge')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {meeting.date} • {meeting.startTime} - {meeting.endTime}
                                            </p>
                                        </div>

                                        {/* 액션 버튼 그룹 — 숨기기 · 수정 · 삭제 */}
                                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => toggleMeetingHidden(meeting.id, meeting.hidden)}
                                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border shadow-sm ${meeting.hidden
                                                    ? 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                                                    : 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50'
                                                    }`}
                                                title={meeting.hidden ? t('admin.showBtn') : t('admin.hideBtn')}
                                            >
                                                {meeting.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                                                <span className="hidden sm:inline">{meeting.hidden ? t('admin.showBtn') : t('admin.hideBtn')}</span>
                                            </button>
                                            <button
                                                onClick={() => handleEditMeeting(meeting)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 shadow-sm"
                                                title="수정"
                                            >
                                                <Edit2 size={14} />
                                                <span className="hidden sm:inline">수정</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMeeting(meeting)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-red-600 border border-red-200 hover:bg-red-50 shadow-sm"
                                                title="삭제"
                                            >
                                                <Trash2 size={14} />
                                                <span className="hidden sm:inline">삭제</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                );
                            })
                    )}
                </div>
            )}

            {/* Attendance Stats · Cost Management 탭은 My 대시보드로 이동 */}

            {/* Permissions Tab */}
            {activeTab === 'permissions' && (
                <PermissionsManagement />
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
