// 주간 모임 · 월간 모아보기 공용 — 날짜 헤더의 날씨 칩과 모임별 참석/불참 인원.

import React, { useEffect, useState } from 'react';
import { useGlobalPinsState } from '../../lib/globalPins';
import { weatherPlan, pickSlot, describeSlot, fetchForecast } from '../../lib/weather';

// 그날 모임 중 장소를 알 수 있는 첫 모임(시작 시각 순)의 장소·시각으로 날씨를 보여 준다.
// 못 보여 주면 이유를 회색으로 짧게.
export const DayWeather = ({ meetings }) => {
    const { pins, loaded } = useGlobalPinsState();
    const plans = [...meetings]
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
        .map((m) => ({ m, plan: weatherPlan(m, pins) }));
    const { m, plan } = plans.find((p) => p.plan.place) || plans[0] || {};
    const lat = plan?.place?.lat, lng = plan?.place?.lng, at = plan?.at;
    const [state, setState] = useState(null);

    useEffect(() => {
        setState(null);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        let off = false;
        fetchForecast(lat, lng)
            .then((list) => { if (!off) setState({ slot: pickSlot(list, at) }); })
            .catch((e) => { if (!off) setState({ error: String(e?.message || 'failed') }); });
        return () => { off = true; };
    }, [lat, lng, at]);

    if (!plan || (!loaded && !plan.place && plan.reason === '장소 미정')) return <Chip muted>…</Chip>;
    if (!plan.place) return <Chip muted title={plan.hint}>{plan.reason === '장소 미정' ? '📍 ' : ''}{plan.reason}</Chip>;
    if (!state) return <Chip muted>날씨 확인 중…</Chip>;
    // 키가 없거나 아직 활성화 전(OpenWeather 새 키는 활성화까지 최대 2시간)이면 고장이 아니라 준비 중
    if (state.error === 'no-key' || state.error === 'owm-401') return <Chip muted title="날씨 API 키 활성화를 기다리는 중이에요">날씨 준비 중</Chip>;
    if (state.error) return <Chip muted title="잠시 후 다시 열어 보세요">날씨 불러오기 실패</Chip>;
    if (!state.slot) return <Chip muted title="일기 예보는 5일 앞까지만 나와요">아직 예보 전</Chip>;

    const s = state.slot;
    const { emoji, label } = describeSlot(s, at);
    const placeName = plan.place.title || plan.place.address || '';
    const title = `${placeName} · ${m.startTime || '12:00'} 무렵 예보 (OpenWeather)${s.desc ? ` — ${s.desc}` : ''}`;
    return (
        <Chip title={title}>
            <span>{emoji}</span>
            <span className="font-semibold text-gray-800">{label}</span>
            {Number.isFinite(s.temp) && <span className="font-bold text-gray-900">{s.temp}°</span>}
            {s.pop >= 20 && <span className="text-blue-600">💧{s.pop}%</span>}
        </Chip>
    );
};

const Chip = ({ children, muted, title }) => (
    <span
        title={title}
        className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap ${muted ? 'text-gray-400' : 'text-gray-700'}`}
    >
        {children}
    </span>
);

// 모임 아래 참석·불참 인원
export const AttendanceCounts = ({ meeting, className = '' }) => {
    const values = Object.values(meeting.responses || {});
    const attend = values.filter((v) => v === 'attend').length;
    const decline = values.filter((v) => v === 'decline').length;
    return (
        <div className={`flex items-center gap-2 text-[11px] ${className}`}>
            <span className="text-emerald-600 font-semibold">참석 {attend}명</span>
            <span className="text-gray-300">·</span>
            <span className="text-red-500 font-semibold">불참 {decline}명</span>
        </div>
    );
};
