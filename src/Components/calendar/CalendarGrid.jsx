import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader, Users } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import MeetingDetailModal from '../meeting/MeetingDetailModal';
import { useNavigate } from 'react-router-dom';

const CalendarGrid = () => {
    const { currentUser, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMeeting, setSelectedMeeting] = useState(null);

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const onDateClick = (day) => setSelectedDate(day);

    const handleMeetingClick = (e, meeting) => {
        e.stopPropagation(); // Prevent triggering date click
        setSelectedMeeting(meeting);
    };

    const handleEditMeeting = (meeting) => {
        // Navigate to schedule page with state to populate form
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
                setError("데이터 처리 중 오류가 발생했습니다.");
                setLoading(false);
            }
        }, (error) => {
            console.error("CalendarGrid: Firestore error", error);
            setError("데이터를 불러오는 중 오류가 발생했습니다.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Update selectedMeeting when meetings data changes (e.g. after RSVP)


    const getMeetingsForDate = (date) => {
        return meetings
            .filter(meeting => !meeting.hidden || isAdmin)
            .filter(meeting => meeting.date === format(date, 'yyyy-MM-dd'));
    };

    const renderHeader = () => {
        const dateFormat = "yyyy년 M월";
        return (
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                    {format(currentMonth, dateFormat, { locale: ko })}
                </h2>
                <div className="flex space-x-2">
                    <button onClick={prevMonth} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                        <ChevronLeft size={20} />
                    </button>
                    <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700">
                        오늘
                    </button>
                    <button onClick={nextMonth} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                        <ChevronRight size={20} />
                    </button>
                    <button
                        onClick={() => navigate('/schedule')}
                        className="ml-4 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                        + 미팅 생성
                    </button>
                </div>
            </div>
        );
    };

    const renderDays = () => {
        const days = [];
        const dateFormat = "eeee"; // Monday, Tuesday...
        const startDate = startOfWeek(currentMonth);

        for (let i = 0; i < 7; i++) {
            const dayName = format(eachDayOfInterval({ start: startDate, end: endOfWeek(currentMonth) })[i], dateFormat, { locale: ko });
            // Custom styling for Sunday (Red) and Saturday (Blue)
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

                        // Specific date colors
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
            return <div className="p-4 text-red-500 text-center">캘린더 렌더링 오류: {err.message}</div>;
        }
    };

    if (error) {
        return (
            <div className="flex flex-col min-h-full bg-white p-6 rounded-xl shadow-sm border border-gray-200 justify-center items-center">
                <div className="text-red-500 mb-4 font-bold">오류가 발생했습니다</div>
                <div className="text-gray-600 mb-4 text-sm">{error}</div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                    새로고침
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-full bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            {renderHeader()}
            {renderDays()}
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[300px]">
                    <Loader className="animate-spin text-blue-600" size={40} />
                </div>
            ) : (
                renderCells()
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
