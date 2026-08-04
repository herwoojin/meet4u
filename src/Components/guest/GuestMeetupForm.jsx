// GuestMeetupForm — 모임 생성/편집 바텀시트
//
// 새 모임: createMeetup 으로 첫 roster 원소(호스트) 자동 삽입.
// 편집(수정): updateMeetupMeta — roster/wait 는 건드리지 않는다.
//
// 기본값은 localStorage (guestMeetup.lastForm) 에 저장해 다음 생성 시
// 장소/실력/은행/예금주 등이 미리 채워지도록 한다.

import React, { useEffect, useMemo, useState } from 'react';
import {
    PLACES, LEVELS, TYPES, REGIONS, BANKS,
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

const GuestMeetupForm = ({ editing, user, onClose, onDone, onToast, palette: T }) => {
    const isEdit = Boolean(editing);
    const defaults = useMemo(readDefaults, []);

    const [date,   setDate]   = useState(editing?.date   || isoToday());
    const [start,  setStart]  = useState(editing?.start  || defaults.start || '06:00');
    const [end,    setEnd]    = useState(editing?.end    || defaults.end   || '08:00');
    const [place,  setPlace]  = useState(editing?.place  || defaults.place || PLACES[0]);
    const [region, setRegion] = useState(editing?.region || defaults.region|| REGIONS[0]);
    const [level,  setLevel]  = useState(editing?.level  || defaults.level || '3.0');
    const [type,   setType]   = useState(editing?.type   || defaults.type  || '혼복');
    const [cap,    setCap]    = useState(String(editing?.cap ?? defaults.cap ?? 3));
    const [court,  setCourt]  = useState(String(editing?.cost?.court ?? defaults.cost?.court ?? 40000));
    const [ball,   setBall]   = useState(String(editing?.cost?.ball  ?? defaults.cost?.ball  ?? 12000));
    const [etc,    setEtc]    = useState(String(editing?.cost?.etc   ?? defaults.cost?.etc   ?? 0));
    const [bankNm, setBankNm] = useState(editing?.bank?.bank   || defaults.bank?.bank   || '카카오뱅크');
    const [bankAcc,setBankAcc]= useState(editing?.bank?.acc    || defaults.bank?.acc    || '');
    const [holder, setHolder] = useState(
        editing?.bank?.holder
        || defaults.bank?.holder
        || user?.displayName
        || (user?.email ? user.email.split('@')[0] : ''),
    );
    const [note,   setNote]   = useState(editing?.note || '');
    const [saving, setSaving] = useState(false);

    // 편집 대상이 바뀌면 폼도 갱신 (편집 → 새로 만들기 전환 시)
    useEffect(() => {
        if (!editing) return;
        setDate(editing.date); setStart(editing.start); setEnd(editing.end);
        setPlace(editing.place); setRegion(editing.region || REGIONS[0]);
        setLevel(editing.level); setType(editing.type);
        setCap(String(editing.cap));
        setCourt(String(editing.cost?.court || 0));
        setBall(String(editing.cost?.ball || 0));
        setEtc(String(editing.cost?.etc || 0));
        setBankNm(editing.bank?.bank || '카카오뱅크');
        setBankAcc(editing.bank?.acc || '');
        setHolder(editing.bank?.holder || '');
        setNote(editing.note || '');
    }, [editing]);

    const save = async () => {
        if (!user?.uid) { onToast('로그인이 필요합니다.'); return; }
        if (!date || !start || !end || !place) {
            onToast('날짜/시간/장소는 필수입니다.'); return;
        }
        setSaving(true);
        const payload = {
            date, start, end, place, region, level, type,
            cap: Math.max(1, Number(cap) || 1),
            cost: {
                court: Math.max(0, Number(court) || 0),
                ball:  Math.max(0, Number(ball)  || 0),
                etc:   Math.max(0, Number(etc)   || 0),
            },
            bank: { bank: bankNm, acc: bankAcc, holder },
            note,
        };
        try {
            if (isEdit) {
                await updateMeetupMeta(editing.id, payload);
                onToast('수정 완료');
            } else {
                await createMeetup({ user, ...payload });
                onToast('모임 생성 완료');
            }
            writeDefaults({
                start, end, place, region, level, type, cap: payload.cap,
                cost: payload.cost, bank: payload.bank,
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
                        <F T={T} label="인원(호스트 제외)">
                            <input type="number" min="1" value={cap} onChange={(e) => setCap(e.target.value)} style={inputStyle(T)} />
                        </F>
                    </G2>
                    <G2>
                        <F T={T} label="시작"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle(T)} /></F>
                        <F T={T} label="종료"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle(T)} /></F>
                    </G2>
                    <F T={T} label="장소(코트)">
                        <input list="places-suggest" value={place} onChange={(e) => setPlace(e.target.value)} style={inputStyle(T)} />
                        <datalist id="places-suggest">
                            {PLACES.map(p => <option key={p} value={p} />)}
                        </datalist>
                    </F>
                    <G2>
                        <F T={T} label="지역">
                            <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle(T)}>
                                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </F>
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

                <Box T={T} title="비용 (원)">
                    <G2>
                        <F T={T} label="코트비"><input type="number" min="0" step="1000" value={court} onChange={(e) => setCourt(e.target.value)} style={inputStyle(T)} /></F>
                        <F T={T} label="테니스공"><input type="number" min="0" step="1000" value={ball} onChange={(e) => setBall(e.target.value)} style={inputStyle(T)} /></F>
                        <F T={T} label="기타"><input type="number" min="0" step="1000" value={etc} onChange={(e) => setEtc(e.target.value)} style={inputStyle(T)} /></F>
                    </G2>
                </Box>

                <Box T={T} title="입금 계좌">
                    <F T={T} label="은행">
                        <select value={bankNm} onChange={(e) => setBankNm(e.target.value)} style={inputStyle(T)}>
                            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </F>
                    <G2>
                        <F T={T} label="계좌번호"><input type="text" value={bankAcc} onChange={(e) => setBankAcc(e.target.value)} placeholder="예: 3333-01-1234567" style={inputStyle(T)} /></F>
                        <F T={T} label="예금주"><input type="text" value={holder} onChange={(e) => setHolder(e.target.value)} style={inputStyle(T)} /></F>
                    </G2>
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
