import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, XCircle, Loader, Search, RotateCcw, ShieldCheck, Save } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc, deleteField } from 'firebase/firestore';

// Admin-only sub-modal that lists every registered Google account from the
// `users` collection and lets the admin set any user's attendance for the
// current meeting to 참석 / 불참, or clear it back to "미응답".
//
// Changes are staged locally and committed in a single Firestore update
// when the admin clicks "저장". The save merges into the meeting document's
// `responses` map (sanitized email keys) so existing user-set responses
// are preserved unless explicitly overridden.

const sanitizeEmail = (email) => (email || '').replace(/\./g, '_');

const AdminAttendanceEditor = ({ open, onClose, meeting }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    // pending[sanitizedEmail] = 'attend' | 'decline' | null (clear) | undefined (no change)
    const [pending, setPending] = useState({});

    // Reset pending state when the modal opens with a new meeting
    useEffect(() => {
        if (open) setPending({});
    }, [open, meeting?.id]);

    // Lock background scroll while open
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    // Esc closes
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // Fetch all registered users
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const snap = await getDocs(collection(db, 'users'));
                const list = [];
                snap.forEach(d => {
                    const u = d.data();
                    if (u.email) {
                        list.push({
                            uid: d.id,
                            email: u.email,
                            displayName: u.displayName || u.email.split('@')[0],
                            photoURL: u.photoURL || '',
                        });
                    }
                });
                list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
                if (!cancelled) setUsers(list);
            } catch (err) {
                console.error('Failed to load users for admin editor:', err);
                if (!cancelled) setUsers([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    const responses = meeting?.responses || {};

    const getEffectiveStatus = (email) => {
        const key = sanitizeEmail(email);
        if (key in pending) return pending[key]; // staged change (incl. null = clear)
        return responses[key] || responses[email] || null;
    };

    const setStatus = (email, status) => {
        const key = sanitizeEmail(email);
        setPending(prev => ({ ...prev, [key]: status }));
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return users;
        return users.filter(u =>
            u.displayName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
        );
    }, [users, query]);

    const pendingCount = Object.keys(pending).length;

    const save = async () => {
        if (!meeting?.id || pendingCount === 0) { onClose?.(); return; }
        setSaving(true);
        try {
            // Build Firestore update payload using dot-paths into the responses map.
            // null pending value → deleteField() to clear that user's response.
            const patch = {};
            for (const [key, val] of Object.entries(pending)) {
                if (val === null) patch[`responses.${key}`] = deleteField();
                else patch[`responses.${key}`] = val;
            }
            await updateDoc(doc(db, 'meetings', meeting.id), patch);
            onClose?.();
        } catch (err) {
            console.error('Admin attendance save failed:', err);
            alert('저장에 실패했습니다. 다시 시도해 주세요.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2100] flex items-end sm:items-center justify-center p-2 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-rose-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck size={18} className="text-amber-600 shrink-0" />
                        <h2 className="text-sm font-bold text-gray-800 truncate">관리자수정 — 참석/불참 직접 지정</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="닫기"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* Search */}
                <div className="px-4 py-2 border-b border-gray-100">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="이름 또는 이메일 검색"
                            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1.5">
                        등록된 회원 중 골라서 참석/불참을 지정합니다. 변경된 항목만 저장됩니다.
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                            <Loader size={14} className="animate-spin" />
                            회원 목록 로딩 중…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-sm">
                            {query ? '검색 결과가 없습니다.' : '등록된 회원이 없습니다.'}
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {filtered.map(u => {
                                const status = getEffectiveStatus(u.email);
                                const key = sanitizeEmail(u.email);
                                const isPending = key in pending;
                                return (
                                    <li
                                        key={u.uid}
                                        className={`flex items-center gap-2 p-2 rounded-lg border ${isPending ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-white'}`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-xs font-bold text-blue-700 border border-blue-100 shrink-0">
                                            {u.displayName[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-gray-800 truncate">{u.displayName}</div>
                                            <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setStatus(u.email, 'attend')}
                                                className={`p-1.5 rounded-md border text-xs font-bold transition-colors flex items-center gap-1 ${status === 'attend'
                                                    ? 'bg-green-600 text-white border-green-600'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                                                }`}
                                                title="참석으로 지정"
                                            >
                                                <Check size={12} />
                                                <span className="hidden sm:inline">참석</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStatus(u.email, 'decline')}
                                                className={`p-1.5 rounded-md border text-xs font-bold transition-colors flex items-center gap-1 ${status === 'decline'
                                                    ? 'bg-red-500 text-white border-red-500'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                                                }`}
                                                title="불참으로 지정"
                                            >
                                                <XCircle size={12} />
                                                <span className="hidden sm:inline">불참</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStatus(u.email, null)}
                                                className="p-1.5 rounded-md border bg-white text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600"
                                                title="응답 초기화"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                <footer className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                    <div className="flex-1 text-xs text-gray-600">
                        {pendingCount > 0 ? (
                            <span className="font-semibold text-amber-700">{pendingCount}건 변경 대기 중</span>
                        ) : (
                            <span className="text-gray-400">변경 사항 없음</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-40"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || pendingCount === 0}
                        className="px-3 py-2 text-xs font-bold text-white bg-amber-600 border border-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-40 flex items-center gap-1"
                    >
                        {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                        저장
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default AdminAttendanceEditor;
