import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Users, Video } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ icon: Icon, label, value, colorClass }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-20`}>
            <Icon className={colorClass.replace("bg-", "text-")} size={24} />
        </div>
        <div>
            <p className="text-gray-500 text-sm">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    </div>
);

import MeetingDetailModal from '../Components/meeting/MeetingDetailModal';
import WeeklyCalendar from '../Components/calendar/WeeklyCalendar';

const MeetingCard = ({ title, time, attendees, status, onJoin }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer shadow-sm" onClick={onJoin}>
        <div className="flex justify-between items-start mb-2">
            <div>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <div className="flex items-center text-gray-500 text-sm mt-1 space-x-2">
                    <Clock size={14} />
                    <span>{time}</span>
                </div>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${status === 'upcoming' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                }`}>
                {status === 'upcoming' ? '예정됨' : '완료됨'}
            </span>
        </div>
        <div className="flex items-center justify-between mt-4">
            <div className="flex -space-x-2">
                {attendees && attendees.map((a, i) => (
                    <img key={i} src={`https://ui-avatars.com/api/?name=${a}&background=random`} alt={a} className="w-6 h-6 rounded-full border border-white" />
                ))}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onJoin();
                }}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 font-medium"
            >
                <Video size={14} />
                <span>참여하기</span>
            </button>
        </div>
    </div>
)

const Dashboard = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMeeting, setSelectedMeeting] = useState(null);

    const handleEditMeeting = (meeting) => {
        setSelectedMeeting(null);
        navigate('/schedule', { state: { meetingToEdit: meeting } });
    };

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, "meetings"),
            where("createdBy", "==", currentUser.uid)
            // orderBy("date", "asc") // Removed to avoid index requirement for now
        );

        // Fallback query if index is missing (often happens in dev)
        // const q = query(collection(db, "meetings"), where("createdBy", "==", currentUser.uid));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const meetingsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMeetings(meetingsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching meetings:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const upcomingMeetings = meetings.filter(m => {
        // Simple client-side filtering for upcoming
        const meetingDate = new Date(m.date + 'T' + m.startTime);
        return meetingDate >= new Date();
    });



    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">대시보드</h2>
                    <p className="text-gray-500">환영합니다, {currentUser?.displayName}님! 오늘의 일정을 확인하세요.</p>
                </div>
                <button
                    onClick={() => navigate('/schedule')}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    + 새 미팅
                </button>
            </header>

            {/* Weekly Calendar Section */}
            <div className="mb-8">
                <WeeklyCalendar />
            </div>

            {/* Stat Cards Removed */}

            <div className="space-y-8">
                <div className="space-y-8">
                    {/* Upcoming Meetings Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-900">진행 중 / 예정된 미팅</h3>
                            <a href="/calendar" className="text-blue-600 text-sm hover:underline font-medium">전체 보기</a>
                        </div>
                        <div className="space-y-4">
                            {loading ? (
                                <p className="text-gray-400">일정을 불러오는 중...</p>
                            ) : upcomingMeetings.length === 0 ? (
                                <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100">
                                    <p className="text-gray-500">예정된 미팅이 없습니다.</p>
                                </div>
                            ) : (
                                upcomingMeetings.map(meeting => (
                                    <MeetingCard
                                        key={meeting.id}
                                        title={meeting.title}
                                        time={`${meeting.date} • ${meeting.startTime} - ${meeting.endTime}`}
                                        attendees={meeting.attendeesList || []}
                                        status={meeting.status || 'upcoming'}
                                        onJoin={() => setSelectedMeeting(meeting)}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Completed Meetings Section */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-gray-900 text-gray-500">완료된 미팅</h3>
                        <div className="space-y-4">
                            {loading ? (
                                <p className="text-gray-400">일정을 불러오는 중...</p>
                            ) : meetings.filter(m => {
                                const meetingDate = new Date(m.date + 'T' + m.startTime);
                                return meetingDate < new Date() || m.status === 'completed';
                            }).length === 0 ? (
                                <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                                    <p className="text-gray-400 text-sm">완료된 미팅이 없습니다.</p>
                                </div>
                            ) : (
                                meetings.filter(m => {
                                    const meetingDate = new Date(m.date + 'T' + m.startTime);
                                    return meetingDate < new Date() || m.status === 'completed';
                                }).map(meeting => (
                                    <MeetingCard
                                        key={meeting.id}
                                        title={meeting.title}
                                        time={`${meeting.date} • ${meeting.startTime} - ${meeting.endTime}`}
                                        attendees={meeting.attendeesList || []}
                                        status='completed'
                                        onJoin={() => setSelectedMeeting(meeting)}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>
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

export default Dashboard;
