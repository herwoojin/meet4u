// 챗.첵 (CHAT.CHECK) — 그룹 대화방 전용 페이지.
//
// 원래는 "저 여기있어요" (GlobalMeetingMap) 페이지 하단에 <GlobalChat /> 이
// 함께 렌더되고 있었지만, 지도와 대화방을 별도 메뉴로 분리해 달라는 요청에
// 따라 이 페이지로 옮겼다. GlobalChat 컴포넌트 자체는 재사용.

import React from 'react';
import { MessageSquare } from 'lucide-react';
import GlobalChat from '../Components/chat/GlobalChat';

const ChatCheck = () => {
    return (
        <div className="max-w-5xl mx-auto space-y-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <MessageSquare className="text-blue-600" size={26} />
                    챗.첵 <span className="text-slate-400 text-sm font-medium">(CHAT.CHECK)</span>
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                    내가 참여한 프로젝트의 멤버들과 그룹 대화방을 만들고 실시간으로 대화하세요.
                </p>
            </div>

            <GlobalChat />
        </div>
    );
};

export default ChatCheck;
