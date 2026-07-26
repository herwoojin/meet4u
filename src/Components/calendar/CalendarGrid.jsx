import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isValid } from 'date-fns';
import { ko, enUS, zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader, Users, Calendar as CalendarIcon, ListChecks, Clock } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { DEFAULT_PROJECT_ID } from '../../lib/projects';
import MeetingDetailModal from '../meeting/MeetingDetailModal';
import { useNavigate } from 'react-router-dom';

const DATE_FNS_LOCALES = { ko, en: enUS, zh: zhCN };

// 모아보기 리스트는 날짜 헤더가 위에 있으므로, 제목 앞에 붙은
// 한국식 날짜 접두어("6월 28일(일)", "6월28일", "2026년 6월 28일(토)"
// 등)와 그 뒤에 따라오는 구분 기호("·", "/", "-", "—" 등)를 잘라
// 핵심 정보만 노출한다.
const stripDatePrefix = (title) => {
    if (!title) return '';
    return title
        .replace(/^\s*(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일\s*(?:\([^)]+\))?\s*[·/\-—,]*\s*/u, '')
        .trim();
};

const CalendarGrid = () => {
    const { t, i18n } = useTranslation();
    const dateLocale = DATE_FNS_LOCALES[i18n.language?.split('-')[0]] || ko;
    const { currentUser, isAdmin } = useAuth();
    const { projects, currentProjectId, currentProject } = useProjects();
    // 내가 멤버인 프로젝트만 통과시키는 보안 게이트 — currentProjectId 가
    // stale 이거나 프로젝트 초대 전 상태여도 다른 팀 일정이 노출되지 않는다.
    const myProjectIds = useMemo(
        () => new Set(projects.map(p => p.id)),
        [projects]
    );
    const navigate = useNavigate();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    // 'grid' (default 월 캘린더) | 'list' (모아보기 — 약속있는 날짜만 모아서)
    const [viewMode, setViewMode] = useState(() => {
        try { return localStorage.getItem('meet4u_calendar_view') || 'grid'; }
        catch { return 'grid'; }
    });
    const toggleViewMode = () => {
        setViewMode(prev => {
            const next = prev === 'grid' ? 'list' : 'grid';
            try { localStorage.setItem('meet4u_calendar_view', next); } catch { /* ignore */ }
            return next;
        });
    };

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const onDateClick = (day) => setSelectedDate(day);

    const handleMeetingClick = (e, meeting) => {
        e.stopPropagation(); // Prevent triggering date click
        setSelectedMeeting(meeting);
    };

    const handleEditMeeting = (meeting) => {
        setSelectedMeeting(null);
        navigate('/schedule', { state: { meetingToEdit: meeting } });
    };

    useEffect(() => {
        if (!currentUser) {
            setLoading(false);
            return;
        }

        const q = query(collection(db, "meetings"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            try {
                const meetingsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setMeetings(meetingsData);
                setLoading(false);
            } catch (err) {
                console.error("CalendarGrid: Data processing error", err);
                setError(t('calendar.dataError'));
                setLoading(false);
            }
        }, (error) => {
            console.error("CalendarGrid: Firestore error", error);
            setError(t('calendar.loadError'));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, t]);

    // Scope meetings to the active project. Legacy meetings without a
    // projectId are treated as belonging to the default project.
    // 1차 게이트: 내가 멤버인 프로젝트만. 2차 필터: 현재 선택 프로젝트만.
    const scopedMeetings = useMemo(() => {
        if (!currentProjectId) return [];
        return meetings.filter(m => {
            const pid = m.projectId || DEFAULT_PROJECT_ID;
            return myProjectIds.has(pid) && pid === currentProjectId;
        });
    }, [meetings, currentProjectId, myProjectIds]);

    const getMeetingsForDate = (date) => {
        return scopedMeetings
            .filter(meeting => !meeting.hidden || isAdmin)
            .filter(meeting => meeting.date === format(date, 'yyyy-MM-dd'));
    };

    const renderHeader = () => {
        return (
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                        {format(currentMonth, t('dashboard.weekHeaderFormat'), { locale: dateLocale })}
                    </h2>
                    {currentProject && (
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <span>{currentProject.icon || '📁'}</span>
                            <span className="font-semibold text-gray-700">{currentProject.name}</span>
                            <span className="text-gray-400">· {(currentProject.memberEmails || []).length}명</span>
                        </div>
                    )}
                </div>
                <div className="flex space-x-2">
                    <button onClick={prevMonth} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                        <ChevronLeft size={20} />
                    </button>
                    <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700">
                        {t('dashboard.today')}
                    </button>
                    <button onClick={nextMonth} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                        <ChevronRight size={20} />
                    </button>
                    <button
                        onClick={toggleViewMode}
                        className={`ml-2 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'list'
                            ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                            }`}
                        title={viewMode === 'list' ? '월 캘린더로 돌아가기' : '약속있는 날짜만 모아보기'}
                    >
                        {viewMode === 'list' ? <CalendarIcon size={14} /> : <ListChecks size={14} />}
                        {viewMode === 'list' ? '캘린더' : '모아보기'}
                    </button>
                    <button
                        onClick={() => navigate('/schedule')}
                        className="ml-4 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                        {t('calendar.createMeetingBtn')}
                    </button>
                </div>
            </div>
        );
    };

    const renderDays = () => {
        const days = [];
        const dateFormat = "eeee";
        const startDate = startOfWeek(currentMonth);

        for (let i = 0; i < 7; i++) {
            const dayName = format(eachDayOfInterval({ start: startDate, end: endOfWeek(currentMonth) })[i], dateFormat, { locale: dateLocale });
            let textColor = "text-gray-500";
            if (i === 0) textColor = "text-red-500";
            if (i === 6) textColor = "text-blue-500";

            days.push(
                <div className={`text-center font-medium py-2 text-sm ${textColor}`} key={i}>
                    {dayName}
                </div>
            );
        }
        return <div className="grid grid-cols-7 mb-2 border-b border-gray-100">{days}</div>;
    };

    const renderCells = () => {
        try {
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(monthStart);
            const startDate = startOfWeek(monthStart);
            const endDate = endOfWeek(monthEnd);

            const allDays = eachDayOfInterval({ start: startDate, end: endDate });

            return (
                <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                    {allDays.map((date, i) => {
                        const isSelected = isSameDay(date, selectedDate);
                        const isCurrentMonth = isSameMonth(date, monthStart);
                        const isToday = isSameDay(date, new Date());
                        const dailyMeetings = getMeetingsForDate(date);

                        const dayOfWeek = date.getDay();
                        let dateColor = "text-gray-900";
                        if (!isCurrentMonth) dateColor = "text-gray-300";
                        else if (dayOfWeek === 0) dateColor = "text-red-500";
                        else if (dayOfWeek === 6) dateColor = "text-blue-500";

                        return (
                            <div
                                key={i}
                                className={`
                                    min-h-[6rem] md:min-h-[8rem] p-1 md:p-2 cursor-pointer transition-colors border-r border-b border-gray-100 bg-white hover:bg-gray-50
                                    ${!isCurrentMonth ? "bg-gray-50" : ""}
                                    ${isSelected ? "bg-blue-50" : ""}
                                `}
                                onClick={() => onDateClick(date)}
                            >
                                <span className={`
                                    text-xs md:text-sm font-medium w-5 h-5 md:w-7 md:h-7 flex items-center justify-center rounded-full mb-1
                                    ${isToday ? "bg-gray-900 text-white" : dateColor}
                                `}>
                                    {format(date, 'd')}
                                </span>

                                <div className="space-y-1 mt-1">
                                    {dailyMeetings.map((meeting) => {
                                        const isCompleted = meeting.status === 'completed';
                                        return (
                                            <div
                                                key={meeting.id}
                                                className={`
                                                    text-[10px] md:text-xs px-1.5 py-0.5 md:px-2 md:py-1 rounded border truncate transition-colors flex items-center justify-between group
                                                    ${isCompleted
                                                        ? 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                                                        : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'
                                                    }
                                                `}
                                                onClick={(e) => handleMeetingClick(e, meeting)}
                                            >
                                                <span className={`truncate flex-1 font-medium ${isCompleted ? 'line-through opacity-70' : ''}`}>
                                                    {meeting.startTime} {meeting.title}
                                                </span>
                                                {meeting.attendeesList?.length > 0 && (
                                                    <span className={`text-[9px] md:text-[10px] flex items-center gap-0.5 ${isCompleted ? 'text-red-400' : 'text-gray-400'}`}>
                                                        <Users size={8} /> {meeting.attendeesList.length}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        } catch (err) {
            console.error("CalendarGrid: Render error", err);
            return <div className="p-4 text-red-500 text-center">{t('calendar.renderError', { msg: err.message })}</div>;
        }
    };

    // 모아보기: 현재 표시 중인 달의 약속있는 날짜만 골라 날짜별로 그룹화.
    const monthMeetingsByDate = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        const visible = scopedMeetings.filter(m => !m.hidden || isAdmin);
        const groups = new Map();
        for (const m of visible) {
            if (!m.date) continue;
            const d = parseISO(m.date);
            if (!isValid(d)) continue;
            if (d < start || d > end) continue;
            const key = m.date;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(m);
        }
        // 날짜 오름차순 + 같은 날 안에서는 시작시각 오름차순
        const sorted = Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateStr, items]) => ({
                dateStr,
                date: parseISO(dateStr),
                items: items.slice().sort((x, y) => (x.startTime || '').localeCompare(y.startTime || '')),
            }));
        return sorted;
    }, [scopedMeetings, currentMonth, isAdmin]);

    const renderListView = () => {
        const totalMeetings = monthMeetingsByDate.reduce((s, g) => s + g.items.length, 0);
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1 text-xs text-gray-500">
                    <span>
                        {format(currentMonth, t('dashboard.weekHeaderFormat'), { locale: dateLocale })} ·
                        <span className="font-semibold text-amber-700 ml-1">
                            약속있는 날 {monthMeetingsByDate.length}일 / 총 {totalMeetings}건
                        </span>
                    </span>
                </div>
                {monthMeetingsByDate.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                        이번 달에 등록된 약속이 없습니다.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {monthMeetingsByDate.map(({ dateStr, date, items }) => {
                            const dow = date.getDay();
                            const dowColor = dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700';
                            const isToday = isSameDay(date, new Date());
                            return (
                                <li key={dateStr} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                                    <div className={`flex items-baseline justify-between px-4 py-2 border-b border-gray-100 ${isToday ? 'bg-amber-50' : 'bg-gray-50'}`}>
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-base font-bold ${dowColor}`}>
                                                {format(date, 'M월 d일', { locale: dateLocale })}
                                            </span>
                                            <span className={`text-xs font-medium ${dowColor}`}>
                                                ({format(date, 'EEEE', { locale: dateLocale })})
                                            </span>
                                            {isToday && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-900 text-white rounded-full">오늘</span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-gray-500">{items.length}건</span>
                                    </div>
                                    <ul className="divide-y divide-gray-100">
                                        {items.map(meeting => {
                                            const isCompleted = meeting.status === 'completed';
                                            const attendCount = Object.values(meeting.responses || {}).filter(v => v === 'attend').length;
                                            return (
                                                <li
                                                    key={meeting.id}
                                                    onClick={() => setSelectedMeeting(meeting)}
                                                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-blue-50/60 ${isCompleted ? 'opacity-70' : ''}`}
                                                >
                                                    <div className="flex items-center gap-1.5 text-xs font-mono text-gray-600 shrink-0 w-[88px]">
                                                        <Clock size={12} className="text-blue-500" />
                                                        <span>{meeting.startTime || '--:--'}</span>
                                                        {meeting.endTime && (
                                                            <span className="text-gray-300">~{meeting.endTime}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-sm font-semibold truncate ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                                            {stripDatePrefix(meeting.title) || '(제목 없음)'}
                                                        </div>
                                                        {meeting.description && (
                                                            <div className="text-[11px] text-gray-500 truncate mt-0.5">{meeting.description}</div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {meeting.attendeesList?.length > 0 && (
                                                            <span className="text-[10px] flex items-center gap-0.5 text-gray-500">
                                                                <Users size={10} /> {attendCount}/{meeting.attendeesList.length}
                                                            </span>
                                                        )}
                                                        {isCompleted && (
                                                            <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200 font-medium">완료</span>
                                                        )}
                                                        {meeting.hidden && (
                                                            <span className="text-[9px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full border border-yellow-200 font-medium">숨김</span>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    };

    if (error) {
        return (
            <div className="flex flex-col min-h-full bg-white p-6 rounded-xl shadow-sm border border-gray-200 justify-center items-center">
                <div className="text-red-500 mb-4 font-bold">{t('calendar.errorTitle')}</div>
                <div className="text-gray-600 mb-4 text-sm">{error}</div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                    {t('calendar.refresh')}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-full bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            {renderHeader()}
            {viewMode === 'grid' && renderDays()}
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[300px]">
                    <Loader className="animate-spin text-blue-600" size={40} />
                </div>
            ) : viewMode === 'grid' ? (
                renderCells()
            ) : (
                renderListView()
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

export default CalendarGrid;
