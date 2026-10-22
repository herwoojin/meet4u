// 카톡 등으로 공유된 정기 모임 링크(/?meeting=<id>)를 열었을 때 그 모임 팝업을 띄운다.
//
// main.jsx 가 링크의 모임 ID 를 sessionStorage(meeting_pending_open)에 남겨 두면,
// 로그인한 뒤 어느 페이지에 있든 MainLayout 안의 이 컴포넌트가 팝업을 연다.
// 팝업에서 바로 참석·불참을 고르고 저장할 수 있다(MeetingDetailModal 그대로).
//
// 보여줘도 되는지는 캘린더와 같은 규칙(meetingAccess): 내 프로젝트의 숨김 아닌 모임만,
// 관리자는 전부. 아니면 내용 없이 안내만 띄운다. (Firestore 규칙은 로그인 사용자 읽기를
// 허용하므로, 다른 프로젝트 일정이 새지 않게 여기서 한 번 더 막는다)

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { DEFAULT_PROJECT_ID } from '../../lib/projects';
import { meetingAccess } from '../../lib/meetingSummary';
import MeetingDetailModal from './MeetingDetailModal';

const STASH_KEY = 'meeting_pending_open';
const readStash = () => {
    try { return sessionStorage.getItem(STASH_KEY) || null; } catch (_) { return null; }
};

const NOTICE = {
    missing: { title: '모임을 찾을 수 없어요', body: '삭제되었거나 링크가 잘못되었을 수 있어요.' },
    hidden: { title: '지금은 볼 수 없는 모임이에요', body: '모임을 만든 사람이 숨김 처리했어요.' },
    'not-member': { title: '프로젝트 멤버만 볼 수 있어요', body: '이 모임의 프로젝트에 초대받은 뒤 링크를 다시 열어 주세요.' },
};

const MeetingLinkOpener = () => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const { projects, loading: projectsLoading } = useProjects();

    // StrictMode 에서 초기화 함수가 두 번 불려도 안전하도록, 읽기만 하고 지우는 건 effect 에서.
    const [meetingId, setMeetingId] = useState(readStash);
    const [meeting, setMeeting] = useState(undefined);   // undefined: 불러오는 중, null: 없음

    useEffect(() => {
        if (meetingId) {
            try { sessionStorage.removeItem(STASH_KEY); } catch (_) { /* ignore */ }
        }
    }, [meetingId]);

    // 실시간 구독 — 팝업을 연 채로 다른 사람이 응답하면 숫자가 바로 바뀐다.
    useEffect(() => {
        if (!meetingId) return undefined;
        return onSnapshot(
            doc(db, 'meetings', meetingId),
            (snap) => setMeeting(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            (err) => { console.warn('[MeetingLinkOpener]', err?.code || err); setMeeting(null); },
        );
    }, [meetingId]);

    if (!meetingId || meeting === undefined || projectsLoading) return null;

    const close = () => setMeetingId(null);
    const access = meetingAccess(meeting, new Set(projects.map((p) => p.id)), isAdmin, DEFAULT_PROJECT_ID);

    if (access !== 'ok') {
        const n = NOTICE[access];
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="text-3xl mb-2">🔒</div>
                    <div className="font-bold text-gray-900 mb-1">{n.title}</div>
                    <div className="text-sm text-gray-500 mb-5">{n.body}</div>
                    <button onClick={close} className="w-full py-2.5 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">
                        닫기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <MeetingDetailModal
            meeting={meeting}
            onClose={close}
            onEdit={(m) => { close(); navigate('/schedule', { state: { meetingToEdit: m } }); }}
        />
    );
};

export default MeetingLinkOpener;
