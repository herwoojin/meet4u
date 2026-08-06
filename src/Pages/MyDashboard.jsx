import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Trophy, Calendar, TrendingUp, Users, Target, DollarSign, CreditCard, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Helper: convert sanitized email key back to real email (matches AdminPage logic)
const unsanitizeEmail = (key) => {
    if (!key) return key;
    const atIndex = key.indexOf('@');
    if (atIndex === -1) return key;
    const localPart = key.substring(0, atIndex);
    const domainPart = key.substring(atIndex + 1).replace(/_/g, '.');
    return localPart + '@' + domainPart;
};

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
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthAttend: 0,
        yearAttend: 0,
        totalAttend: 0,
        // 게스트 참석 통계 — 남의 게스트 모집에 참여한 횟수(내가 호스트인 것 제외).
        guestMonth: 0,
        guestYear: 0,
        guestTotal: 0,
        totalGames: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winPartners: {},
        lossOpponents: {},
        // 프로젝트별 통계 (id → { name, icon, color, attend, games, wins, draws, losses })
        projectStats: {},
    });
    const [userCreatedAt, setUserCreatedAt] = useState(null);
    const [allMeetings, setAllMeetings] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [costDate, setCostDate] = useState(new Date());

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
        const fetchedMeetings = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllMeetings(fetchedMeetings);

        // Fetch all users so cost calculation can mirror AdminPage (settlement across all members)
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error fetching users:', e);
        }

        let monthAttend = 0;
        let yearAttend = 0;
        let totalAttend = 0;
        let totalGames = 0;
        let wins = 0;
        let draws = 0;
        let losses = 0;
        const winPartners = {};
        const lossOpponents = {};

        // 프로젝트 마스터 fetch — 이름/아이콘/색 매핑용
        const projectMap = {};
        try {
            const projSnap = await getDocs(collection(db, 'projects'));
            projSnap.docs.forEach(d => {
                const p = d.data();
                if (!p.deleted) projectMap[d.id] = p;
            });
        } catch (e) {
            console.warn('[MyDashboard] projects fetch failed:', e?.code || e);
        }
        // 프로젝트별 통계 컨테이너 — projectId → 통계
        const projectStats = {};
        const bumpProject = (pid, patch) => {
            if (!pid) return;
            if (!projectStats[pid]) {
                const p = projectMap[pid] || {};
                projectStats[pid] = {
                    id: pid,
                    name: p.name || pid,
                    icon: p.icon || '📁',
                    color: p.color || '#3b82f6',
                    attend: 0, games: 0, wins: 0, draws: 0, losses: 0,
                };
            }
            Object.entries(patch).forEach(([k, v]) => {
                projectStats[pid][k] += v;
            });
        };

        // Helper: get display name from email key
        const getNameFromEmail = (emailKey) => {
            if (!emailKey) return emailKey;
            return emailKey.split('@')[0];
        };

        fetchedMeetings.forEach(meeting => {
            const responses = meeting.responses || {};

            // Check if user attended this meeting
            const userResponse = responses[sanitizedEmail] || responses[email];
            const isAttend = userResponse === 'attend';

            if (isAttend) {
                totalAttend++;
                bumpProject(meeting.projectId, { attend: 1 });

                const meetingDate = meeting.date;
                if (meetingDate >= monthStart) monthAttend++;
                if (meetingDate >= yearStart) yearAttend++;
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
                bumpProject(meeting.projectId, { games: 1 });

                if (inTeam1) {
                    const partner = team1.find(n => n !== myName) || '';
                    if (s1 > s2) {
                        wins++;
                        winPartners[partner] = (winPartners[partner] || 0) + 1;
                        bumpProject(meeting.projectId, { wins: 1 });
                    } else if (s1 === s2) {
                        draws++;
                        bumpProject(meeting.projectId, { draws: 1 });
                    } else {
                        losses++;
                        team2.forEach(opp => {
                            lossOpponents[opp] = (lossOpponents[opp] || 0) + 1;
                        });
                        bumpProject(meeting.projectId, { losses: 1 });
                    }
                } else if (inTeam2) {
                    const partner = team2.find(n => n !== myName) || '';
                    if (s2 > s1) {
                        wins++;
                        winPartners[partner] = (winPartners[partner] || 0) + 1;
                        bumpProject(meeting.projectId, { wins: 1 });
                    } else if (s2 === s1) {
                        draws++;
                        bumpProject(meeting.projectId, { draws: 1 });
                    } else {
                        losses++;
                        team1.forEach(opp => {
                            lossOpponents[opp] = (lossOpponents[opp] || 0) + 1;
                        });
                        bumpProject(meeting.projectId, { losses: 1 });
                    }
                }
            });
        });

        // 게스트 참석 카운팅 — guestMeetups 컬렉션에서 내가 게스트(host=false)
        // 로 로스터에 포함된 문서 수. 월/년/전체 3구간.
        let guestMonth = 0, guestYear = 0, guestTotal = 0;
        try {
            const guestSnap = await getDocs(collection(db, 'guestMeetups'));
            guestSnap.docs.forEach(d => {
                const g = d.data();
                const my = (g.roster || []).find(r => r?.uid === currentUser.uid);
                if (!my || my.host) return; // 로스터에 없거나 내가 호스트면 제외
                guestTotal++;
                if (!g.date) return;
                // YYYY-MM-DD 문자열 비교로 월/년 판정 (시간 무관)
                if (g.date.slice(0, 7) === now.toISOString().slice(0, 7)) guestMonth++;
                if (g.date.slice(0, 4) === String(now.getFullYear())) guestYear++;
            });
        } catch (e) {
            console.warn('[MyDashboard] guest meetups fetch failed:', e?.code || e);
        }

        setStats({
            monthAttend, yearAttend, totalAttend,
            guestMonth, guestYear, guestTotal,
            totalGames, wins, draws, losses, winPartners, lossOpponents,
            projectStats,
        });
        setLoading(false);
    };

    // Cost stats - mirrors AdminPage's monthlyData calculation so the total matches
    const costStats = useMemo(() => {
        if (!currentUser?.email || allMeetings.length === 0) {
            return { costToPay: 0, costBooked: 0, details: [], adjustment: 0 };
        }
        const myEmailLower = currentUser.email.toLowerCase();
        const sanitizedEmail = currentUser.email.replace(/\./g, '_');
        const selectedMonth = `${costDate.getFullYear()}-${String(costDate.getMonth() + 1).padStart(2, '0')}`;

        // Initialize userCosts from all registered users (matches AdminPage)
        const userCosts = {};
        allUsers.forEach(u => {
            if (u.email) {
                userCosts[u.email.toLowerCase()] = {
                    name: u.displayName || u.email.split('@')[0],
                    email: u.email,
                    totalToPay: 0,
                    bookedTotal: 0,
                };
            }
        });

        const myDetails = [];

        allMeetings.forEach(meeting => {
            const meetingDate = meeting.date || '';
            if (!meetingDate.startsWith(selectedMonth)) return;

            const entries = meeting.costEntries || [];
            const totalCost = entries.length > 0
                ? entries.reduce((sum, e) => sum + (Number(e.cost) || 0), 0)
                : (Number(meeting.rentalCost) || 0);
            if (totalCost <= 0) return;

            const responses = meeting.responses || {};
            const attendeeKeys = Object.entries(responses)
                .filter(([, status]) => status === 'attend')
                .map(([key]) => key);
            const attendCount = attendeeKeys.length;
            const perPerson = attendCount > 0 ? Math.ceil(totalCost / attendCount) : 0;

            const iAttend = attendeeKeys.includes(sanitizedEmail) || attendeeKeys.includes(currentUser.email);
            if (iAttend && perPerson > 0) {
                myDetails.push({
                    title: meeting.title,
                    date: meetingDate,
                    totalCost,
                    attendCount,
                    myShare: perPerson,
                });
            }

            // Distribute per-person cost to every attendee
            attendeeKeys.forEach(key => {
                const keyEmail = unsanitizeEmail(key).toLowerCase();
                if (!userCosts[keyEmail]) {
                    userCosts[keyEmail] = {
                        name: keyEmail.split('@')[0],
                        email: keyEmail,
                        totalToPay: 0,
                        bookedTotal: 0,
                    };
                }
                userCosts[keyEmail].totalToPay += perPerson;
            });

            // Track booked amount
            if (entries.length > 0) {
                entries.forEach(entry => {
                    if (entry.bookedBy) {
                        const booker = Object.values(userCosts).find(u => u.name === entry.bookedBy);
                        if (booker) booker.bookedTotal += (Number(entry.cost) || 0);
                    }
                });
            } else if (meeting.bookedBy) {
                const booker = Object.values(userCosts).find(u => u.name === meeting.bookedBy);
                if (booker) booker.bookedTotal += totalCost;
            }
        });

        const userCostList = Object.values(userCosts)
            .filter(u => u.totalToPay > 0 || u.bookedTotal > 0);

        let sumBooked = userCostList.reduce((sum, u) => sum + u.bookedTotal, 0);
        let sumTotalToPay = userCostList.reduce((sum, u) => sum + u.totalToPay, 0);

        const diff = sumBooked - sumTotalToPay;
        const payingMembers = userCostList.filter(u => u.totalToPay > 0);
        let myAdjustment = 0;

        if (diff !== 0 && payingMembers.length > 0) {
            const isPositive = diff > 0;
            const absDiff = Math.abs(diff);
            const diffPerPerson = Math.floor(absDiff / payingMembers.length);
            let remainder = absDiff % payingMembers.length;

            payingMembers.forEach((u) => {
                const share = diffPerPerson + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
                const signed = isPositive ? share : -share;
                u.totalToPay += signed;
                if (u.email.toLowerCase() === myEmailLower) {
                    myAdjustment = signed;
                }
            });
        }

        const me = userCostList.find(u => u.email.toLowerCase() === myEmailLower);
        const costToPay = me?.totalToPay || 0;
        const costBooked = me?.bookedTotal || 0;

        return { costToPay, costBooked, details: myDetails, adjustment: myAdjustment };
    }, [allMeetings, allUsers, costDate, currentUser]);

    // Chart data
    const wdlData = [
        { name: t('myDashboard.wins'), value: stats.wins, color: '#3b82f6' },
        { name: t('myDashboard.draws'), value: stats.draws, color: '#9ca3af' },
        { name: t('myDashboard.losses'), value: stats.losses, color: '#ef4444' },
    ].filter(d => d.value > 0);

    const winPartnerData = Object.entries(stats.winPartners)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name: name || '-', count }));

    const lossOpponentData = Object.entries(stats.lossOpponents)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name: name || '-', count }));

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
                    {t('myDashboard.title')}
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                    {t('myDashboard.activityStats', { name: currentUser?.displayName || currentUser?.email?.split('@')[0] })}
                </p>
            </div>

            {/* Attendance Stats */}
            <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Calendar size={16} className="text-blue-500" />
                    {t('myDashboard.attendanceStatus')}
                </h2>
                <div className="grid grid-cols-3 gap-3">
                    <StatCard icon={Calendar} label={t('myDashboard.monthAttend')} value={stats.monthAttend} color="bg-blue-500" sub={`${new Date().getMonth() + 1}${t('common.month')}`} />
                    <StatCard icon={TrendingUp} label={t('myDashboard.yearAttend')} value={stats.yearAttend} color="bg-green-500" sub={`${new Date().getFullYear()}${t('common.year')}`} />
                    <StatCard icon={Target} label={t('myDashboard.totalAttend')} value={stats.totalAttend} color="bg-purple-500" sub={userCreatedAt ? `${formatDate(userCreatedAt)}~` : ''} />
                </div>
            </div>

            {/* 게스트 참석 현황 — 남이 만든 게스트 모집에 게스트로 참여한 횟수 */}
            <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <UserPlus size={16} className="text-indigo-500" />
                    게스트 참석 현황
                </h2>
                <div className="grid grid-cols-3 gap-3">
                    <StatCard
                        icon={UserPlus}
                        label="이달 게스트 참석"
                        value={stats.guestMonth}
                        color="bg-indigo-500"
                        sub={`${new Date().getMonth() + 1}${t('common.month')}`}
                    />
                    <StatCard
                        icon={TrendingUp}
                        label="올해 게스트 참석"
                        value={stats.guestYear}
                        color="bg-teal-500"
                        sub={`${new Date().getFullYear()}${t('common.year')}`}
                    />
                    <StatCard
                        icon={Target}
                        label="전체 게스트 참석"
                        value={stats.guestTotal}
                        color="bg-pink-500"
                        sub="누적"
                    />
                </div>
            </div>

            {/* Monthly Cost Stats */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                        <DollarSign size={16} className="text-green-500" />
                        {t('myDashboard.costStatus')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCostDate(new Date(costDate.getFullYear(), costDate.getMonth() - 1, 1))}
                            className="p-1 hover:bg-gray-100 rounded-full transition text-gray-500"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-bold text-gray-700 w-24 text-center">
                            {costDate.getFullYear()}{t('common.year')} {costDate.getMonth() + 1}{t('common.month')}
                        </span>
                        <button
                            onClick={() => setCostDate(new Date(costDate.getFullYear(), costDate.getMonth() + 1, 1))}
                            className="p-1 hover:bg-gray-100 rounded-full transition text-gray-500"
                        >
                            <ChevronRight size={16} />
                        </button>
                        {(costDate.getFullYear() !== new Date().getFullYear() || costDate.getMonth() !== new Date().getMonth()) && (
                            <button
                                onClick={() => setCostDate(new Date())}
                                className="text-xs text-blue-600 font-medium hover:text-blue-700 ml-1"
                            >
                                {t('common.thisMonth')}
                            </button>
                        )}
                    </div>
                </div>
                {costStats.costToPay > 0 || costStats.costBooked > 0 ? (
                    <>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <StatCard icon={CreditCard} label={t('myDashboard.costToPay')} value={`${costStats.costToPay.toLocaleString()}${t('common.won')}`} color="bg-green-500" sub={t('myDashboard.attendBasis')} />
                            <StatCard icon={DollarSign} label={t('myDashboard.costBooked')} value={`${costStats.costBooked.toLocaleString()}${t('common.won')}`} color="bg-orange-500" sub={t('myDashboard.bookerBasis')} />
                        </div>
                        {(costStats.details.length > 0 || costStats.adjustment !== 0) && (
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="divide-y divide-gray-50">
                                    {costStats.details.map((d, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-800">{d.title}</p>
                                                <p className="text-xs text-gray-400">{d.date} · {d.totalCost.toLocaleString()}{t('common.won')} ÷ {d.attendCount}{t('common.people')}</p>
                                            </div>
                                            <span className="text-sm font-bold text-green-700">{d.myShare.toLocaleString()}{t('common.won')}</span>
                                        </div>
                                    ))}
                                    {costStats.adjustment !== 0 && (
                                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">{t('myDashboard.settlementAdjustment')}</p>
                                                <p className="text-xs text-gray-400">{t('myDashboard.settlementDesc')}</p>
                                            </div>
                                            <span className={`text-sm font-bold ${costStats.adjustment > 0 ? 'text-green-700' : 'text-red-500'}`}>
                                                {costStats.adjustment > 0 ? '+' : ''}{costStats.adjustment.toLocaleString()}{t('common.won')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm text-center">
                        <p className="text-gray-400 text-sm">{t('myDashboard.noCostThisMonth')}</p>
                    </div>
                )}
            </div>

            {/* 프로젝트별 통계 — 참석 · 경기 · 승/무/패 · 승률 */}
            {Object.keys(stats.projectStats || {}).length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                        <Trophy size={16} className="text-indigo-500" />
                        프로젝트별 통계
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.values(stats.projectStats)
                            .sort((a, b) => (b.attend + b.games) - (a.attend + a.games))
                            .map(ps => {
                                const decided = ps.wins + ps.losses;
                                const rate = decided > 0 ? Math.round((ps.wins / decided) * 100) : 0;
                                return (
                                    <div key={ps.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-lg shrink-0"
                                                style={{ background: `${ps.color}18`, border: `1px solid ${ps.color}55` }}
                                            >{ps.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-gray-900 truncate" title={ps.name}>{ps.name}</div>
                                                <div className="text-[11px] text-gray-500">참석 {ps.attend}회 · 경기 {ps.games}회</div>
                                            </div>
                                            <div
                                                className="text-right shrink-0"
                                                title={`승 ${ps.wins} · 패 ${ps.losses} (무승부 제외 승률)`}
                                            >
                                                <div className="text-xs text-gray-400">승률</div>
                                                <div className="text-lg font-bold" style={{ color: ps.color }}>
                                                    {decided > 0 ? `${rate}%` : '—'}
                                                </div>
                                            </div>
                                        </div>
                                        {ps.games > 0 && (
                                            <>
                                                {/* W/D/L 스택 바 */}
                                                <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-2">
                                                    {ps.wins > 0 && (
                                                        <div className="bg-blue-500" style={{ width: `${(ps.wins / ps.games) * 100}%` }} title={`승 ${ps.wins}`} />
                                                    )}
                                                    {ps.draws > 0 && (
                                                        <div className="bg-gray-400" style={{ width: `${(ps.draws / ps.games) * 100}%` }} title={`무 ${ps.draws}`} />
                                                    )}
                                                    {ps.losses > 0 && (
                                                        <div className="bg-red-500" style={{ width: `${(ps.losses / ps.games) * 100}%` }} title={`패 ${ps.losses}`} />
                                                    )}
                                                </div>
                                                <div className="flex justify-between text-[11px] font-semibold">
                                                    <span className="text-blue-600">승 {ps.wins}</span>
                                                    <span className="text-gray-500">무 {ps.draws}</span>
                                                    <span className="text-red-500">패 {ps.losses}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Game Stats */}
            <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Trophy size={16} className="text-yellow-500" />
                    {t('myDashboard.gameStats')}
                </h2>
                <div className="grid grid-cols-4 gap-3">
                    <StatCard icon={Target} label={t('myDashboard.gamesPlayed')} value={stats.totalGames} color="bg-gray-500" />
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 mb-1">{t('myDashboard.wins')}</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.wins}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 mb-1">{t('myDashboard.draws')}</div>
                        <div className="text-2xl font-bold text-gray-500">{stats.draws}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 mb-1">{t('myDashboard.losses')}</div>
                        <div className="text-2xl font-bold text-red-500">{stats.losses}</div>
                    </div>
                </div>
            </div>

            {/* Win Rate Donut */}
            {stats.totalGames > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('myDashboard.winRate')}</h3>
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
                                    <span className="text-sm font-bold text-gray-900">{d.value}{t('myDashboard.gamesSuffix')}</span>
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
                        {t('myDashboard.winPartners')}
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">{t('myDashboard.winPartnersDesc')}</p>
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
                                        <span className="text-xs font-bold text-gray-900 shrink-0">{d.count}{t('myDashboard.winsSuffix')}</span>
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
                        {t('myDashboard.lossOpponents')}
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">{t('myDashboard.lossOpponentsDesc')}</p>
                    <div className="space-y-2">
                        {lossOpponentData.map((d, i) => {
                            const pct = Math.round((d.count / (stats.losses * 2)) * 100);
                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-gray-700">{d.name}</span>
                                        <span className="text-xs font-bold text-gray-500">{d.count}{t('myDashboard.timesSuffix')} ({pct}%)</span>
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
                    <p className="text-gray-400 text-sm">{t('myDashboard.noRecords')}</p>
                    <p className="text-gray-300 text-xs mt-1">{t('myDashboard.joinMeetings')}</p>
                </div>
            )}
        </div>
    );
};

export default MyDashboard;
