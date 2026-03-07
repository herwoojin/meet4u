import React, { useState, useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { Calendar, Users as UsersIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ede9fe'];

// Helper: convert sanitized email key (dots→underscores) back to real email
const unsanitizeEmail = (key) => {
    if (!key) return key;
    const atIndex = key.indexOf('@');
    if (atIndex === -1) return key;
    const localPart = key.substring(0, atIndex);
    const domainPart = key.substring(atIndex + 1).replace(/_/g, '.');
    return localPart + '@' + domainPart;
};

const AttendanceStats = ({ meetings, users }) => {
    // Current selected month
    const [currentDate, setCurrentDate] = useState(new Date());

    const selectedYear = currentDate.getFullYear();
    const selectedMonth = currentDate.getMonth(); // 0-based

    // Filter meetings by selected month
    const monthlyMeetings = useMemo(() => {
        return meetings.filter(m => {
            if (!m.date) return false;
            const dateObj = new Date(m.date);
            if (!isValid(dateObj)) return false;
            return dateObj.getFullYear() === selectedYear && dateObj.getMonth() === selectedMonth;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [meetings, selectedYear, selectedMonth]);

    // Calculate stats
    const stats = useMemo(() => {
        const userStats = {}; // email -> { count, dates }

        // Initialize userStats with all system users to show 0 for non-attendees
        users.forEach(u => {
            if (u.email) {
                userStats[u.email] = {
                    name: u.displayName || u.email.split('@')[0],
                    email: u.email,
                    count: 0,
                    dates: []
                };
            }
        });

        // Meeting details
        const meetingDetails = monthlyMeetings.map(m => {
            const attendees = [];

            if (m.responses) {
                Object.entries(m.responses).forEach(([key, status]) => {
                    if (status === 'attend') {
                        const email = unsanitizeEmail(key);
                        const user = users.find(u =>
                            u.email === email ||
                            u.email === key ||
                            u.email?.replace(/\./g, '_') === key
                        );

                        const name = user ? (user.displayName || email.split('@')[0]) : email.split('@')[0];
                        attendees.push(name);

                        // Increment stat
                        // Ensure we track by normalized email if possible
                        const targetUser = user || { email, displayName: name };
                        if (!userStats[targetUser.email]) {
                            userStats[targetUser.email] = { name, email: targetUser.email, count: 0, dates: [] };
                        }
                        userStats[targetUser.email].count += 1;
                        userStats[targetUser.email].dates.push(m.date);
                    }
                });
            }

            let dateFormatted = m.date;
            let dayOfWeek = '';
            try {
                const d = new Date(m.date);
                if (isValid(d)) {
                    dateFormatted = format(d, 'MM/dd');
                    dayOfWeek = format(d, 'EEEE', { locale: ko });
                }
            } catch (e) {
                console.warn("Invalid date format:", m.date);
            }

            return {
                id: m.id,
                title: m.title,
                date: dateFormatted,
                fullDate: m.date,
                dayOfWeek,
                attendees,
                attendeesCount: attendees.length
            };
        });

        // Convert userStats to array and sort by count descending
        const chartData = Object.values(userStats)
            .filter(u => u.count > 0) // Only show users who attended at least once
            .sort((a, b) => b.count - a.count);

        return { meetingDetails, chartData, totalMeetings: monthlyMeetings.length };
    }, [monthlyMeetings, users]);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(selectedYear, selectedMonth - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(selectedYear, selectedMonth + 1, 1));
    };

    const handleCurrentMonth = () => {
        setCurrentDate(new Date());
    };

    return (
        <div className="space-y-6">
            {/* Header / Month Selector */}
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600">
                        <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold text-gray-800 w-32 text-center">
                        {format(currentDate, 'yyyy년 M월')}
                    </h2>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600">
                        <ChevronRight size={20} />
                    </button>
                </div>
                <button
                    onClick={handleCurrentMonth}
                    className="px-4 py-2 text-sm font-medium bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition"
                >
                    이번 달 보기
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">이 달의 일정</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.totalMeetings}회</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                        <UsersIcon size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">누적 참석자</p>
                        <p className="text-2xl font-bold text-gray-900">
                            {stats.chartData.reduce((acc, curr) => acc + curr.count, 0)}명
                        </p>
                    </div>
                </div>
            </div>

            {/* Meeting Details Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Calendar size={18} className="text-purple-600" />
                        일정별 참석 현황
                    </h3>
                </div>
                {stats.meetingDetails.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">해당 월에 일정이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                                <tr>
                                    <th className="px-5 py-3 w-24">날짜</th>
                                    <th className="px-5 py-3 w-20">요일</th>
                                    <th className="px-5 py-3 min-w-[150px]">일정명</th>
                                    <th className="px-5 py-3">참석자 ({stats.totalMeetings > 0 ? '명' : ''})</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {stats.meetingDetails.map((m) => (
                                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3 font-medium text-gray-900">{m.date}</td>
                                        <td className="px-5 py-3 text-gray-600">{m.dayOfWeek}</td>
                                        <td className="px-5 py-3 text-gray-800">{m.title}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-wrap gap-1.5 align-middle items-center">
                                                <span className="font-bold text-purple-600 mr-2">[{m.attendeesCount}명]</span>
                                                {m.attendees.map((attendee, idx) => (
                                                    <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
                                                        {attendee}
                                                    </span>
                                                ))}
                                                {m.attendeesCount === 0 && <span className="text-gray-400 text-xs italic">참석자 없음</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Charts & User Stats Table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Graph */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <UsersIcon size={18} className="text-blue-600" />
                            회원별 참석 그래프
                        </h3>
                    </div>
                    <div className="p-5 flex-1 min-h-[300px]">
                        {stats.chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-gray-500 text-sm">참석 데이터가 없습니다.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                                    <Tooltip
                                        cursor={{ fill: '#F3F4F6' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    />
                                    <Bar dataKey="count" name="참석 횟수" radius={[4, 4, 0, 0]}>
                                        {stats.chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* User Stats Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <UsersIcon size={18} className="text-green-600" />
                            회원별 참석 횟수 상세 ({stats.chartData.length}명)
                        </h3>
                    </div>
                    <div className="overflow-y-auto max-h-[350px]">
                        {stats.chartData.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">참석 데이터가 없습니다.</div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 border-b">
                                    <tr>
                                        <th className="px-5 py-3 w-16 text-center">순위</th>
                                        <th className="px-5 py-3">이름</th>
                                        <th className="px-5 py-3 text-center">참석 횟수</th>
                                        <th className="px-5 py-3 text-right">출석률</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.chartData.map((user, idx) => (
                                        <tr key={user.email} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-5 py-3 text-center text-gray-500 font-medium">
                                                {idx + 1}
                                            </td>
                                            <td className="px-5 py-3 font-medium text-gray-800">
                                                {user.name}
                                                <p className="text-xs text-gray-400 truncate w-32">{user.email}</p>
                                            </td>
                                            <td className="px-5 py-3 text-center font-bold text-purple-600">
                                                {user.count}회
                                            </td>
                                            <td className="px-5 py-3 text-right text-gray-600">
                                                {stats.totalMeetings > 0
                                                    ? Math.round((user.count / stats.totalMeetings) * 100)
                                                    : 0}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AttendanceStats;
