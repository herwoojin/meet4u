// 월별 비용 관리 — 관리자 페이지에서 옮긴 컴포넌트.
// AdminPage 인라인 정의를 별도 파일로 분리해 MyDashboard 에서도 재사용.
// props.meetings 는 이미 프로젝트 필터가 적용된 배열이 전달된다고 가정.

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isValid } from 'date-fns';
import { Calendar, Users, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';

// Helper: convert sanitized email key (dots→underscores) back to real email
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
        const userCosts = {};

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

            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                    <DollarSign size={24} />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-500">{t('admin.totalMonthlyCost')}</p>
                    <p className="text-2xl font-bold text-gray-900">{monthlyData.totalCost.toLocaleString()}{t('common.won')}</p>
                </div>
            </div>

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
                                {monthlyData.userCostList.map((u) => {
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

export default CostManagement;
