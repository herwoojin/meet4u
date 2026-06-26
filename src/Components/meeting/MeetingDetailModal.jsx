import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, Users, Trash2, Edit, Check, XCircle, AlignLeft, EyeOff, Eye, DollarSign, ShieldCheck } from 'lucide-react';
import { db } from '../../lib/firebase';
import { deleteDoc, doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { format, isValid } from 'date-fns';
import { ko, enUS, zhCN } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';
import CommentSection from './CommentSection';
import ScoreBoard from './ScoreBoard';
import AdminAttendanceEditor from './AdminAttendanceEditor';

const DATE_FNS_LOCALES = { ko, en: enUS, zh: zhCN };

// Helper: convert sanitized email key (dots→underscores) back to real email
const unsanitizeEmail = (key) => {
    if (!key) return key;
    const atIndex = key.indexOf('@');
    if (atIndex === -1) return key;
    // Only unsanitize the domain part (after @), where dots were replaced with underscores
    const localPart = key.substring(0, atIndex);
    const domainPart = key.substring(atIndex + 1).replace(/_/g, '.');
    return localPart + '@' + domainPart;
};

const MeetingDetailModal = ({ meeting, onClose, onEdit }) => {
    const { t, i18n } = useTranslation();
    const { currentUser, isAdmin } = useAuth();
    const dateLocale = DATE_FNS_LOCALES[i18n.language?.split('-')[0]] || ko;

    if (!meeting) return null;

    const isCreator = currentUser?.uid === meeting.createdBy;
    const responses = meeting.responses || {};

    const handleDelete = async () => {
        if (!isCreator && !isAdmin) return;
        try {
            await deleteDoc(doc(db, "meetings", meeting.id));
            onClose();
        } catch (error) {
            console.error("Error deleting meeting:", error);
            alert(t('meeting.deleteError'));
        }
    };

    const [selectedStatus, setSelectedStatus] = React.useState(null);
    const [adminEditorOpen, setAdminEditorOpen] = React.useState(false);

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

            // Send push notification when someone marks "attend"
            if (selectedStatus === 'attend') {
                const senderName = currentUser.displayName || currentUser.email.split('@')[0];
                // Notify existing attendees + meeting creator
                const existingAttendees = Object.entries(meeting.responses || {})
                    .filter(([, status]) => status === 'attend')
                    .map(([key]) => unsanitizeEmail(key));
                // Also include all attendeesList members
                const allRecipients = Array.from(new Set([
                    ...(meeting.attendeesList || []),
                    ...existingAttendees,
                ])).map(e => e.toLowerCase());

                if (allRecipients.length > 0) {
                    fetch('/.netlify/functions/send-notification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'attendance',
                            title: t('meeting.attendanceNotifTitle'),
                            body: t('meeting.attendanceNotifBody', { name: senderName, title: meeting.title }),
                            recipientEmails: allRecipients,
                            senderEmail: currentUser.email,
                        }),
                    }).catch(err => console.error('Push notification failed:', err));
                }
            }

            alert(t('meeting.responseSaved'));
        } catch (e) {
            console.error("Response update failed", e);
            alert(t('meeting.responseSaveFailed'));
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

    let formattedDate = t('meeting.dateError');
    try {
        const dateObj = new Date(meeting.date);
        if (isValid(dateObj)) {
            formattedDate = format(dateObj, t('meeting.dateFormat'), { locale: dateLocale });
        }
    } catch (e) {
        console.error("Date formatting error:", e);
    }

    // State for user profiles (nicknames)
    const [userMap, setUserMap] = React.useState({});

    // Fetch user profiles for all attendees
    React.useEffect(() => {
        const fetchUserProfiles = async () => {
            // Unsanitize response keys (underscores→dots in domain) to get real emails for Firestore lookup
            const responseKeys = Object.keys(meeting.responses || {}).map(k => unsanitizeEmail(k));
            const allEmails = Array.from(new Set([...(meeting.attendeesList || []), ...responseKeys]));
            if (allEmails.length === 0) return;

            // Firestore 'in' query limit is 10. Chunk the emails.
            // Chunk the emails.
            const chunks = [];
            for (let i = 0; i < allEmails.length; i += 10) {
                // Ensure we query with lowercase emails since `users` collection might have inconsistent casing 
                // (though new users are effectively lowercased by our new logic, legacy might not be).
                // Actually, AuthContext writes raw email. We should query raw OR lowercase? 
                // `in` query is exact match. Let's try to query both if possible, or assume standardized.
                // Given we just started standardizing in MeetingForm, best to query the raw email AND the lowercased version if different.

                const rawSlice = allEmails.slice(i, i + 10);
                const processedSlice = new Set();
                rawSlice.forEach(e => {
                    processedSlice.add(e);
                    processedSlice.add(e.toLowerCase());
                });

                // Re-chunking might be needed if processedSlice > 10, but `in` limit is 30 (actually 10 for some types, 30 for others). 
                // Firestore `in` limit is 10. So better to just lowercase them all if we assume `users` have lowercase emails?
                // Or just keep it simple: strict lowercase for everything going forward.
                // Let's stick to the plan: lowercase keys for lookup.

                chunks.push(rawSlice.map(e => e.toLowerCase()));
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
        // Unsanitize in case it's a sanitized key from responses
        const unsanitized = unsanitizeEmail(emailRaw);

        // 1. Try to find if this email matches current user (use auth profile)
        if (currentUser?.email && (
            currentUser.email === emailRaw ||
            currentUser.email === unsanitized ||
            currentUser.email.replace(/\./g, '_') === emailRaw
        )) {
            return currentUser.displayName || currentUser.email.split('@')[0];
        }

        // 2. Try to find in fetched userMap
        // Check unsanitized, raw, lowercase, and sanitized versions
        if (userMap[unsanitized]) return userMap[unsanitized];
        const lowerEmail = unsanitized.toLowerCase();
        if (userMap[lowerEmail]) return userMap[lowerEmail];
        if (userMap[emailRaw]) return userMap[emailRaw];

        const sanitized = emailRaw.replace(/\./g, '_');
        if (userMap[sanitized]) return userMap[sanitized];

        // 3. Otherwise return the part before @ as nickname fallback to hide email
        return unsanitized.split('@')[0];
    };

    const handleComplete = async () => {
        if (!isCreator && !isAdmin) return;
        try {
            await updateDoc(doc(db, "meetings", meeting.id), {
                status: 'completed'
            });
            onClose();
        } catch (error) {
            console.error("Error completing meeting:", error);
            alert(t('meeting.statusChangeError'));
        }
    };

    const getDisplayEmailInitial = (displayString) => {
        // Return first char of string
        return displayString && displayString.length > 0 ? displayString[0].toUpperCase() : "?";
    }

    const handleToggleHide = async () => {
        if (!isCreator && !isAdmin) return;
        const newHidden = !meeting.hidden;
        try {
            await updateDoc(doc(db, "meetings", meeting.id), {
                hidden: newHidden
            });
            onClose();
        } catch (error) {
            console.error("Error toggling hide:", error);
            alert(t('meeting.statusChangeError'));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`flex justify-between items-start p-6 border-b border-gray-100 ${meeting.status === 'completed' ? 'bg-red-50' : 'bg-white'}`}>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-gray-900">{meeting.title}</h2>
                            {meeting.status === 'completed' && (
                                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-200 font-bold">{t('meeting.completed')}</span>
                            )}
                            {meeting.hidden && (
                                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full border border-yellow-200 font-bold">{t('meeting.hidden')}</span>
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
                                <AlignLeft size={14} /> {t('meeting.description')}
                            </h3>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {meeting.description}
                            </p>
                        </div>
                    )}

                    {/* Rental Cost Info */}
                    {(() => {
                        const entries = meeting.costEntries || [];
                        const totalCost = entries.length > 0
                            ? entries.reduce((sum, e) => sum + (Number(e.cost) || 0), 0)
                            : (Number(meeting.rentalCost) || 0);
                        const hasCost = totalCost > 0 || entries.some(e => e.bookedBy) || meeting.bookedBy;
                        if (!hasCost) return null;

                        const attendCount = Object.values(responses).filter(v => v === 'attend').length;
                        const perPerson = attendCount > 0 ? Math.ceil(totalCost / attendCount) : 0;

                        return (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                <h3 className="text-xs font-bold text-green-800 mb-2 flex items-center gap-1">
                                    <DollarSign size={14} /> {t('meeting.rentalCost')}
                                </h3>
                                <div className="space-y-1.5">
                                    {entries.length > 0 ? entries.map((entry, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600">{entry.bookedBy || t('meeting.unassigned')}</span>
                                            <span className="font-bold text-gray-900">{Number(entry.cost).toLocaleString()}{t('common.won')}</span>
                                        </div>
                                    )) : (
                                        <>
                                            {meeting.bookedBy && (
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">{t('meeting.bookedBy')}</span>
                                                    <span className="font-bold text-gray-900">{meeting.bookedBy}</span>
                                                </div>
                                            )}
                                            {totalCost > 0 && (
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">{t('meeting.rentalAmount')}</span>
                                                    <span className="font-bold text-gray-900">{totalCost.toLocaleString()}{t('common.won')}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {entries.length > 1 && (
                                        <div className="flex items-center justify-between text-sm pt-1 border-t border-green-200">
                                            <span className="text-gray-600 font-medium">{t('meeting.sumLabel')}</span>
                                            <span className="font-bold text-gray-900">{totalCost.toLocaleString()}{t('common.won')}</span>
                                        </div>
                                    )}
                                    {totalCost > 0 && attendCount > 0 && (
                                        <div className="flex items-center justify-between text-sm pt-1.5 border-t border-green-200">
                                            <span className="text-gray-600">{t('meeting.perPersonLabel', { count: attendCount })}</span>
                                            <span className="font-bold text-green-700 text-base">{perPerson.toLocaleString()}{t('common.won')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Stats */}
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                        <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold border-b border-gray-200 pb-2">
                            <Users size={18} className="text-gray-700" />
                            {t('meeting.attendanceTitle')}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                                <div className="text-2xl font-bold text-green-600">{getResponseCount('attend')}</div>
                                <div className="text-xs text-gray-500 font-medium mt-1">{t('meeting.attend')}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-red-500">{getResponseCount('decline')}</div>
                                <div className="text-xs text-gray-500 font-medium mt-1">{t('meeting.decline')}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-400">
                                    {Math.max(0, (meeting.attendeesList?.length || 0) - Object.keys(responses).length)}
                                </div>
                                <div className="text-xs text-gray-500 font-medium mt-1">{t('meeting.noResponse')}</div>
                            </div>
                        </div>
                    </div>

                    {/* Attendees List */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center justify-between">
                            <span>{t('meeting.attendeesList')}</span>
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                {new Set([...(meeting.attendeesList || []), ...Object.keys(responses).map(k => unsanitizeEmail(k))]).size}{t('meeting.peopleSuffix')}
                            </span>
                        </h3>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {Array.from(new Set([...(meeting.attendeesList || []), ...Object.keys(responses).map(k => unsanitizeEmail(k))])).map((emailRaw, idx) => {
                                const displayName = getDisplayName(emailRaw);
                                const status = getStatusForEmail(emailRaw);

                                let statusBadge;
                                switch (status) {
                                    case 'attend': statusBadge = <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200 font-medium">{t('meeting.attend')}</span>; break;
                                    case 'maybe': statusBadge = <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full border border-orange-200 font-medium">{t('meeting.maybe')}</span>; break;
                                    case 'decline': statusBadge = <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200 font-medium">{t('meeting.decline')}</span>; break;
                                    default: statusBadge = <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">{t('meeting.noResponse')}</span>;
                                }

                                return (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-100 shadow-sm transition-colors"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-xs font-bold text-blue-700 border border-blue-100 shrink-0">
                                                {getDisplayEmailInitial(displayName)}
                                            </div>
                                            <span className="text-sm text-gray-700 truncate group-hover:text-blue-600 transition-colors">{displayName}</span>
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
                            <h3 className="text-sm font-bold text-gray-900 mb-3">{t('meeting.responseTitle')}</h3>
                            <div className={`grid ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-4`}>
                                <button
                                    onClick={() => setSelectedStatus('attend')}
                                    className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 border ${selectedStatus === 'attend'
                                        ? 'bg-green-600 text-white border-green-600 ring-2 ring-green-100'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                                        }`}
                                >
                                    <Check size={16} /> {t('meeting.attend')}
                                </button>
                                <button
                                    onClick={() => setSelectedStatus('decline')}
                                    className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 border ${selectedStatus === 'decline'
                                        ? 'bg-red-500 text-white border-red-500 ring-2 ring-red-100'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                                        }`}
                                >
                                    <XCircle size={16} /> {t('meeting.decline')}
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={() => setAdminEditorOpen(true)}
                                        className="py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 border bg-white text-amber-700 border-amber-300 hover:bg-amber-50 hover:border-amber-400"
                                        title="등록된 회원을 골라 참석/불참 직접 지정"
                                    >
                                        <ShieldCheck size={16} /> 관리자수정
                                    </button>
                                )}
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
                                <Check size={18} /> {t('meeting.saveResponse')}
                            </button>
                        </div>
                    )}

                    {/* Footer Actions (Moved inside content) */}
                    <div className="pt-4 border-t border-gray-100 flex flex-col gap-4">
                        {/* Action Buttons */}
                        {(isCreator || isAdmin) && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => onEdit(meeting)}
                                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm flex-1 justify-center"
                                >
                                    <Edit size={16} className="text-gray-500" /> {t('meeting.editBtn')}
                                </button>
                                {/* Complete Button */}
                                {meeting.status !== 'completed' && (
                                    <button
                                        onClick={handleComplete}
                                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-green-300 rounded-lg text-sm font-medium text-green-700 hover:bg-green-50 transition-colors shadow-sm flex-1 justify-center"
                                    >
                                        <Check size={16} /> {t('meeting.completeBtn')}
                                    </button>
                                )}
                                {/* Hide/Show Button */}
                                <button
                                    onClick={handleToggleHide}
                                    className={`flex items-center gap-1.5 px-4 py-2.5 bg-white border rounded-lg text-sm font-medium transition-colors shadow-sm flex-1 justify-center ${meeting.hidden
                                        ? 'border-blue-300 text-blue-600 hover:bg-blue-50'
                                        : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                                        }`}
                                >
                                    {meeting.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                                    {meeting.hidden ? t('meeting.showBtn') : t('meeting.hideBtn')}
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm flex-1 justify-center"
                                >
                                    <Trash2 size={16} /> {t('meeting.deleteBtn')}
                                </button>
                            </div>
                        )}

                        {/* Score Board */}
                        <ScoreBoard
                            meetingId={meeting.id}
                            attendeeNames={
                                Array.from(new Set([
                                    ...(meeting.attendeesList || []),
                                    ...Object.keys(responses).map(k => unsanitizeEmail(k))
                                ])).map(email => getDisplayName(email))
                            }
                            isEditable={isCreator || isAdmin}
                        />

                        {/* Comment Section */}
                        <CommentSection
                            meetingId={meeting.id}
                            currentUser={currentUser}
                            attendees={Object.entries(meeting.responses || {})
                                .filter(([, status]) => status === 'attend')
                                .map(([key]) => unsanitizeEmail(key))
                            }
                        />

                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors mt-2"
                        >
                            {t('meeting.closeBtn')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Admin: 등록된 회원을 골라 참석/불참 직접 지정 */}
            {isAdmin && (
                <AdminAttendanceEditor
                    open={adminEditorOpen}
                    onClose={() => setAdminEditorOpen(false)}
                    meeting={meeting}
                />
            )}
        </div>
    );
};

export default MeetingDetailModal;
