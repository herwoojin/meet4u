import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../lib/firebase';
import { collection, addDoc, query, onSnapshot, serverTimestamp, deleteDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Send, MessageSquare, Trash2, CheckCheck, Mic, Volume2, VolumeX } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';

// BCP 47 locales for Web Speech API
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
};

const GlobalChat = () => {
    const { t } = useTranslation();
    const { currentUser, userProfile } = useAuth();
    const myLang = userProfile?.preferredLanguage || 'ko';

    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [speakingId, setSpeakingId] = useState(null);
    const commentsEndRef = useRef(null);
    const markedAsRead = useRef(new Set());
    const translatingRef = useRef(new Set());
    const recognitionRef = useRef(null);
    const recordingBaseRef = useRef('');

    useEffect(() => {
        const q = query(collection(db, 'globalComments'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loaded = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
                const t1 = a.timestamp?.toMillis() || 0;
                const t2 = b.timestamp?.toMillis() || 0;
                return t1 - t2;
            });
            setComments(loaded);
            setLoading(false);
            scrollToBottom();

            if (currentUser?.email) {
                loaded.forEach(c => {
                    if (c.senderEmail !== currentUser.email && !markedAsRead.current.has(c.id)) {
                        const readBy = c.readBy || [];
                        if (!readBy.includes(currentUser.email.toLowerCase())) {
                            markedAsRead.current.add(c.id);
                            updateDoc(doc(db, 'globalComments', c.id), {
                                readBy: arrayUnion(currentUser.email.toLowerCase())
                            }).catch(() => { });
                        }
                    }
                });
            }
        }, (err) => {
            console.error("GlobalChat fetch error:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        comments.forEach(async (comment) => {
            const isMe = comment.senderEmail === currentUser.email;
            if (isMe) return;

            const srcLang = comment.sourceLanguage || 'ko';
            if (srcLang === myLang) return;
            if (comment.translations && comment.translations[myLang]) return;
            if (translatingRef.current.has(comment.id)) return;
            translatingRef.current.add(comment.id);

            try {
                const res = await fetch('/.netlify/functions/translate-comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: comment.text, sourceLang: srcLang, targetLang: myLang })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.translatedText) {
                        await updateDoc(doc(db, 'globalComments', comment.id), {
                            [`translations.${myLang}`]: data.translatedText
                        });
                    }
                }
            } catch (err) {
                console.error("GlobalChat translation fail:", err);
                translatingRef.current.delete(comment.id);
            }
        });
    }, [comments, myLang, currentUser]);

    const scrollToBottom = () => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        return () => {
            try { recognitionRef.current?.stop(); } catch (_) { /* ignore */ }
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

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

        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
        const recognition = new SpeechRecognition();
        recognition.lang = SPEECH_LOCALE[myLang] || 'ko-KR';
        recognition.interimResults = true;
        recognition.continuous = !isMobile;

        recordingBaseRef.current = newComment ? newComment.trimEnd() + (newComment ? ' ' : '') : '';

        recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0]?.transcript || '';
                if (result.isFinal) finalText += transcript;
                else interimText += transcript;
            }
            setNewComment(recordingBaseRef.current + finalText + interimText);
        };
        recognition.onerror = () => setIsRecording(false);
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

    const speakComment = (commentId, text, lang) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            alert(t('meeting.voiceUnsupportedPlay'));
            return;
        }
        const synth = window.speechSynthesis;
        if (speakingId === commentId) {
            synth.cancel();
            setSpeakingId(null);
            return;
        }
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = SPEECH_LOCALE[lang] || 'ko-KR';
        utter.onend = () => setSpeakingId(null);
        utter.onerror = () => setSpeakingId(null);
        setSpeakingId(commentId);
        synth.speak(utter);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser) return;

        const senderName = currentUser.displayName || currentUser.email.split('@')[0];
        try {
            await addDoc(collection(db, 'globalComments'), {
                text: newComment,
                senderEmail: currentUser.email,
                senderName,
                sourceLanguage: myLang,
                timestamp: serverTimestamp(),
                readBy: [currentUser.email.toLowerCase()],
            });
            setNewComment('');
        } catch (error) {
            console.error("Error adding global comment:", error);
            alert(`${t('meeting.errorOccurred')}: ${error.message}`);
        }
    };

    const handleDelete = async (commentId) => {
        if (!window.confirm(t('meeting.confirmDeleteComment'))) return;
        try {
            await deleteDoc(doc(db, "globalComments", commentId));
        } catch (error) {
            console.error("Error deleting global comment:", error);
            alert(t('meeting.deleteCommentFailed'));
        }
    };

    const getOtherCommenters = () => {
        const commenters = new Set();
        comments.forEach(c => {
            if (c.senderEmail && c.senderEmail !== currentUser?.email) {
                commenters.add(c.senderEmail.toLowerCase());
            }
        });
        return commenters;
    };

    const getReadStatus = (comment) => {
        const readBy = (comment.readBy || []).map(e => e.toLowerCase());
        const otherCommenters = getOtherCommenters();
        if (otherCommenters.size === 0) return null;
        const readCommenters = [...otherCommenters].filter(email => readBy.includes(email));
        if (readCommenters.length === 0) return null;
        if (readCommenters.length >= otherCommenters.size) return 'all';
        return 'some';
    };

    return (
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex flex-col h-96">
            <div className="flex items-center justify-between mb-4 text-gray-900 font-bold border-b border-gray-200 pb-2">
                <div className="flex items-center gap-2">
                    <MessageSquare size={18} className="text-gray-700" />
                    {t('global.chatTitle')} ({comments.length})
                </div>
                {myLang !== 'ko' && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
                        {t('meeting.translationEnabled')}
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                {loading && <p className="text-center text-gray-400 text-sm">{t('common.loading')}</p>}
                {!loading && comments.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-10">{t('meeting.noCommentsYet')}</p>
                )}
                {comments.map((comment) => {
                    const isMe = comment.senderEmail === currentUser?.email;
                    const readStatus = isMe ? getReadStatus(comment) : null;
                    const isTranslated = !isMe && comment.translations && comment.translations[myLang] && comment.translations[myLang] !== comment.text;
                    const isTranslating = !isMe && !comment.translations?.[myLang] && (comment.sourceLanguage || 'ko') !== myLang;
                    const displayText = isMe ? comment.text : (comment.translations?.[myLang] || comment.text);

                    // Sender plays original in source language; receiver plays translated in own language
                    const ttsText = isMe ? comment.text : displayText;
                    const ttsLang = isMe ? (comment.sourceLanguage || 'ko') : myLang;

                    return (
                        <div key={comment.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {isMe && (
                                    <button
                                        onClick={() => handleDelete(comment.id)}
                                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                        title={t('meeting.deleteBtn')}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                                <span className="text-xs font-bold text-gray-700">{comment.senderName}</span>
                                <span className="text-[10px] text-gray-400">
                                    {comment.timestamp ? format(comment.timestamp.toDate(), 'a h:mm', { locale: ko }) : ''}
                                </span>
                            </div>
                            <div className={`flex items-start gap-1.5 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`px-3 py-2 rounded-lg text-sm break-words ${isMe
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                                    }`}>
                                    {displayText}
                                    {isTranslated && (
                                        <div className="text-[9px] text-gray-400 mt-1 flex items-center gap-1 border-t border-gray-100 pt-1">
                                            {t('meeting.translated')} ({t('meeting.original')}: {comment.text})
                                        </div>
                                    )}
                                    {isTranslating && (
                                        <div className="text-[9px] text-gray-300 mt-1 italic">
                                            {t('meeting.translating')}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => speakComment(comment.id, ttsText, ttsLang)}
                                    className={`shrink-0 p-1.5 rounded-full transition-colors ${speakingId === comment.id
                                        ? 'bg-blue-100 text-blue-600 animate-pulse'
                                        : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                                        }`}
                                    title={speakingId === comment.id ? t('meeting.ttsStop') : t('meeting.ttsPlay')}
                                >
                                    {speakingId === comment.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                </button>
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
                <div ref={commentsEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={isRecording ? t('meeting.voiceListening') : t('meeting.commentPlaceholder')}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!currentUser}
                />
                <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={!currentUser}
                    className={`relative p-2 rounded-lg transition-all shadow-sm disabled:opacity-50 ${isRecording
                        ? 'bg-gradient-to-br from-red-500 to-pink-600 text-white ring-2 ring-red-300 animate-pulse'
                        : 'bg-gradient-to-br from-orange-400 to-red-500 text-white hover:from-orange-500 hover:to-red-600'
                        }`}
                    title={isRecording ? t('meeting.micStop') : t('meeting.micStart')}
                >
                    <Mic size={18} />
                    {isRecording && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-ping"></span>
                    )}
                </button>
                <button
                    type="submit"
                    disabled={!newComment.trim() || !currentUser}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
};

export default GlobalChat;
