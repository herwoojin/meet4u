import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';

const ChatModal = ({ onClose, targetUserEmail, targetUserName }) => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    const chatId = [currentUser.email, targetUserEmail].sort().join('_');

    useEffect(() => {
        // Ensure chat document exists
        const checkChatExists = async () => {
            const chatRef = doc(db, 'chats', chatId);
            const chatSnap = await getDoc(chatRef);

            if (!chatSnap.exists()) {
                await setDoc(chatRef, {
                    participants: [currentUser.email, targetUserEmail],
                    lastMessage: '',
                    lastMessageTimestamp: serverTimestamp(),
                    participantIds: [currentUser.uid], // We might not know target uid, but reliable queries use participants array of emails
                    updatedAt: serverTimestamp()
                });
            }
        };
        checkChatExists();

        // Subscribe to messages
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMessages(msgs);
            scrollToBottom();
        });

        return () => unsubscribe();
    }, [chatId, currentUser.email, targetUserEmail, currentUser.uid]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            // Add message to subcollection
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                text: newMessage,
                senderEmail: currentUser.email,
                senderName: currentUser.displayName,
                timestamp: serverTimestamp()
            });

            // Update chat metadata for list view / notifications
            const chatRef = doc(db, 'chats', chatId);
            await updateDoc(chatRef, {
                lastMessage: newMessage,
                lastMessageTimestamp: serverTimestamp(),
                lastSender: currentUser.email
            });

            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm h-[600px] flex flex-col overflow-hidden transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-gray-900">{targetUserName}</h3>
                        <p className="text-xs text-gray-500">{targetUserEmail}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                    {messages.map((msg) => {
                        const isMe = msg.senderEmail === currentUser.email;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${isMe
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                    }`}>
                                    <p>{msg.text}</p>
                                    <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                                        {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : '...'}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 bg-white">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder={t('chat.messagePlaceholder')}
                            className="flex-1 px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChatModal;
