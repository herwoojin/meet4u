import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db, storage } from '../../lib/firebase';
import {
    collection, addDoc, query, where, onSnapshot, serverTimestamp,
    deleteDoc, doc, updateDoc, arrayUnion, arrayRemove, getDocs, writeBatch
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
    Send, MessageSquare, Trash2, CheckCheck, Mic, Volume2, VolumeX, BookOpen, Radio, FileText,
    Plus, Users, LogOut, X, ChevronDown, Search, Loader, Image as ImageIcon,
    Copy, Check, Star, Edit2
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { useNavigate } from 'react-router-dom';
import { compressImageToWebp } from '../../lib/imageUtils';
import ImageLightbox from './ImageLightbox';
import GrammarPopup from './GrammarPopup';
import LiveTranslatorModal from './LiveTranslatorModal';
import MeetingMinutesModal from './MeetingMinutesModal';
import {
    romajiToHangul,
    pinyinToHangul,
    latinToHangul,
    isLatinScript,
    isNonLatinScript,
    getPronunciationDisplay,
} from '../../lib/phonetics';

const SPEECH_LOCALE = {
    'ko': 'ko-KR',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'zh': 'zh-CN',
    'ja': 'ja-JP',
    'ru': 'ru-RU',
    'es': 'es-ES',
    'vi': 'vi-VN',
    'mn': 'mn-MN',
    'ar': 'ar-SA',
    'fr': 'fr-FR',
    'km': 'km-KH',
    // 신규 8개 — 더 많은 외국인 사용자 지원
    'bn': 'bn-BD',  // 방글라데시(벵골어)
    'uz': 'uz-UZ',  // 우즈베키스탄(우즈베크어)
    'si': 'si-LK',  // 스리랑카(신할라어)
    'my': 'my-MM',  // 미얀마(버마어)
    'tl': 'fil-PH', // 필리핀(타갈로그/필리핀어)
    'th': 'th-TH',  // 태국어
    'id': 'id-ID',  // 인도네시아어
    'ne': 'ne-NP',  // 네팔어
};

const LANG_LABEL = {
    'ko': '한국어', 'en': 'English', 'ja': '日本語', 'zh-CN': '中文(简)', 'zh': '中文',
    'ru': 'Русский', 'es': 'Español', 'vi': 'Tiếng Việt', 'mn': 'Монгол',
    'ar': 'العربية', 'fr': 'Français', 'km': 'ភាសាខ្មែរ',
    // 신규 8개
    'bn': 'বাংলা(방글라)', 'uz': 'Oʻzbek(우즈베크)', 'si': 'සිංහල(신할라)',
    'my': 'မြန်မာ(미얀마)', 'tl': 'Filipino(필리핀)', 'th': 'ไทย(태국)',
    'id': 'Indonesia(인니)', 'ne': 'नेपाली(네팔)',
};

const LANG_FLAG = {
    'ko': '🇰🇷', 'en': '🇺🇸', 'ja': '🇯🇵', 'zh-CN': '🇨🇳', 'zh': '🇨🇳',
    'ru': '🇷🇺', 'es': '🇪🇸', 'vi': '🇻🇳', 'mn': '🇲🇳',
    'ar': '🇸🇦', 'fr': '🇫🇷', 'km': '🇰🇭',
    // 신규 8개
    'bn': '🇧🇩', 'uz': '🇺🇿', 'si': '🇱🇰', 'my': '🇲🇲',
    'tl': '🇵🇭', 'th': '🇹🇭', 'id': '🇮🇩', 'ne': '🇳🇵',
};

const lower = (s) => (s || '').toLowerCase();

// ---------------- Create room modal ----------------
const CreateRoomModal = ({ onClose, onCreated }) => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const { projects } = useProjects();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [allUsers, setAllUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selected, setSelected] = useState([]); // [{email, displayName}]
    const [saving, setSaving] = useState(false);
    const [showList, setShowList] = useState(true);
    // 프로젝트를 여러 개 참여하고 있다면 프로젝트 필터를 노출해서 특정 프로젝트
    // 멤버만 뽑을 수 있게 한다. 'all' 이면 내 모든 프로젝트의 합집합.
    const [projectFilter, setProjectFilter] = useState('all');

    useEffect(() => {
        getDocs(collection(db, 'users'))
            .then(snap => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(err => console.error('load users failed', err));
    }, []);

    // 내가 참여 중인 프로젝트에서만 후보 뽑기.
    //   - 각 유저의 email 이 어떤 프로젝트의 memberEmails 에 들어 있는지 계산
    //   - projectFilter 에 따라 특정 프로젝트로 좁히거나 전체 합집합 사용
    //   - 매칭된 프로젝트 이름 리스트를 태그로 붙여 노출
    const candidates = useMemo(() => {
        if (projects.length === 0) return [];
        const filterSet = projectFilter === 'all'
            ? new Set(projects.map(p => p.id))
            : new Set([projectFilter]);
        const relevantProjects = projects.filter(p => filterSet.has(p.id));

        // 후보 email → { user, projectNames[] } 매핑
        const map = new Map();
        relevantProjects.forEach(p => {
            (p.memberEmails || []).forEach(em => {
                const emL = lower(em);
                if (!emL || emL === lower(currentUser?.email)) return;
                const existing = map.get(emL) || { email: emL, projectNames: [] };
                if (!existing.projectNames.includes(p.name)) existing.projectNames.push(p.name);
                map.set(emL, existing);
            });
        });

        // users 컬렉션에서 displayName/photoURL 보강
        const byEmail = new Map(allUsers.map(u => [lower(u.email || ''), u]));
        return Array.from(map.values()).map(c => {
            const u = byEmail.get(c.email);
            return {
                email: c.email,
                displayName: u?.displayName || c.email.split('@')[0],
                photoURL: u?.photoURL || '',
                hiddenFromSearch: u?.hiddenFromSearch || false,
                projectNames: c.projectNames,
            };
        });
    }, [projects, projectFilter, allUsers, currentUser]);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const selectedEmails = new Set(selected.map(s => lower(s.email)));
        return candidates
            .filter(u => !u.hiddenFromSearch)
            .filter(u => !selectedEmails.has(u.email))
            .filter(u => {
                if (!term) return true;
                return u.displayName.toLowerCase().includes(term)
                    || u.email.includes(term);
            })
            .slice(0, 50);
    }, [candidates, searchTerm, selected]);

    const toggleSelect = (user) => {
        setSelected(prev => [...prev, { email: user.email, displayName: user.displayName || user.email.split('@')[0] }]);
        setSearchTerm('');
        setShowList(false);
    };

    const removeSelected = (email) => {
        setSelected(prev => prev.filter(s => lower(s.email) !== lower(email)));
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        if (!name.trim()) {
            alert(t('chat.rooms.titleRequired'));
            return;
        }
        if (selected.length === 0) {
            alert(t('chat.rooms.atLeastOneInvitee'));
            return;
        }

        setSaving(true);
        try {
            const members = [
                lower(currentUser.email),
                ...selected.map(s => lower(s.email))
            ];
            const memberNames = {
                [lower(currentUser.email)]: currentUser.displayName || currentUser.email.split('@')[0],
            };
            selected.forEach(s => {
                memberNames[lower(s.email)] = s.displayName;
            });

            const ref = await addDoc(collection(db, 'globalChatRooms'), {
                name: name.trim(),
                createdBy: lower(currentUser.email),
                createdByName: currentUser.displayName || currentUser.email.split('@')[0],
                members: Array.from(new Set(members)),
                memberNames,
                createdAt: serverTimestamp(),
            });
            onCreated?.(ref.id);
            onClose();
        } catch (err) {
            console.error('create room failed', err);
            alert(t('chat.rooms.createFailed'));
        } finally {
            setSaving(false);
        }
    };

    // 참여 중인 프로젝트가 하나도 없으면 대화방을 만들 대상 자체가 없다.
    // → 프로젝트 관리 페이지로 유도.
    if (projects.length === 0) {
        return (
            <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-center" onClick={e => e.stopPropagation()}>
                    <div className="text-4xl mb-2">📁</div>
                    <h3 className="font-bold text-gray-900 mb-2">먼저 프로젝트가 필요해요</h3>
                    <p className="text-sm text-gray-500 leading-relaxed mb-5">
                        대화방은 <b>내가 참여 중인 프로젝트의 멤버</b> 로만 만들 수 있어요.<br />
                        프로젝트를 하나 만들거나 초대받은 뒤 다시 시도해 주세요.
                    </p>
                    <div className="flex justify-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={() => { onClose(); navigate('/projects'); }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg shadow-sm hover:bg-blue-700"
                        >
                            <Plus size={14} /> 프로젝트 관리로 가기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900">{t('chat.rooms.newRoom')}</h3>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleCreate} className="p-4 flex-1 overflow-y-auto space-y-4">
                    {/* 프로젝트 필터 — 여러 개 참여 중일 때만 노출 */}
                    {projects.length > 1 && (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">초대할 프로젝트 범위</label>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setProjectFilter('all')}
                                    className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${
                                        projectFilter === 'all'
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >전체 ({projects.length}개 프로젝트)</button>
                                {projects.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setProjectFilter(p.id)}
                                        className={`text-xs px-2.5 py-1 rounded-full border font-semibold inline-flex items-center gap-1 ${
                                            projectFilter === p.id
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        <span>{p.icon || '📁'}</span>{p.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('chat.rooms.roomName')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('chat.rooms.roomNamePlaceholder')}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('chat.rooms.inviteMembers')}</label>
                        <div className="flex items-center gap-2 px-3 border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                            <Search size={14} className="text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setShowList(true); }}
                                onFocus={() => setShowList(true)}
                                placeholder={t('chat.rooms.searchUser')}
                                className="flex-1 py-2 text-sm bg-transparent focus:outline-none"
                            />
                        </div>
                        <div className="mt-1 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-sm">
                            {filtered.length === 0 ? (
                                <div className="p-3 text-xs text-gray-400 text-center">
                                    {candidates.length === 0
                                        ? '이 프로젝트에는 나 말고 다른 멤버가 없어요.'
                                        : t('chat.rooms.noResults')}
                                </div>
                            ) : (
                                filtered.map(u => (
                                    <button
                                        type="button"
                                        key={u.email}
                                        onClick={() => toggleSelect(u)}
                                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2"
                                    >
                                        <span className="truncate min-w-0 flex-1">
                                            <span className="font-medium text-gray-800">{u.displayName}</span>
                                            <span className="ml-2 text-xs text-gray-400 truncate">{u.email}</span>
                                            {u.projectNames?.length > 0 && (
                                                <span className="ml-2 inline-flex flex-wrap gap-0.5">
                                                    {u.projectNames.slice(0, 3).map(pn => (
                                                        <span key={pn} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                                                            {pn}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </span>
                                        <Plus size={14} className="text-blue-500 shrink-0" />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {selected.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                {t('chat.rooms.selectedMembers')} ({selected.length})
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {selected.map(s => (
                                    <span key={s.email} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full border border-blue-100">
                                        {s.displayName}
                                        <button
                                            type="button"
                                            onClick={() => removeSelected(s.email)}
                                            className="text-blue-400 hover:text-blue-600"
                                            title={t('chat.rooms.remove')}
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-blue-300"
                        >
                            {saving ? (
                                <>
                                    <Loader size={14} className="animate-spin" />
                                    {t('chat.rooms.creating')}
                                </>
                            ) : (
                                <>
                                    <Plus size={14} />
                                    {t('chat.rooms.create')}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ---------------- Quick Phrase Manager modal ----------------
const PhraseManagerModal = ({ phrases, onSave, onClose }) => {
    const [list, setList] = useState(phrases || []);
    const [newText, setNewText] = useState('');
    const [editingIdx, setEditingIdx] = useState(-1);
    const [editText, setEditText] = useState('');

    const persist = (next) => {
        setList(next);
        onSave(next);
    };

    const handleAdd = () => {
        const trimmed = newText.trim();
        if (!trimmed) return;
        persist([...list, trimmed]);
        setNewText('');
    };

    const handleDelete = (idx) => {
        persist(list.filter((_, i) => i !== idx));
        if (editingIdx === idx) {
            setEditingIdx(-1);
            setEditText('');
        }
    };

    const startEdit = (idx) => {
        setEditingIdx(idx);
        setEditText(list[idx]);
    };

    const saveEdit = () => {
        if (editingIdx < 0) return;
        const trimmed = editText.trim();
        if (!trimmed) return;
        const next = list.map((v, i) => i === editingIdx ? trimmed : v);
        persist(next);
        setEditingIdx(-1);
        setEditText('');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[1200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Star size={18} className="text-yellow-500" /> 자주 쓰는 문구 관리
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                    {list.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">아직 저장된 문구가 없습니다.<br/>아래에서 추가해보세요.</p>
                    ) : (
                        <ul className="space-y-2">
                            {list.map((phrase, idx) => (
                                <li key={idx} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg">
                                    {editingIdx === idx ? (
                                        <>
                                            <input
                                                type="text"
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEdit();
                                                    if (e.key === 'Escape') { setEditingIdx(-1); setEditText(''); }
                                                }}
                                                autoFocus
                                                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                            />
                                            <button onClick={saveEdit} className="text-blue-600 hover:text-blue-700 text-xs font-bold px-2 py-1">저장</button>
                                            <button onClick={() => { setEditingIdx(-1); setEditText(''); }} className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1">취소</button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 text-sm text-gray-800 break-words">{phrase}</span>
                                            <button onClick={() => startEdit(idx)} className="text-gray-400 hover:text-blue-600 p-1" title="편집">
                                                <Edit2 size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(idx)} className="text-gray-400 hover:text-red-600 p-1" title="삭제">
                                                <Trash2 size={14} />
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="p-4 border-t flex gap-2">
                    <input
                        type="text"
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        placeholder="새 문구 입력..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={!newText.trim()}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors flex items-center gap-1"
                    >
                        <Plus size={16} /> 추가
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------- Main GlobalChat with rooms ----------------
const GlobalChat = () => {
    const { t } = useTranslation();
    const { currentUser, userProfile, updateUserProfile, isAdmin } = useAuth();
    const [grammarTarget, setGrammarTarget] = useState(null); // { text, lang } or null
    const [liveOpen, setLiveOpen] = useState(false);
    const [minutesOpen, setMinutesOpen] = useState(false);
    const myLang = userProfile?.preferredLanguage || 'ko';
    const myEmail = lower(currentUser?.email);

    const [rooms, setRooms] = useState([]);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [showRoomDropdown, setShowRoomDropdown] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showMembersPanel, setShowMembersPanel] = useState(false);

    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [speakingId, setSpeakingId] = useState(null);
    const [autoVoice, setAutoVoice] = useState(() =>
        typeof window !== 'undefined' && localStorage.getItem('meet4u_autoVoice') === 'true'
    );
    const [uploadingImage, setUploadingImage] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const fileInputRef = useRef(null);

    // Direct Speaking (Memo) State
    const [showDirectSpeak, setShowDirectSpeak] = useState(false);
    const [directSpeakText, setDirectSpeakText] = useState('');
    const [directSpeakLang, setDirectSpeakLang] = useState('ja');
    const [directSpeakResult, setDirectSpeakResult] = useState(null);
    const [directSpeakLoading, setDirectSpeakLoading] = useState(false);

    // Member language map: { email -> preferredLanguage }
    const [memberLangs, setMemberLangs] = useState({});

    const markedAsRead = useRef(new Set());
    const translatingRef = useRef(new Set());
    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const recordingBaseRef = useRef('');
    const spokenIdsRef = useRef(new Set());
    const firstLoadRef = useRef(true);
    const dropdownRef = useRef(null);
    const audioRef = useRef(null); // Google TTS audio element
    const messageInputRef = useRef(null);
    const quickPhrasesRef = useRef(null);

    // Copy-message feedback
    const [copiedId, setCopiedId] = useState(null);

    // Quick phrases (자주 쓰는 문구) — synced via Firestore (users/{uid}.quickPhrases)
    // 모든 디바이스에서 동일하게 보입니다.
    const quickPhrases = useMemo(
        () => Array.isArray(userProfile?.quickPhrases) ? userProfile.quickPhrases : [],
        [userProfile]
    );
    const [showQuickPhrases, setShowQuickPhrases] = useState(false);
    const [showPhraseManager, setShowPhraseManager] = useState(false);

    const persistPhrases = async (next) => {
        try {
            await updateUserProfile({ quickPhrases: next });
        } catch (e) {
            console.error('Failed to save quick phrases:', e);
            alert('자주 쓰는 문구 저장에 실패했습니다.');
        }
    };

    // 1회성 마이그레이션: localStorage에 있던 기존 문구를 Firestore로 옮긴다.
    useEffect(() => {
        if (!currentUser || !userProfile) return;
        // 이미 Firestore에 quickPhrases 필드가 존재하면(빈 배열 포함) 마이그레이션 불필요
        if (userProfile.quickPhrases !== undefined) {
            try { localStorage.removeItem('meet4u_quick_phrases'); } catch { /* ignore */ }
            return;
        }
        let legacy = [];
        try {
            const stored = localStorage.getItem('meet4u_quick_phrases');
            if (stored) legacy = JSON.parse(stored);
        } catch { /* ignore */ }
        if (!Array.isArray(legacy) || legacy.length === 0) return;
        (async () => {
            try {
                await updateUserProfile({ quickPhrases: legacy });
                try { localStorage.removeItem('meet4u_quick_phrases'); } catch { /* ignore */ }
            } catch (e) {
                console.error('Quick phrase migration failed:', e);
            }
        })();
    }, [currentUser, userProfile, updateUserProfile]);

    const insertPhrase = (phrase) => {
        if (!phrase) return;
        setNewMessage(prev => {
            if (!prev) return phrase;
            const sep = prev.endsWith(' ') ? '' : ' ';
            return prev + sep + phrase;
        });
        setShowQuickPhrases(false);
        // Refocus input so user can keep typing
        setTimeout(() => messageInputRef.current?.focus(), 0);
    };

    const copyMessage = async (id, text) => {
        if (!text) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 1500);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    // Close quick-phrases popover when clicking outside
    useEffect(() => {
        if (!showQuickPhrases) return;
        const onDocClick = (e) => {
            if (quickPhrasesRef.current && !quickPhrasesRef.current.contains(e.target)) {
                setShowQuickPhrases(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [showQuickPhrases]);

    // Auto-resize textarea up to ~4 lines
    useEffect(() => {
        const el = messageInputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const max = 112; // ~4 lines
        el.style.height = Math.min(el.scrollHeight, max) + 'px';
    }, [newMessage]);

    // Load rooms the user is a member of
    useEffect(() => {
        if (!currentUser?.email) return;
        const q = query(
            collection(db, 'globalChatRooms'),
            where('members', 'array-contains', myEmail)
        );
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            setRooms(list);
            setRoomsLoading(false);
            // Auto-select first room if none selected
            setSelectedRoomId(prev => {
                if (prev && list.find(r => r.id === prev)) return prev;
                return list[0]?.id || null;
            });
        }, (err) => {
            console.error('rooms load failed', err);
            setRoomsLoading(false);
        });
        return () => unsub();
    }, [currentUser, myEmail]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowRoomDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Load member languages from Firestore
    useEffect(() => {
        const room = rooms.find(r => r.id === selectedRoomId);
        if (!room?.members?.length) return;
        const loadLangs = async () => {
            try {
                const snap = await getDocs(collection(db, 'users'));
                const langMap = {};
                snap.docs.forEach(d => {
                    const data = d.data();
                    if (data.email && room.members.includes(lower(data.email))) {
                        langMap[lower(data.email)] = data.preferredLanguage || 'ko';
                    }
                });
                setMemberLangs(langMap);
            } catch (err) {
                console.error('Failed to load member languages:', err);
            }
        };
        loadLangs();
    }, [rooms, selectedRoomId]);

    // Load messages for selected room
    useEffect(() => {
        if (!selectedRoomId) {
            setMessages([]);
            return;
        }
        setLoadingMsgs(true);
        const q = query(collection(db, 'globalChatRooms', selectedRoomId, 'messages'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
                return (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0);
            });
            setMessages(list);
            setLoadingMsgs(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

            if (currentUser?.email) {
                list.forEach(m => {
                    if (m.senderEmail !== currentUser.email && !markedAsRead.current.has(`${selectedRoomId}:${m.id}`)) {
                        const readBy = m.readBy || [];
                        if (!readBy.includes(myEmail)) {
                            markedAsRead.current.add(`${selectedRoomId}:${m.id}`);
                            updateDoc(doc(db, 'globalChatRooms', selectedRoomId, 'messages', m.id), {
                                readBy: arrayUnion(myEmail)
                            }).catch(() => { });
                        }
                    }
                });
            }
        }, (err) => {
            console.error('messages load failed', err);
            setLoadingMsgs(false);
        });
        return () => unsub();
    }, [selectedRoomId, currentUser, myEmail]);

    // Background translation
    useEffect(() => {
        if (!currentUser || !selectedRoomId) return;
        messages.forEach(async (m) => {
            const isMe = m.senderEmail === currentUser.email;
            if (isMe) return;
            if (!m.text) return; // nothing to translate (image-only message)
            const srcLang = m.sourceLanguage || 'ko';
            if (srcLang === myLang) return;

            // Case 1: Needs translation (no translation yet)
            if (!m.translations?.[myLang]) {
                if (translatingRef.current.has(m.id)) return;
                translatingRef.current.add(m.id);
                try {
                    const res = await fetch('/.netlify/functions/translate-comment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: m.text, sourceLang: srcLang, targetLang: myLang })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.translatedText) {
                            const updateData = {
                                [`translations.${myLang}`]: data.translatedText
                            };
                            if (data.pronunciation) {
                                updateData[`pronunciations.${myLang}`] = data.pronunciation;
                            }
                            await updateDoc(doc(db, 'globalChatRooms', selectedRoomId, 'messages', m.id), updateData);
                        }
                    }
                } catch (err) {
                    console.error("translation fail:", err);
                    translatingRef.current.delete(m.id);
                }
                return;
            }

            // Case 2: Has translation but missing pronunciation — backfill
            if (m.translations[myLang] && !m.pronunciations?.[myLang]) {
                const pronKey = `pron_${m.id}`;
                if (translatingRef.current.has(pronKey)) return;
                translatingRef.current.add(pronKey);
                try {
                    const translatedText = m.translations[myLang];
                    let pronunciation = '';

                    if (isLatinScript(myLang)) {
                        // Latin-script target (fr/en/de/es/it/pt/vi/…): Google's
                        // dt=rm returns nothing useful, so transliterate the
                        // translated text directly into Hangul.
                        pronunciation = latinToHangul(translatedText, myLang);
                    } else if (isNonLatinScript(myLang)) {
                        // Non-Latin target: fetch romanization from Google.
                        const romanUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(myLang)}&tl=en&dt=rm&q=${encodeURIComponent(translatedText)}`;
                        const romanRes = await fetch(romanUrl);
                        if (romanRes.ok) {
                            const romanData = await romanRes.json();
                            if (romanData && romanData[0]) {
                                const parts = romanData[0]
                                    .filter(seg => seg)
                                    .map(seg => seg[3] || seg[2] || '')
                                    .filter(Boolean);
                                pronunciation = parts.join(' ').trim();
                            }
                        }
                    }

                    if (pronunciation) {
                        await updateDoc(doc(db, 'globalChatRooms', selectedRoomId, 'messages', m.id), {
                            [`pronunciations.${myLang}`]: pronunciation
                        });
                    }
                } catch (err) {
                    console.error("pronunciation backfill fail:", err);
                    translatingRef.current.delete(pronKey);
                }
            }
        });
    }, [messages, myLang, currentUser, selectedRoomId]);

    // Cleanup STT/TTS on unmount
    useEffect(() => {
        return () => {
            try { recognitionRef.current?.stop(); } catch (_) { /* ignore */ }
            try { audioRef.current?.pause(); audioRef.current = null; } catch (_) { /* ignore */ }
        };
    }, []);

    // Reset auto-voice tracking when switching rooms (don't narrate history)
    useEffect(() => {
        firstLoadRef.current = true;
        spokenIdsRef.current = new Set();
        try { audioRef.current?.pause(); audioRef.current = null; } catch (_) { /* ignore */ }
    }, [selectedRoomId]);

    // Persist auto-voice toggle
    useEffect(() => {
        try { localStorage.setItem('meet4u_autoVoice', autoVoice ? 'true' : 'false'); } catch (_) { /* ignore */ }
    }, [autoVoice]);

    // When enabling, mark current messages as already spoken
    useEffect(() => {
        if (autoVoice) {
            messages.forEach(m => spokenIdsRef.current.add(m.id));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoVoice]);

    // Google Translate TTS가 지원하지 않는 언어 — 브라우저 네이티브 speechSynthesis로 fallback
    const GOOGLE_TTS_UNSUPPORTED = new Set(['mn']);
    const isGoogleTTSSupported = (lang) => {
        if (!lang) return true;
        const base = lang.split('-')[0];
        return !GOOGLE_TTS_UNSUPPORTED.has(lang) && !GOOGLE_TTS_UNSUPPORTED.has(base);
    };

    // Google Translate TTS 는 요청당 ~200자 제한이 있어서 긴 문장은
    // 문장/절 단위로 잘라 순차 재생해야 끝까지 들린다.
    const chunkTextForTTS = (text, maxLen = 190) => {
        const out = [];
        // 문장 경계로 우선 분리 (영/한/중/일 종결부호 모두).
        const sentences = String(text).split(/(?<=[.!?。！？…])\s+/);
        for (const raw of sentences) {
            let s = raw.trim();
            if (!s) continue;
            if (s.length <= maxLen) { out.push(s); continue; }
            // 문장이 너무 길면 콤마·공백 기준으로 재분할.
            while (s.length > maxLen) {
                let cut = -1;
                const win = s.slice(0, maxLen + 1);
                cut = Math.max(
                    win.lastIndexOf(', '),
                    win.lastIndexOf('; '),
                    win.lastIndexOf(': '),
                    win.lastIndexOf('、'),
                    win.lastIndexOf('，'),
                );
                if (cut < 40) cut = win.lastIndexOf(' ');
                if (cut < 40) cut = maxLen;
                out.push(s.slice(0, cut + 1).trim());
                s = s.slice(cut + 1).trim();
            }
            if (s) out.push(s);
        }
        return out.filter(Boolean);
    };

    // Helper: play TTS via Google Translate proxy (works on ALL browsers).
    // 긴 텍스트는 문장 단위로 나눠 순차 재생하도록 컨트롤러를 리턴한다.
    // 반환 객체는 HTMLAudioElement 와 유사 인터페이스(.play/.pause/onended/onerror)
    // 를 노출해 기존 호출부와 호환된다.
    const playGoogleTTS = (text, lang) => {
        if (!text) return null;
        const locale = lang || 'ko';
        const chunks = chunkTextForTTS(text, 190);
        if (chunks.length === 0) return null;

        let idx = 0;
        let currentAudio = null;
        let stopped = false;
        let playedOne = false;
        const handlers = { onended: null, onerror: null };

        const buildUrl = (chunk) =>
            `/.netlify/functions/text-to-speech?text=${encodeURIComponent(chunk)}&lang=${encodeURIComponent(locale)}`;

        const playNext = () => {
            if (stopped) return Promise.resolve();
            if (idx >= chunks.length) {
                try { handlers.onended?.(); } catch (_) { /* ignore */ }
                return Promise.resolve();
            }
            const audio = new Audio(buildUrl(chunks[idx++]));
            currentAudio = audio;
            audio.onended = () => {
                playedOne = true;
                currentAudio = null;
                playNext();
            };
            audio.onerror = () => {
                currentAudio = null;
                if (playedOne) {
                    // 앞 청크는 이미 재생됐다 — 조용히 종료.
                    try { handlers.onended?.(); } catch (_) { /* ignore */ }
                } else {
                    try { handlers.onerror?.(); } catch (_) { /* ignore */ }
                }
            };
            return audio.play().catch((err) => {
                currentAudio = null;
                if (playedOne) {
                    try { handlers.onended?.(); } catch (_) { /* ignore */ }
                } else {
                    throw err;
                }
            });
        };

        return {
            get onended() { return handlers.onended; },
            set onended(fn) { handlers.onended = fn; },
            get onerror() { return handlers.onerror; },
            set onerror(fn) { handlers.onerror = fn; },
            play() { return playNext(); },
            pause() {
                stopped = true;
                try { currentAudio?.pause(); } catch (_) { /* ignore */ }
                currentAudio = null;
            },
        };
    };

    // Native browser speech synthesis (fallback for unsupported langs)
    const playNativeTTS = (text, lang, onEnd) => {
        if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
            onEnd?.();
            return false;
        }
        try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = SPEECH_LOCALE[lang] || lang || 'ko-KR';
            if (onEnd) {
                utter.onend = onEnd;
                utter.onerror = onEnd;
            }
            window.speechSynthesis.speak(utter);
            return true;
        } catch (e) {
            console.error('Native TTS failed:', e);
            onEnd?.();
            return false;
        }
    };

    // Auto-voice playback for new incoming messages
    useEffect(() => {
        if (firstLoadRef.current && messages.length > 0) {
            firstLoadRef.current = false;
            messages.forEach(m => spokenIdsRef.current.add(m.id));
            return;
        }
        if (!autoVoice || !currentUser) return;

        messages.forEach(m => {
            if (spokenIdsRef.current.has(m.id)) return;
            const isMe = m.senderEmail === currentUser.email;
            if (isMe) {
                spokenIdsRef.current.add(m.id);
                return;
            }
            // Skip image-only messages
            if (m.imageUrl && !m.text) {
                spokenIdsRef.current.add(m.id);
                return;
            }
            const srcLang = m.sourceLanguage || 'ko';
            const needsTranslation = srcLang !== myLang;
            const translated = m.translations?.[myLang];
            if (needsTranslation && !translated) return;

            spokenIdsRef.current.add(m.id);
            const textToSpeak = translated || m.text;
            if (!textToSpeak) return;

            if (!isGoogleTTSSupported(myLang)) {
                playNativeTTS(textToSpeak, myLang);
                return;
            }
            const audio = playGoogleTTS(textToSpeak, myLang);
            if (audio) {
                audio.onerror = () => playNativeTTS(textToSpeak, myLang);
                audio.play().catch(() => playNativeTTS(textToSpeak, myLang));
            }
        });
    }, [messages, autoVoice, myLang, currentUser]);

    const selectedRoom = useMemo(
        () => rooms.find(r => r.id === selectedRoomId) || null,
        [rooms, selectedRoomId]
    );
    const isOwner = selectedRoom?.createdBy === myEmail;

    const toggleRecording = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert(t('meeting.voiceUnsupportedInput'));
            return;
        }
        if (isRecording) {
            try { recognitionRef.current?.stop(); } catch (_) { /* ignore */ }
            setIsRecording(false);
            return;
        }

        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        const isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(ua);
        // Edge는 continuous 모드에서 음성 감지 실패 시 즉시 onend가 발생해 녹음이 바로 중지된 것처럼 보이므로 단발 세션으로 동작시킨다.
        const isEdge = /Edg\//i.test(ua);
        const recognition = new SpeechRecognition();
        recognition.lang = SPEECH_LOCALE[myLang] || 'ko-KR';
        recognition.interimResults = true;
        recognition.continuous = !(isMobile || isEdge);

        recordingBaseRef.current = newMessage ? newMessage.trimEnd() + (newMessage ? ' ' : '') : '';

        recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';
            for (let i = 0; i < event.results.length; i++) {
                const r = event.results[i];
                const tr = r[0]?.transcript || '';
                if (r.isFinal) finalText += tr;
                else interimText += tr;
            }
            setNewMessage(recordingBaseRef.current + finalText + interimText);
        };
        recognition.onerror = (e) => {
            const code = e?.error || 'unknown';
            console.error('Speech recognition error:', code, e);
            if (code === 'not-allowed' || code === 'service-not-allowed') {
                alert(t('meeting.voiceUnsupportedInput'));
            } else if (code === 'network') {
                alert(t('meeting.voiceNetworkError'));
            } else if (code === 'language-not-supported') {
                alert(t('meeting.voiceLangUnsupported', { lang: recognition.lang }));
            } else if (code !== 'no-speech' && code !== 'aborted') {
                alert(t('meeting.voiceGenericError', { code }));
            }
            setIsRecording(false);
        };
        recognition.onend = () => setIsRecording(false);

        try {
            recognition.start();
            recognitionRef.current = recognition;
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recognition:', err);
            setIsRecording(false);
        }
    };

    const stopAllPlayback = () => {
        try { audioRef.current?.pause(); audioRef.current = null; } catch (_) { /* ignore */ }
        try { window.speechSynthesis?.cancel(); } catch (_) { /* ignore */ }
    };

    const speakMessage = (id, text, lang) => {
        // Toggle off if already playing this message
        if (speakingId === id) {
            stopAllPlayback();
            setSpeakingId(null);
            return;
        }
        // Stop any current playback
        stopAllPlayback();
        setSpeakingId(id);

        // Mongolian and other Google-TTS-unsupported langs: native fallback
        if (!isGoogleTTSSupported(lang)) {
            const ok = playNativeTTS(text, lang, () => setSpeakingId(null));
            if (!ok) setSpeakingId(null);
            return;
        }

        const audio = playGoogleTTS(text, lang);
        if (!audio) {
            setSpeakingId(null);
            return;
        }
        audioRef.current = audio;
        audio.onended = () => { setSpeakingId(null); audioRef.current = null; };
        // If Google TTS proxy fails (e.g., Google rejects the language),
        // automatically fall back to the browser's native speech synthesis.
        audio.onerror = () => {
            audioRef.current = null;
            const ok = playNativeTTS(text, lang, () => setSpeakingId(null));
            if (!ok) setSpeakingId(null);
        };
        audio.play().catch(() => {
            audioRef.current = null;
            const ok = playNativeTTS(text, lang, () => setSpeakingId(null));
            if (!ok) setSpeakingId(null);
        });
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || !selectedRoomId) return;
        const senderName = currentUser.displayName || currentUser.email.split('@')[0];
        const textToSend = newMessage;
        try {
            await addDoc(collection(db, 'globalChatRooms', selectedRoomId, 'messages'), {
                text: textToSend,
                senderEmail: currentUser.email,
                senderName,
                sourceLanguage: myLang,
                timestamp: serverTimestamp(),
                readBy: [myEmail],
            });
            setNewMessage('');

            // Fire background push to other room members
            const recipientEmails = (selectedRoom?.members || []).filter(e => e && e !== myEmail);
            const roomName = selectedRoom?.name || '';
            if (recipientEmails.length > 0) {
                fetch('/.netlify/functions/send-notification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'globalChat',
                        title: roomName
                            ? `💬 [${roomName}] ${senderName}`
                            : `💬 ${senderName}`,
                        body: textToSend.length > 100 ? textToSend.slice(0, 100) + '...' : textToSend,
                        recipientEmails,
                        senderEmail: currentUser.email,
                    }),
                }).catch(err => console.error('Global chat push failed:', err));
            }
        } catch (err) {
            console.error('send failed', err);
            alert(`${t('meeting.errorOccurred')}: ${err.message}`);
        }
    };

    const handleImageFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !currentUser || !selectedRoomId) return;

        if (file.size > 20 * 1024 * 1024) {
            alert(t('common.imageTooLarge'));
            return;
        }

        setUploadingImage(true);
        try {
            const { blob, width, height } = await compressImageToWebp(file, { maxDim: 1280, quality: 0.82 });
            const path = `globalChatImages/${selectedRoomId}/${currentUser.uid}/${Date.now()}.webp`;
            const sRef = storageRef(storage, path);
            await uploadBytes(sRef, blob, { contentType: 'image/webp' });
            const url = await getDownloadURL(sRef);

            const senderName = currentUser.displayName || currentUser.email.split('@')[0];
            await addDoc(collection(db, 'globalChatRooms', selectedRoomId, 'messages'), {
                text: '',
                imageUrl: url,
                imagePath: path,
                imageWidth: width,
                imageHeight: height,
                senderEmail: currentUser.email,
                senderName,
                sourceLanguage: myLang,
                timestamp: serverTimestamp(),
                readBy: [myEmail],
            });

            // Push notification
            const recipientEmails = (selectedRoom?.members || []).filter(e => e && e !== myEmail);
            const roomName = selectedRoom?.name || '';
            if (recipientEmails.length > 0) {
                fetch('/.netlify/functions/send-notification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'globalChat',
                        title: roomName ? `📷 [${roomName}] ${senderName}` : `📷 ${senderName}`,
                        body: '사진을 보냈습니다',
                        recipientEmails,
                        senderEmail: currentUser.email,
                    }),
                }).catch(() => { });
            }
        } catch (err) {
            console.error('image upload failed', err);
            alert(t('common.imageFailed'));
        } finally {
            setUploadingImage(false);
        }
    };

    const handleDirectSpeakTranslate = async () => {
        if (!directSpeakText.trim()) return;
        setDirectSpeakLoading(true);
        try {
            // 1단계: 번역만 가져온다 (sl=내언어, tl=대상언어)
            const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${myLang}&tl=${directSpeakLang}&dt=t&q=${encodeURIComponent(directSpeakText)}`;
            const transRes = await fetch(translateUrl);
            const transData = await transRes.json();

            let translated = '';
            if (transData && transData[0] && transData[0].length > 0) {
                translated = transData[0].filter(item => item[0]).map(item => item[0]).join('');
            }

            // 2단계: 번역문(대상 언어)의 로마자를 별도 호출로 가져온다.
            // sl=대상언어로 두면 lastItem[2]이 대상 언어의 로마자가 된다.
            // 대상 언어가 이미 라틴 문자면 호출 생략.
            const NON_LATIN_TARGETS = new Set([
                'ko', 'ja', 'zh', 'zh-CN', 'zh-TW',
                'th', 'ar', 'ru', 'el', 'hi', 'km', 'mn', 'he', 'bn', 'ta', 'fa', 'ur'
            ]);
            let roman = '';
            if (translated && NON_LATIN_TARGETS.has(directSpeakLang)) {
                try {
                    const romanUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${directSpeakLang}&tl=en&dt=rm&q=${encodeURIComponent(translated)}`;
                    const romanRes = await fetch(romanUrl);
                    const romanData = await romanRes.json();
                    if (romanData && romanData[0] && romanData[0].length > 0) {
                        const lastItem = romanData[0][romanData[0].length - 1];
                        if (lastItem) {
                            roman = lastItem[2] || lastItem[3] || '';
                        }
                    }
                } catch (romanErr) {
                    console.warn('Romanization fetch failed (translation OK):', romanErr);
                }
            }

            // 한국어 발음 가이드:
            //   - 일본어: Google 로마자 → 카나 한글 음차
            //   - 중국어: Google 병음 → 한글 음차
            //   - 그 외 비라틴(러시아어/태국어/아랍어 등): Google 로마자를 그대로 보여줌
            //   - 라틴 문자 언어(프/영/독/스/이/포/베…): 번역문 자체를 한글로 음차
            let hangul = '';
            if (directSpeakLang === 'ja') {
                hangul = romajiToHangul(roman);
            } else if (directSpeakLang === 'zh-CN' || directSpeakLang === 'zh') {
                hangul = pinyinToHangul(roman);
            } else if (isLatinScript(directSpeakLang)) {
                hangul = latinToHangul(translated, directSpeakLang);
            }
            // 라틴 문자 언어는 Google 로마자가 비어있으므로, 음차한 한글을 로마자 칸 대신 노출.
            if (!roman && isLatinScript(directSpeakLang)) {
                roman = '';
            }

            setDirectSpeakResult({
                translated,
                roman,
                hangul
            });
        } catch (err) {
            console.error('Direct speak translation failed:', err);
            alert(t('meeting.errorOccurred'));
        } finally {
            setDirectSpeakLoading(false);
        }
    };

    const handleDeleteMessage = async (msgId) => {
        if (!window.confirm(t('meeting.confirmDeleteComment'))) return;
        try {
            const msg = messages.find(m => m.id === msgId);
            await deleteDoc(doc(db, 'globalChatRooms', selectedRoomId, 'messages', msgId));
            if (msg?.imagePath) {
                deleteObject(storageRef(storage, msg.imagePath)).catch(() => { });
            }
        } catch (err) {
            console.error('delete message failed', err);
            alert(t('meeting.deleteCommentFailed'));
        }
    };

    const deleteRoomById = async (room) => {
        if (!room || room.createdBy !== myEmail) return;
        if (!window.confirm(`${t('chat.rooms.confirmDelete')}\n\n"${room.name || ''}"`)) return;
        try {
            const msgsSnap = await getDocs(collection(db, 'globalChatRooms', room.id, 'messages'));
            const chunks = [];
            for (let i = 0; i < msgsSnap.docs.length; i += 400) {
                chunks.push(msgsSnap.docs.slice(i, i + 400));
            }
            for (const ch of chunks) {
                const batch = writeBatch(db);
                ch.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            await deleteDoc(doc(db, 'globalChatRooms', room.id));
            if (selectedRoomId === room.id) {
                setSelectedRoomId(null);
                setShowMembersPanel(false);
            }
        } catch (err) {
            console.error('delete room failed', err);
            alert(t('chat.rooms.deleteFailed'));
        }
    };

    const leaveRoomById = async (room) => {
        if (!room || room.createdBy === myEmail) return;
        if (!window.confirm(`${t('chat.rooms.confirmLeave')}\n\n"${room.name || ''}"`)) return;
        try {
            await updateDoc(doc(db, 'globalChatRooms', room.id), {
                members: arrayRemove(myEmail),
            });
            if (selectedRoomId === room.id) {
                setSelectedRoomId(null);
                setShowMembersPanel(false);
            }
        } catch (err) {
            console.error('leave room failed', err);
            alert(t('chat.rooms.leaveFailed'));
        }
    };

    const handleDeleteRoom = () => deleteRoomById(selectedRoom);
    const handleLeaveRoom = () => leaveRoomById(selectedRoom);

    const getOtherSenders = () => {
        const s = new Set();
        messages.forEach(m => {
            if (m.senderEmail && m.senderEmail !== currentUser?.email) {
                s.add(lower(m.senderEmail));
            }
        });
        return s;
    };

    const getReadStatus = (m) => {
        const readBy = (m.readBy || []).map(lower);
        const others = getOtherSenders();
        if (others.size === 0) return null;
        const read = [...others].filter(e => readBy.includes(e));
        if (read.length === 0) return null;
        if (read.length >= others.size) return 'all';
        return 'some';
    };

    // -------------- Render --------------
    return (
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex flex-col h-[32rem]">
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                <MessageSquare size={18} className="text-gray-700 shrink-0" />

                {/* Room selector */}
                <div className="relative flex-1 min-w-0" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => setShowRoomDropdown(v => !v)}
                        disabled={!currentUser}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-blue-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                        <span className="truncate font-bold text-gray-800">
                            {roomsLoading
                                ? t('common.loading')
                                : (selectedRoom?.name || t('chat.rooms.selectRoom'))}
                        </span>
                        <ChevronDown size={14} className="text-gray-400 shrink-0" />
                    </button>
                    {showRoomDropdown && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                            {rooms.length === 0 ? (
                                <div className="p-3 text-xs text-gray-400 text-center">
                                    {t('chat.rooms.noRooms')}
                                </div>
                            ) : (
                                rooms.map(r => {
                                    const isOwned = r.createdBy === myEmail;
                                    return (
                                        <div
                                            key={r.id}
                                            className={`group flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-blue-50 ${r.id === selectedRoomId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'}`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedRoomId(r.id); setShowRoomDropdown(false); }}
                                                className="flex-1 min-w-0 flex items-center justify-between text-left px-1"
                                            >
                                                <span className="truncate">{r.name}</span>
                                                <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                                                    {(r.members?.length || 0)}
                                                    {isOwned && <span className="ml-1 text-amber-600">★</span>}
                                                </span>
                                            </button>
                                            {isOwned ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); deleteRoomById(r); }}
                                                    className="shrink-0 p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-60 group-hover:opacity-100 transition"
                                                    title={t('chat.rooms.deleteRoom')}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); leaveRoomById(r); }}
                                                    className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-60 group-hover:opacity-100 transition"
                                                    title={t('chat.rooms.leaveRoom')}
                                                >
                                                    <LogOut size={14} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* Members button */}
                {selectedRoom && (
                    <button
                        type="button"
                        onClick={() => setShowMembersPanel(v => !v)}
                        className={`shrink-0 p-1.5 rounded-lg border transition-colors ${showMembersPanel ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                        title={t('chat.rooms.members')}
                    >
                        <Users size={16} />
                    </button>
                )}

                {/* Auto-voice toggle */}
                <button
                    type="button"
                    onClick={() => {
                        setAutoVoice(v => {
                            const next = !v;
                            if (!next && typeof window !== 'undefined' && window.speechSynthesis) {
                                window.speechSynthesis.cancel();
                            }
                            return next;
                        });
                    }}
                    className={`shrink-0 p-1.5 rounded-lg border transition-colors ${autoVoice ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                    title={autoVoice ? t('chat.autoVoiceOff', '자동 음성 끄기') : t('chat.autoVoiceOn', '자동 음성 켜기')}
                >
                    {autoVoice ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>

                {/* Direct Speak Toggle */}
                <button
                    type="button"
                    onClick={() => setShowDirectSpeak(v => !v)}
                    className={`shrink-0 p-1.5 rounded-lg border transition-colors ${showDirectSpeak ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                    title="내가 직접 말하기 (메모/발음 연습)"
                >
                    <MessageSquare size={16} />
                </button>

                {/* Live Translator (Gemini Live API) */}
                <button
                    type="button"
                    onClick={() => setLiveOpen(true)}
                    disabled={!currentUser}
                    className="shrink-0 p-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-40"
                    title="라이브 통역 — 마이크로 말하면 상대 언어로 실시간 통역"
                >
                    <Radio size={16} />
                </button>

                {/* Meeting Minutes — 이 방의 대화를 기간별로 회의록 마크다운으로 정리 */}
                <button
                    type="button"
                    onClick={() => setMinutesOpen(true)}
                    disabled={!currentUser || !selectedRoomId}
                    className="shrink-0 p-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-40"
                    title="회의록 만들기 — 기간을 골라 마크다운 회의록 생성"
                >
                    <FileText size={16} />
                </button>

                {/* New room button */}
                <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    disabled={!currentUser}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                    title={t('chat.rooms.newRoom')}
                >
                    <Plus size={14} />
                    <span className="hidden sm:inline">{t('chat.rooms.newRoom')}</span>
                </button>
            </div>

            {/* Members panel */}
            {showMembersPanel && selectedRoom && (
                <div className="mb-3 p-3 bg-white border border-gray-200 rounded-lg text-xs">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-gray-700">
                            {t('chat.rooms.members')} ({selectedRoom.members?.length || 0})
                        </span>
                        <div className="flex items-center gap-1.5">
                            {isOwner ? (
                                <button
                                    type="button"
                                    onClick={handleDeleteRoom}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 size={12} />
                                    {t('chat.rooms.deleteRoom')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleLeaveRoom}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100"
                                >
                                    <LogOut size={12} />
                                    {t('chat.rooms.leaveRoom')}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {(selectedRoom.members || []).map(memEmail => {
                            const isOwnerMember = memEmail === selectedRoom.createdBy;
                            const isSelf = memEmail === myEmail;
                            const displayName = selectedRoom.memberNames?.[memEmail] || memEmail.split('@')[0];
                            const memLang = memberLangs[memEmail] || 'ko';
                            return (
                                <span
                                    key={memEmail}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${isOwnerMember ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
                                >
                                    {displayName}
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-white/60 border border-gray-200 text-gray-500 whitespace-nowrap" title={LANG_LABEL[memLang] || memLang}>
                                        {LANG_FLAG[memLang] || '🌐'} {LANG_LABEL[memLang] || memLang}
                                    </span>
                                    {isSelf && <span className="text-[10px] text-gray-400">({t('chat.rooms.you')})</span>}
                                    {isOwnerMember && <span className="text-[10px]">★</span>}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Direct Speak panel */}
            {showDirectSpeak && selectedRoom && (
                <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm flex flex-col gap-2 relative shadow-sm">
                    <button 
                        type="button" 
                        onClick={() => setShowDirectSpeak(false)}
                        className="absolute top-2 right-2 p-1 text-indigo-400 hover:text-indigo-600 rounded-md"
                    >
                        <X size={16} />
                    </button>
                    <div className="font-bold text-indigo-700 flex items-center gap-1.5 mb-1">
                        <MessageSquare size={16} /> Korean -&gt; Other (Speak)
                    </div>
                    <div className="flex gap-2">
                        <textarea 
                            value={directSpeakText}
                            onChange={(e) => setDirectSpeakText(e.target.value)}
                            placeholder="한국어로 입력하세요..."
                            className="flex-1 p-2 border border-indigo-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none h-20 bg-white"
                        />
                        <div className="flex flex-col gap-2 w-32 shrink-0">
                            <select 
                                value={directSpeakLang}
                                onChange={(e) => setDirectSpeakLang(e.target.value)}
                                className="w-full p-2 border border-indigo-200 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {/* Languages used by room members (excluding my own) */}
                                {(() => {
                                    const memberLangSet = new Set(
                                        Object.entries(memberLangs)
                                            .filter(([email]) => email !== myEmail)
                                            .map(([, lang]) => lang)
                                    );
                                    const memberOptions = [...memberLangSet].map(code => (
                                        <option key={`mem-${code}`} value={code}>
                                            ★ {LANG_FLAG[code] || '🌐'} {LANG_LABEL[code] || code}
                                        </option>
                                    ));
                                    const otherOptions = Object.keys(LANG_LABEL)
                                        .filter(code => code !== myLang && !memberLangSet.has(code))
                                        .map(code => (
                                            <option key={code} value={code}>
                                                {LANG_FLAG[code] || '🌐'} {LANG_LABEL[code] || code}
                                            </option>
                                        ));
                                    return (
                                        <>
                                            {memberOptions.length > 0 && (
                                                <optgroup label="참여자 언어">
                                                    {memberOptions}
                                                </optgroup>
                                            )}
                                            <optgroup label="기타 언어">
                                                {otherOptions}
                                            </optgroup>
                                        </>
                                    );
                                })()}
                            </select>
                            <button 
                                type="button"
                                onClick={handleDirectSpeakTranslate}
                                disabled={!directSpeakText.trim() || directSpeakLoading}
                                className="w-full flex-1 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                            >
                                {directSpeakLoading ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                                번역·발음
                            </button>
                        </div>
                    </div>
                    {directSpeakResult && (
                        <div className="mt-2 p-3 bg-white rounded-lg border border-indigo-100 flex flex-col gap-2 shadow-inner">
                            {/* Translated text with TTS */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-semibold">
                                        {LANG_FLAG[directSpeakLang] || '🌐'} {LANG_LABEL[directSpeakLang] || directSpeakLang}
                                    </span>
                                    <span className="text-gray-800 font-medium text-base">
                                        {directSpeakResult.translated}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => speakMessage('direct-speak', directSpeakResult.translated, directSpeakLang)}
                                    className={`shrink-0 p-1.5 rounded-md transition-colors ${speakingId === 'direct-speak' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                    title="발음 듣기"
                                >
                                    <Volume2 size={16} />
                                </button>
                            </div>
                            {/* Romanization */}
                            {directSpeakResult.roman && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-semibold shrink-0">로마자</span>
                                    <span className="text-sm text-indigo-600 font-mono tracking-wide">{directSpeakResult.roman}</span>
                                </div>
                            )}
                            {/* Korean pronunciation guide */}
                            {directSpeakResult.hangul && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-600 font-semibold shrink-0">한글발음</span>
                                    <span className="text-sm font-bold text-teal-700">{directSpeakResult.hangul}</span>
                                </div>
                            )}
                            {/* Original Korean text */}
                            <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold shrink-0">🇰🇷 원문</span>
                                <span className="text-xs text-gray-500">{directSpeakText}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {!currentUser && (
                    <p className="text-center text-gray-400 text-sm py-10">{t('global.loginRequired')}</p>
                )}
                {currentUser && !selectedRoom && !roomsLoading && (
                    <div className="text-center text-gray-400 text-sm py-10">
                        <p>{t('chat.rooms.noRooms')}</p>
                        <p className="mt-1">{t('chat.rooms.selectRoomHint')}</p>
                    </div>
                )}
                {selectedRoom && loadingMsgs && (
                    <p className="text-center text-gray-400 text-sm">{t('common.loading')}</p>
                )}
                {selectedRoom && !loadingMsgs && messages.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-10">{t('meeting.noCommentsYet')}</p>
                )}
                {selectedRoom && messages.map(m => {
                    const isMe = m.senderEmail === currentUser?.email;
                    const readStatus = isMe ? getReadStatus(m) : null;
                    const isTranslated = !isMe && m.translations && m.translations[myLang] && m.translations[myLang] !== m.text;
                    const srcLang = m.sourceLanguage || 'ko';
                    const isTranslating = !isMe && !m.translations?.[myLang] && srcLang !== myLang;
                    const displayText = isMe ? m.text : (m.translations?.[myLang] || m.text);
                    const ttsText = isMe ? m.text : displayText;
                    const ttsLang = isMe ? srcLang : myLang;
                    const pronunciation = !isMe
                        ? (m.pronunciations?.[myLang] || getPronunciationDisplay({
                            translatedText: m.translations?.[myLang],
                            targetLang: myLang,
                            romanFromServer: '',
                        }))
                        : null;

                    return (
                        <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {isMe && (
                                    <button
                                        onClick={() => handleDeleteMessage(m.id)}
                                        className="text-gray-400 hover:text-red-500 p-0.5"
                                        title={t('meeting.deleteBtn')}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                                <span className="text-xs font-bold text-gray-700">{m.senderName}</span>
                                <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500" title={LANG_LABEL[srcLang] || srcLang}>
                                    {LANG_FLAG[srcLang] || '🌐'}{LANG_LABEL[srcLang] || srcLang}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    {m.timestamp ? format(m.timestamp.toDate(), 'a h:mm', { locale: ko }) : ''}
                                </span>
                            </div>
                            <div className={`flex items-start gap-1.5 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                {m.imageUrl ? (
                                    <button
                                        type="button"
                                        onClick={() => setLightboxSrc(m.imageUrl)}
                                        className={`overflow-hidden rounded-lg border ${isMe ? 'border-blue-200' : 'border-gray-200'} shadow-sm`}
                                        style={{ maxWidth: '220px' }}
                                    >
                                        <img
                                            src={m.imageUrl}
                                            alt=""
                                            loading="lazy"
                                            className="block max-w-[220px] max-h-[260px] object-cover"
                                        />
                                    </button>
                                ) : (
                                    <div className={`px-3 py-2 rounded-lg text-sm break-words ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'}`}>
                                        {displayText}
                                        {isTranslated && (
                                            <div className="text-[9px] text-gray-400 mt-1 flex flex-col gap-0.5 border-t border-gray-100 pt-1">
                                                <div className="flex items-center gap-1">
                                                    {t('meeting.translated')} ({t('meeting.original')}: {m.text})
                                                </div>
                                                {pronunciation && (
                                                    <div className="flex items-center gap-1 text-purple-500">
                                                        <span className="font-semibold">발음:</span>
                                                        <span className="font-mono tracking-wide">{pronunciation}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {isTranslating && (
                                            <div className="text-[9px] text-gray-300 mt-1 italic">
                                                {t('meeting.translating')}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!m.imageUrl && (
                                    <div className="flex flex-col gap-0.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => speakMessage(m.id, ttsText, ttsLang)}
                                            className={`p-1.5 rounded-full transition-colors ${speakingId === m.id ? 'bg-blue-100 text-blue-600 animate-pulse' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                                            title={speakingId === m.id ? t('meeting.ttsStop') : t('meeting.ttsPlay')}
                                        >
                                            {speakingId === m.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => copyMessage(m.id, displayText)}
                                            className={`p-1.5 rounded-full transition-colors ${copiedId === m.id ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                                            title={copiedId === m.id ? '복사됨' : '복사'}
                                        >
                                            {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                        {displayText && (
                                            <button
                                                type="button"
                                                onClick={() => setGrammarTarget({
                                                    text: displayText,
                                                    lang: ttsLang,
                                                    pronunciation: pronunciation || '',
                                                    // 원문이 한국어이고 보고 있는 언어가 한국어가 아니면, 한국어 원문 분석도 함께 보여준다.
                                                    koreanOriginal: (srcLang === 'ko' && ttsLang !== 'ko' && m.text) ? m.text : '',
                                                })}
                                                className="p-1.5 rounded-full transition-colors text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                title="문법 분석"
                                            >
                                                <BookOpen size={14} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            {isMe && readStatus && (
                                <div className={`flex items-center gap-1 mt-1 text-[10px] ${readStatus === 'all' ? 'text-blue-500' : 'text-gray-400'}`}>
                                    <CheckCheck size={12} />
                                    <span>{readStatus === 'all' ? t('meeting.allRead') : t('meeting.someRead')}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="relative flex items-end gap-2 mt-3">
                {/* Quick phrases popover */}
                {showQuickPhrases && (
                    <div ref={quickPhrasesRef} className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-h-60 overflow-y-auto z-30">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                                <Star size={12} className="text-yellow-500" /> 자주 쓰는 문구
                            </span>
                            <button
                                type="button"
                                onClick={() => { setShowQuickPhrases(false); setShowPhraseManager(true); }}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                                <Edit2 size={11} /> 관리
                            </button>
                        </div>
                        {quickPhrases.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-3">저장된 문구가 없습니다.<br/>관리에서 추가하세요.</p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {quickPhrases.map((phrase, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => insertPhrase(phrase)}
                                        className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 transition-colors"
                                    >
                                        {phrase}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setShowQuickPhrases(v => !v)}
                    disabled={!currentUser || !selectedRoomId}
                    className={`p-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 ${showQuickPhrases ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 hover:text-yellow-600'}`}
                    title="자주 쓰는 문구"
                >
                    <Star size={18} />
                </button>
                <textarea
                    ref={messageInputRef}
                    rows={1}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleSend(e);
                        }
                    }}
                    placeholder={isRecording ? t('meeting.voiceListening') : t('meeting.commentPlaceholder')}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 resize-none leading-6"
                    style={{ minHeight: '40px', maxHeight: '112px' }}
                    disabled={!currentUser || !selectedRoomId}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageFileChange}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!currentUser || !selectedRoomId || uploadingImage}
                    className="p-2 rounded-lg transition-colors shadow-sm bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    title={t('common.attachImage')}
                >
                    {uploadingImage ? <Loader size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                </button>
                <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={!currentUser || !selectedRoomId}
                    className={`relative p-2 rounded-lg transition-all shadow-sm disabled:opacity-50 ${isRecording ? 'bg-gradient-to-br from-red-500 to-pink-600 text-white ring-2 ring-red-300 animate-pulse' : 'bg-gradient-to-br from-orange-400 to-red-500 text-white hover:from-orange-500 hover:to-red-600'}`}
                    title={isRecording ? t('meeting.micStop') : t('meeting.micStart')}
                >
                    <Mic size={18} />
                    {isRecording && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-ping"></span>
                    )}
                </button>
                <button
                    type="submit"
                    disabled={!newMessage.trim() || !currentUser || !selectedRoomId}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    <Send size={18} />
                </button>
            </form>

            {showCreateModal && (
                <CreateRoomModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(id) => setSelectedRoomId(id)}
                />
            )}

            {lightboxSrc && (
                <ImageLightbox
                    src={lightboxSrc}
                    onClose={() => setLightboxSrc(null)}
                />
            )}

            {showPhraseManager && (
                <PhraseManagerModal
                    phrases={quickPhrases}
                    onSave={persistPhrases}
                    onClose={() => setShowPhraseManager(false)}
                />
            )}

            <GrammarPopup
                open={Boolean(grammarTarget)}
                onClose={() => setGrammarTarget(null)}
                text={grammarTarget?.text || ''}
                lang={grammarTarget?.lang || ''}
                fullPronunciation={grammarTarget?.pronunciation || ''}
                koreanOriginal={grammarTarget?.koreanOriginal || ''}
                isAdmin={isAdmin}
            />

            <LiveTranslatorModal
                open={liveOpen}
                onClose={() => setLiveOpen(false)}
                defaultSourceLang={myLang || 'ko'}
                defaultTargetLang={myLang === 'en' ? 'ko' : 'en'}
                isAdmin={isAdmin}
            />

            <MeetingMinutesModal
                open={minutesOpen}
                onClose={() => setMinutesOpen(false)}
                roomId={selectedRoomId}
                roomName={selectedRoom?.name || ''}
                myLang={myLang}
                isAdmin={isAdmin}
            />
        </div>
    );
};

export default GlobalChat;
