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

const MeetingCard = ({ title, time, attendees, status }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer shadow-sm">
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
            <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 font-medium">
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

    const hoursScheduled = meetings.reduce((acc, curr) => {
        // Approximate duration calculation
        const start = new Date(`2000-01-01T${curr.startTime}`);
        const end = new Date(`2000-01-01T${curr.endTime}`);
        const durationHours = (end - start) / (1000 * 60 * 60);
        return acc + (durationHours > 0 ? durationHours : 0);
    }, 0).toFixed(1);

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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={Calendar} label="다가오는 미팅" value={upcomingMeetings.length} colorClass="bg-blue-100 text-blue-600" />
                <StatCard icon={Clock} label="예정된 시간" value={hoursScheduled} colorClass="bg-purple-100 text-purple-600" />
                <StatCard icon={Users} label="활성 팀" value="1" colorClass="bg-green-100 text-green-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-gray-900">나의 일정</h3>
                        <a href="/calendar" className="text-blue-600 text-sm hover:underline font-medium">전체 보기</a>
                    </div>
                    <div className="space-y-4">
                        {loading ? (
                            <p className="text-gray-400">일정을 불러오는 중...</p>
                        ) : meetings.length === 0 ? (
                            <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-gray-500">예정된 미팅이 없습니다.</p>
                            </div>
                        ) : (
                            meetings.map(meeting => (
                                <MeetingCard
                                    key={meeting.id}
                                    title={meeting.title}
                                    time={`${meeting.date} • ${meeting.startTime} - ${meeting.endTime}`}
                                    attendees={meeting.attendeesList || []}
                                    status={meeting.status || 'upcoming'}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">빠른 실행</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => navigate('/schedule')}
                            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left group border border-gray-100"
                        >
                            <div className="bg-blue-100 text-blue-600 p-2 rounded w-fit mb-3 group-hover:scale-110 transition-transform">
                                <Calendar size={20} />
                            </div>
                            <h4 className="font-semibold text-gray-900">미팅 예약</h4>
                            <p className="text-xs text-gray-500 mt-1">새로운 일정 만들기</p>
                        </button>
                        <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left group border border-gray-100">
                            <div className="bg-orange-100 text-orange-600 p-2 rounded w-fit mb-3 group-hover:scale-110 transition-transform">
                                <Users size={20} />
                            </div>
                            <h4 className="font-semibold text-gray-900">팀 관리</h4>
                            <p className="text-xs text-gray-500 mt-1">멤버 초대 및 관리</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
