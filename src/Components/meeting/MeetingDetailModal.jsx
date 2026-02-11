import React from 'react';
import { X, Clock, Users, Trash2, Edit, Check, HelpCircle, XCircle, AlignLeft } from 'lucide-react';
import { db } from '../../lib/firebase';
import { deleteDoc, doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { format, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';

const MeetingDetailModal = ({ meeting, onClose, onEdit }) => {
    const { currentUser } = useAuth();

    if (!meeting) return null;

    const isCreator = currentUser?.uid === meeting.createdBy;
    const responses = meeting.responses || {};

    const handleDelete = async () => {
        if (!isCreator) return;
        if (window.confirm('정말 이 미팅을 삭제하시겠습니까?')) {
            try {
                await deleteDoc(doc(db, "meetings", meeting.id));
                onClose();
            } catch (error) {
                console.error("Error deleting meeting:", error);
                alert("삭제 중 오류가 발생했습니다.");
            }
        }
    };

    const [selectedStatus, setSelectedStatus] = React.useState(null);

    // Initialize selected status from existing response
    React.useEffect(() => {
        if (currentUser?.email && meeting.responses) {
            const sanitized = currentUser.email.replace(/\./g, '_');
            const currentStatus = meeting.responses[sanitized] || meeting.responses[currentUser.email];
            setSelectedStatus(currentStatus);
        }
    }, [currentUser, meeting]);

    const saveResponse = async () => {
        if (!currentUser?.email || !selectedStatus) return;
        try {
            const sanitizedEmail = currentUser.email.replace(/\./g, '_');
            await updateDoc(doc(db, "meetings", meeting.id), {
                [`responses.${sanitizedEmail}`]: selectedStatus
            });
            alert("응답이 저장되었습니다.");
        } catch (e) {
            console.error("Response update failed", e);
            alert("응답 저장 실패");
        }
    };

    const getResponseCount = (type) => {
        return Object.values(responses).filter(v => v === type).length;
    };

    const getStatusForEmail = (email) => {
        if (!email) return null;
        const sanitized = email.replace(/\./g, '_');
        return responses[sanitized] || responses[email];
    };

    let formattedDate = "날짜 오류";
    try {
        const dateObj = new Date(meeting.date);
        if (isValid(dateObj)) {
            formattedDate = format(dateObj, 'yyyy년 M월 d일 (eeee)', { locale: ko });
        }
    } catch (e) {
        console.error("Date formatting error:", e);
    }

    // State for user profiles (nicknames)
    const [userMap, setUserMap] = React.useState({});

    // Fetch user profiles for all attendees
    React.useEffect(() => {
        const fetchUserProfiles = async () => {
            const allEmails = Array.from(new Set([...(meeting.attendeesList || []), ...Object.keys(meeting.responses || {})]));
            if (allEmails.length === 0) return;

            // Firestore 'in' query limit is 10. Chunk the emails.
            const chunks = [];
            for (let i = 0; i < allEmails.length; i += 10) {
                chunks.push(allEmails.slice(i, i + 10));
            }

            const profileMap = {};

            try {
                // We have a mix of raw emails and sanitized keys.
                // The `users` collection now has `email` and `emailSanitized`.
                // Ideally we search against the field that matches our key.
                // Since we can't do OR queries easily across fields with 'in', let's just search 'email' first.
                // Most keys in `attendeesList` are raw emails.

                await Promise.all(chunks.map(async (chunk) => {
                    const q = query(collection(db, "users"), where("email", "in", chunk));
                    const querySnapshot = await getDocs(q);
                    querySnapshot.forEach((doc) => {
                        const userData = doc.data();
                        if (userData.email && userData.displayName) {
                            profileMap[userData.email] = userData.displayName;
                            profileMap[userData.email.replace(/\./g, '_')] = userData.displayName;
                        }
                    });
                }));

                // Fallback: If we missed some users (maybe they are only in responses with sanitized keys),
                // we could try searching by 'emailSanitized'.
                // But for now, let's assume the primary key is 'email'.

                setUserMap(prev => ({ ...prev, ...profileMap }));
            } catch (error) {
                console.error("Error fetching user profiles:", error);
            }
        };

        fetchUserProfiles();
    }, [meeting]);


    // Helper to get display name with nickname if available, hiding email
    const getDisplayName = (emailRaw) => {
        // 1. Try to find if this email matches current user (use auth profile)
        if (currentUser?.email && (currentUser.email === emailRaw || currentUser.email.replace(/\./g, '_') === emailRaw)) {
            return currentUser.displayName || currentUser.email.split('@')[0];
        }

        // 2. Try to find in fetched userMap
        // Check both raw and sanitized versions just to be safe
        if (userMap[emailRaw]) return userMap[emailRaw];
        const sanitized = emailRaw.replace(/\./g, '_'); // In case emailRaw was a real email
        // Or if emailRaw was already sanitized, we might need to reconstruct? 
        // Actually the map stores keys as they come from DB (real emails) and we also added sanitized keys above.
        if (userMap[sanitized]) return userMap[sanitized];

        // 3. Otherwise return the part before @ as nickname fallback to hide email
        return emailRaw.split('@')[0];
    };

    const handleComplete = async () => {
        if (!isCreator) return;
        if (window.confirm('이 미팅을 완료 상태로 변경하시겠습니까?')) {
            try {
                await updateDoc(doc(db, "meetings", meeting.id), {
                    status: 'completed'
                });
                onClose();
            } catch (error) {
                console.error("Error completing meeting:", error);
                alert("상태 변경 중 오류가 발생했습니다.");
            }
        }
    };

    const getDisplayEmailInitial = (displayString) => {
        // Return first char of string
        return displayString && displayString.length > 0 ? displayString[0].toUpperCase() : "?";
    }


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`flex justify-between items-start p-6 border-b border-gray-100 ${meeting.status === 'completed' ? 'bg-red-50' : 'bg-white'}`}>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-gray-900">{meeting.title}</h2>
                            {meeting.status === 'completed' && (
                                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-200 font-bold">완료됨</span>
                            )}
                        </div>
                        <div className="flex items-center text-gray-500 mt-2 text-sm">
                            <Clock size={16} className="mr-1.5 text-blue-500" />
                            <div className="leading-tight">
                                {formattedDate} <br />
                                <span className="font-medium text-gray-700">{meeting.startTime} - {meeting.endTime}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Description */}
                    {meeting.description && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h3 className="text-xs font-bold text-blue-800 mb-1 flex items-center gap-1">
                                <AlignLeft size={14} /> 설명
                            </h3>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {meeting.description}
                            </p>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                        <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold border-b border-gray-200 pb-2">
                            <Users size={18} className="text-gray-700" />
                            실시간 참석 현황
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                            <div>
                                <div className="text-2xl font-bold text-green-600">{getResponseCount('attend')}</div>
                                <div className="text-xs text-gray-500 font-medium mt-1">참석</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-orange-500">{getResponseCount('maybe')}</div>
                                <div className="text-xs text-gray-500 font-medium mt-1">미정</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-red-500">{getResponseCount('decline')}</div>
                                <div className="text-xs text-gray-500 font-medium mt-1">불참</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-400">
                                    {Math.max(0, (meeting.attendeesList?.length || 0) - Object.keys(responses).length)}
                                </div>
                                <div className="text-xs text-gray-500 font-medium mt-1">미응답</div>
                            </div>
                        </div>
                    </div>

                    {/* Attendees List */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center justify-between">
                            <span>참석자 목록</span>
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                {new Set([...(meeting.attendeesList || []), ...Object.keys(responses)]).size}명
                            </span>
                        </h3>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {Array.from(new Set([...(meeting.attendeesList || []), ...Object.keys(responses)])).map((emailRaw, idx) => {
                                const displayName = getDisplayName(emailRaw);
                                const status = getStatusForEmail(emailRaw);

                                let statusBadge;
                                switch (status) {
                                    case 'attend': statusBadge = <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200 font-medium">참석</span>; break;
                                    case 'maybe': statusBadge = <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full border border-orange-200 font-medium">미정</span>; break;
                                    case 'decline': statusBadge = <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200 font-medium">불참</span>; break;
                                    default: statusBadge = <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">미응답</span>;
                                }

                                return (
                                    <div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-xs font-bold text-blue-700 border border-blue-100 shrink-0">
                                                {getDisplayEmailInitial(displayName)}
                                            </div>
                                            <span className="text-sm text-gray-700 truncate">{displayName}</span>
                                        </div>
                                        {statusBadge}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Response Actions */}
                    {meeting.status !== 'completed' && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3">참석 여부 응답</h3>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <button
                                    onClick={() => setSelectedStatus('attend')}
                                    className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 border ${selectedStatus === 'attend'
                                        ? 'bg-green-600 text-white border-green-600 ring-2 ring-green-100'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                                        }`}
                                >
                                    <Check size={16} /> 참석
                                </button>
                                <button
                                    onClick={() => setSelectedStatus('maybe')}
                                    className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 border ${selectedStatus === 'maybe'
                                        ? 'bg-orange-500 text-white border-orange-500 ring-2 ring-orange-100'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700'
                                        }`}
                                >
                                    <HelpCircle size={16} /> 미정
                                </button>
                                <button
                                    onClick={() => setSelectedStatus('decline')}
                                    className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 border ${selectedStatus === 'decline'
                                        ? 'bg-red-500 text-white border-red-500 ring-2 ring-red-100'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                                        }`}
                                >
                                    <XCircle size={16} /> 불참
                                </button>
                            </div>
                            <button
                                onClick={saveResponse}
                                disabled={!selectedStatus || selectedStatus === getStatusForEmail(currentUser?.email)}
                                className={`w-full py-3 rounded-lg text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2
                                    ${!selectedStatus || selectedStatus === getStatusForEmail(currentUser?.email)
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
                                    }`}
                            >
                                <Check size={18} /> 응답 저장하기
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 flex justify-between bg-gray-50 items-center">
                    <div className="flex gap-2">
                        {isCreator && (
                            <>
                                <button
                                    onClick={() => onEdit(meeting)}
                                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    <Edit size={16} className="text-gray-500" /> 수정
                                </button>
                                {/* Complete Button */}
                                {meeting.status !== 'completed' && (
                                    <button
                                        onClick={handleComplete}
                                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-green-300 rounded-lg text-sm font-medium text-green-700 hover:bg-green-50 transition-colors shadow-sm"
                                    >
                                        <Check size={16} /> 완료
                                    </button>
                                )}
                                <button
                                    onClick={handleDelete}
                                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                                >
                                    <Trash2 size={16} /> 삭제
                                </button>
                            </>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="flex items-center gap-1 px-5 py-2.5 bg-gray-900 border border-transparent rounded-lg text-sm font-bold text-white hover:bg-gray-800 transition-all shadow-md hover:shadow-lg"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MeetingDetailModal;
