// "저 여기 있어요" 지도에 등록된 핀(globalPins) 공용 구독 + 모임 장소 연결 도우미.
//
// 모임 폼·모임 팝업이 같은 핀 목록을 쓰므로 onSnapshot 하나를 여러 화면이 나눠 쓴다
// (마지막 구독자가 사라지면 해제).

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';

let cache = null;
let unsub = null;
const listeners = new Set();

export const useGlobalPins = () => {
    const [pins, setPins] = useState(cache || []);
    useEffect(() => {
        listeners.add(setPins);
        if (!unsub) {
            unsub = onSnapshot(query(collection(db, 'globalPins'), orderBy('createdAt', 'desc')), (snap) => {
                cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
                    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
                listeners.forEach((f) => f(cache));
            }, (err) => console.error('globalPins subscribe failed:', err));
        } else if (cache) {
            setPins(cache);
        }
        return () => {
            listeners.delete(setPins);
            if (!listeners.size && unsub) { unsub(); unsub = null; }
        };
    }, []);
    return pins;
};

// 모임 장소 칸에 들어갈 이름 — 제목 우선, 없으면 주소
export const pinLabel = (pin) => String(pin?.title || pin?.address || '').trim();

// 모임 문서에 저장하는 핀 스냅샷(핀이 나중에 지워져도 위치는 남는다)
export const pinSnapshot = (pin) => ({
    id: pin.id, lat: pin.lat, lng: pin.lng,
    title: pin.title || '', address: pin.address || '',
});

// 장소 글자와 같은 이름의 핀 — locationPin 이 없는 예전 모임도 지도와 연결하기 위해
export const findPinByLabel = (pins, text) => {
    const q = String(text || '').trim();
    if (!q) return null;
    return pins.find((p) => pinLabel(p) === q) || pins.find((p) => String(p.address || '').trim() === q) || null;
};

// "저 여기 있어요" 지도에서 이 좌표로 확대 + 핀 팝업 열기
export const pinMapPath = (pin) => `/global-meeting?focus=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;

// k-road.asia 원스톱 길안내 — 출발 현재 위치, 도착 이 좌표, 고속도로·추천 경로로 주행 모드까지
export const kroadNavUrl = (pin) =>
    `https://www.k-road.asia/?navTo=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}&navName=${encodeURIComponent(pinLabel(pin))}`;
