// 정기 모임(meetings) — 카톡 공유 카드 · 카드 이미지 · 링크 미리보기가 같이 쓰는 순수 계산.
//
// 브라우저와 Netlify 함수 양쪽에서 import 하므로 firebase 등 런타임 의존성을 두지 않는다.
// 참석·불참·미응답 수는 상세 팝업(MeetingDetailModal)과 같은 식으로 센다.

import { hash36 } from './guestSummary.js';

const DAY = ['일', '월', '화', '수', '목', '금', '토'];

// 카드 디자인을 바꾸면 올린다 (URL 이 바뀌어 캐시된 옛 이미지가 재사용되지 않음).
const MEETING_CARD_REV = 1;

// /?meeting=<id>.<버전> — 해시 없는 진입 URL (카톡이 # 이하를 보존한다는 보장이 없어서).
// 버전은 카드 내용이 바뀌면 바뀌어 카톡이 미리보기를 새로 읽게 한다. main.jsx 가 ID 만 쓴다.
export const meetingShareUrl = (origin, id, version) =>
    `${origin}/?meeting=${encodeURIComponent(id)}${version ? `.${version}` : ''}`;

export const parseMeetingParam = (raw) => String(raw || '').split('.')[0];

export const meetingCardContent = (s) =>
    [s.title, s.dateLong, s.time, s.attend, s.decline, s.pending, s.completed].join('|');

export const summarizeMeeting = (m, origin) => {
    const responses = m?.responses || {};
    const values = Object.values(responses);
    const attend = values.filter((v) => v === 'attend').length;
    const decline = values.filter((v) => v === 'decline').length;
    // 상세 팝업과 같은 식: 초대 명단 수 − 응답 수
    const pending = Math.max(0, (m?.attendeesList?.length || 0) - Object.keys(responses).length);
    const completed = m?.status === 'completed';

    const p = String(m?.date || '').split('-').map(Number);
    const ok = p.length === 3 && p.every(Number.isFinite);
    const day = ok ? DAY[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] : '';
    const dateLong = ok ? `${p[1]}월 ${p[2]}일(${day})` : (m?.date || '');

    const s = {
        id: m?.id || '',
        title: (m?.title || '').trim() || '모임',
        dateLong,
        time: `${m?.startTime || ''} ~ ${m?.endTime || ''}`,
        attend, decline, pending, completed,
        countsText: `참석 ${attend} · 불참 ${decline}${pending ? ` · 미응답 ${pending}` : ''}`,
    };
    s.version = hash36(`${MEETING_CARD_REV}|${meetingCardContent(s)}`);
    s.url = meetingShareUrl(origin, s.id, s.version);
    return s;
};

export const meetingCardImageUrl = (origin, s) =>
    `${origin}/.netlify/functions/meeting-card?c=${encodeURIComponent(s.id)}.${s.version}`;

/**
 * 링크로 연 모임을 보여줘도 되는지 — 캘린더와 같은 규칙.
 *   관리자: 전부 · 그 외: 내가 멤버인 프로젝트의 숨김 아닌 모임만
 * @returns {'ok'|'missing'|'hidden'|'not-member'}
 */
export const meetingAccess = (meeting, myProjectIds, isAdmin, defaultProjectId) => {
    if (!meeting) return 'missing';
    if (isAdmin) return 'ok';
    const pid = meeting.projectId || defaultProjectId;
    if (!myProjectIds.has(pid)) return 'not-member';
    if (meeting.hidden) return 'hidden';
    return 'ok';
};
