import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, query, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldOff, Users, Eye, EyeOff, Calendar, Lock, LogOut, BarChart2, DollarSign, ChevronLeft, ChevronRight, UserMinus } from 'lucide-react';
import MeetingDetailModal from '../Components/meeting/MeetingDetailModal';
import AttendanceStats from '../Components/admin/AttendanceStats';
import { useNavigate } from 'react-router-dom';
import { format, isValid } from 'date-fns';

// Helper: convert sanitized email key back to real email
const unsanitizeEmail = (key) => {
    if (!key) return key;
    const atIndex = key.indexOf('@');
    if (atIndex === -1) return key;
    const localPart = key.substring(0, atIndex);
    const domainPart = key.substring(atIndex + 1).replace(/_/g, '.');
    return localPart + '@' + domainPart;
};

const CostManagement = ({ meetings, users }) => {
    const { t } = useTranslation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const selectedYear = currentDate.getFullYear();
    const selectedMonth = currentDate.getMonth();

    const monthlyData = useMemo(() => {
        const monthMeetings = meetings.filter(m => {
            if (!m.date) return false;
            const d = new Date(m.date);
            if (!isValid(d)) return false;
            return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        let totalCost = 0;
        const meetingCosts = [];
        const userCosts = {}; // email -> { name, totalToPay, details }

        // Initialize all users
        users.forEach(u => {
            if (u.email) {
                userCosts[u.email.toLowerCase()] = {
                    name: u.displayName || u.email.split('@')[0],
                    email: u.email,
                    totalToPay: 0,
                    bookedTotal: 0,
                    details: [],
                };
            }
        });

        monthMeetings.forEach(m => {
            const entries = m.costEntries || [];
            const cost = entries.length > 0
                ? entries.reduce((sum, e) => sum + (Number(e.cost) || 0), 0)
                : (Number(m.rentalCost) || 0);
            if (cost <= 0) return;

            totalCost += cost;
            const responses = m.responses || {};
            const attendees = Object.entries(responses)
                .filter(([, status]) => status === 'attend')
                .map(([key]) => unsanitizeEmail(key));
            const attendCount = attendees.length;
            const perPerson = attendCount > 0 ? Math.ceil(cost / attendCount) : 0;

            let dateFormatted = m.date;
            try {
                const d = new Date(m.date);
                if (isValid(d)) dateFormatted = format(d, 'MM/dd');
            } catch (e) { /* keep original */ }

            const bookedByNames = entries.length > 0
                ? entries.filter(e => e.bookedBy).map(e => e.bookedBy).join(', ') || '-'
                : (m.bookedBy || '-');

            meetingCosts.push({
                id: m.id,
                title: m.title,
                date: dateFormatted,
                fullDate: m.date,
                cost,
                attendCount,
                perPerson,
                bookedBy: bookedByNames,
                costEntries: entries,
            });

            // Assign per-person costs
            attendees.forEach(email => {
                const key = email.toLowerCase();
                if (!userCosts[key]) {
                    userCosts[key] = {
                        name: email.split('@')[0],
                        email,
                        totalToPay: 0,
                        bookedTotal: 0,
                        details: [],
                    };
                }
                userCosts[key].totalToPay += perPerson;
                userCosts[key].details.push({ title: m.title, date: dateFormatted, amount: perPerson });
            });

            // Track booked cost per entry
            if (entries.length > 0) {
                entries.forEach(entry => {
                    if (entry.bookedBy) {
                        const booker = Object.values(userCosts).find(u => u.name === entry.bookedBy);
                        if (booker) booker.bookedTotal += (Number(entry.cost) || 0);
                    }
                });
            } else if (m.bookedBy) {
                const booker = Object.values(userCosts).find(u => u.name === m.bookedBy);
                if (booker) booker.bookedTotal += cost;
            }
        });

        let userCostList = Object.values(userCosts)
            .filter(u => u.totalToPay > 0 || u.bookedTotal > 0);

        let sumBooked = userCostList.reduce((sum, u) => sum + u.bookedTotal, 0);
        let sumTotalToPay = userCostList.reduce((sum, u) => sum + u.totalToPay, 0);

        const diff = sumBooked - sumTotalToPay;
        const payingMembers = userCostList.filter(u => u.totalToPay > 0);

        if (diff !== 0 && payingMembers.length > 0) {
            const isPositive = diff > 0;
            const absDiff = Math.abs(diff);
            const diffPerPerson = Math.floor(absDiff / payingMembers.length);
            let remainder = absDiff % payingMembers.length;

            payingMembers.forEach((u) => {
                let adjustment = diffPerPerson + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
                u.totalToPay += isPositive ? adjustment : -adjustment;
            });
            
            sumTotalToPay = userCostList.reduce((sum, u) => sum + u.totalToPay, 0);
        }

        userCostList.sort((a, b) => b.totalToPay - a.totalToPay);

        return { totalCost, meetingCosts, userCostList, sumBooked, sumTotalToPay };
    }, [meetings, users, selectedYear, selectedMonth]);

    return (
        <div className="space-y-6">
            {/* Month selector */}
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentDate(new Date(selectedYear, selectedMonth - 1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600">
                        <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold text-gray-800 w-32 text-center">
                        {format(currentDate, t('admin.dateFormat'))}
                    </h2>
                    <button onClick={() => setCurrentDate(new Date(selectedYear, selectedMonth + 1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600">
                        <ChevronRight size={20} />
                    </button>
                </div>
                <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 text-sm font-medium bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition"
                >
                    {t('admin.thisMonthBtn')}
                </button>
            </div>

            {/* Total cost summary */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                    <DollarSign size={24} />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-500">{t('admin.totalMonthlyCost')}</p>
                    <p className="text-2xl font-bold text-gray-900">{monthlyData.totalCost.toLocaleString()}{t('common.won')}</p>
                </div>
            </div>

            {/* Meeting cost table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Calendar size={18} className="text-green-600" />
                        {t('admin.meetingCosts')}
                    </h3>
                </div>
                {monthlyData.meetingCosts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">{t('admin.noCostsMonth')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3">{t('admin.dateCol')}</th>
                                    <th className="px-4 py-3">{t('admin.meetingCol')}</th>
                                    <th className="px-4 py-3 text-right">{t('admin.rentalCostCol')}</th>
                                    <th className="px-4 py-3 text-center">{t('admin.attendCol')}</th>
                                    <th className="px-4 py-3 text-right">{t('admin.perPerson')}</th>
                                    <th className="px-4 py-3">{t('admin.booker')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {monthlyData.meetingCosts.map(m => (
                                    <tr key={m.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{m.date}</td>
                                        <td className="px-4 py-3 text-gray-800">{m.title}</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-900">{m.cost.toLocaleString()}{t('common.won')}</td>
                                        <td className="px-4 py-3 text-center text-purple-600 font-bold">{m.attendCount}{t('admin.attendSuffix')}</td>
                                        <td className="px-4 py-3 text-right font-bold text-green-700">{m.perPerson.toLocaleString()}{t('common.won')}</td>
                                        <td className="px-4 py-3 text-gray-600">{m.bookedBy}</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50 font-bold">
                                    <td className="px-4 py-3" colSpan="2">{t('admin.sumLabel')}</td>
                                    <td className="px-4 py-3 text-right text-gray-900">{monthlyData.totalCost.toLocaleString()}{t('common.won')}</td>
                                    <td colSpan="3"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Per-user cost table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Users size={18} className="text-blue-600" />
                        {t('admin.memberCosts')}
                    </h3>
                </div>
                {monthlyData.userCostList.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">{t('admin.noCostData')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                                <tr>
                                    <th className="px-5 py-3">{t('admin.name')}</th>
                                    <th className="px-5 py-3 text-right">{t('admin.paidAmount')}</th>
                                    <th className="px-5 py-3 text-right">{t('admin.bookedAmount')}</th>
                                    <th className="px-5 py-3 text-right">{t('admin.settlement')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {monthlyData.userCostList.map((u, idx) => {
                                    const settlement = u.bookedTotal - u.totalToPay;
                                    return (
                                        <tr key={u.email} className="hover:bg-gray-50">
                                            <td className="px-5 py-3">
                                                <span className="font-medium text-gray-800">{u.name}</span>
                                            </td>
                                            <td className="px-5 py-3 text-right font-bold text-green-700">{u.totalToPay.toLocaleString()}{t('common.won')}</td>
                                            <td className="px-5 py-3 text-right font-bold text-orange-600">{u.bookedTotal > 0 ? `${u.bookedTotal.toLocaleString()}${t('common.won')}` : '-'}</td>
                                            <td className={`px-5 py-3 text-right font-bold ${settlement > 0 ? 'text-blue-600' : settlement < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                                {settlement > 0 ? `+${settlement.toLocaleString()}${t('common.won')}` : settlement < 0 ? `${settlement.toLocaleString()}${t('common.won')}` : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                                    <td className="px-5 py-3 text-center">{t('admin.sumLabel')}</td>
                                    <td className="px-5 py-3 text-right text-green-700">{monthlyData.sumTotalToPay.toLocaleString()}{t('common.won')}</td>
                                    <td className="px-5 py-3 text-right text-orange-600">{monthlyData.sumBooked.toLocaleString()}{t('common.won')}</td>
                                    <td className="px-5 py-3 text-right text-gray-900">
                                        {(monthlyData.sumBooked - monthlyData.sumTotalToPay) > 0
                                            ? `+${(monthlyData.sumBooked - monthlyData.sumTotalToPay).toLocaleString()}${t('common.won')}`
                                            : `${(monthlyData.sumBooked - monthlyData.sumTotalToPay).toLocaleString()}${t('common.won')}`}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
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
                <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'stats'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <BarChart2 size={16} /> {t('admin.tabStats')}
                </button>
                <button
                    onClick={() => setActiveTab('costs')}
                    className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'costs'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <DollarSign size={16} /> {t('admin.tabCosts')}
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
                                    <div className="flex items-center gap-2">
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
                                            {meeting.hidden ? t('admin.showBtn') : t('admin.hideBtn')}
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

            {/* Cost Management Tab */}
            {activeTab === 'costs' && (
                <CostManagement meetings={meetings} users={users} />
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
