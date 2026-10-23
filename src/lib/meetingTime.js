// 정기 모임 시각 계산 — 앱(위치 자동 공유)과 Netlify 예약 함수(알림)가 같이 쓴다.
//
// 모임의 date('YYYY-MM-DD') · startTime/endTime('HH:mm') 은 한국 시간(KST) 기준 벽시계 값이다.
// 서버는 UTC 로 돌고 휴대폰 시간대도 제각각일 수 있으므로, 항상 KST 로 해석해
// 절대 시각(ms)으로 바꾼 뒤 비교한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const REMIND_BEFORE_MIN = 60;      // 시작 1시간 전 알림
export const AUTO_SHARE_BEFORE_MIN = 30;  // 시작 30분 전부터 위치 자동 공유

/** KST 날짜·시각 → 절대 시각(ms). 형식이 틀리면 NaN */
export const kstToMs = (date, hhmm) => {
    const d = String(date || '').split('-').map(Number);
    const t = String(hhmm || '').split(':').map(Number);
    if (d.length !== 3 || t.length < 2 || [...d, t[0], t[1]].some((n) => !Number.isFinite(n))) return NaN;
    return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - KST_OFFSET_MS;
};

/** 절대 시각 → KST 'YYYY-MM-DD' */
export const kstDate = (ms) => {
    const k = new Date(ms + KST_OFFSET_MS);
    const p = (n) => String(n).padStart(2, '0');
    return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}`;
};

/** 모임의 시작·종료 절대 시각. 종료가 시작보다 이르면(자정 넘김) 다음 날로 본다. */
export const meetingWindow = (m) => {
    const startMs = kstToMs(m?.date, m?.startTime);
    let endMs = kstToMs(m?.date, m?.endTime || m?.startTime);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
    return { startMs, endMs };
};

/** 참석('attend')으로 응답한 사람들의 응답 키 (이메일의 '.' 을 '_' 로 바꾼 값) */
export const attendKeys = (m) =>
    Object.entries(m?.responses || {}).filter(([, v]) => v === 'attend').map(([k]) => k);

/** 이 사용자의 응답 키 — MeetingDetailModal 이 저장할 때와 같은 규칙 */
export const responseKeyOf = (email) => String(email || '').replace(/\./g, '_');

/** 지금(nowMs) 위치 자동 공유 구간 [시작-30분, 종료) 안인가 */
export const inAutoShareWindow = (m, nowMs) => {
    const { startMs, endMs } = meetingWindow(m);
    return Number.isFinite(startMs) && nowMs >= startMs - AUTO_SHARE_BEFORE_MIN * 60000 && nowMs < endMs;
};
