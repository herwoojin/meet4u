import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, deleteDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Send, MessageSquare, Trash2, CheckCheck, Mic, Volume2, VolumeX, Image as ImageIcon, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';
import { compressImageToWebp } from '../../lib/imageUtils';
import ImageLightbox from '../chat/ImageLightbox';

// BCP 47 locales for Web Speech API (SpeechRecognition / SpeechSynthesis)
const SPEECH_LOCALE = {
    'ko': 'ko-KR',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'ja': 'ja-JP',
    'ru': 'ru-RU',
    'es': 'es-ES',
    'vi': 'vi-VN',
    'mn': 'mn-MN',
    'ar': 'ar-SA',
    'fr': 'fr-FR',
    'km': 'km-KH',
};

const CommentSection = ({ meetingId, currentUser, attendees }) => {
    const { t } = useTranslation();
    const { userProfile } = useAuth();
    const myLang = userProfile?.preferredLanguage || 'ko';

    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [speakingId, setSpeakingId] = useState(null);
    const [autoVoice, setAutoVoice] = useState(() =>
        typeof window !== 'undefined' && localStorage.getItem('meet4u_autoVoice') === 'true'
    );
    const [uploadingImage, setUploadingImage] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const commentsEndRef = useRef(null);
    const markedAsRead = useRef(new Set());
    const translatingRef = useRef(new Set());
    const recognitionRef = useRef(null);
    const recordingBaseRef = useRef('');
    const spokenIdsRef = useRef(new Set());
    const firstLoadRef = useRef(true);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!meetingId) return;

        const q = query(
            collection(db, 'comments'),
            where('meetingId', '==', meetingId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedComments = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })).sort((a, b) => {
                const t1 = a.timestamp?.toMillis() || 0;
                const t2 = b.timestamp?.toMillis() || 0;
                return t1 - t2;
            });
            setComments(loadedComments);
            setLoading(false);
            scrollToBottom();

            // Mark all comments as read by current user
            if (currentUser?.email) {
                loadedComments.forEach(comment => {
                    if (comment.senderEmail !== currentUser.email && !markedAsRead.current.has(comment.id)) {
                        const readBy = comment.readBy || [];
                        if (!readBy.includes(currentUser.email.toLowerCase())) {
                            markedAsRead.current.add(comment.id);
                            updateDoc(doc(db, 'comments', comment.id), {
                                readBy: arrayUnion(currentUser.email.toLowerCase())
                            }).catch(() => { });
                        }
                    }
                });
            }
        }, (error) => {
            console.error("Error fetching comments:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [meetingId, currentUser]);

    // Persist auto-voice preference
    useEffect(() => {
        try { localStorage.setItem('meet4u_autoVoice', autoVoice ? 'true' : 'false'); } catch (_) { /* ignore */ }
    }, [autoVoice]);

    // Auto-voice: read new incoming messages aloud in the receiver's language
    useEffect(() => {
        if (firstLoadRef.current && comments.length > 0) {
            firstLoadRef.current = false;
            comments.forEach(c => spokenIdsRef.current.add(c.id));
            return;
        }
        if (!autoVoice || !currentUser) return;
        if (typeof window === 'undefined' || !window.speechSynthesis) return;

        comments.forEach(c => {
            if (spokenIdsRef.current.has(c.id)) return;

            const isMe = c.senderEmail === currentUser.email;
            if (isMe) {
                spokenIdsRef.current.add(c.id);
                return;
            }
            if (c.imageUrl && !c.text) {
                spokenIdsRef.current.add(c.id);
                return;
            }
            const srcLang = c.sourceLanguage || 'ko';
            const needsTranslation = srcLang !== myLang;
            const translated = c.translations?.[myLang];

            if (needsTranslation && !translated) {
                // Translation not yet arrived — wait for next update
                return;
            }

            spokenIdsRef.current.add(c.id);
            const textToSpeak = translated || c.text;
            if (!textToSpeak) return;

            const utter = new SpeechSynthesisUtterance(textToSpeak);
            utter.lang = SPEECH_LOCALE[myLang] || 'ko-KR';
            window.speechSynthesis.speak(utter);
        });
    }, [comments, autoVoice, myLang, currentUser]);

    // When enabling auto-voice, mark current comments as already spoken so
    // history isn't narrated on toggle-on.
    useEffect(() => {
        if (autoVoice) {
            comments.forEach(c => spokenIdsRef.current.add(c.id));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoVoice]);

    // Background translation processor
    useEffect(() => {
        if (!currentUser) return;
        
        comments.forEach(async (comment) => {
            const isMe = comment.senderEmail === currentUser.email;
            if (isMe) return;
            if (!comment.text) return; // skip image-only

            const srcLang = comment.sourceLanguage || 'ko';
            // Same language → no translation needed
            if (srcLang === myLang) return;

            // If we already have the translation for myLang, skip
            if (comment.translations && comment.translations[myLang]) return;

            // Avoid duplicate calls
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
                        await updateDoc(doc(db, 'comments', comment.id), {
                            [`translations.${myLang}`]: data.translatedText
                        });
                    }
                }
            } catch (err) {
                console.error("Translation fail:", err);
                translatingRef.current.delete(comment.id); // allow retry later
            }
        });
    }, [comments, myLang, currentUser]);

    const scrollToBottom = () => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Clean up any ongoing recognition/speech on unmount
    useEffect(() => {
        return () => {
            try { recognitionRef.current?.stop(); } catch (_) { /* ignore */ }
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    // Speech-to-text: dictate in user's preferred language
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

        // Android Chrome의 continuous 모드는 확정 세그먼트를 중복 재방출하는
        // 버그가 있어 모바일에서는 단발 세션으로 동작시킨다.
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
        recognition.onerror = (e) => {
            console.error('Speech recognition error:', e);
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

    // Text-to-speech: play a comment aloud in its source language
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

    const handleImageFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !currentUser || !meetingId) return;

        if (file.size > 20 * 1024 * 1024) {
            alert(t('common.imageTooLarge'));
            return;
        }

        setUploadingImage(true);
        try {
            const { blob, width, height } = await compressImageToWebp(file, { maxDim: 1280, quality: 0.82 });
            const path = `commentImages/${meetingId}/${currentUser.uid}/${Date.now()}.webp`;
            const sRef = storageRef(storage, path);
            await uploadBytes(sRef, blob, { contentType: 'image/webp' });
            const url = await getDownloadURL(sRef);

            const senderName = currentUser.displayName || currentUser.email.split('@')[0];
            const recipientEmails = (attendees || [])
                .filter(email => email && typeof email === 'string')
                .map(email => email.toLowerCase());

            await addDoc(collection(db, 'comments'), {
                meetingId,
                text: '',
                imageUrl: url,
                imagePath: path,
                imageWidth: width,
                imageHeight: height,
                senderEmail: currentUser.email,
                senderName,
                sourceLanguage: myLang,
                timestamp: serverTimestamp(),
                readBy: [currentUser.email.toLowerCase()],
                recipients: recipientEmails,
            });

            if (recipientEmails.length > 0) {
                fetch('/.netlify/functions/send-notification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'comment',
                        title: `📷 ${senderName}님의 새 사진 댓글`,
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser) return;

        const senderName = currentUser.displayName || currentUser.email.split('@')[0];
        const recipientEmails = attendees
            .filter(email => email && typeof email === 'string')
            .map(email => email.toLowerCase());

        try {
            await addDoc(collection(db, 'comments'), {
                meetingId,
                text: newComment,
                senderEmail: currentUser.email,
                senderName,
                sourceLanguage: myLang,
                timestamp: serverTimestamp(),
                readBy: [currentUser.email.toLowerCase()],
                recipients: recipientEmails
            });

            // Send background push notification to attendees
            if (recipientEmails.length > 0) {
                fetch('/.netlify/functions/send-notification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'comment',
                        title: `💬 ${senderName}님의 새 댓글`,
                        body: newComment.length > 100 ? newComment.slice(0, 100) + '...' : newComment,
                        recipientEmails,
                        senderEmail: currentUser.email,
                    }),
                }).catch(err => console.error('Push notification failed:', err));
            }

            setNewComment('');
        } catch (error) {
            console.error("Error adding comment:", error);
            alert(`댓글 저장 실패: ${error.message}`);
        }
    };

    const handleDelete = async (commentId) => {
        if (!window.confirm(t('meeting.confirmDeleteComment'))) return;
        try {
            const comment = comments.find(c => c.id === commentId);
            await deleteDoc(doc(db, "comments", commentId));
            if (comment?.imagePath) {
                deleteObject(storageRef(storage, comment.imagePath)).catch(() => { });
            }
        } catch (error) {
            console.error("Error deleting comment:", error);
            alert(t('meeting.deleteCommentFailed'));
        }
    };

    // Get unique commenters (other than me) for read receipt calculation
    const getOtherCommenters = () => {
        const commenters = new Set();
        comments.forEach(c => {
            if (c.senderEmail && c.senderEmail !== currentUser?.email) {
                commenters.add(c.senderEmail.toLowerCase());
            }
        });
        return commenters;
    };

    // Get read status for a comment written by the current user
    const getReadStatus = (comment) => {
        const readBy = (comment.readBy || []).map(e => e.toLowerCase());
        const otherCommenters = getOtherCommenters();

        if (otherCommenters.size === 0) return null; // No other commenters

        // Filter to only commenters who have read this
        const readCommenters = [...otherCommenters].filter(email => readBy.includes(email));

        if (readCommenters.length === 0) return null; // No one has read
        if (readCommenters.length >= otherCommenters.size) return 'all'; // Everyone read
        return 'some'; // Some have read
    };

    return (
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex flex-col h-80">
            <div className="flex items-center justify-between mb-4 text-gray-900 font-bold border-b border-gray-200 pb-2 gap-2">
                <div className="flex items-center gap-2">
                    <MessageSquare size={18} className="text-gray-700" />
                    {t('meeting.commentsCount', { count: comments.length })}
                </div>
                <div className="flex items-center gap-1.5">
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
                        title={t('meeting.autoVoiceTitle')}
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${autoVoice
                            ? 'bg-orange-50 text-orange-600 border-orange-200'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-600'
                            }`}
                    >
                        {autoVoice ? <Volume2 size={10} /> : <VolumeX size={10} />}
                        {autoVoice ? t('meeting.autoVoiceOn') : t('meeting.autoVoiceOff')}
                    </button>
                    {myLang !== 'ko' && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
                            {t('meeting.translationEnabled')}
                        </span>
                    )}
                </div>
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

                    // Sender plays their original text in the source language.
                    // Receiver plays the translated text in their own preferred language.
                    const ttsText = isMe ? comment.text : displayText;
                    const ttsLang = isMe ? (comment.sourceLanguage || 'ko') : myLang;

                    return (
                        <div key={comment.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {isMe && (
                                    <button
                                        onClick={() => handleDelete(comment.id)}
                                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                        title="삭제"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                                <span className="text-xs font-bold text-gray-700">{comment.senderName}</span>
                                <span className="text-[10px] text-gray-400">
                                    {comment.timestamp ? format(comment.timestamp.toDate(), 'a h:mm', { locale: ko }) : '방금 전'}
                                </span>
                            </div>
                            <div className={`flex items-start gap-1.5 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                {comment.imageUrl ? (
                                    <button
                                        type="button"
                                        onClick={() => setLightboxSrc(comment.imageUrl)}
                                        className={`overflow-hidden rounded-lg border ${isMe ? 'border-blue-200' : 'border-gray-200'} shadow-sm`}
                                        style={{ maxWidth: '220px' }}
                                    >
                                        <img
                                            src={comment.imageUrl}
                                            alt=""
                                            loading="lazy"
                                            className="block max-w-[220px] max-h-[260px] object-cover"
                                        />
                                    </button>
                                ) : (
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
                                )}
                                {!comment.imageUrl && (
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
                                )}
                            </div>
                            {/* Read Receipt */}
                            {isMe && readStatus && (
                                <div className={`flex items-center gap-1 mt-1 text-[10px] ${readStatus === 'all' ? 'text-blue-500' : 'text-gray-400'
                                    }`}>
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
                    disabled={uploadingImage}
                    className="p-2 rounded-lg transition-colors shadow-sm bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    title={t('common.attachImage')}
                >
                    {uploadingImage ? <Loader size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                </button>
                <button
                    type="button"
                    onClick={toggleRecording}
                    className={`relative p-2 rounded-lg transition-all shadow-sm ${isRecording
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
                    disabled={!newComment.trim()}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    <Send size={18} />
                </button>
            </form>

            {lightboxSrc && (
                <ImageLightbox
                    src={lightboxSrc}
                    onClose={() => setLightboxSrc(null)}
                />
            )}
        </div>
    );
};

export default CommentSection;
