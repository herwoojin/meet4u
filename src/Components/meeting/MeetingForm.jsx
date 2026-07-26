import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, MapPin, AlignLeft, Loader, DollarSign, User, Plus, Trash2, Search, ChevronDown } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { DEFAULT_PROJECT_ID } from '../../lib/projects';
import { useNavigate, useLocation } from 'react-router-dom';
import useGoogleCalendar from '../../hooks/useGoogleCalendar';

// Searchable user dropdown component
const UserSearchDropdown = ({ value, onChange, users }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = users.filter(u =>
        u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-left text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none flex items-center justify-between"
            >
                <span className={value ? 'text-gray-900' : 'text-gray-400'}>
                    {value || t('meeting.selectMember')}
                </span>
                <ChevronDown size={16} className="text-gray-400" />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
                    <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t('meeting.searchMember')}
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-400 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                        {filtered.length === 0 ? (
                            <div className="p-3 text-sm text-gray-400 text-center">
                                {users.length === 0
                                    ? '프로젝트에 초대된 멤버가 없습니다. 프로젝트 관리에서 먼저 초대해 주세요.'
                                    : t('meeting.noSearchResults')}
                            </div>
                        ) : (
                            filtered.map(u => (
                                <button
                                    type="button"
                                    key={u.id}
                                    onClick={() => {
                                        onChange(u.displayName || u.email.split('@')[0]);
                                        setSearchTerm('');
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-center gap-3 transition-colors ${value === (u.displayName || u.email.split('@')[0]) ? 'bg-blue-50' : ''}`}
                                >
                                    <img
                                        src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'U')}&background=random&size=32`}
                                        alt=""
                                        className="w-7 h-7 rounded-full border border-gray-200"
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{u.displayName || t('meeting.noName')}</p>
                                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const MeetingForm = () => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const { currentProjectId, currentProject } = useProjects();
    const navigate = useNavigate();
    const gcal = useGoogleCalendar();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [allUsers, setAllUsers] = useState([]);

    const [formData, setFormData] = useState({
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        location: '',
        description: '',
        attendees: '',
    });

    const [costEntries, setCostEntries] = useState([]);

    // Fetch all users for the dropdown
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const snap = await getDocs(collection(db, 'users'));
                const usersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAllUsers(usersData);
            } catch (e) {
                console.error('Error fetching users:', e);
            }
        };
        fetchUsers();
    }, []);

    // 예약자 드롭다운은 "현재 선택된 프로젝트의 멤버" 로만 좁힌다.
    // 프로젝트가 없거나 memberEmails 가 비어 있으면 아예 빈 리스트를 반환한다.
    // (이전에는 안전 fallback 이라며 allUsers 로 확장했지만, 그 결과 프로젝트에
    // 초대되지 않은 사람의 이름까지 검색되는 정보 유출이 발생했다.)
    const projectMemberEmails = React.useMemo(() => {
        const list = currentProject?.memberEmails || [];
        return new Set(list.map(e => String(e || '').toLowerCase().trim()).filter(Boolean));
    }, [currentProject]);

    const projectMembers = React.useMemo(() => {
        if (projectMemberEmails.size === 0) return [];
        return allUsers.filter(u => {
            const em = String(u.email || '').toLowerCase().trim();
            return em && projectMemberEmails.has(em);
        });
    }, [allUsers, projectMemberEmails]);

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
                attendees: m.attendees || '',
            });

            // Load cost entries (support both new array and legacy single fields)
            if (m.costEntries && m.costEntries.length > 0) {
                setCostEntries(m.costEntries.map(e => ({ cost: String(e.cost || ''), bookedBy: e.bookedBy || '' })));
            } else if (m.rentalCost > 0 || m.bookedBy) {
                setCostEntries([{ cost: m.rentalCost ? String(m.rentalCost) : '', bookedBy: m.bookedBy || '' }]);
            }

            if (!m.attendees && m.attendeesList) {
                setFormData(prev => ({ ...prev, attendees: m.attendeesList.join(', ') }));
            }
        }
    }, [location.state]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const addCostEntry = () => {
        setCostEntries(prev => [...prev, { cost: '', bookedBy: '' }]);
    };

    const removeCostEntry = (idx) => {
        setCostEntries(prev => prev.filter((_, i) => i !== idx));
    };

    const updateCostEntry = (idx, field, value) => {
        setCostEntries(prev => prev.map((entry, i) => i === idx ? { ...entry, [field]: value } : entry));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const validCostEntries = costEntries
            .filter(e => e.cost && Number(e.cost) > 0)
            .map(e => ({ cost: Number(e.cost), bookedBy: e.bookedBy }));

        const totalRentalCost = validCostEntries.reduce((sum, e) => sum + e.cost, 0);

        const meetingData = {
            ...formData,
            costEntries: validCostEntries,
            rentalCost: totalRentalCost,
            bookedBy: validCostEntries.length === 1 ? validCostEntries[0].bookedBy : '',
            createdBy: currentUser.uid,
            status: 'upcoming',
            attendeesList: [],
            projectId: currentProjectId || DEFAULT_PROJECT_ID,
        };

        try {
            let savedSuccess = '';
            if (isEditing && editId) {
                await updateDoc(doc(db, "meetings", editId), {
                    ...meetingData,
                    updatedAt: serverTimestamp()
                });
                savedSuccess = t('meeting.meetingEditSuccess');
            } else {
                await addDoc(collection(db, "meetings"), {
                    ...meetingData,
                    createdAt: serverTimestamp()
                });
                savedSuccess = t('meeting.meetingCreateSuccess');
            }

            // Best-effort Google Calendar sync (only on create + when enabled)
            let trailingMsg = '';
            if (!isEditing && gcal.syncEnabled && gcal.clientId) {
                const result = await gcal.syncMeeting(meetingData);
                if (result?.ok) {
                    trailingMsg = '\n' + t('settings.googleCalendar.eventCreated');
                } else if (!result?.skipped) {
                    trailingMsg = '\n' + t('settings.googleCalendar.eventCreateFailed');
                }
            }

            alert(savedSuccess + trailingMsg);
            navigate('/');
        } catch (error) {
            console.error("Error saving meeting: ", error);
            alert(t('meeting.errorOccurred') + ": " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 프로젝트에 소속돼 있지 않으면 미팅 생성 자체를 막는다. 미팅은 반드시
    // 어떤 프로젝트의 하위에 속해야 하고, 예약자 목록도 그 프로젝트 멤버로만
    // 노출되기 때문에, 프로젝트가 없는 사용자에게는 폼 대신 안내를 보여준다.
    if (!currentProject) {
        return (
            <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{isEditing ? t('meeting.editTitle') : t('meeting.newTitle')}</h2>
                <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
                    <div className="text-5xl mb-3">📁</div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">먼저 프로젝트가 필요해요</h3>
                    <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                        미팅은 반드시 프로젝트 하위에 등록됩니다.<br />
                        새 프로젝트를 만들거나, 기존 프로젝트에 초대 받은 뒤 다시 시도해 주세요.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/projects')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={16} /> 프로젝트 관리로 가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{isEditing ? t('meeting.editTitle') : t('meeting.newTitle')}</h2>
            <div className="mb-6 flex items-center gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <span className="text-lg">{currentProject.icon || '📁'}</span>
                <span>이 미팅은 <b className="text-blue-800">{currentProject.name}</b> 프로젝트에 등록됩니다.</span>
            </div>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl border border-gray-200 space-y-6 shadow-sm">

                {/* Title */}
                <div>
                    <label className="block text-gray-700 mb-2 font-medium">{t('meeting.titleLabel')}</label>
                    <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder={t('meeting.titlePlaceholder')}
                        required
                    />
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                            <Calendar size={16} /> {t('meeting.dateLabel')}
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
                            <Clock size={16} /> {t('meeting.startTime')}
                        </label>
                        <select
                            name="startTime"
                            value={formData.startTime}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            required
                        >
                            <option value="">{t('meeting.selectOption')}</option>
                            {Array.from({ length: 24 }).map((_, i) => {
                                const time = `${String(i).padStart(2, '0')}:00`;
                                return <option key={time} value={time}>{time}</option>;
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                            <Clock size={16} /> {t('meeting.endTime')}
                        </label>
                        <select
                            name="endTime"
                            value={formData.endTime}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            required
                        >
                            <option value="">{t('meeting.selectOption')}</option>
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
                        <MapPin size={16} /> {t('meeting.location')}
                    </label>
                    <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder={t('meeting.locationPlaceholder')}
                    />
                </div>

                {/* Cost Entries */}
                <div>
                    <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                        <DollarSign size={16} /> {t('meeting.rentalCostLabel')}
                    </label>
                    <div className="space-y-3">
                        {costEntries.map((entry, idx) => (
                            <div key={idx} className="flex items-start gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <div className="flex-1 space-y-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">{t('meeting.costAmount')}</label>
                                            <input
                                                type="number"
                                                value={entry.cost}
                                                onChange={(e) => updateCostEntry(idx, 'cost', e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                placeholder={t('meeting.costAmountPlaceholder')}
                                                min="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">{t('meeting.bookedByLabel')}</label>
                                            <UserSearchDropdown
                                                value={entry.bookedBy}
                                                onChange={(v) => updateCostEntry(idx, 'bookedBy', v)}
                                                users={projectMembers}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeCostEntry(idx)}
                                    className="mt-6 p-2 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={addCostEntry}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-colors"
                        >
                            <Plus size={16} /> {t('meeting.addCostEntry')}
                        </button>
                    </div>
                    {costEntries.length > 0 && (
                        <div className="mt-2 text-right text-sm text-gray-500">
                            {t('meeting.totalLabel')}: <span className="font-bold text-gray-900">
                                {costEntries.reduce((sum, e) => sum + (Number(e.cost) || 0), 0).toLocaleString()}{t('common.won')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Description */}
                <div>
                    <label className="block text-gray-700 mb-2 font-medium flex items-center gap-2">
                        <AlignLeft size={16} /> {t('meeting.description')}
                    </label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows="4"
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        placeholder={t('meeting.descPlaceholder')}
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
                            <Loader className="animate-spin" size={20} /> {t('meeting.processing')}
                        </span>
                    ) : (
                        isEditing ? t('meeting.completeEdit') : t('meeting.bookMeeting')
                    )}
                </button>
            </form>
        </div>
    );
};

export default MeetingForm;
