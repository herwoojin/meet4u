// GET /?meeting=<모임ID>.<버전>  (public/_redirects 의 쿼리 매칭 규칙으로 들어온다)
//
// 정기 모임 링크를 카톡에 붙여넣으면 미리보기가 그 모임의 제목·일시·참석 현황과 카드
// 이미지로 뜬다. 사람이 열면 앱이 뜨고 main.jsx 가 ?meeting= 을 받아 로그인 후 그 모임
// 팝업(참석·불참 체크)을 연다. 앱 쪽에서 프로젝트 멤버인지 다시 확인한다.
//
// 링크만 있으면 누구나 미리보기를 볼 수 있으므로 참석자 이름·비용은 넣지 않는다.
// 숨김 처리된 모임은 내용을 싣지 않는다(사이트 공통 미리보기 그대로).

import { readMeeting } from '../lib/publicDocs.js';
import { injectOg, originOf, respondWithOg } from '../lib/ogHtml.js';
import { summarizeMeeting, meetingCardImageUrl, parseMeetingParam } from '../../src/lib/meetingSummary.js';
import { SNAPSHOT_HINT } from '../../src/lib/guestSummary.js';

const meetingOg = (m, origin) => {
    const s = summarizeMeeting(m, origin);
    return {
        title: `🎾 ${s.title}${s.completed ? ' (완료)' : ' — 참석 체크'}`,
        description: [`${s.dateLong} ${s.time}`, s.countsText, SNAPSHOT_HINT].join(' · '),
        image: meetingCardImageUrl(origin, s),
        url: s.url,
    };
};

export const injectMeetingOg = (html, m, origin) => injectOg(html, meetingOg(m, origin));

export const handler = async (event) => {
    const id = parseMeetingParam(event.queryStringParameters?.meeting);
    const origin = originOf(event);
    return respondWithOg(
        origin,
        async () => {
            const m = await readMeeting(id);
            return m && !m.hidden ? meetingOg(m, origin) : null;
        },
        `${origin}/#/`,
        'meeting-og',
    );
};
