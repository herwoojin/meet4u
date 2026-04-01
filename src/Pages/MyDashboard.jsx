import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Trophy, Calendar, TrendingUp, Users, Target, DollarSign, CreditCard } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const StatCard = ({ icon: Icon, label, value, color, sub }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg ${color}`}>
                <Icon size={16} className="text-white" />
            </div>
            <span className="text-xs font-medium text-gray-500">{label}</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
);

const MyDashboard = () => {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthAttend: 0,
        yearAttend: 0,
        totalAttend: 0,
        totalGames: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winPartners: {},
        lossOpponents: {},
        monthCostToPay: 0,
        monthCostBooked: 0,
        monthCostDetails: [],
    });
    const [userCreatedAt, setUserCreatedAt] = useState(null);

    useEffect(() => {
        if (!currentUser?.email) return;
        fetchStats();
    }, [currentUser]);

    const fetchStats = async () => {
        setLoading(true);
        const email = currentUser.email;
        const sanitizedEmail = email.replace(/\./g, '_');
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

        // Get user createdAt
        let createdAt = null;
        try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
                createdAt = userDoc.data().createdAt;
                setUserCreatedAt(createdAt);
            }
        } catch (e) {
            console.error('Error fetching user profile:', e);
        }

        // Fetch all meetings where this user is an attendee
        const meetingsSnap = await getDocs(collection(db, 'meetings'));
        const allMeetings = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        let monthAttend = 0;
        let yearAttend = 0;
        let totalAttend = 0;
        let totalGames = 0;
        let wins = 0;
        let draws = 0;
        let losses = 0;
        const winPartners = {};
        const lossOpponents = {};
        let monthCostToPay = 0;
        let monthCostBooked = 0;
        const monthCostDetails = [];
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Helper: get display name from email key
        const getNameFromEmail = (emailKey) => {
            if (!emailKey) return emailKey;
            return emailKey.split('@')[0];
        };

        // Build a user map for display names from all meetings' attendees
        const userNames = {};

        allMeetings.forEach(meeting => {
            const responses = meeting.responses || {};

            // Check if user attended this meeting
            const userResponse = responses[sanitizedEmail] || responses[email];
            const isAttend = userResponse === 'attend';

            if (isAttend) {
                totalAttend++;

                const meetingDate = meeting.date;
                if (meetingDate >= monthStart) monthAttend++;
                if (meetingDate >= yearStart) yearAttend++;
            }

            // Calculate cost for this month's meetings
            const meetingDate = meeting.date || '';
            const entries = meeting.costEntries || [];
            const meetingTotalCost = entries.length > 0
                ? entries.reduce((sum, e) => sum + (Number(e.cost) || 0), 0)
                : (Number(meeting.rentalCost) || 0);

            if (meetingDate.startsWith(currentMonth) && meetingTotalCost > 0) {
                const attendCount = Object.values(responses).filter(v => v === 'attend').length;
                const perPerson = attendCount > 0 ? Math.ceil(meetingTotalCost / attendCount) : 0;

                // If I attended, I need to pay 1/N
                if (isAttend && attendCount > 0) {
                    monthCostToPay += perPerson;
                    monthCostDetails.push({
                        title: meeting.title,
                        date: meetingDate,
                        totalCost: meetingTotalCost,
                        attendCount,
                        myShare: perPerson,
                    });
                }

                // If I booked (check costEntries bookedBy or legacy bookedBy)
                const myName = currentUser.displayName || email.split('@')[0];
                if (entries.length > 0) {
                    entries.forEach(e => {
                        if (e.bookedBy === myName) monthCostBooked += (Number(e.cost) || 0);
                    });
                } else if (meeting.bookedBy === myName || meeting.createdBy === currentUser.uid) {
                    monthCostBooked += meetingTotalCost;
                }
            }

            // Analyze scoreboard
            const scoreboard = meeting.scoreboard;
            if (!scoreboard?.games) return;

            // Build name map from attendees for this meeting
            const attendeesList = meeting.attendeesList || [];
            const responseKeys = Object.keys(responses);

            scoreboard.games.forEach(game => {
                if (!game.team1 || !game.team2) return;

                const team1 = game.team1;
                const team2 = game.team2;
                const s1 = Number(game.score1);
                const s2 = Number(game.score2);

                if (game.score1 === '' || game.score2 === '') return;

                // Get current user's display name for matching
                const myName = currentUser.displayName || email.split('@')[0];

                // Check if user is in this game
                const inTeam1 = team1.includes(myName);
                const inTeam2 = team2.includes(myName);

                if (!inTeam1 && !inTeam2) return;

                totalGames++;

                if (inTeam1) {
                    const partner = team1.find(n => n !== myName) || '';
                    if (s1 > s2) {
                        wins++;
                        winPartners[partner] = (winPartners[partner] || 0) + 1;
                    } else if (s1 === s2) {
                        draws++;
                    } else {
                        losses++;
                        team2.forEach(opp => {
                            lossOpponents[opp] = (lossOpponents[opp] || 0) + 1;
                        });
                    }
                } else if (inTeam2) {
                    const partner = team2.find(n => n !== myName) || '';
                    if (s2 > s1) {
                        wins++;
                        winPartners[partner] = (winPartners[partner] || 0) + 1;
                    } else if (s2 === s1) {
                        draws++;
                    } else {
                        losses++;
                        team1.forEach(opp => {
                            lossOpponents[opp] = (lossOpponents[opp] || 0) + 1;
                        });
                    }
                }
            });
        });

        setStats({ monthAttend, yearAttend, totalAttend, totalGames, wins, draws, losses, winPartners, lossOpponents, monthCostToPay, monthCostBooked, monthCostDetails });
        setLoading(false);
    };

    // Chart data
    const wdlData = [
        { name: '승', value: stats.wins, color: '#3b82f6' },
        { name: '무', value: stats.draws, color: '#9ca3af' },
        { name: '패', value: stats.losses, color: '#ef4444' },
    ].filter(d => d.value > 0);

    const winPartnerData = Object.entries(stats.winPartners)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name: name || '없음', count }));

    const lossOpponentData = Object.entries(stats.lossOpponents)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name: name || '없음', count }));

    const winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4">
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BarChart3 className="text-blue-600" size={28} />
                    My 대시보드
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                    {currentUser?.displayName || currentUser?.email?.split('@')[0]}님의 활동 통계
                </p>
            </div>

            {/* Attendance Stats */}
            <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Calendar size={16} className="text-blue-500" />
                    참석 현황
                </h2>
                <div className="grid grid-cols-3 gap-3">
                    <StatCard icon={Calendar} label="이달 참석" value={stats.monthAttend} color="bg-blue-500" sub={`${new Date().getMonth() + 1}월`} />
                    <StatCard icon={TrendingUp} label="올해 참석" value={stats.yearAttend} color="bg-green-500" sub={`${new Date().getFullYear()}년`} />
                    <StatCard icon={Target} label="전체 참석" value={stats.totalAttend} color="bg-purple-500" sub={userCreatedAt ? `${formatDate(userCreatedAt)}~` : ''} />
                </div>
            </div>

            {/* Monthly Cost Stats */}
            {(stats.monthCostToPay > 0 || stats.monthCostBooked > 0) && (
                <div>
                    <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                        <DollarSign size={16} className="text-green-500" />
                        이달 비용 현황 ({new Date().getMonth() + 1}월)
                    </h2>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <StatCard icon={CreditCard} label="내가 낼 금액" value={`${stats.monthCostToPay.toLocaleString()}원`} color="bg-green-500" sub="참석 기준 1/N" />
                        <StatCard icon={DollarSign} label="내가 예약한 비용" value={`${stats.monthCostBooked.toLocaleString()}원`} color="bg-orange-500" sub="예약자 기준" />
                    </div>
                    {stats.monthCostDetails.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="divide-y divide-gray-50">
                                {stats.monthCostDetails.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between px-4 py-3">
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{d.title}</p>
                                            <p className="text-xs text-gray-400">{d.date} · {d.totalCost.toLocaleString()}원 ÷ {d.attendCount}명</p>
                                        </div>
                                        <span className="text-sm font-bold text-green-700">{d.myShare.toLocaleString()}원</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Game Stats */}
            <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Trophy size={16} className="text-yellow-500" />
                    경기 통계
                </h2>
                <div className="grid grid-cols-4 gap-3">
                    <StatCard icon={Target} label="참여 경기" value={stats.totalGames} color="bg-gray-500" />
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 mb-1">승</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.wins}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 mb-1">무</div>
                        <div className="text-2xl font-bold text-gray-500">{stats.draws}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 mb-1">패</div>
                        <div className="text-2xl font-bold text-red-500">{stats.losses}</div>
                    </div>
                </div>
            </div>

            {/* Win Rate Donut */}
            {stats.totalGames > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">승률</h3>
                    <div className="flex items-center justify-center gap-6">
                        <div className="relative w-32 h-32">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={wdlData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={35}
                                        outerRadius={55}
                                        dataKey="value"
                                        strokeWidth={2}
                                        stroke="#fff"
                                    >
                                        {wdlData.map((entry, idx) => (
                                            <Cell key={idx} fill={entry.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xl font-bold text-gray-900">{winRate}%</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {wdlData.map((d, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                                    <span className="text-sm text-gray-600">{d.name}</span>
                                    <span className="text-sm font-bold text-gray-900">{d.value}경기</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Win Partner Chart */}
            {winPartnerData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                        <Users size={16} className="text-blue-500" />
                        승리 시 파트너 비율
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">내가 이긴 경기에서 함께한 파트너</p>
                    <div className="flex items-center gap-4">
                        <div className="w-28 h-28 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={winPartnerData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={50}
                                        dataKey="count"
                                        strokeWidth={2}
                                        stroke="#fff"
                                    >
                                        {winPartnerData.map((_, idx) => (
                                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-1.5 overflow-hidden">
                            {winPartnerData.map((d, i) => {
                                const pct = Math.round((d.count / stats.wins) * 100);
                                return (
                                    <div key={i} className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                        <span className="text-xs text-gray-700 truncate flex-1">{d.name}</span>
                                        <span className="text-xs font-bold text-gray-900 shrink-0">{d.count}승</span>
                                        <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Loss Opponent Chart */}
            {lossOpponentData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                        <Target size={16} className="text-red-500" />
                        패배 시 상대 비율
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">내가 진 경기의 상대편 선수</p>
                    <div className="space-y-2">
                        {lossOpponentData.map((d, i) => {
                            const pct = Math.round((d.count / (stats.losses * 2)) * 100);
                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-gray-700">{d.name}</span>
                                        <span className="text-xs font-bold text-gray-500">{d.count}회 ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="h-2 rounded-full transition-all"
                                            style={{
                                                width: `${Math.max(8, (d.count / lossOpponentData[0].count) * 100)}%`,
                                                backgroundColor: COLORS[(i + 3) % COLORS.length],
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {stats.totalGames === 0 && stats.totalAttend === 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
                    <Trophy size={40} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">아직 참석 및 경기 기록이 없습니다.</p>
                    <p className="text-gray-300 text-xs mt-1">모임에 참석하고 스코어보드에 경기를 기록해보세요!</p>
                </div>
            )}
        </div>
    );
};

export default MyDashboard;
