import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { Send, MessageSquare, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const CommentSection = ({ meetingId, currentUser, attendees }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const commentsEndRef = useRef(null);

    useEffect(() => {
        if (!meetingId) return;

        const q = query(
            collection(db, 'comments'),
            where('meetingId', '==', meetingId)
            // orderBy('timestamp', 'asc') // Removed to avoid composite index requirement
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedComments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => {
                const t1 = a.timestamp?.toMillis() || 0;
                const t2 = b.timestamp?.toMillis() || 0;
                return t1 - t2;
            });
            setComments(loadedComments);
            setLoading(false);
            scrollToBottom();
        }, (error) => {
            console.error("Error fetching comments:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [meetingId]);

    const scrollToBottom = () => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser) return;

        try {
            await addDoc(collection(db, 'comments'), {
                meetingId,
                text: newComment,
                senderEmail: currentUser.email,
                senderName: currentUser.displayName || currentUser.email.split('@')[0],
                timestamp: serverTimestamp(),
                recipients: attendees
                    .filter(email => email && typeof email === 'string')
                    .map(email => email.toLowerCase())
            });
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

    return (
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex flex-col h-80">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold border-b border-gray-200 pb-2">
                <MessageSquare size={18} className="text-gray-700" />
                댓글 ({comments.length})
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                {loading && <p className="text-center text-gray-400 text-sm">로딩 중...</p>}
                {!loading && comments.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-10">첫 번째 댓글을 남겨보세요!</p>
                )}
                {comments.map((comment) => {
                    const isMe = comment.senderEmail === currentUser?.email;
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
                                {comment.text}
                            </div>
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
