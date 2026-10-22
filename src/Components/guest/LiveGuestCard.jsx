// LiveGuestCard — 카톡 공유 카드와 같은 디자인을 HTML/CSS 로 그린 "살아있는" 카드.
//
// 카톡 대화방의 카드는 공유하는 순간의 정지 이미지라 움직이거나 바뀔 수 없다.
// 그 카드를 누르면 열리는 이 팝업 맨 위에서 같은 카드가 살아 움직인다:
//   · 남은 자리가 Firestore 실시간 구독으로 바뀌는 즉시 숫자가 굴러 올라가며 반짝
//   · 남은 1자리면 상태 칩이 깜빡이고, 상태 점은 늘 맥박처럼 뛴다
//   · 마감되면 큰 "마감" 도장이 쾅 찍히고 공이 멈춘다
//   · 처음 열 때 글자가 차례로 올라오는 키네틱 등장, 공 바운스, 코트·조명 숨쉬기
// 숫자는 카드 이미지·카톡 설명과 같은 summarizeMeetup() 으로 계산한다.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { summarizeMeetup } from '../../lib/guestSummary';
import './LiveGuestCard.css';

const STAGE_W = 1200;

// 장소명이 길수록 글자를 줄인다 (카드 이미지 렌더러와 같은 규칙).
const placeSize = (t) => {
    const n = [...t].length;
    if (n <= 7) return 92;
    if (n <= 10) return 76;
    if (n <= 14) return 62;
    return 54;
};

const delay = (sec) => ({ animationDelay: `${sec}s` });

const LiveGuestCard = ({ m }) => {
    const s = summarizeMeetup(m, typeof window !== 'undefined' ? window.location.origin : '');
    const isLast = !s.closed && s.left === 1;

    // 1200×600 무대를 컨테이너 폭에 맞춰 통째로 축소 — 이미지와 같은 배치를 유지.
    const wrapRef = useRef(null);
    const [scale, setScale] = useState(0.3);
    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const fit = () => setScale(el.clientWidth / STAGE_W);
        fit();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(fit);
            ro.observe(el);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, []);

    // 남은 자리가 바뀔 때마다(첫 렌더 제외) 칩을 한 번 번쩍이게 한다.
    const prevLeft = useRef(s.left);
    const [flashKey, setFlashKey] = useState(0);
    useEffect(() => {
        if (prevLeft.current !== s.left) {
            prevLeft.current = s.left;
            setFlashKey((k) => k + 1);
        }
    }, [s.left]);

    return (
        <div ref={wrapRef} className="lgc-wrap" role="img"
             aria-label={`${s.place} 게스트 모집 ${s.dateLong} ${s.time} ${s.status} ${s.priceText}`}>
            <div className="lgc-stage" style={{ transform: `scale(${scale})` }}>
                <div className={`lgc-scene${s.closed ? ' is-closed lgc-shake' : ''}`}>
                    <div className="lgc-glow" />
                    <div className="lgc-lines" />

                    <div className="lgc-court">
                        <i style={{ left: 0, right: 0, top: 223, height: 5, background: 'rgba(255,255,255,.55)' }} />
                        <i style={{ left: 62, top: 0, bottom: 0, width: 4 }} />
                        <i style={{ right: 62, top: 0, bottom: 0, width: 4 }} />
                        <i style={{ left: 62, right: 62, top: 120, height: 4 }} />
                        <i style={{ left: 62, right: 62, bottom: 120, height: 4 }} />
                        <i style={{ left: 273, top: 120, bottom: 120, width: 4 }} />
                    </div>

                    <div className="lgc-ballbox">
                        <div className="lgc-shadow" />
                        <div className="lgc-ball">
                            <svg viewBox="0 0 170 170" width="170" height="170" aria-hidden="true">
                                <path d="M30 18 C 78 60, 78 110, 30 152" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".92" />
                                <path d="M140 18 C 92 60, 92 110, 140 152" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".92" />
                            </svg>
                        </div>
                    </div>

                    <div className="lgc-eyebrow">TENNIS · GUEST</div>
                    <div className="lgc-live"><b />LIVE</div>

                    <div className="lgc-body">
                        <div className={`lgc-chip lgc-in${s.closed ? ' is-closed' : ''}${isLast ? ' is-last' : ''}`} style={delay(0.15)}>
                            {flashKey > 0 && <span key={flashKey} className="lgc-flash" />}
                            <span className="lgc-dot" />
                            {s.closed ? (
                                <span>마감 · 대기 신청 가능</span>
                            ) : (
                                <span>
                                    모집중 · 남은{' '}
                                    <span className="lgc-numwrap"><span key={s.left} className="lgc-num">{s.left}</span></span>
                                    자리
                                </span>
                            )}
                        </div>
                        <div className="lgc-place lgc-in" style={{ ...delay(0.3), fontSize: placeSize(s.place) }}>
                            {s.place || '게스트 모집'}
                        </div>
                        <div className="lgc-date lgc-in" style={delay(0.45)}>{s.dateLong}</div>
                        <div className="lgc-time lgc-in" style={delay(0.55)}>{s.time}</div>
                        <div className="lgc-chips lgc-in" style={delay(0.7)}>
                            <span className="lgc-tag">NTRP {s.level}</span>
                            <span className="lgc-tag">{s.type}</span>
                            {s.priceText && <span className="lgc-tag is-price">{s.priceText}</span>}
                        </div>
                    </div>

                    {s.closed && <div className="lgc-stamp">마감</div>}
                </div>
            </div>
        </div>
    );
};

export default LiveGuestCard;
