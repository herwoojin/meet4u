// 정기 모임 카톡 공유 — 게스트 모집 공유(kakaoShare.js)와 같은 방식.
// 카톡방에 카드(모임별 이미지 + 일시 + 참석 현황 + "참석·불참 체크하기" 버튼)로 올라가고,
// 누르면 로그인 후 그 모임 팝업이 열려 바로 참석·불참을 저장할 수 있다.

import { loadKakaoSdk, pageOrigin, publicOrigin } from './kakaoShare';
import { summarizeMeeting, meetingCardImageUrl } from './meetingSummary';
import { SNAPSHOT_HINT } from './guestSummary';

export const meetingShareLink = (m) => summarizeMeeting(m, pageOrigin()).url;

export const meetingCardImage = (m) =>
    meetingCardImageUrl(publicOrigin(), summarizeMeeting(m, pageOrigin()));

// 팝업이 열릴 때 카드 이미지를 미리 그려 둔다 (첫 렌더가 수 초 걸려 카카오가 놓치지 않게).
export const warmMeetingCardImage = (m) => {
    try { new Image().src = meetingCardImage(m); } catch (_) { /* ignore */ }
};

export const shareMeetingToKakao = async (m) => {
    const Kakao = await loadKakaoSdk();
    const s = summarizeMeeting(m, pageOrigin());
    const link = { mobileWebUrl: s.url, webUrl: s.url };
    Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
            title: `🎾 ${s.title}${s.completed ? ' (완료)' : ''}`,
            description: `${s.dateLong} ${s.time}\n${s.countsText}\n${SNAPSHOT_HINT}`,
            imageUrl: meetingCardImageUrl(publicOrigin(), s),
            imageWidth: 1200,
            imageHeight: 600,
            link,
        },
        buttons: [{ title: s.completed ? '모임 보기' : '참석·불참 체크하기', link }],
    });
};
