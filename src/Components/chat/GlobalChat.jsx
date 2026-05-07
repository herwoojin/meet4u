import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db, storage } from '../../lib/firebase';
import {
    collection, addDoc, query, where, onSnapshot, serverTimestamp,
    deleteDoc, doc, updateDoc, arrayUnion, arrayRemove, getDocs, writeBatch
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
    Send, MessageSquare, Trash2, CheckCheck, Mic, Volume2, VolumeX,
    Plus, Users, LogOut, X, ChevronDown, Search, Loader, Image as ImageIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';
import { compressImageToWebp } from '../../lib/imageUtils';
import ImageLightbox from './ImageLightbox';
import { romajiToHangul, pinyinToHangul } from '../../lib/phonetics';

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
};

const LANG_LABEL = {
    'ko': '한국어', 'en': 'English', 'ja': '日本語', 'zh-CN': '中文(简)', 'zh': '中文',
    'ru': 'Русский', 'es': 'Español', 'vi': 'Tiếng Việt', 'mn': 'Монгол',
    'ar': 'العربية', 'fr': 'Français', 'km': 'ភាសាខ្មែរ',
};

const LANG_FLAG = {
    'ko': '🇰🇷', 'en': '🇺🇸', 'ja': '🇯🇵', 'zh-CN': '🇨🇳', 'zh': '🇨🇳',
    'ru': '🇷🇺', 'es': '🇪🇸', 'vi': '🇻🇳', 'mn': '🇲🇳',
    'ar': '🇸🇦', 'fr': '🇫🇷', 'km': '🇰🇭',
};

const lower = (s) => (s || '').toLowerCase();

// ---------------- Create room modal ----------------
const CreateRoomModal = ({ onClose, onCreated }) => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const [name, setName] = useState('');
    const [allUsers, setAllUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selected, setSelected] = useState([]); // [{email, displayName}]
    const [saving, setSaving] = useState(false);
    const [showList, setShowList] = useState(false);

    useEffect(() => {
        getDocs(collection(db, 'users'))
            .then(snap => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(err => console.error('load users failed', err));
    }, []);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const selectedEmails = new Set(selected.map(s => lower(s.email)));
        return allUsers
            .filter(u => u.email && lower(u.email) !== lower(currentUser?.email))
            .filter(u => !u.hiddenFromSearch)
            .filter(u => !selectedEmails.has(lower(u.email)))
            .filter(u => {
                if (!term) return true;
                const name = lower(u.displayName || '');
                const email = lower(u.email || '');
                return name.includes(term) || email.includes(term);
            })
            .slice(0, 50);
    }, [allUsers, searchTerm, selected, currentUser]);

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
                        {showList && (searchTerm || filtered.length > 0) && (
                            <div className="mt-1 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-sm">
                                {filtered.length === 0 ? (
                                    <div className="p-3 text-xs text-gray-400 text-center">{t('chat.rooms.noResults')}</div>
                                ) : (
                                    filtered.map(u => (
                                        <button
                                            type="button"
                                            key={u.email}
                                            onClick={() => toggleSelect(u)}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                                        >
                                            <span className="truncate min-w-0 flex-1">
                                                <span className="font-medium text-gray-800">{u.displayName || u.email.split('@')[0]}</span>
                                                <span className="ml-2 text-xs text-gray-400 truncate">{u.email}</span>
                                            </span>
                                            <Plus size={14} className="text-blue-500 shrink-0" />
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
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

// ---------------- Main GlobalChat with rooms ----------------
const GlobalChat = () => {
    const { t } = useTranslation();
    const { currentUser, userProfile } = useAuth();
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
            if (m.translations && m.translations[myLang]) return;
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
                        await updateDoc(doc(db, 'globalChatRooms', selectedRoomId, 'messages', m.id), {
                            [`translations.${myLang}`]: data.translatedText
                        });
                    }
                }
            } catch (err) {
                console.error("translation fail:", err);
                translatingRef.current.delete(m.id);
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

    // Helper: play TTS via Google Translate proxy (works on ALL browsers)
    const playGoogleTTS = (text, lang) => {
        if (!text) return null;
        const locale = lang || 'ko';
        // Truncate for Google TTS limit
        const trimmed = text.length > 200 ? text.slice(0, 200) : text;
        const url = `/.netlify/functions/text-to-speech?text=${encodeURIComponent(trimmed)}&lang=${encodeURIComponent(locale)}`;
        const audio = new Audio(url);
        return audio;
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

            const audio = playGoogleTTS(textToSpeak, myLang);
            if (audio) audio.play().catch(() => {});
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

    const speakMessage = (id, text, lang) => {
        // Toggle off if already playing this message
        if (speakingId === id) {
            try { audioRef.current?.pause(); audioRef.current = null; } catch (_) { /* ignore */ }
            setSpeakingId(null);
            return;
        }
        // Stop any current playback
        try { audioRef.current?.pause(); audioRef.current = null; } catch (_) { /* ignore */ }

        const audio = playGoogleTTS(text, lang);
        if (!audio) return;
        audioRef.current = audio;
        setSpeakingId(id);
        audio.onended = () => { setSpeakingId(null); audioRef.current = null; };
        audio.onerror = () => { setSpeakingId(null); audioRef.current = null; };
        audio.play().catch(() => { setSpeakingId(null); audioRef.current = null; });
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

            // 한국어 발음 가이드: 일본어/중국어 로마자를 한글로 음차 변환
            let hangul = '';
            if (directSpeakLang === 'ja') {
                hangul = romajiToHangul(roman);
            } else if (directSpeakLang === 'zh-CN' || directSpeakLang === 'zh') {
                hangul = pinyinToHangul(roman);
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
                        <MessageSquare size={16} /> 내가 직접 말하기 (메모장)
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
                                            <div className="text-[9px] text-gray-400 mt-1 flex items-center gap-1 border-t border-gray-100 pt-1">
                                                {t('meeting.translated')} ({t('meeting.original')}: {m.text})
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
                                    <button
                                        type="button"
                                        onClick={() => speakMessage(m.id, ttsText, ttsLang)}
                                        className={`shrink-0 p-1.5 rounded-full transition-colors ${speakingId === m.id ? 'bg-blue-100 text-blue-600 animate-pulse' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                                        title={speakingId === m.id ? t('meeting.ttsStop') : t('meeting.ttsPlay')}
                                    >
                                        {speakingId === m.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                    </button>
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
            <form onSubmit={handleSend} className="flex gap-2 mt-3">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={isRecording ? t('meeting.voiceListening') : t('meeting.commentPlaceholder')}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
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
        </div>
    );
};

export default GlobalChat;
