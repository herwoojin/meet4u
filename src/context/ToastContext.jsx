import React, { createContext, useContext, useState, useCallback } from 'react';
import { MessageSquare, X } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, options = {}) => {
        const id = Date.now() + Math.random();
        const toast = {
            id,
            message,
            title: options.title || '알림',
            type: options.type || 'info', // info, success, warning
            duration: options.duration || 5000,
        };
        setToasts(prev => [...prev, toast]);

        // Auto remove
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, toast.duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}

            {/* Toast Container - fixed at top */}
            {toasts.length > 0 && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[90vw] max-w-sm pointer-events-none">
                    {toasts.map(toast => (
                        <div
                            key={toast.id}
                            className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-gray-200 p-4 animate-slide-down flex items-start gap-3"
                            style={{
                                animation: 'slideDown 0.3s ease-out',
                            }}
                        >
                            <div className="bg-blue-100 p-2 rounded-lg shrink-0">
                                <MessageSquare size={18} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900">{toast.title}</p>
                                <p className="text-sm text-gray-600 mt-0.5 truncate">{toast.message}</p>
                            </div>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="text-gray-400 hover:text-gray-600 shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </ToastContext.Provider>
    );
};
