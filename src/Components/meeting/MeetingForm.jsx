import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, AlignLeft, CheckCircle, Loader } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const MeetingForm = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation(); // Get navigation state
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);

    const [formData, setFormData] = useState({
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        location: '',
        description: '',
        attendees: ''
    });

    // Check for edit mode on mount
    useEffect(() => {
        if (location.state?.meetingToEdit) {
            const m = location.state.meetingToEdit;
            setIsEditing(true);
            setEditId(m.id);
            setFormData({
                title: m.title || '',
                date: m.date || '',
                startTime: m.startTime || '',
                endTime: m.endTime || '',
                location: m.location || '',
                description: m.description || '',
                attendees: m.attendees || '' // Assuming 'attendees' string was saved or we reconstructed it
                // Note: If we only saved attendeesList array, we might need to join it back to string
                // For now, let's assume we can map it back if needed, but in original code we only saved attendeesList
            });

            // If attendees is missing but attendeesList exists, join it
            if (!m.attendees && m.attendeesList) {
                setFormData(prev => ({ ...prev, attendees: m.attendeesList.join(', ') }));
            }
        }
    }, [location.state]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const meetingData = {
            ...formData,
            createdBy: currentUser.uid,
            status: 'upcoming',
            attendeesList: []
        };

        try {
            if (isEditing && editId) {
                // Update existing document
                await updateDoc(doc(db, "meetings", editId), {
                    ...meetingData,
                    updatedAt: serverTimestamp()
                });
                alert('미팅이 성공적으로 수정되었습니다!');
            } else {
                // Create new document
                await addDoc(collection(db, "meetings"), {
                    ...meetingData,
                    createdAt: serverTimestamp()
                });
                alert('미팅이 성공적으로 생성되었습니다!');
            }
            navigate('/');
        } catch (error) {
            console.error("Error saving meeting: ", error);
            alert("오류가 발생했습니다: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{isEditing ? '미팅 수정' : '새 미팅 예약'}</h2>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl border border-gray-200 space-y-6 shadow-sm">

                {/* Title */}
                <div>
                    <label className="block text-gray-700 mb-2 font-medium">미팅 제목</label>
                    <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="예: 주간 기획 회의"
                        required
                    />
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                            <Calendar size={16} /> 날짜
                        </label>
                        <input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                            <Clock size={16} /> 시작 시간
                        </label>
                        <select
                            name="startTime"
                            value={formData.startTime}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            required
                        >
                            <option value="">선택</option>
                            {Array.from({ length: 24 }).map((_, i) => {
                                const time = `${String(i).padStart(2, '0')}:00`;
                                return <option key={time} value={time}>{time}</option>;
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                            <Clock size={16} /> 종료 시간
                        </label>
                        <select
                            name="endTime"
                            value={formData.endTime}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            required
                        >
                            <option value="">선택</option>
                            {Array.from({ length: 24 }).map((_, i) => {
                                const time = `${String(i).padStart(2, '0')}:00`;
                                return <option key={time} value={time}>{time}</option>;
                            })}
                        </select>
                    </div>
                </div>

                {/* Location */}
                <div>
                    <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                        <MapPin size={16} /> 장소
                    </label>
                    <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="예: 회의실 A 또는 Zoom 링크"
                    />
                </div>



                {/* Description */}
                <div>
                    <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                        <AlignLeft size={16} /> 설명
                    </label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows="4"
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        placeholder="회의 안건 및 메모..."
                    ></textarea>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    className={`w-full text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/30 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800'}`}
                    disabled={loading}
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader className="animate-spin" size={20} /> 처리 중...
                        </span>
                    ) : (
                        isEditing ? '미팅 수정 완료' : '미팅 예약하기'
                    )}
                </button>
            </form>
        </div>
    );
};

export default MeetingForm;
