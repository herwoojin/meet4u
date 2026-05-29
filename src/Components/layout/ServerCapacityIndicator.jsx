import React, { useEffect, useMemo, useState } from 'react';
import { subscribeCapacity, computeUsage, LIMITS } from '../../lib/capacityMonitor';

const LEVEL_STYLES = {
    ok:       { color: '#16a34a', bg: 'rgba(22,163,74,0.95)',  label: '정상',    pulse: false },
    caution:  { color: '#eab308', bg: 'rgba(234,179,8,0.95)',   label: '주의',    pulse: false },
    warning:  { color: '#f97316', bg: 'rgba(249,115,22,0.95)',  label: '경고',    pulse: true  },
    critical: { color: '#dc2626', bg: 'rgba(220,38,38,0.95)',   label: '한도임박', pulse: true  },
    offline:  { color: '#6b7280', bg: 'rgba(107,114,128,0.95)', label: '오프라인', pulse: true  },
};

const METRIC_LABELS = {
    firestoreReads: 'Firestore 읽기/일',
    firestoreWrites: 'Firestore 쓰기/일',
    firestoreDeletes: 'Firestore 삭제/일',
    storageBytesTotal: 'Storage 누적 용량',
    storageDownloadBytes: 'Storage 다운로드/일',
    netlifyFunctions: 'Netlify Functions/월',
    netlifyBandwidthBytes: 'Netlify 대역폭/월',
};

const formatNumber = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
};

const formatBytes = (n) => {
    if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GiB';
    if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MiB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB';
    return n + ' B';
};

const formatMetric = (key, value) => {
    if (key.toLowerCase().includes('bytes')) return formatBytes(value);
    return formatNumber(value);
};

const limitOf = (key) => {
    switch (key) {
        case 'firestoreReads': return LIMITS.firestoreReadsPerDay;
        case 'firestoreWrites': return LIMITS.firestoreWritesPerDay;
        case 'firestoreDeletes': return LIMITS.firestoreDeletesPerDay;
        case 'storageBytesTotal': return LIMITS.storageBytesTotal;
        case 'storageDownloadBytes': return LIMITS.storageDownloadBytesPerDay;
        case 'netlifyFunctions': return LIMITS.netlifyFunctionsPerMonth;
        case 'netlifyBandwidthBytes': return LIMITS.netlifyBandwidthBytesPerMonth;
        default: return 0;
    }
};

const currentValueOf = (state, key) => {
    if (key === 'storageBytesTotal') return state.cumulative.storageBytesTotal || 0;
    return state.counters[key] || 0;
};

const ServerCapacityIndicator = () => {
    const [state, setState] = useState(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => subscribeCapacity(setState), []);

    const usage = useMemo(() => (state ? computeUsage(state) : null), [state]);
    if (!usage) return null;

    const style = LEVEL_STYLES[usage.level];
    const bars = 5;
    const filled = Math.max(1, Math.min(bars, Math.ceil((1 - usage.worstRatio) * bars)));

    return (
        <div
            style={{
                position: 'fixed',
                right: 12,
                bottom: 12,
                zIndex: 9999,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                userSelect: 'none',
            }}
        >
            {expanded && (
                <div
                    style={{
                        marginBottom: 8,
                        background: '#ffffff',
                        border: `2px solid ${style.color}`,
                        borderRadius: 12,
                        padding: 12,
                        minWidth: 260,
                        maxWidth: 320,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                        color: '#111827',
                        fontSize: 12,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13 }}>백엔드 용량 모니터</strong>
                        <span style={{ color: style.color, fontWeight: 700 }}>{style.label}</span>
                    </div>
                    {Object.entries(usage.ratios).map(([key, ratio]) => {
                        const value = currentValueOf(state, key);
                        const limit = limitOf(key);
                        const pct = Math.min(100, ratio * 100);
                        const barColor = ratio >= 0.9 ? '#dc2626' : ratio >= 0.7 ? '#f97316' : ratio >= 0.4 ? '#eab308' : '#16a34a';
                        return (
                            <div key={key} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <span>{METRIC_LABELS[key]}</span>
                                    <span style={{ color: '#6b7280' }}>{formatMetric(key, value)} / {formatMetric(key, limit)}</span>
                                </div>
                                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: pct + '%', height: '100%', background: barColor, transition: 'width 300ms ease' }} />
                                </div>
                            </div>
                        );
                    })}
                    <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                        클라이언트 측 추정치입니다. 실제 사용량은 Firebase / Netlify 콘솔에서 확인하세요.
                        {state.health.lastPingMs != null && (
                            <div>마지막 함수 응답: {Math.round(state.health.lastPingMs)} ms</div>
                        )}
                    </div>
                </div>
            )}

            <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={`백엔드 용량 ${style.label}`}
                title={`백엔드 ${style.label} — ${METRIC_LABELS[usage.worstKey]} ${(usage.worstRatio * 100).toFixed(0)}% 사용`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    border: 'none',
                    borderRadius: 999,
                    background: style.bg,
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    cursor: 'pointer',
                    animation: style.pulse ? 'meet4uCapacityPulse 1.6s ease-in-out infinite' : 'none',
                }}
            >
                <span
                    aria-hidden
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        padding: '2px 4px',
                        background: 'rgba(0,0,0,0.18)',
                        borderRadius: 4,
                    }}
                >
                    {Array.from({ length: bars }).map((_, i) => (
                        <span
                            key={i}
                            style={{
                                width: 4,
                                height: 12,
                                borderRadius: 1,
                                background: i < filled ? '#ffffff' : 'rgba(255,255,255,0.25)',
                            }}
                        />
                    ))}
                    <span
                        style={{
                            width: 2,
                            height: 6,
                            borderRadius: 1,
                            background: '#ffffff',
                            marginLeft: 1,
                        }}
                    />
                </span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{style.label}</span>
                <span style={{ fontSize: 11, opacity: 0.85 }}>{(usage.worstRatio * 100).toFixed(0)}%</span>
            </button>

            <style>{`
                @keyframes meet4uCapacityPulse {
                    0%, 100% { transform: scale(1);   box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
                    50%      { transform: scale(1.06); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
                }
            `}</style>
        </div>
    );
};

export default ServerCapacityIndicator;
