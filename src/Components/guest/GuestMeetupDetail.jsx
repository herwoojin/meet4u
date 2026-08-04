// GuestMeetupDetail — 바텀시트 상세 모달
//
// 표시: 날짜/시간/장소/실력/유형 · 비용 breakdown · 1인당 · 참가자(입금 체크) ·
//       대기자 · 계좌정보 + 복사 · 호스트 액션(수정/마감·재개/삭제).
//
// 참가/취소/대기 액션은 부모(GuestMeetups) 의 onAction 을 그대로 재사용.

import React from 'react';
import { totalCost, perHead, paidCount, capTotal, isClosed, setPaid, setClosed, deleteMeetup } from '../../lib/guestMeetups';

const GuestMeetupDetail = ({ m, me, onClose, onAction, onEdit, onToast, palette: T }) => {
    const cl = isClosed(m);
    const total = totalCost(m);
    const head = perHead(m);
    const paid = paidCount(m);
    const isHost = me?.uid && m.createdBy === me.uid;
    const isInRoster = me?.uid && (m.roster || []).some(r => r.uid === me.uid);
    const isWaiting = me?.uid && (m.wait || []).some(w => w.uid === me.uid);

    const dayName = (dateStr) =>
        ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr + 'T00:00:00').getDay()];

    const copyAcc = async () => {
        const text = `${m.bank?.bank || ''} ${m.bank?.acc || ''} (${m.bank?.holder || ''})`.trim();
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                onToast('📋 계좌 정보 복사됨');
                return;
            }
        } catch (_) { /* fall through */ }
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        onToast('📋 계좌 정보 복사됨');
    };

    const togglePaid = async (targetUid, currentPaid) => {
        if (!me?.uid) return;
        try {
            await setPaid(m.id, targetUid, !currentPaid, me.uid);
        } catch (e) {
            onToast(e.message || '변경 실패');
        }
    };

    const toggleClosed = async () => {
        try {
            await setClosed(m.id, !cl);
            onToast(cl ? '모집 재개' : '수동 마감');
        } catch (e) { onToast(e.message || '실패'); }
    };

    const doDelete = async () => {
        if (!window.confirm('정말 이 모임을 삭제할까요?')) return;
        try {
            await deleteMeetup(m.id);
            onToast('삭제됨');
            onClose();
        } catch (e) { onToast(e.message || '삭제 실패'); }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 40,
                background: 'rgba(30,26,18,.45)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: T.bg, width: '100%', maxWidth: 560,
                    maxHeight: '92vh', overflow: 'auto',
                    borderRadius: '20px 20px 0 0',
                    padding: '16px 16px 34px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif',
                    color: T.ink,
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <b style={{ fontSize: 17 }}>
                        {Number(m.date.split('-')[1])}월 {Number(m.date.split('-')[2])}일 ({dayName(m.date)}) · {m.place}
                    </b>
                    <button onClick={onClose} style={{
                        fontSize: 20, color: T.sub, background: 'none',
                        border: 0, cursor: 'pointer', padding: '0 4px',
                    }}>×</button>
                </div>

                {/* Time / meta */}
                <Box T={T}>
                    <Row><span style={{ color: T.sub, fontSize: 12 }}>시간</span><b>{m.start} ~ {m.end}</b></Row>
                    <Row><span style={{ color: T.sub, fontSize: 12 }}>NTRP</span><b>{m.level}</b></Row>
                    <Row><span style={{ color: T.sub, fontSize: 12 }}>경기</span><b>{m.type}</b></Row>
                    <Row><span style={{ color: T.sub, fontSize: 12 }}>지역</span><b>{m.region || '-'}</b></Row>
                    <Row>
                        <span style={{ color: T.sub, fontSize: 12 }}>모집</span>
                        <b>{m.roster?.length || 0} / {capTotal(m)}명 {cl && '(마감)'}</b>
                    </Row>
                    {m.note && <div style={{ marginTop: 8, fontSize: 12.5, color: T.sub, lineHeight: 1.6 }}>📝 {m.note}</div>}
                </Box>

                {/* 정산 */}
                <Box T={T} title="정산">
                    <SumRow label="코트 예약비" value={won(m.cost?.court)} T={T} />
                    <SumRow label="테니스공" value={won(m.cost?.ball)} T={T} />
                    <SumRow label="기타비용" value={won(m.cost?.etc)} T={T} />
                    <SumRow label="합계" value={won(total)} bold T={T} />
                    <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 8, paddingTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ color: T.sub, fontSize: 13 }}>1인당</span>
                            <span style={{ fontSize: 24, fontWeight: 800, color: T.dark }}>{won(head)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>
                            입금완료 {paid}/{m.roster?.length || 0}명
                        </div>
                    </div>
                </Box>

                {/* 참가자 */}
                <Box T={T} title="참가자">
                    {(m.roster || []).length === 0 && <div style={{ color: T.sub, fontSize: 13 }}>아직 없어요.</div>}
                    {(m.roster || []).map(r => {
                        const isMine = r.uid === me?.uid;
                        const canToggle = isMine || isHost;
                        return (
                            <div key={r.uid} style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', padding: '8px 0',
                                borderBottom: `1px dashed ${T.line}`, fontSize: 14,
                            }}>
                                <div>
                                    <span style={{ fontWeight: 700 }}>{r.name}</span>
                                    {r.host && <Tag T={T}>호스트</Tag>}
                                    {isMine && <Tag T={T} me>나</Tag>}
                                    {r.promotedFromWait && (
                                        <span
                                            title="대기 → 참가로 자동 승격"
                                            style={{
                                                fontSize: 10.5, borderRadius: 5, padding: '2px 5px',
                                                marginLeft: 5, fontWeight: 800,
                                                background: '#d9eede', color: T.green,
                                            }}
                                        >🎉 대기승격</span>
                                    )}
                                </div>
                                <label style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    fontSize: 12.5, fontWeight: 800,
                                    color: r.paid ? T.green : T.sub,
                                    cursor: canToggle ? 'pointer' : 'default',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={!!r.paid}
                                        disabled={!canToggle}
                                        onChange={() => togglePaid(r.uid, r.paid)}
                                        style={{ width: 19, height: 19, accentColor: T.green }}
                                    />
                                    {r.paid ? '입금완료' : '입금대기'}
                                </label>
                            </div>
                        );
                    })}
                </Box>

                {/* 대기자 */}
                {(m.wait || []).length > 0 && (
                    <Box T={T} title="대기자">
                        {m.wait.map((w, i) => (
                            <div key={w.uid} style={{ padding: '6px 0', fontSize: 13 }}>
                                <b>{i + 1}. {w.name}</b>
                                {w.uid === me?.uid && <Tag T={T} me>나</Tag>}
                            </div>
                        ))}
                    </Box>
                )}

                {/* 계좌 */}
                <Box T={T} title="입금 계좌">
                    <div style={{ fontSize: 14, marginBottom: 4 }}>
                        <b>{m.bank?.bank || '-'}</b> {m.bank?.acc || '-'}
                    </div>
                    <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 10 }}>
                        예금주: {m.bank?.holder || '-'}
                    </div>
                    <button onClick={copyAcc} style={{
                        width: '100%', background: T.dark, color: '#fff',
                        border: 0, borderRadius: 10, padding: '10px 0',
                        fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    }}>📋 계좌 복사</button>
                </Box>

                {/* 참가 액션 */}
                {!isHost && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {!cl && !isInRoster && (
                            <ActionBtn primary T={T} onClick={() => { onAction('join', m); onClose(); }}>참가하기</ActionBtn>
                        )}
                        {isInRoster && (
                            <ActionBtn danger T={T} onClick={() => { onAction('leave', m); onClose(); }}>참가 취소</ActionBtn>
                        )}
                        {cl && !isInRoster && !isWaiting && (
                            <ActionBtn warn T={T} onClick={() => { onAction('wait', m); onClose(); }}>대기 걸기</ActionBtn>
                        )}
                        {isWaiting && (
                            <ActionBtn danger T={T} onClick={() => { onAction('cancelWait', m); onClose(); }}>대기 취소</ActionBtn>
                        )}
                    </div>
                )}

                {/* 호스트 액션 */}
                {isHost && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <ActionBtn T={T} onClick={() => onEdit(m)}>수정</ActionBtn>
                        <ActionBtn warn T={T} onClick={toggleClosed}>{cl ? '모집 재개' : '수동 마감'}</ActionBtn>
                        <ActionBtn danger T={T} onClick={doDelete}>삭제</ActionBtn>
                    </div>
                )}
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

const Row = ({ children }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13.5 }}>
        {children}
    </div>
);

const SumRow = ({ label, value, bold, T }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: bold ? 15 : 13.5, padding: '4px 0',
        fontWeight: bold ? 800 : 400,
        borderTop: bold ? `1px solid ${T.line}` : 'none',
        marginTop: bold ? 6 : 0,
        paddingTop: bold ? 8 : 4,
    }}>
        <span>{label}</span>
        <span>{value}</span>
    </div>
);

const Tag = ({ T, me, children }) => (
    <span style={{
        fontSize: 10.5, borderRadius: 5, padding: '2px 5px',
        marginLeft: 5, fontWeight: 800,
        background: me ? T.dark : '#eee6d3',
        color: me ? '#fff' : T.sub,
    }}>{children}</span>
);

const ActionBtn = ({ primary, warn, danger, T, onClick, children }) => {
    const styles = primary
        ? { background: T.dark, color: '#fff', border: `1px solid ${T.dark}` }
        : warn
            ? { background: T.accent, color: '#241a05', border: `1px solid ${T.accent}` }
            : danger
                ? { background: '#fff', color: T.red, border: '1px solid #e8c3b8' }
                : { background: '#fff', color: T.ink, border: `1px solid ${T.line}` };
    return (
        <button onClick={onClick} style={{
            flex: 1, minWidth: 100, borderRadius: 10, padding: '11px 0',
            fontSize: 13, fontWeight: 800, cursor: 'pointer', ...styles,
        }}>{children}</button>
    );
};

const won = (n) => (Number(n) || 0).toLocaleString('ko-KR') + '원';

export default GuestMeetupDetail;
