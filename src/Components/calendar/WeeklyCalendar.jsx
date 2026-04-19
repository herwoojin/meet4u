import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { ko, enUS, zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Users, Clock } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import MeetingDetailModal from '../meeting/MeetingDetailModal';
import { useNavigate } from 'react-router-dom';

const DATE_FNS_LOCALES = { ko, en: enUS, zh: zhCN };

const WeeklyCalendar = () => {
    const { t, i18n } = useTranslation();
    const dateLocale = DATE_FNS_LOCALES[i18n.language?.split('-')[0]] || ko;
    const { currentUser, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday start
    const [meetings, setMeetings] = useState([]);
    const [selectedMeeting, setSelectedMeeting] = useState(null);

    const nextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    const prevWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
    const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

    useEffect(() => {
        if (!currentUser) return;

        const q = query(collection(db, "meetings"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const meetingsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMeetings(meetingsData);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const getMeetingsForDate = (date) => {
        return meetings
            .filter(meeting => !meeting.hidden || isAdmin)
            .filter(meeting => meeting.date === format(date, 'yyyy-MM-dd'));
    };

    const handleEditMeeting = (meeting) => {
        setSelectedMeeting(null);
        navigate('/schedule', { state: { meetingToEdit: meeting } });
    };

    const renderDays = () => {
        const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

        // Only show days that have meetings
        const daysWithMeetings = days.filter(date => getMeetingsForDate(date).length > 0);

        if (daysWithMeetings.length === 0) {
            return (
                <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-gray-400 text-sm">{t('dashboard.noWeekMeetings')}</p>
                </div>
            );
        }

        return daysWithMeetings.map((date) => {
            const dailyMeetings = getMeetingsForDate(date);
            const isToday = isSameDay(date, new Date());
            const dayName = format(date, 'EEEE', { locale: dateLocale });
            const dateStr = format(date, t('dashboard.dayDateFormat'), { locale: dateLocale });
            const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

            return (
                <div key={date.toISOString()} className={`mb-4 bg-white rounded-xl border ${isToday ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200'} p-4 shadow-sm`}>
                    <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                            <span className={`font-bold text-lg ${dayOfWeek === 0 || dayOfWeek === 6 ? 'text-red-600' : 'text-gray-900'}`}>{dayName}</span>
                            <span className="font-bold text-gray-800 text-sm">{dateStr}</span>
                        </div>
                        {isToday && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold">{t('dashboard.today')}</span>}
                    </div>

                    <div className="space-y-2">
                        {dailyMeetings.map(meeting => (
                            <div
                                key={meeting.id}
                                onClick={() => setSelectedMeeting(meeting)}
                                className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all flex justify-between items-center
                                    ${meeting.status === 'completed' ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'}
                                `}
                            >
                                <div className="flex-1 min-w-0">
                                    <h4 className={`font-bold text-sm truncate ${meeting.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                        {meeting.title}
                                    </h4>
                                    <div className="flex items-center text-xs text-gray-500 mt-1 gap-2">
                                        <span className="flex items-center gap-1"><Clock size={12} /> {meeting.startTime} - {meeting.endTime}</span>
                                    </div>
                                    {meeting.description && (
                                        <p className="text-xs text-gray-500 mt-1 truncate">{meeting.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200 ml-2 shrink-0">
                                    <Users size={12} />
                                    <span>{Object.values(meeting.responses || {}).filter(r => r === 'attend').length}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        });
    };

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                    {format(currentWeekStart, t('dashboard.weekHeaderFormat'), { locale: dateLocale })}
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={20} /></button>
                    <button onClick={goToToday} className="px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">{t('dashboard.today')}</button>
                    <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={20} /></button>
                </div>
            </div>

            <div className="flex flex-col">
                {renderDays()}
            </div>

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

export default WeeklyCalendar;
