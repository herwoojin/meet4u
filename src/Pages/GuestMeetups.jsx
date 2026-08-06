// 게스트 모집 (테니스) — 목록 · 필터 · 카드 · FAB
//
// 기존 meet4u 캘린더는 그대로 두고, /guest-meetups 하위에서만 이 신규 스펙이
// 동작한다. 데이터 소스는 lib/guestMeetups.js 의 guestMeetups 컬렉션.

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
    COLLECTION, LEVELS, TYPES, placePrefix,
    capTotal, isClosed, findRosterIndex, findWaitIndex, perHead,
    joinMeetup, leaveMeetup, waitMeetup, cancelWait,
} from '../lib/guestMeetups';
import GuestMeetupDetail from '../Components/guest/GuestMeetupDetail';
import GuestMeetupForm from '../Components/guest/GuestMeetupForm';

// ────────────────────────────────────────────────────────────────
// 팔레트 (스펙 컬러 그대로) — Tailwind 로 표현하기 어려운 톤이라 인라인 CSS.
// ────────────────────────────────────────────────────────────────
const T = {
    bg: '#f2ecdd', card: '#fbf8f0', line: '#e5dbc4',
    ink: '#2b2721', sub: '#8b8069', accent: '#e0a13c',
    dark: '#171a33', green: '#2f8f5b', red: '#c0492b',
};

const dayColor = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00').getDay();
    if (d === 0) return T.red;   // 일
    if (d === 6) return '#2f6f8f'; // 토
    return T.ink;
};

const dayName = (dateStr) =>
    ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr + 'T00:00:00').getDay()];

const groupHeader = (dateStr) => {
    const p = dateStr.split('-');
    return `${Number(p[1])}월 ${Number(p[2])}일 (${dayName(dateStr)})`;
};

const showToast = (msg, durationMs = 2200) => {
    // 간단한 top-of-viewport 토스트. duration 을 파라미터로 받아, 대기 자동
    // 승격 같은 중요한 안내는 더 길게 노출할 수 있게 한다.
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '86px',
        transform: 'translateX(-50%)',
        background: 'rgba(23,26,51,.95)', color: '#fff',
        padding: '11px 16px', borderRadius: '12px',
        fontSize: '13px', fontWeight: '700', zIndex: '9999',
        maxWidth: '90%', textAlign: 'center', opacity: '0',
        transition: 'opacity .25s',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, Math.max(500, durationMs));
};

// 서버로 푸시 알림 요청. 상대가 FCM 토큰을 등록해뒀다면 앱이 닫혀
// 있어도 잠금화면에 알림이 뜬다. 응답을 기다리지 않고 fire-and-forget.
const sendPush = ({ type, title, body, url, recipientUids, senderUid }) => {
    try {
        fetch('/.netlify/functions/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, title, body, url, recipientUids, senderUid }),
        }).catch(err => console.warn('[guest] push failed', err));
    } catch (e) {
        console.warn('[guest] push threw', e);
    }
};

const meetupLabel = (m) => {
    if (!m?.date) return '';
    const p = m.date.split('-');
    const md = `${Number(p[1])}/${Number(p[2])}`;
    return `${md} ${m.start || ''} ${m.place || ''}`.trim();
};

// 카카오톡 인앱 브라우저용 클립보드 폴백 포함
const copyToClipboard = async (text) => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) { /* fall through */ }
    // Legacy fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (_) {
        document.body.removeChild(ta);
        return false;
    }
};

// ────────────────────────────────────────────────────────────────
// Card
// ────────────────────────────────────────────────────────────────
const MeetupCard = ({ m, me, onClick, onAction }) => {
    const cl = isClosed(m);
    const used = m.roster?.length || 0;
    const total = capTotal(m);
    const left = Math.max(0, total - used);
    // 카드에 표시되는 '게스트 N명 / 모집인원 M명'
    // host 는 카운트에서 제외한다: guests = roster - 1 (호스트 존재 시)
    const capOnly = Math.max(1, m.cap ?? 0);
    const guestCount = Math.max(0, used - (m.roster?.[0]?.host ? 1 : 0));
    const myRosterIdx = me?.uid ? findRosterIndex(m, me.uid) : -1;
    const myWaitIdx = me?.uid ? findWaitIndex(m, me.uid) : -1;
    const mine = myRosterIdx >= 0;
    const waiting = myWaitIdx >= 0;

    return (
        <div
            onClick={onClick}
            style={{
                background: T.card, border: `1px solid ${T.line}`,
                borderRadius: 16, padding: '12px 13px', marginBottom: 9,
                boxShadow: '0 1px 2px rgba(0,0,0,.03)',
                opacity: cl ? 0.78 : 1, cursor: 'pointer',
            }}
        >
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {m.start}
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: T.sub, marginLeft: 3 }}>
                        ~ {m.end}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Badge bg="#fbeccd" fg="#8a6410">{m.level}</Badge>
                    <Badge bg="#dcebf3" fg="#245a75">{m.type}</Badge>
                    {cl
                        ? <Badge bg="#f3d9d1" fg={T.red}>마감</Badge>
                        : <Badge bg="#d9eede" fg={T.green}>{left}자리</Badge>}
                </div>
            </div>

            <div style={{ marginTop: 7, fontWeight: 800, fontSize: 14.5 }}>📍 {m.place}</div>
            <div style={{ marginTop: 2, fontSize: 12.5, color: T.sub }}>
                호스트 {m.roster?.[0]?.name || '-'} · 게스트 {m.cap}명 모집
                {mine && <> · <b>내가 참가중</b></>}
                {waiting && <> · <b>내 대기 {myWaitIdx + 1}번</b></>}
            </div>

            {/* Progress bar */}
            <div style={{
                height: 6, background: '#eae1cc', borderRadius: 99,
                margin: '9px 0 6px', overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%',
                    width: `${Math.min(100, Math.round(guestCount / capOnly * 100))}%`,
                    background: cl ? T.red : T.green,
                    borderRadius: 99,
                }} />
            </div>

            <div style={{ fontSize: 12.5, color: T.sub }}>
                {guestCount}/{capOnly}명 · {m.roster?.map(r => r.name + (r.host ? '(호)' : '')).join(', ')}
                {(m.wait?.length || 0) > 0 && (
                    <span style={{
                        fontSize: 10.5, background: '#eee6d3', color: T.sub,
                        borderRadius: 5, padding: '2px 5px', marginLeft: 5, fontWeight: 800,
                    }}>대기 {m.wait.length}</span>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                {!cl && !mine && (
                    <ActionButton variant="primary" onClick={() => onAction('join', m)}>참가하기</ActionButton>
                )}
                {mine && !m.roster[myRosterIdx].host && (
                    <ActionButton variant="danger" onClick={() => onAction('leave', m)}>참가 취소</ActionButton>
                )}
                {cl && !mine && !waiting && (
                    <ActionButton variant="warn" onClick={() => onAction('wait', m)}>대기 걸기</ActionButton>
                )}
                {waiting && (
                    <ActionButton variant="danger" onClick={() => onAction('cancelWait', m)}>대기 취소</ActionButton>
                )}
                <ActionButton variant="ghost" onClick={onClick}>상세</ActionButton>
            </div>
        </div>
    );
};

const Badge = ({ bg, fg, children }) => (
    <span style={{
        fontSize: 11, fontWeight: 800, borderRadius: 6,
        padding: '3px 6px', background: bg, color: fg,
    }}>{children}</span>
);

const ActionButton = ({ variant = 'ghost', onClick, children }) => {
    const styles = {
        ghost:   { background: '#fff', color: T.ink,  border: `1px solid ${T.line}` },
        primary: { background: T.dark, color: '#fff', border: `1px solid ${T.dark}` },
        warn:    { background: T.accent, color: '#241a05', border: `1px solid ${T.accent}` },
        danger:  { background: '#fff', color: T.red, border: '1px solid #e8c3b8' },
    };
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                flex: 1, borderRadius: 10, padding: '9px 0',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                ...styles[variant],
            }}
        >{children}</button>
    );
};

// ────────────────────────────────────────────────────────────────
// Chip (다중 선택)
// ────────────────────────────────────────────────────────────────
const Chip = ({ label, active, kind = 'default', onClick }) => {
    const styles = {
        default: active
            ? { background: T.dark, borderColor: T.dark, color: '#fff' }
            : { background: T.card, borderColor: T.line, color: T.sub },
        level: active
            ? { background: T.accent, borderColor: T.accent, color: '#241a05' }
            : { background: T.card, borderColor: T.line, color: T.sub },
        type: active
            ? { background: '#2f6f8f', borderColor: '#2f6f8f', color: '#fff' }
            : { background: T.card, borderColor: T.line, color: T.sub },
    };
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                border: '1px solid', borderRadius: 999,
                padding: '5px 10px', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', ...styles[kind],
            }}
        >{label}</button>
    );
};

// ────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────
const GuestMeetups = () => {
    const { currentUser, isAdmin } = useAuth();
    const me = currentUser
        ? { uid: currentUser.uid, displayName: currentUser.displayName, email: currentUser.email }
        : null;

    const [meetups, setMeetups] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter state
    // 기본 탭은 '전체보기'. 사용자가 페이지 진입할 때마다 초기 상태로 전체보기 노출.
    const [scope, setScope] = useState('all');
    const [places, setPlaces] = useState([]);
    const [levels, setLevels] = useState([]);
    const [types, setTypes] = useState([]);
    const [sortBy, setSortBy] = useState('date');

    // Modal state
    const [detailId, setDetailId] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    // 다른 페이지(MeetingDetailModal 등) 에서 이 페이지로 넘어올 때 미리 채워
    // 놓을 값. editing 과 달리 id 가 없어 저장 시 createMeetup 흐름을 탄다.
    const [seed, setSeed] = useState(null);

    // 라우터 state 로 넘어온 guestMeetupSeed 를 감지해 폼 자동 오픈.
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const s = location.state?.guestMeetupSeed;
        if (s) {
            setSeed(s);
            setEditing(null);
            setFormOpen(true);
            // 새로고침 시 다시 열리지 않도록 state 정리
            navigate(location.pathname, { replace: true, state: null });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 딥링크 자동 오픈. URL query(?open=id) 우선, 없으면 main.jsx 가 stash 한
    // sessionStorage.guest_pending_open 을 사용(로그인 리다이렉트로 잃어버린 경우).
    useEffect(() => {
        let openId = '';
        try {
            openId = new URLSearchParams(location.search).get('open') || '';
        } catch (_) { /* ignore */ }
        if (!openId) {
            try {
                openId = sessionStorage.getItem('guest_pending_open') || '';
                if (openId) sessionStorage.removeItem('guest_pending_open');
            } catch (_) { /* ignore */ }
        }
        if (openId) setDetailId(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    // 실시간 구독
    useEffect(() => {
        const q = query(collection(db, COLLECTION), orderBy('date', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setMeetups(list);
            setLoading(false);
        }, (err) => {
            console.error('[guestMeetups] snapshot error:', err);
            setLoading(false);
        });
        return unsub;
    }, []);

    const toggleChip = (arr, setArr, v) => {
        setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
    };

    // Filter + Sort
    const visible = useMemo(() => {
        let a = meetups.filter(m => {
            if (scope === 'open' && isClosed(m)) return false;
            if (scope === 'mine' && (!me?.uid || findRosterIndex(m, me.uid) < 0)) return false;
            if (scope === 'wait' && (!me?.uid || findWaitIndex(m, me.uid) < 0)) return false;
            // 장소 필터: chip 은 "충장" 같은 prefix 만 노출되므로, 미팅의
            // 실제 place("충장 1번") 를 prefix 로 잘라 매칭한다.
            if (places.length && !places.includes(placePrefix(m.place))) return false;
            if (levels.length && !levels.includes(m.level)) return false;
            if (types.length && !types.includes(m.type)) return false;
            return true;
        });
        a.sort((x, y) => {
            if (sortBy === 'place') {
                const c = (x.place || '').localeCompare(y.place || '', 'ko');
                if (c) return c;
            }
            if (sortBy === 'level') {
                const c = parseFloat(x.level) - parseFloat(y.level);
                if (c) return c;
            }
            if (sortBy === 'left') {
                const lx = capTotal(x) - (x.roster?.length || 0);
                const ly = capTotal(y) - (y.roster?.length || 0);
                if (ly - lx) return ly - lx;
            }
            return (x.date + x.start).localeCompare(y.date + y.start);
        });
        return a;
    }, [meetups, scope, places, levels, types, sortBy, me?.uid]);

    // 날짜별 그룹핑
    const grouped = useMemo(() => {
        const map = new Map();
        visible.forEach(m => {
            if (!map.has(m.date)) map.set(m.date, []);
            map.get(m.date).push(m);
        });
        return Array.from(map.entries());
    }, [visible]);

    // 장소 필터 chip 목록 — 오직 등록된 모임에서 뽑은 prefix 만 사용.
    // 프리셋 시드는 없다. 호스트가 모임을 만들 때 적은 장소가 그대로
    // 필터의 원천이 되고, 관리자는 chip 옆 ✏️/🗑 로 이름을 바꾸거나
    // 관련 모임을 일괄 삭제해서 관리한다.
    const dynamicPrefixes = useMemo(() => {
        const set = new Set();
        meetups.forEach(m => {
            const p = placePrefix(m.place);
            if (p) set.add(p);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    }, [meetups]);

    // 관리자: 장소 prefix 이름을 일괄 rename. 해당 prefix 를 가진 모든 모임의
    // place 필드에서 prefix 부분만 새 이름으로 교체(뒷 번호는 유지).
    const handleRenamePrefix = async (oldPrefix) => {
        if (!isAdmin) return;
        const newName = window.prompt(
            `"${oldPrefix}" 장소명을 무엇으로 바꿀까요?\n(해당 prefix 를 가진 모든 모임이 함께 갱신됩니다)`,
            oldPrefix,
        );
        if (newName == null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldPrefix) return;
        const targets = meetups.filter(m => placePrefix(m.place) === oldPrefix);
        if (targets.length === 0) { showToast('바뀌는 모임이 없어요.'); return; }
        try {
            const batch = writeBatch(db);
            targets.forEach(m => {
                const newPlace = (m.place || '').replace(oldPrefix, trimmed);
                batch.update(doc(db, COLLECTION, m.id), { place: newPlace });
            });
            await batch.commit();
            setPlaces(prev => prev.map(p => (p === oldPrefix ? trimmed : p)));
            showToast(`장소명 "${oldPrefix}" → "${trimmed}" · ${targets.length}건 갱신`);
        } catch (e) {
            console.error(e);
            showToast('갱신 실패: ' + (e.message || ''));
        }
    };

    // 관리자: 장소 prefix 를 가진 모든 모임을 일괄 삭제.
    const handleDeletePrefix = async (prefix) => {
        if (!isAdmin) return;
        const targets = meetups.filter(m => placePrefix(m.place) === prefix);
        if (targets.length === 0) { showToast('삭제할 모임이 없어요.'); return; }
        if (!window.confirm(
            `"${prefix}" 장소의 모임 ${targets.length}건을 모두 삭제할까요?\n되돌릴 수 없습니다.`
        )) return;
        try {
            const batch = writeBatch(db);
            targets.forEach(m => batch.delete(doc(db, COLLECTION, m.id)));
            await batch.commit();
            setPlaces(prev => prev.filter(p => p !== prefix));
            showToast(`"${prefix}" 관련 ${targets.length}건 삭제됨`);
        } catch (e) {
            console.error(e);
            showToast('삭제 실패: ' + (e.message || ''));
        }
    };

    // Actions
    const runAction = async (action, m) => {
        if (!me?.uid) { showToast('로그인이 필요합니다.'); return; }
        try {
            if (action === 'join') {
                const r = await joinMeetup(m.id, me);
                if (r.status === 'joined') {
                    showToast('참가 완료!');
                    // 내 참가로 인해 모임이 방금 마감됐다면 참가자 전원(발신자
                    // 제외) 에게 마감 알림 발송. body 는 호스트가 폼에서 지정한
                    // closingMessage — 없으면 기본 안내 문구.
                    if (r.closed) {
                        const allUids = (r.finalRoster || [])
                            .map(x => x.uid)
                            .filter(uid => uid && uid !== me.uid);
                        if (allUids.length > 0) {
                            const bodyText = (r.closingMessage && r.closingMessage.trim())
                                || `${meetupLabel(m)} 모임 인원이 확정되었습니다.`;
                            sendPush({
                                type: 'guest-full',
                                title: '🎉 모임 마감!',
                                body: bodyText,
                                url: '/guest-meetups',
                                recipientUids: allUids,
                                senderUid: me.uid,
                            });
                        }
                    }
                }
                else if (r.status === 'waiting') showToast(`대기 ${r.position}번으로 등록됐어요.`);
                else if (r.status === 'already-in') showToast('이미 참가중이에요.');
                else if (r.status === 'already-waiting') showToast('이미 대기중이에요.');
            } else if (action === 'leave') {
                const r = await leaveMeetup(m.id, me);
                if (r.promoted) {
                    showToast(`🎉 취소 완료 · 대기 1번 ${r.promoted.name} 님이 자동 참가했어요`, 5000);
                    // 승격된 사람에게 푸시 — 앱을 열지 않아도 잠금화면에 뜬다
                    if (r.promoted.uid && r.promoted.uid !== me.uid) {
                        sendPush({
                            type: 'guest-promoted',
                            title: '🎉 대기 → 참가 확정!',
                            body: `${meetupLabel(m)} 모임에 자동 참가됐어요.`,
                            url: '/guest-meetups',
                            recipientUids: [r.promoted.uid],
                            senderUid: me.uid,
                        });
                    }
                } else {
                    showToast('참가 취소했어요.');
                }
            } else if (action === 'wait') {
                const r = await waitMeetup(m.id, me);
                if (r.status === 'waiting') showToast(`대기 ${r.position}번 등록`);
                else showToast('이미 참가/대기중이에요.');
            } else if (action === 'cancelWait') {
                await cancelWait(m.id, me);
                showToast('대기 취소했어요.');
            }
        } catch (e) {
            console.error(e);
            showToast(e.message || '요청 실패');
        }
    };

    // '톡에 공유' 는 이제 각 상세 팝업에만 두므로 요약 텍스트 빌더는 제거.
    // 링크복사만 헤더에 남긴다.

    const handleShareLink = async () => {
        const url = typeof window !== 'undefined' ? window.location.origin + '/guest-meetups' : '';
        const ok = await copyToClipboard(url);
        showToast(ok ? '🔗 링크 복사됨' : '복사 실패');
    };

    const resetFilters = () => {
        setPlaces([]); setLevels([]); setTypes([]); setSortBy('date');
    };

    // ────────────────────────────────────────────────────────────
    const detailMeetup = detailId ? meetups.find(m => m.id === detailId) : null;

    return (
        <div style={{
            background: T.bg, color: T.ink, minHeight: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif',
        }}>
            <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 14px' }}>
                {/* Sticky Header */}
                <header style={{
                    position: 'sticky', top: 0, zIndex: 30,
                    background: 'rgba(242,236,221,.96)',
                    backdropFilter: 'saturate(180%) blur(10px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(10px)',
                    borderBottom: `1px solid ${T.line}`,
                    padding: '10px 0 9px',
                    margin: '0 -14px 0',
                    paddingLeft: 14, paddingRight: 14,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.3px' }}>🎾 게스트 모집</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <GhostBtn onClick={handleShareLink}>🔗 링크복사</GhostBtn>
                            {/* 헤더로 승격된 모임 만들기 CTA — 어두운 톤으로 강조 */}
                            <button
                                type="button"
                                onClick={() => { setEditing(null); setFormOpen(true); }}
                                style={{
                                    background: T.dark, color: '#fff',
                                    border: 0, borderRadius: 999,
                                    padding: '6px 14px', fontSize: 12.5, fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(23,26,51,.25)',
                                }}
                            >＋ 모임 만들기</button>
                        </div>
                    </div>

                    {/* Scope Tabs */}
                    <div style={{
                        display: 'flex', gap: 6, marginTop: 10,
                        background: '#eae1cc', borderRadius: 12, padding: 4,
                    }}>
                        {[
                            ['all', '전체보기'], ['open', '모집중'],
                            ['mine', '내 참가'], ['wait', '내 대기'],
                        ].map(([key, label]) => (
                            <button key={key}
                                onClick={() => setScope(key)}
                                style={{
                                    flex: 1, border: 0, cursor: 'pointer',
                                    borderRadius: 9, padding: '7px 0',
                                    fontSize: 13, fontWeight: 700,
                                    background: scope === key ? T.card : 'transparent',
                                    color: scope === key ? T.ink : T.sub,
                                    boxShadow: scope === key ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                                }}
                            >{label}</button>
                        ))}
                    </div>

                    {/* Filters */}
                    <FilterRow label="장소">
                        {dynamicPrefixes.length === 0 && (
                            <span style={{ fontSize: 12, color: T.sub, paddingTop: 6 }}>
                                아직 등록된 장소가 없어요 — 모임을 만들면 여기에 자동 추가됩니다.
                            </span>
                        )}
                        {dynamicPrefixes.map(p => (
                            <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Chip label={p} active={places.includes(p)}
                                    onClick={() => toggleChip(places, setPlaces, p)} />
                                {isAdmin && (
                                    <>
                                        <button
                                            type="button"
                                            title={`"${p}" 장소명 일괄 변경`}
                                            onClick={() => handleRenamePrefix(p)}
                                            style={{
                                                border: 'none', background: 'transparent',
                                                color: T.sub, cursor: 'pointer',
                                                padding: '2px 3px', fontSize: 11, opacity: 0.7,
                                            }}
                                        >✏️</button>
                                        <button
                                            type="button"
                                            title={`"${p}" 관련 모임 모두 삭제`}
                                            onClick={() => handleDeletePrefix(p)}
                                            style={{
                                                border: 'none', background: 'transparent',
                                                color: T.red, cursor: 'pointer',
                                                padding: '2px 3px', fontSize: 11, opacity: 0.7,
                                            }}
                                        >🗑</button>
                                    </>
                                )}
                            </span>
                        ))}
                    </FilterRow>
                    <FilterRow label="실력 NTRP">
                        {LEVELS.map(v => (
                            <Chip key={v} label={v} kind="level" active={levels.includes(v)}
                                onClick={() => toggleChip(levels, setLevels, v)} />
                        ))}
                    </FilterRow>
                    <FilterRow label="경기">
                        {TYPES.map(v => (
                            <Chip key={v} label={v} kind="type" active={types.includes(v)}
                                onClick={() => toggleChip(types, setTypes, v)} />
                        ))}
                    </FilterRow>

                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginTop: 9,
                    }}>
                        <div style={{ fontSize: 12, color: T.sub, fontWeight: 800, display: 'flex', gap: 6, alignItems: 'center' }}>
                            정렬
                            <select
                                value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                                style={{
                                    border: `1px solid ${T.line}`, background: T.card,
                                    borderRadius: 8, padding: '5px 8px', font: 'inherit',
                                    fontSize: 12.5, fontWeight: 700,
                                }}
                            >
                                <option value="date">날짜 빠른순</option>
                                <option value="place">장소순</option>
                                <option value="left">잔여석 많은순</option>
                                <option value="level">실력순</option>
                            </select>
                        </div>
                        <button onClick={resetFilters} style={{
                            border: 0, background: 'none', color: T.sub,
                            fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
                        }}>필터 초기화</button>
                    </div>
                </header>

                {/* List */}
                <main style={{ paddingBottom: 40, paddingTop: 4 }}>
                    {loading && <div style={{ textAlign: 'center', color: T.sub, padding: '50px 0' }}>불러오는 중…</div>}
                    {!loading && grouped.length === 0 && (
                        <div style={{ textAlign: 'center', color: T.sub, fontSize: 13.5, padding: '50px 0' }}>
                            조건에 맞는 모임이 없어요.<br />
                            우측 상단 <b>＋ 모임 만들기</b> 로 첫 모임을 만들어 보세요!
                        </div>
                    )}
                    {grouped.map(([date, items]) => (
                        <section key={date}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                margin: '16px 2px 7px',
                            }}>
                                <b style={{ fontSize: 15, color: dayColor(date) }}>{groupHeader(date)}</b>
                                <span style={{ fontSize: 11.5, color: T.sub }}>· {items.length}건</span>
                            </div>
                            {items.map(m => (
                                <MeetupCard key={m.id} m={m} me={me}
                                    onClick={() => setDetailId(m.id)}
                                    onAction={runAction} />
                            ))}
                        </section>
                    ))}
                </main>
            </div>

            {/* Detail modal */}
            {detailMeetup && (
                <GuestMeetupDetail
                    m={detailMeetup}
                    me={me}
                    onClose={() => setDetailId(null)}
                    onAction={runAction}
                    onEdit={(m) => { setEditing(m); setDetailId(null); setFormOpen(true); }}
                    onToast={showToast}
                    palette={T}
                />
            )}

            {/* Create/Edit form */}
            {formOpen && (
                <GuestMeetupForm
                    editing={editing}
                    seed={seed}
                    user={currentUser}
                    onClose={() => { setFormOpen(false); setSeed(null); }}
                    onDone={() => { setFormOpen(false); setEditing(null); setSeed(null); }}
                    onToast={showToast}
                    palette={T}
                />
            )}
        </div>
    );
};

// ────────────────────────────────────────────────────────────────
const FilterRow = ({ label, children }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 9 }}>
        <div style={{ flex: '0 0 64px', fontSize: 12, color: T.sub, fontWeight: 800, paddingTop: 6 }}>
            {label}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{children}</div>
    </div>
);

const GhostBtn = ({ onClick, children }) => (
    <button onClick={onClick} style={{
        border: `1px solid ${T.line}`, background: T.card,
        borderRadius: 999, padding: '6px 10px', fontSize: 12.5, fontWeight: 700,
        color: T.ink, cursor: 'pointer',
    }}>{children}</button>
);

export default GuestMeetups;
