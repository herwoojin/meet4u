// 게스트 모집 (테니스) — 목록 · 필터 · 카드 · FAB
//
// 기존 meet4u 캘린더는 그대로 두고, /guest-meetups 하위에서만 이 신규 스펙이
// 동작한다. 데이터 소스는 lib/guestMeetups.js 의 guestMeetups 컬렉션.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
    COLLECTION, PLACE_PREFIXES, LEVELS, TYPES, placePrefix,
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
                    width: `${Math.min(100, Math.round(used / total * 100))}%`,
                    background: cl ? T.red : T.green,
                    borderRadius: 99,
                }} />
            </div>

            <div style={{ fontSize: 12.5, color: T.sub }}>
                {used}/{total}명 · {m.roster?.map(r => r.name + (r.host ? '(호)' : '')).join(', ')}
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
    const { currentUser } = useAuth();
    const me = currentUser
        ? { uid: currentUser.uid, displayName: currentUser.displayName, email: currentUser.email }
        : null;

    const [meetups, setMeetups] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter state
    const [scope, setScope] = useState('open');
    const [places, setPlaces] = useState([]);
    const [levels, setLevels] = useState([]);
    const [types, setTypes] = useState([]);
    const [sortBy, setSortBy] = useState('date');

    // Modal state
    const [detailId, setDetailId] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);

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

    // Actions
    const runAction = async (action, m) => {
        if (!me?.uid) { showToast('로그인이 필요합니다.'); return; }
        try {
            if (action === 'join') {
                const r = await joinMeetup(m.id, me);
                if (r.status === 'joined') showToast('참가 완료!');
                else if (r.status === 'waiting') showToast(`대기 ${r.position}번으로 등록됐어요.`);
                else if (r.status === 'already-in') showToast('이미 참가중이에요.');
                else if (r.status === 'already-waiting') showToast('이미 대기중이에요.');
            } else if (action === 'leave') {
                const r = await leaveMeetup(m.id, me);
                if (r.promoted) {
                    showToast(`🎉 취소 완료 · 대기 1번 ${r.promoted.name} 님이 자동 참가했어요`, 5000);
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

    // 카톡 공유용 텍스트 만들기 (모집중 일정 요약)
    const buildKakaoShareText = () => {
        const open = meetups
            .filter(m => !isClosed(m))
            .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
        if (open.length === 0) return '📢 지금 모집중인 게스트 모임이 없어요.';
        const url = typeof window !== 'undefined' ? window.location.origin + '/guest-meetups' : '';
        const lines = ['🎾 모집중인 게스트 모임', ''];
        open.slice(0, 10).forEach(m => {
            const left = capTotal(m) - (m.roster?.length || 0);
            lines.push(
                `• ${m.date.slice(5)} (${dayName(m.date)}) ${m.start}~${m.end} · ${m.place}`,
                `  NTRP ${m.level} / ${m.type} · 남은 ${left}자리 · 1인 ${perHead(m).toLocaleString()}원`,
            );
        });
        if (url) lines.push('', `👉 ${url}`);
        return lines.join('\n');
    };

    const handleShare = async () => {
        const text = buildKakaoShareText();
        const ok = await copyToClipboard(text);
        showToast(ok ? '📋 클립보드에 복사됨 — 톡방에 붙여넣기!' : '복사 실패');
    };

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
                            <GhostBtn onClick={handleShare}>📋 톡에 공유</GhostBtn>
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
                            ['open', '모집중'], ['all', '전체'],
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
                        {PLACE_PREFIXES.map(p => (
                            <Chip key={p} label={p} active={places.includes(p)}
                                onClick={() => toggleChip(places, setPlaces, p)} />
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
                    user={currentUser}
                    onClose={() => setFormOpen(false)}
                    onDone={() => { setFormOpen(false); setEditing(null); }}
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
