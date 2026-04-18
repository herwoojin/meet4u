import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, deleteDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Send, MessageSquare, Trash2, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';

const CommentSection = ({ meetingId, currentUser, attendees }) => {
    const { userProfile } = useAuth();
    const myLang = userProfile?.preferredLanguage || 'ko';
    
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const commentsEndRef = useRef(null);
    const markedAsRead = useRef(new Set());
    const translatingRef = useRef(new Set());

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

    // Background translation processor
    useEffect(() => {
        if (!currentUser) return;
        
        comments.forEach(async (comment) => {
            const isMe = comment.senderEmail === currentUser.email;
            if (isMe) return;

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
        if (!window.confirm("댓글을 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "comments", commentId));
        } catch (error) {
            console.error("Error deleting comment:", error);
            alert("댓글 삭제 실패");
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
            <div className="flex items-center justify-between mb-4 text-gray-900 font-bold border-b border-gray-200 pb-2">
                <div className="flex items-center gap-2">
                    <MessageSquare size={18} className="text-gray-700" />
                    댓글 ({comments.length})
                </div>
                {myLang !== 'ko' && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
                        번역 활성화됨
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                {loading && <p className="text-center text-gray-400 text-sm">로딩 중...</p>}
                {!loading && comments.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-10">첫 번째 댓글을 남겨보세요!</p>
                )}
                {comments.map((comment) => {
                    const isMe = comment.senderEmail === currentUser?.email;
                    const readStatus = isMe ? getReadStatus(comment) : null;
                    const isTranslated = !isMe && comment.translations && comment.translations[myLang] && comment.translations[myLang] !== comment.text;
                    const isTranslating = !isMe && !comment.translations?.[myLang];
                    const displayText = isMe ? comment.text : (comment.translations?.[myLang] || comment.text);

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
                            <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] break-words ${isMe
                                ? 'bg-blue-600 text-white rounded-tr-none'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                                }`}>
                                {displayText}
                                {isTranslated && (
                                    <div className="text-[9px] text-gray-400 mt-1 flex items-center gap-1 border-t border-gray-100 pt-1">
                                        번역됨 (원문: {comment.text})
                                    </div>
                                )}
                                {isTranslating && (
                                    <div className="text-[9px] text-gray-300 mt-1 italic">
                                        번역 중...
                                    </div>
                                )}
                            </div>
                            {/* Read Receipt */}
                            {isMe && readStatus && (
                                <div className={`flex items-center gap-1 mt-1 text-[10px] ${readStatus === 'all' ? 'text-blue-500' : 'text-gray-400'
                                    }`}>
                                    <CheckCheck size={12} />
                                    <span>{readStatus === 'all' ? '모두 읽음' : '읽음'}</span>
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
                    placeholder="댓글을 입력하세요..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="submit"
                    disabled={!newComment.trim()}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
};

export default CommentSection;
