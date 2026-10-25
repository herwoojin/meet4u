// 모임 날씨 — 모임의 장소(지도 핀 좌표)·날짜·시작 시각으로 OpenWeather 예보를 골라 짧게 보여 준다.
//
// 예보는 netlify/functions/weather 가 OpenWeather 5일/3시간 예보를 대신 받아 온다(키는 서버에만).
// 날씨를 못 보여 줄 때는 이유를 짧게 돌려준다: 장소 미정 / 아직 예보 전 / 지난 일정 / 불러오기 실패.

import { meetingWindow, kstDate } from './meetingTime';
import { findPinByLabel } from './globalPins';

const HOUR = 60 * 60 * 1000;
const FORECAST_DAYS = 5;   // 무료 예보가 내다보는 기간

// 핀 이름의 핵심 — "충장테니스장" → "충장", "삼송테니스장(인조잔디)" → "삼송"
const coreName = (s) => String(s || '').replace(/\(.*?\)/g, '').replace(/테니스장|테니스코트|체육공원|운동장|코트|\s/g, '');

// 모임이 열리는 핀: ① 저장된 locationPin ② 장소 이름이 같은 핀
// ③ 장소·제목 글자에 핀 이름 핵심이 들어 있는 핀("충장 1번 코트" → 충장테니스장). 여럿이면 가장 긴 이름.
export const resolveMeetingPlace = (meeting, pins) => {
    const lp = meeting?.locationPin;
    if (lp && Number.isFinite(lp.lat) && Number.isFinite(lp.lng)) return lp;
    const exact = findPinByLabel(pins, meeting?.location);
    if (exact) return exact;
    const text = `${meeting?.location || ''}${meeting?.title || ''}`.replace(/\s/g, '');
    let best = null;
    for (const p of pins) {
        const c = coreName(p.title);
        if (c.length >= 2 && text.includes(c) && (!best || c.length > coreName(best.title).length)) best = p;
    }
    return best;
};

// 날씨를 받아 올 수 있는지 먼저 판단. 받아 올 수 있으면 { place, at }, 아니면 { reason, hint }
export const weatherPlan = (meeting, pins, now = Date.now()) => {
    const { startMs, endMs } = meetingWindow({ ...meeting, startTime: meeting?.startTime || '12:00' });
    if (!Number.isFinite(startMs)) return { reason: '날짜 정보 없음' };
    if ((Number.isFinite(endMs) ? endMs : startMs + 2 * HOUR) < now) return { reason: '지난 일정' };
    const place = resolveMeetingPlace(meeting, pins);
    if (!place) return { reason: '장소 미정', hint: '모임 장소를 지도 핀에서 고르면 날씨를 볼 수 있어요' };
    if (startMs > now + FORECAST_DAYS * 24 * HOUR) {
        const [, mo, d] = kstDate(startMs - FORECAST_DAYS * 24 * HOUR).split('-');
        return { reason: `${+mo}/${+d}부터 예보`, hint: '일기 예보는 5일 앞까지만 나와요' };
    }
    // 진행 중인 모임은 지금 날씨 — 30분 단위로 끊어 화면이 다시 그려질 때마다 값이 바뀌지 않게
    return { place, at: Math.max(startMs, Math.floor(now / (HOUR / 2)) * (HOUR / 2)) };
};

// 3시간 간격 예보 중 모임 시작에 가장 가까운 칸 (예보 범위 밖이면 null)
export const pickSlot = (list, at) => {
    if (!list?.length) return null;
    if (at < list[0].t - 3 * HOUR || at > list[list.length - 1].t + 1.5 * HOUR) return null;
    return list.reduce((a, b) => (Math.abs(b.t - at) < Math.abs(a.t - at) ? b : a));
};

// OpenWeather 날씨 코드 → 이모지 + 짧은 말. 해/달은 예보 칸이 아니라 모임 시각(KST)으로 정한다
// (07:00 모임이 06:00 예보 칸에 걸려 🌙 로 나오지 않게).
export const describeSlot = (s, at = s.t) => {
    const id = s.id;
    const h = new Date(at + 9 * HOUR).getUTCHours();
    const night = h < 6 || h >= 18;
    if (id >= 200 && id < 300) return { emoji: '⛈', label: '뇌우' };
    if (id >= 300 && id < 400) return { emoji: '🌦', label: '이슬비' };
    if (id >= 500 && id < 600) return { emoji: '🌧', label: id >= 502 && id !== 520 ? '강한 비' : '비' };
    if (id >= 600 && id < 700) return { emoji: '🌨', label: id === 611 || id === 612 || id === 613 || id === 615 || id === 616 ? '진눈깨비' : '눈' };
    if (id >= 700 && id < 800) return { emoji: '🌫', label: id === 741 ? '안개' : id === 721 ? '연무' : id === 761 || id === 731 ? '황사·먼지' : '박무' };
    if (id === 800) return { emoji: night ? '🌙' : '☀️', label: '맑음' };
    if (id === 801) return { emoji: night ? '🌙' : '🌤', label: '구름 조금' };
    if (id === 802 || id === 803) return { emoji: '⛅', label: '구름 많음' };
    if (id === 804) return { emoji: '☁️', label: '흐림' };
    return { emoji: '🌡', label: s.desc || '날씨' };
};

// 좌표별 예보 — 같은 화면의 여러 모임이 한 번만 받아 오도록 20분 동안 공유
const cache = new Map();
export const fetchForecast = (lat, lng) => {
    const k = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.promise;
    const promise = fetch(`/.netlify/functions/weather?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`)
        .then((r) => r.json())
        .then((j) => { if (!j?.ok) throw new Error(j?.error || 'weather-failed'); return j.list; });
    cache.set(k, { at: Date.now(), promise });
    promise.catch(() => cache.delete(k));
    return promise;
};
