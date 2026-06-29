import React, { useEffect, useMemo, useState } from 'react';
import { Folder, FolderPlus, Users, Plus, X, Check, Trash2, Crown, LogOut, Loader, Search } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useProjects } from '../context/ProjectContext';
import { createProject, addMember, removeMember, deleteProject } from '../lib/projects';

const lower = (s) => String(s || '').toLowerCase().trim();

// Lightweight create-project modal
const CreateModal = ({ open, onClose, onCreated, me, users }) => {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('📁');
    const [description, setDescription] = useState('');
    const [pickedEmails, setPickedEmails] = useState([]);
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(''); setIcon('📁'); setDescription(''); setPickedEmails([]); setQuery('');
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = users.filter(u => lower(u.email) !== me);
        if (!q) return list;
        return list.filter(u =>
            (u.displayName || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q));
    }, [users, query, me]);

    const toggle = (email) => {
        const e = lower(email);
        setPickedEmails(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
    };

    const submit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const id = await createProject({
                name: name.trim(),
                description: description.trim(),
                icon,
                createdBy: me,
                memberEmails: pickedEmails,
            });
            onCreated?.(id);
            onClose?.();
        } catch (e) {
            console.error('create project failed', e);
            alert('프로젝트 생성에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[2100] flex items-end sm:items-center justify-center p-2 sm:p-6" onClick={onClose}>
            <div className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50">
                    <div className="flex items-center gap-2">
                        <FolderPlus size={18} className="text-blue-600" />
                        <h2 className="text-sm font-bold text-gray-800">새 프로젝트 만들기</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100"><X size={18} /></button>
                </header>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div>
                        <label className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">이름 *</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="예: 헬스 모임"
                            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>
                    <div className="flex gap-2">
                        <div className="w-24">
                            <label className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">아이콘</label>
                            <input
                                value={icon}
                                onChange={e => setIcon(e.target.value)}
                                placeholder="📁"
                                maxLength={4}
                                className="mt-1 w-full px-3 py-2 text-center text-lg border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">설명</label>
                            <input
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="(옵션)"
                                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">초기 멤버 ({pickedEmails.length}명)</label>
                            <span className="text-[10px] text-gray-400">본인은 자동 포함</span>
                        </div>
                        <div className="relative mb-2">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="이름 또는 이메일 검색"
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                        <ul className="space-y-1 max-h-56 overflow-y-auto border border-gray-100 rounded-lg p-1">
                            {filtered.length === 0 ? (
                                <li className="text-center text-xs text-gray-400 py-6">{query ? '검색 결과 없음' : '등록 회원 없음'}</li>
                            ) : filtered.map(u => {
                                const e = lower(u.email);
                                const picked = pickedEmails.includes(e);
                                return (
                                    <li key={u.uid || e}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(e)}
                                            className={`w-full flex items-center gap-2 p-2 rounded-md text-xs ${picked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                                        >
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                                                {(u.displayName || u.email || '?')[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0 text-left">
                                                <div className="font-semibold text-gray-800 truncate">{u.displayName || u.email}</div>
                                                <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                                            </div>
                                            {picked && <Check size={12} className="text-blue-600 shrink-0" />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
                <footer className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex gap-2">
                    <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-40">취소</button>
                    <button type="button" onClick={submit} disabled={saving || !name.trim()} className="flex-1 px-3 py-2 text-xs font-bold text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1">
                        {saving ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                        만들기
                    </button>
                </footer>
            </div>
        </div>
    );
};

const ProjectsPage = () => {
    const { currentUser } = useAuth();
    const me = lower(currentUser?.email);
    const { projects, loading, setCurrentProjectId, currentProjectId } = useProjects();
    const [users, setUsers] = useState([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [busy, setBusy] = useState({});

    useEffect(() => {
        getDocs(collection(db, 'users')).then(snap => {
            const list = [];
            snap.forEach(d => {
                const u = d.data();
                if (u.email) list.push({ uid: d.id, email: u.email, displayName: u.displayName || '' });
            });
            list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'ko'));
            setUsers(list);
        }).catch(e => console.error('load users failed', e));
    }, []);

    const findUserLabel = (email) => {
        const u = users.find(u => lower(u.email) === lower(email));
        return u?.displayName || email;
    };

    const handleInvite = async (projectId) => {
        const email = prompt('초대할 사용자의 이메일을 입력하세요');
        if (!email) return;
        try {
            setBusy(b => ({ ...b, [projectId]: true }));
            await addMember(projectId, email);
        } catch (e) {
            console.error('invite failed', e);
            alert('초대 실패: ' + (e?.message || ''));
        } finally {
            setBusy(b => ({ ...b, [projectId]: false }));
        }
    };

    const handleKick = async (projectId, email) => {
        if (!window.confirm(`${findUserLabel(email)} 님을 프로젝트에서 제외하시겠어요?`)) return;
        try {
            setBusy(b => ({ ...b, [projectId]: true }));
            await removeMember(projectId, email);
        } finally {
            setBusy(b => ({ ...b, [projectId]: false }));
        }
    };

    const handleLeave = async (projectId) => {
        if (!window.confirm('이 프로젝트에서 나가시겠어요? 다시 초대받기 전엔 접근할 수 없습니다.')) return;
        try { await removeMember(projectId, me); } catch (e) { console.error('leave failed', e); }
    };

    const handleDelete = async (projectId) => {
        if (!window.confirm('이 프로젝트를 삭제하시겠어요? (소속 미팅은 삭제되지 않지만 더 이상 보이지 않습니다)')) return;
        try { await deleteProject(projectId); } catch (e) { console.error('delete failed', e); }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-4">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Folder size={22} className="text-blue-600" /> 프로젝트 관리
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">참여 중인 프로젝트만 보입니다. 새 프로젝트를 만들거나 멤버를 초대하세요.</p>
                </div>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
                >
                    <Plus size={14} /> 새 프로젝트
                </button>
            </header>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
                    <Loader size={14} className="animate-spin" /> 로딩 중…
                </div>
            ) : projects.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                    참여 중인 프로젝트가 없습니다. 새 프로젝트를 만들어 보세요.
                </div>
            ) : (
                <ul className="space-y-3">
                    {projects.map(p => {
                        const isCreator = lower(p.createdBy) === me;
                        const isActive = p.id === currentProjectId;
                        return (
                            <li key={p.id} className={`rounded-xl border ${isActive ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'} p-4`}>
                                <div className="flex items-start gap-3">
                                    <div className="text-2xl shrink-0">{p.icon || '📁'}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base font-bold text-gray-900 truncate">{p.name}</h3>
                                            {isCreator && (
                                                <span className="text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
                                                    <Crown size={9} /> 생성자
                                                </span>
                                            )}
                                            {isActive && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">활성</span>
                                            )}
                                        </div>
                                        {p.description && <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>}
                                        <div className="text-[11px] text-gray-500 mt-2 flex items-center gap-1">
                                            <Users size={11} /> {(p.memberEmails || []).length}명
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {(p.memberEmails || []).map(em => {
                                                const canKick = isCreator && lower(em) !== me;
                                                return (
                                                    <span
                                                        key={em}
                                                        className={`inline-flex items-center gap-1 text-[11px] pl-2 py-0.5 rounded-full border ${
                                                            canKick
                                                                ? 'bg-white border-gray-200 pr-0.5'
                                                                : 'bg-gray-50 border-gray-100 pr-2'
                                                        }`}
                                                    >
                                                        <span className={lower(em) === me ? 'font-bold text-blue-700' : 'text-gray-700'}>
                                                            {findUserLabel(em)}
                                                            {lower(em) === me && ' (나)'}
                                                        </span>
                                                        {canKick && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleKick(p.id, em)}
                                                                disabled={busy[p.id]}
                                                                className="ml-0.5 w-5 h-5 inline-flex items-center justify-center rounded-full text-red-500 bg-red-50 hover:bg-red-500 hover:text-white border border-red-200 transition-colors disabled:opacity-40"
                                                                title={`${findUserLabel(em)} 님을 프로젝트에서 제거`}
                                                                aria-label="제거"
                                                            >
                                                                <X size={11} strokeWidth={3} />
                                                            </button>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        {isCreator && (
                                            <div className="mt-1.5 text-[10px] text-gray-500 italic">
                                                💡 각 멤버 옆 빨간 ✕ 버튼으로 프로젝트에서 제거할 수 있습니다.
                                            </div>
                                        )}
                                    </div>
                                    <div className="shrink-0 flex flex-col gap-1.5">
                                        {!isActive && (
                                            <button
                                                onClick={() => setCurrentProjectId(p.id)}
                                                className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
                                            >
                                                활성화
                                            </button>
                                        )}
                                        {isCreator && (
                                            <button
                                                onClick={() => handleInvite(p.id)}
                                                disabled={busy[p.id]}
                                                className="px-2 py-1 text-[11px] font-semibold text-green-700 bg-white border border-green-200 rounded-md hover:bg-green-50"
                                            >
                                                + 초대
                                            </button>
                                        )}
                                        {isCreator ? (
                                            <button
                                                onClick={() => handleDelete(p.id)}
                                                className="px-2 py-1 text-[11px] font-semibold text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 flex items-center gap-0.5 justify-center"
                                            >
                                                <Trash2 size={10} /> 삭제
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleLeave(p.id)}
                                                className="px-2 py-1 text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-0.5 justify-center"
                                            >
                                                <LogOut size={10} /> 나가기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <CreateModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                me={me}
                users={users}
                onCreated={(id) => setCurrentProjectId(id)}
            />
        </div>
    );
};

export default ProjectsPage;
