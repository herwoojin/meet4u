// 카카오톡 말풍선 심볼 (브랜드 가이드: 노란 바탕 #FEE500 위 짙은 갈색 심볼)
import React from 'react';

const KakaoTalkIcon = ({ small }) => (
    <svg width={small ? 20 : 30} height={small ? 19 : 28} viewBox="0 0 30 28" aria-hidden="true">
        <path
            d="M15 2C7.8 2 2 6.6 2 12.3c0 3.7 2.4 6.9 6.1 8.7l-1.3 4.8c-.1.4.3.7.7.5l5.6-3.7c.6.1 1.3.1 1.9.1 7.2 0 13-4.6 13-10.3S22.2 2 15 2z"
            fill="#3A1D1D"
        />
        <text x="15" y="15.4" textAnchor="middle" fontSize="7.2" fontWeight="800"
              fill="#FEE500" fontFamily="Arial, Helvetica, sans-serif">TALK</text>
    </svg>
);

export default KakaoTalkIcon;
