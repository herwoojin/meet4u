// 모임 팝업의 장소 카드 — 지도 핀과 연결된 장소면 작은 지도로 위치를 보여 주고,
// 누르면 "저 여기 있어요" 지도로 넘어가 그 핀을 확대해 보여 준다.

import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ChevronRight } from 'lucide-react';
import { useGlobalPins, findPinByLabel, pinMapPath } from '../../lib/globalPins';

const pinIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:28px;transform:translate(-2px,-26px)">📍</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

const MeetingLocationCard = ({ meeting, onOpenMap }) => {
    const pins = useGlobalPins();
    if (!meeting.location) return null;
    // 새 모임은 고른 핀 좌표가 저장돼 있고, 예전 모임은 장소 이름이 같은 핀을 찾아 연결한다
    const pin = meeting.locationPin || findPinByLabel(pins, meeting.location);

    if (!pin) {
        return (
            <div className="flex items-center gap-1.5 text-sm text-gray-700">
                <MapPin size={16} className="text-blue-500 shrink-0" />
                <span className="break-words">{meeting.location}</span>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onOpenMap(pinMapPath(pin))}
            className="block w-full text-left rounded-lg border border-blue-100 overflow-hidden hover:border-blue-300 transition-colors"
            title="저 여기 있어요 지도에서 크게 보기"
        >
            {/* 미리보기 지도 — 조작은 막고, 누르면 큰 지도로 넘어간다 */}
            <div className="h-32 pointer-events-none">
                <MapContainer
                    key={`${pin.lat},${pin.lng}`}
                    center={[pin.lat, pin.lng]}
                    zoom={16}
                    zoomControl={false}
                    attributionControl={false}
                    dragging={false}
                    scrollWheelZoom={false}
                    doubleClickZoom={false}
                    touchZoom={false}
                    boxZoom={false}
                    keyboard={false}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[pin.lat, pin.lng]} icon={pinIcon} interactive={false} />
                </MapContainer>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50">
                <MapPin size={16} className="text-blue-600 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 truncate">{meeting.location}</div>
                    {pin.address && pin.address !== meeting.location && (
                        <div className="text-[11px] text-gray-500 truncate">{pin.address}</div>
                    )}
                </div>
                <span className="shrink-0 inline-flex items-center text-[11px] font-semibold text-blue-600">
                    지도에서 보기 <ChevronRight size={14} />
                </span>
            </div>
        </button>
    );
};

export default MeetingLocationCard;
