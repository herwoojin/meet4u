// GuestMeetupForm — 모임 생성/편집 바텀시트
//
// 새 모임: createMeetup 으로 첫 roster 원소(호스트) 자동 삽입.
// 편집(수정): updateMeetupMeta — roster/wait 는 건드리지 않는다.
//
// 기본값은 localStorage (guestMeetup.lastForm) 에 저장해 다음 생성 시
// 장소/실력/은행/예금주 등이 미리 채워지도록 한다.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LEVELS, TYPES, BANKS, DEFAULT_BANK,
    createMeetup, updateMeetupMeta,
} from '../../lib/guestMeetups';

const LS_LAST = 'guestMeetup.lastForm';

const isoToday = () => {
    const d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
};

const readDefaults = () => {
    try { return JSON.parse(localStorage.getItem(LS_LAST) || '{}'); }
    catch { return {}; }
};

const writeDefaults = (v) => {
    try { localStorage.setItem(LS_LAST, JSON.stringify(v)); } catch { /* ignore */ }
};

// 이 기기의 알림 권한 상태 — 마감메세지 블럭에 "내 알림: …" 으로 보여 준다.
const pushStatus = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return { label: '이 브라우저 미지원', tone: '#8b8069' };
    if (Notification.permission === 'granted') return { label: '켜짐', tone: '#2f8f5b' };
    if (Notification.permission === 'denied') return { label: '차단됨', tone: '#c0492b' };
    return { label: '미설정', tone: '#8b8069' };
};

const GuestMeetupForm = ({ editing, seed, user, onClose, onDone, onToast, palette: T }) => {
    const navigate = useNavigate();
    const isEdit = Boolean(editing);
    const defaults = useMemo(readDefaults, []);

    // 초기값 우선순위: editing > seed(다른 페이지에서 넘어온 사전값) > localStorage defaults > 기본값.
    // seed 는 예: 캘린더 미팅에서 "게스트 초대" 로 넘어올 때 날짜/시간/장소가
    // 미리 채워지고, level=2.5, type=남복 이 기본으로 지정된다.
    const [date,   setDate]   = useState(editing?.date   || seed?.date   || isoToday());
    const [start,  setStart]  = useState(editing?.start  || seed?.start  || defaults.start || '06:00');
    const [end,    setEnd]    = useState(editing?.end    || seed?.end    || defaults.end   || '08:00');
    // 장소는 매번 새로 적도록 defaults 를 쓰지 않는다. 편집이나 seed 값이 있으면 그것만 pre-fill.
    // 새 생성 시엔 빈 값으로 시작해 placeholder "예: 삼성동 실내코트 1번" 이 회색으로 노출.
    const [place,  setPlace]  = useState(editing?.place  || seed?.place  || '');
    const [level,  setLevel]  = useState(editing?.level  || seed?.level  || defaults.level || '3.0');
    const [type,   setType]   = useState(editing?.type   || seed?.type   || defaults.type  || '혼복');
    const [cap,    setCap]    = useState(String(editing?.cap ?? defaults.cap ?? 3));
    // 1인당 금액 — 호스트가 직접 지정. 이전 세분류(코트/공/기타) 는 폐기.
    const [perHeadAmount, setPerHeadAmount] = useState(
        String(editing?.perHeadAmount ?? defaults.perHeadAmount ?? 13000)
    );
    // 새 모임은 항상 카톡입금으로 시작(목록 맨 위). 수정할 땐 저장된 은행 그대로.
    const [bankNm, setBankNm] = useState(editing?.bank?.bank || DEFAULT_BANK);
    // 계좌번호 · 예금주는 매번 확인해서 새로 입력하도록 defaults 를 쓰지 않는다.
    // 이렇게 해야 새 모임 생성 시 placeholder("예: 3333-01-1234567", "예: 홍길동")
    // 가 노출되고, 이전에 만든 모임의 실명·계좌가 자동으로 미리 채워지지 않는다.
    const [bankAcc, setBankAcc] = useState(editing?.bank?.acc || '');
    const [holder,  setHolder]  = useState(editing?.bank?.holder || '');
    const [note,   setNote]   = useState(editing?.note || '');
    // 마감 시 참가자 전원에게 푸시로 전송할 안내 문구
    const [closingMessage, setClosingMessage] = useState(editing?.closingMessage || '');
    const [saving, setSaving] = useState(false);

    // 편집 대상이 바뀌면 폼도 갱신 (편집 → 새로 만들기 전환 시)
    useEffect(() => {
        if (!editing) return;
        setDate(editing.date); setStart(editing.start); setEnd(editing.end);
        setPlace(editing.place);
        setLevel(editing.level); setType(editing.type);
        setCap(String(editing.cap));
        setPerHeadAmount(String(editing.perHeadAmount || 0));
        setBankNm(editing.bank?.bank || DEFAULT_BANK);
        setBankAcc(editing.bank?.acc || '');
        setHolder(editing.bank?.holder || '');
        setNote(editing.note || '');
        setClosingMessage(editing.closingMessage || '');
    }, [editing]);

    const save = async () => {
        if (!user?.uid) { onToast('로그인이 필요합니다.'); return; }
        if (!date || !start || !end || !place) {
            onToast('날짜/시간/장소는 필수입니다.'); return;
        }
        setSaving(true);
        const payload = {
            date, start, end, place, level, type,
            cap: Math.max(1, Number(cap) || 1),
            perHeadAmount: Math.max(0, Number(perHeadAmount) || 0),
            bank: { bank: bankNm, acc: bankAcc, holder },
            note,
            closingMessage,
        };
        try {
            if (isEdit) {
                await updateMeetupMeta(editing.id, payload);
                onToast('수정 완료');
            } else {
                // seed.meetingId 가 있으면 그 미팅에서 파생된 초대라는 링크로 저장.
                await createMeetup({ user, ...payload, meetingId: seed?.meetingId || null });
                onToast('모임 생성 완료');
            }
            // 다음 생성 시 자동 채워질 값 — 장소/은행/계좌번호/예금주는 저장하지 않는다
            // (장소·계좌는 매번 확인해 새로 적고, 은행은 늘 카톡입금으로 시작).
            writeDefaults({
                start, end, level, type, cap: payload.cap,
                perHeadAmount: payload.perHeadAmount,
            });
            onDone();
        } catch (e) {
            console.error(e);
            onToast(e.message || '저장 실패');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 45,
            background: 'rgba(30,26,18,.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
            <div onClick={(e) => e.stopPropagation()} style={{
                background: T.bg, width: '100%', maxWidth: 560,
                maxHeight: '92vh', overflow: 'auto',
                borderRadius: '20px 20px 0 0',
                padding: '16px 16px 34px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif',
                color: T.ink,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <b style={{ fontSize: 17 }}>{isEdit ? '모임 수정' : '＋ 모임 만들기'}</b>
                    <button onClick={onClose} style={{
                        fontSize: 20, color: T.sub, background: 'none',
                        border: 0, cursor: 'pointer', padding: '0 4px',
                    }}>×</button>
                </div>

                <Box T={T}>
                    <G2>
                        <F T={T} label="날짜">
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle(T)} />
                        </F>
                        <F T={T} label="모집인원">
                            <input type="number" min="1" value={cap} onChange={(e) => setCap(e.target.value)} style={inputStyle(T)} />
                        </F>
                    </G2>
                    <G2>
                        <F T={T} label="시작"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle(T)} /></F>
                        <F T={T} label="종료"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle(T)} /></F>
                    </G2>
                    <F T={T} label="장소(코트)">
                        <input
                            type="text"
                            value={place}
                            onChange={(e) => setPlace(e.target.value)}
                            placeholder="예: 삼성동 실내코트 1번"
                            style={inputStyle(T)}
                        />
                    </F>
                    <G2>
                        <F T={T} label="실력(NTRP)">
                            <select value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle(T)}>
                                {LEVELS.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </F>
                        <F T={T} label="경기">
                            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle(T)}>
                                {TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </F>
                    </G2>
                </Box>

                <Box T={T} title="1인당 비용 (선택)">
                    <F T={T} label="게스트 1명이 낼 금액">
                        <input
                            type="number" min="0" step="500"
                            value={perHeadAmount}
                            onChange={(e) => setPerHeadAmount(e.target.value)}
                            placeholder="예: 13000"
                            style={inputStyle(T)}
                        />
                    </F>
                </Box>

                <Box T={T} title="입금 계좌 (선택)">
                    <F T={T} label="은행">
                        <select value={bankNm} onChange={(e) => setBankNm(e.target.value)} style={inputStyle(T)}>
                            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </F>
                    <G2>
                        <F T={T} label="계좌번호"><input type="text" value={bankAcc} onChange={(e) => setBankAcc(e.target.value)} placeholder="예: 3333-01-1234567" style={inputStyle(T)} /></F>
                        <F T={T} label="예금주"><input type="text" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="예: 홍길동" style={inputStyle(T)} /></F>
                    </G2>
                </Box>

                <Box T={T} title="🎉 마감메세지 (선택)">
                    <F T={T} label="모임이 마감되는 순간 참가자 전원에게 푸시로 전송됩니다.">
                        <textarea
                            rows={3}
                            value={closingMessage}
                            onChange={(e) => setClosingMessage(e.target.value)}
                            placeholder={'예: 모임인원이 확정되었습니다. "코트는 2번입니다."'}
                            style={{ ...inputStyle(T), resize: 'vertical' }}
                        />
                    </F>
                    {/* 마감 푸시를 받으려면 알림이 켜져 있어야 한다 → 설정의 푸시 알림 칸으로 바로 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, color: T.sub }}>
                            내 알림: <b style={{ color: pushStatus().tone }}>{pushStatus().label}</b>
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                const typed = [place, closingMessage, bankAcc, holder].some((v) => String(v || '').trim());
                                if (typed && !window.confirm('작성 중인 내용은 저장되지 않아요. 알림 설정으로 이동할까요?')) return;
                                onClose?.();
                                navigate('/settings', { state: { focus: 'push' } });
                            }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                                border: `1px solid ${T.line}`, background: '#fff', color: T.ink,
                                fontSize: 13, fontWeight: 800,
                            }}
                        >
                            🔔 알림 푸시 설정 바로가기 ›
                        </button>
                    </div>
                </Box>

                <Box T={T}>
                    <F T={T} label="메모(선택)"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle(T), resize: 'vertical' }} /></F>
                </Box>

                <button
                    onClick={save}
                    disabled={saving}
                    style={{
                        width: '100%', background: saving ? '#a8a294' : T.dark,
                        color: '#fff', border: 0, borderRadius: 12,
                        padding: '13px 0', fontWeight: 800, fontSize: 15,
                        cursor: saving ? 'wait' : 'pointer', marginTop: 4,
                    }}
                >{saving ? '저장 중…' : (isEdit ? '수정 저장' : '모임 만들기')}</button>
            </div>
        </div>
    );
};

// ────────────────────────────────────────────────────────────────
const Box = ({ T, title, children }) => (
    <div style={{
        background: T.card, border: `1px solid ${T.line}`,
        borderRadius: 14, padding: 12, marginBottom: 10,
    }}>
        {title && <h4 style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>{title}</h4>}
        {children}
    </div>
);

const G2 = ({ children }) => (
    <div style={{ display: 'flex', gap: 8 }}>
        {React.Children.map(children, (c) => <div style={{ flex: 1 }}>{c}</div>)}
    </div>
);

const F = ({ T, label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 9 }}>
        <label style={{ fontSize: 12, color: T.sub, fontWeight: 800 }}>{label}</label>
        {children}
    </div>
);

const inputStyle = (T) => ({
    border: `1px solid ${T.line}`, background: '#fff',
    borderRadius: 9, padding: '9px 10px',
    fontSize: 14, width: '100%', font: 'inherit',
});

export default GuestMeetupForm;
