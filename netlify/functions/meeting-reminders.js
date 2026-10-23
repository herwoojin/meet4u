// 예약 함수 (netlify.toml: 5분마다) — 정기 모임·게스트 모집 참가자 알림 + 끝난 모임의 위치 공유 정리.
//
//  게스트 모집: 시작 1시간 전 알림만 (위치 공유는 프로젝트 멤버 대상이라 게스트 모집엔 없음).
//               참가자는 roster 의 uid 로 찾고, guestMeetups.reminders.h1 로 중복을 막는다.
//
//  · 시작 1시간 전  : "⏰ 1시간 뒤 모임" 알림 → 누르면 그 모임 팝업
//  · 시작 30분 전   : "📍 30분 전 · 위치 공유" 알림 → 누르면 '저 여기 있어요'가 열리며 위치 공유 자동 시작
//  · 종료 시각 이후 : 모임 때문에 자동으로 켜졌던 위치 공유(liveLocations 의 autoUntil)를 지운다.
//                    앱이 닫혀 있어도 끝난 모임의 위치가 남지 않게 서버가 정리한다.
//
// 대상: 참석('attend')으로 응답했고 푸시가 켜진(fcmTokens 가 있는) 사람. 숨김·완료 모임 제외.
// 같은 알림은 한 번만: 보낸 뒤 meetings.reminders.{h1|m30} 에 "그때의 시작 시각"을 적는다.
// 모임 시간이 바뀌면 값이 달라져 새 시간 기준으로 다시 보낸다. 종료 후에는 아무것도 보내지 않는다.

import { getDb } from '../lib/adminApp.js';
import { findUsersByResponseKeys, findUsersByUids, sendPushToUsers } from '../lib/pushSend.js';
import { meetingWindow, attendKeys, kstDate, REMIND_BEFORE_MIN, AUTO_SHARE_BEFORE_MIN } from '../../src/lib/meetingTime.js';

/**
 * 순수 판단 — 이번 회차에 어떤 모임에 어떤 알림을 보낼지. (테스트·드라이런용으로 분리)
 * @returns [{ meeting, kind: 'h1'|'m30', startKey, minsToStart, keys }]
 */
export const planReminders = (meetings, nowMs) => {
    const plan = [];
    for (const m of meetings) {
        if (m.hidden || m.status === 'completed') continue;
        const keys = attendKeys(m);
        if (keys.length === 0) continue;
        const { startMs, endMs } = meetingWindow(m);
        if (!Number.isFinite(startMs) || nowMs >= endMs) continue;      // 끝난 모임은 알림 꺼짐
        const minsToStart = (startMs - nowMs) / 60000;
        const startKey = `${m.date} ${m.startTime}`;
        const sent = m.reminders || {};
        const needM30 = minsToStart <= AUTO_SHARE_BEFORE_MIN && sent.m30 !== startKey;
        const needH1 = minsToStart > 0 && minsToStart <= REMIND_BEFORE_MIN && sent.h1 !== startKey;
        // 늦게 만든 모임처럼 둘 다 해당되면 30분 알림 하나로 (1시간 알림은 보낸 것으로 기록)
        if (needM30) plan.push({ meeting: m, kind: 'm30', startKey, minsToStart, keys, alsoMark: needH1 ? ['h1'] : [] });
        else if (needH1) plan.push({ meeting: m, kind: 'h1', startKey, minsToStart, keys, alsoMark: [] });
    }
    return plan;
};

/** 게스트 모집 — 시작 1시간 전 알림 대상 (순수 판단) */
export const planGuestReminders = (guestMeetups, nowMs) => {
    const plan = [];
    for (const g of guestMeetups) {
        const uids = (g.roster || []).map((r) => r?.uid).filter(Boolean);
        if (uids.length === 0) continue;
        const { startMs, endMs } = meetingWindow({ date: g.date, startTime: g.start, endTime: g.end });
        if (!Number.isFinite(startMs) || nowMs >= endMs) continue;
        const minsToStart = (startMs - nowMs) / 60000;
        const startKey = `${g.date} ${g.start}`;
        if (minsToStart > 0 && minsToStart <= REMIND_BEFORE_MIN && g.reminders?.h1 !== startKey) {
            plan.push({ guest: g, startKey, minsToStart, uids });
        }
    }
    return plan;
};

const pushFor = (item) => {
    const m = item.meeting;
    const when = `${m.startTime}~${m.endTime || ''}`;
    if (item.kind === 'h1') {
        return {
            type: 'meeting-reminder',
            title: '⏰ 1시간 뒤 모임이 시작돼요',
            body: `${m.title || '모임'} · ${when}`,
            url: `/?meeting=${m.id}`,                       // 눌러서 그 모임 팝업
            tag: `rem-h1-${m.id}`,
        };
    }
    const mins = Math.max(0, Math.round(item.minsToStart));
    return {
        type: 'meeting-autoshare',
        title: mins > 0 ? `📍 모임 ${mins}분 전 — 위치 공유가 켜져요` : '📍 모임 시작 — 위치 공유가 켜져요',
        body: `${m.title || '모임'} · ${when} · 눌러서 '저 여기 있어요' 열기 (끝나면 자동 종료)`,
        url: `/global-meeting?autoshare=${m.id}`,           // 서비스워커가 /#/ 경로로 바꿔 연다
        tag: `rem-m30-${m.id}`,
    };
};

/** 실제 실행. dryRun 이면 보내지도 기록하지도 않고 계획과 수신자 수만 돌려준다. */
export const runReminders = async ({ nowMs = Date.now(), dryRun = false } = {}) => {
    const db = getDb();
    const today = kstDate(nowMs);
    const tomorrow = kstDate(nowMs + 24 * 60 * 60 * 1000);   // 자정 직후 시작하는 모임 대비
    const snap = await db.collection('meetings').where('date', 'in', [today, tomorrow]).get();
    const meetings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const plan = planReminders(meetings, nowMs);

    const report = [];
    for (const item of plan) {
        const users = await findUsersByResponseKeys(item.keys);
        const push = pushFor(item);
        let result = { users: users.size, tokens: [...users.values()].reduce((n, u) => n + (u.fcmTokens?.length || 0), 0) };
        if (!dryRun) {
            result = await sendPushToUsers(users, push);
            const marks = { [`reminders.${item.kind}`]: item.startKey };
            item.alsoMark.forEach((k) => { marks[`reminders.${k}`] = item.startKey; });
            await db.collection('meetings').doc(item.meeting.id).update(marks);
        }
        report.push({ id: item.meeting.id, title: item.meeting.title, kind: item.kind, mins: Math.round(item.minsToStart), push: push.title, ...result });
    }

    // 게스트 모집 1시간 전 알림
    const gsnap = await db.collection('guestMeetups').where('date', 'in', [today, tomorrow]).get();
    const guests = gsnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const item of planGuestReminders(guests, nowMs)) {
        const g = item.guest;
        const users = await findUsersByUids(item.uids);
        const push = {
            type: 'guest-reminder',
            title: '⏰ 1시간 뒤 게스트 모임이 시작돼요',
            body: `${g.place || '게스트 모임'} · ${g.start}~${g.end || ''}`,
            url: `/guest-meetups?open=${g.id}`,                // 서비스워커가 /#/ 경로로 바꿔 연다
            tag: `rem-g-${g.id}`,
        };
        let result = { users: users.size, tokens: [...users.values()].reduce((n, u) => n + (u.fcmTokens?.length || 0), 0) };
        if (!dryRun) {
            result = await sendPushToUsers(users, push);
            await db.collection('guestMeetups').doc(g.id).update({ 'reminders.h1': item.startKey });
        }
        report.push({ id: g.id, title: g.place, kind: 'guest-h1', mins: Math.round(item.minsToStart), push: push.title, ...result });
    }

    // 끝난 모임의 자동 위치 공유 정리
    const expired = await db.collection('liveLocations').where('autoUntil', '<=', nowMs).get();
    if (!dryRun) await Promise.all(expired.docs.map((d) => d.ref.delete()));

    return { now: new Date(nowMs).toISOString(), checked: meetings.length, checkedGuests: guests.length, plan: report, expiredShares: expired.size, dryRun };
};

export const handler = async () => {
    try {
        const r = await runReminders();
        if (r.plan.length || r.expiredShares) console.log('[meeting-reminders]', JSON.stringify(r));
        return { statusCode: 200, body: JSON.stringify(r) };
    } catch (e) {
        console.error('[meeting-reminders]', e);
        return { statusCode: 500, body: String(e?.message || e) };
    }
};
