import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useProjects } from '../context/ProjectContext';
import { Globe, MapPin, Trash2, Loader, Plus, Search, X, Crosshair, Radio, Share2, Users, ChevronDown, ChevronUp, Map, Check, Folder } from 'lucide-react';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
// GlobalChat 은 /chat-check (챗.첵) 페이지로 분리됨. 여기선 지도/위치 공유만.

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

// Cluster icon factory — colors and sizes buckets by count thresholds.
// 2-4 ⇒ green (small), 5-9 ⇒ yellow, 10-14 ⇒ orange, 15-29 ⇒ red-orange, 30+ ⇒ deep red.
const createClusterIcon = (cluster) => {
    const count = cluster.getChildCount();
    let bucket = 0; // size index
    let bg = 'hsla(112, 75%, 42%, 0.95)';
    let size = 34;

    if (count >= 30)      { bucket = 4; bg = 'hsla(0, 80%, 48%, 0.95)';  size = 60; }
    else if (count >= 15) { bucket = 3; bg = 'hsla(8, 88%, 52%, 0.95)';  size = 52; }
    else if (count >= 10) { bucket = 2; bg = 'hsla(28, 92%, 52%, 0.95)'; size = 46; }
    else if (count >= 5)  { bucket = 1; bg = 'hsla(48, 95%, 50%, 0.95)'; size = 40; }
    else                  { bucket = 0; bg = 'hsla(112, 75%, 42%, 0.95)'; size = 34; }

    const fontSize = bucket >= 3 ? 16 : bucket >= 2 ? 15 : 13;
    const ring = bucket >= 3 ? 10 : 8;

    return L.divIcon({
        className: 'meet4u-cluster',
        html: `
            <div style="
                width:${size}px;
                height:${size}px;
                border-radius:50%;
                background:${bg};
                color:white;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:700;
                font-size:${fontSize}px;
                text-shadow:0 1px 2px rgba(0,0,0,0.45);
                box-shadow:
                    0 0 0 ${ring}px rgba(255,255,255,0.55),
                    0 2px 6px rgba(0,0,0,0.35);
                border:2px solid white;
            ">${count}</div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
};

// Saved pin — bright red teardrop with white border, visible at all zoom levels
const savedPinIcon = L.divIcon({
    className: 'meet4u-pin',
    html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 2C8.716 2 2 8.716 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.716 25.284 2 17 2z"
              fill="#dc2626" stroke="white" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="17" cy="17" r="6" fill="white"/>
    </svg>`,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
});

// Pending (unsaved) pin — bright orange teardrop
const pendingIcon = L.divIcon({
    className: 'meet4u-pending-pin',
    html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 2C8.716 2 2 8.716 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.716 25.284 2 17 2z"
              fill="#f97316" stroke="white" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="17" cy="17" r="6" fill="white"/>
    </svg>`,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
});

// Live shared location with name label — green for others, red for self
const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const sharedLocationIcon = (name, isSelf) => {
    const color = isSelf ? '#dc2626' : '#10b981';
    const safeName = escapeHtml(name);
    return L.divIcon({
        className: 'meet4u-shared-location',
        html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
              <div style="
                background:${color};
                color:white;
                font-size:11px;
                padding:2px 8px;
                border-radius:10px;
                white-space:nowrap;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);
                margin-bottom:3px;
                font-weight:600;
                line-height:1.4;
              ">${safeName}</div>
              <div style="
                width:18px;height:18px;
                background:${color};
                border:3px solid white;
                border-radius:50%;
                box-shadow:0 0 0 4px ${color}33, 0 1px 3px rgba(0,0,0,0.3);
              "></div>
            </div>
        `,
        iconSize: [120, 50],
        iconAnchor: [60, 50],
    });
};

// My-location pulsing blue dot
const myLocationIcon = L.divIcon({
    className: 'meet4u-my-location',
    html: `<div style="position:relative;width:20px;height:20px;">
        <div style="position:absolute;inset:0;background:rgba(59,130,246,0.25);border-radius:50%;animation:meet4u-pulse 1.8s ease-out infinite;"></div>
        <div style="position:absolute;inset:4px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
    </div>
    <style>
      @keyframes meet4u-pulse {
        0%   { transform: scale(0.9); opacity: 0.9; }
        100% { transform: scale(2.4); opacity: 0; }
      }
    </style>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// Recenter helper — flies to target when it changes.
// target.zoom 이 지정되면 그 값을 최소치로 사용 (핀 검색 결과 클릭 시 클러스터
// 를 풀기 위해 17 정도로 상향).
const MapFlyTo = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            const desired = target.zoom || 14;
            map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), desired), { duration: 1.2 });
        }
    }, [target, map]);
    return null;
};

// 현재 지도 zoom 을 상위 state 로 브로드캐스트. 마커 라벨(핀 아래 두 글자)
// 을 zoom 임계값 이상에서만 렌더하는 데 쓴다.
const ZoomWatcher = ({ onZoom }) => {
    const map = useMap();
    useEffect(() => {
        const emit = () => onZoom(map.getZoom());
        emit();
        map.on('zoomend', emit);
        return () => map.off('zoomend', emit);
    }, [map, onZoom]);
    return null;
};

// 핀 검색 결과 클릭 시, flyTo 애니메이션이 끝난 후 지도의 모든 마커 레이어를
// 훑어 해당 좌표의 마커를 찾아 openPopup() 을 호출한다.
// <Marker ref={...}> 를 <MarkerClusterGroup> 내부에서 쓰면 react-leaflet-cluster
// 4.x + react-leaflet 5.x 조합에서 "VM is not a constructor" 에러가 발생하므로,
// 이 helper 는 그 우회로.
const OpenPinPopup = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (!target) return;
        const t = setTimeout(() => {
            map.eachLayer((layer) => {
                if (typeof layer.getLatLng !== 'function' || typeof layer.openPopup !== 'function') return;
                const ll = layer.getLatLng();
                if (Math.abs(ll.lat - target.lat) < 1e-5 && Math.abs(ll.lng - target.lng) < 1e-5) {
                    layer.openPopup();
                }
            });
        }, 1300);
        return () => clearTimeout(t);
    }, [target, map]);
    return null;
};

const MapResizeFix = () => {
    const map = useMap();
    useEffect(() => {
        const ro = new ResizeObserver(() => map.invalidateSize());
        const container = map.getContainer();
        ro.observe(container);
        const t = setTimeout(() => map.invalidateSize(), 200);
        return () => {
            ro.disconnect();
            clearTimeout(t);
        };
    }, [map]);
    return null;
};

// Handles plain-map clicks (not clicks on existing markers)
const ClickToPin = ({ onPick }) => {
    useMapEvents({
        click(e) {
            onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
        },
    });
    return null;
};

const GlobalMeetingMap = () => {
    const { t } = useTranslation();
    const { currentUser, isAdmin } = useAuth();
    const { projects } = useProjects();
    // 내가 멤버인 프로젝트 id 집합 — 위치 공유 대상/구독 필터의 기준.
    const myProjectIds = useMemo(
        () => new Set(projects.map(p => p.id)),
        [projects]
    );

    const [pins, setPins] = useState([]);
    const [loading, setLoading] = useState(true);

    // Address form
    const [address, setAddress] = useState('');
    const [pinTitle, setPinTitle] = useState('');
    const [adding, setAdding] = useState(false);

    const [flyToTarget, setFlyToTarget] = useState(null);

    // Pending (unsaved) pin — from map click or search selection
    const [pendingPin, setPendingPin] = useState(null); // { lat, lng, address, resolving }
    const [pendingTitle, setPendingTitle] = useState('');

    // My current location
    const [myLocation, setMyLocation] = useState(null);
    const [locating, setLocating] = useState(false);

    // Pins list modal
    const [showPinsList, setShowPinsList] = useState(false);

    // Live location sharing
    const [isSharing, setIsSharing] = useState(false);
    const [sharingLoading, setSharingLoading] = useState(false);
    const [sharedUsers, setSharedUsers] = useState([]);
    const [showSharedList, setShowSharedList] = useState(true);
    const watchIdRef = useRef(null);
    // 위치 공유 대상 프로젝트 id 집합 (Set<string>). 공유 시작 시 확정.
    const [shareAudienceIds, setShareAudienceIds] = useState([]);
    // 프로젝트 피커 모달 (내 위치 공유 버튼을 누르면 열림)
    const [sharePickerOpen, setSharePickerOpen] = useState(false);
    const [pickerSelection, setPickerSelection] = useState(new Set());

    // 핀 검색 (외부 지도 API 아님) — 등록된 핀 title/address 를 실시간 필터
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const pendingCardRef = useRef(null);
    // 검색 결과에서 선택된 핀 좌표. <OpenPinPopup> 이 감시해 flyTo 후 자동으로 팝업 open.
    const [pinToOpen, setPinToOpen] = useState(null);
    // 마커 라벨 노출을 위한 zoom 추적. 도시 규모(zoom 10~) 정도부터 이미
    // 개별 핀이 클러스터에서 분리돼 보이는 경우가 많아 그때부터 라벨을 노출.
    const [mapZoom, setMapZoom] = useState(10);
    const LABEL_MIN_ZOOM = 10;

    // Map toggle
    const [showMap, setShowMap] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('meet4u_showMap');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });

    useEffect(() => {
        try { localStorage.setItem('meet4u_showMap', showMap ? 'true' : 'false'); } catch (_) { /* ignore */ }
    }, [showMap]);

    // Load pins
    useEffect(() => {
        const q = query(collection(db, 'globalPins'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setPins(data);
            setLoading(false);
        }, (err) => {
            console.error('GlobalMeetingMap pin load error:', err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Filter shared users:
    //   (1) stale entries (no update in 10+ minutes) 제거
    //   (2) 프로젝트 오디언스 게이트 — 상대가 공유 대상으로 지정한 프로젝트
    //       중 하나라도 내가 멤버여야 지도에 보인다. audienceProjectIds 가
    //       없는 옛 레코드는 하위호환을 위해 우선은 자신에게만 보이도록 제한.
    //   내 위치는 audience 무관하게 항상 나에게는 보인다.
    const freshSharedUsers = useMemo(() => {
        const TEN_MIN = 10 * 60 * 1000;
        const now = Date.now();
        return sharedUsers.filter(u => {
            if (typeof u.lat !== 'number' || typeof u.lng !== 'number') return false;
            const t = u.updatedAt?.toMillis?.();
            if (t && now - t >= TEN_MIN) return false;

            const isMe = u.uid === currentUser?.uid;
            if (isMe) return true;

            const audience = Array.isArray(u.audienceProjectIds) ? u.audienceProjectIds : [];
            if (audience.length === 0) return false; // 오디언스 미지정 = 남에게 안 보임
            return audience.some(pid => myProjectIds.has(pid));
        });
    }, [sharedUsers, currentUser?.uid, myProjectIds]);

    // Subscribe to all live shared locations
    useEffect(() => {
        const q = collection(db, 'liveLocations');
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setSharedUsers(list);
        }, (err) => {
            console.error('liveLocations listen error:', err);
        });
        return () => unsub();
    }, []);

    // Stop sharing on unmount + clear watcher
    useEffect(() => {
        return () => {
            if (watchIdRef.current != null && 'geolocation' in navigator) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, []);

    // Scroll pending card into view when created
    useEffect(() => {
        if (pendingPin && pendingCardRef.current) {
            pendingCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [pendingPin]);

    // -------- Geocoding --------
    const geocodeAddress = async (addr) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json', 'Accept-Language': 'ko,en;q=0.8,zh;q=0.6' }
        });
        if (!res.ok) throw new Error('geocode request failed');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const hit = data[0];
        return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name };
    };

    const reverseGeocode = async (lat, lng) => {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json', 'Accept-Language': 'ko,en;q=0.8,zh;q=0.6' }
        });
        if (!res.ok) throw new Error('reverse geocode failed');
        const data = await res.json();
        return data?.display_name || '';
    };

    // searchNominatim 은 예전 "지도 검색" 이 외부 Nominatim 을 호출하던
    // 시절의 함수. 지금은 "핀 검색" 이 pins 로컬 필터만 사용하므로 제거.

    // -------- Handlers --------
    const startPendingPin = async (lat, lng, initialAddress = '') => {
        setPendingPin({ lat, lng, address: initialAddress, resolving: !initialAddress });
        setPendingTitle('');
        setFlyToTarget({ lat, lng, key: Date.now() });
        if (!initialAddress) {
            try {
                const resolved = await reverseGeocode(lat, lng);
                setPendingPin(prev => prev && prev.lat === lat && prev.lng === lng
                    ? { ...prev, address: resolved || '', resolving: false }
                    : prev);
            } catch (err) {
                console.error('reverseGeocode fail', err);
                setPendingPin(prev => prev ? { ...prev, resolving: false } : prev);
            }
        }
    };

    const handleMapClick = (latlng) => {
        if (!currentUser) {
            alert(t('global.loginRequired'));
            return;
        }
        // 핀 추가는 관리자만 — 일반 사용자의 지도 클릭은 아무 액션도 하지 않는다.
        if (!isAdmin) return;
        startPendingPin(latlng.lat, latlng.lng);
    };

    const handleConfirmPendingPin = async () => {
        if (!pendingPin || !currentUser) return;
        if (!isAdmin) { alert('핀 추가는 관리자만 할 수 있어요.'); return; }
        setAdding(true);
        try {
            await addDoc(collection(db, 'globalPins'), {
                lat: pendingPin.lat,
                lng: pendingPin.lng,
                address: pendingPin.address || `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`,
                resolvedAddress: pendingPin.address || '',
                title: pendingTitle.trim() || '',
                createdBy: currentUser.email,
                createdByName: currentUser.displayName || currentUser.email.split('@')[0],
                createdAt: serverTimestamp(),
            });
            setPendingPin(null);
            setPendingTitle('');
        } catch (err) {
            console.error('Failed to save pending pin:', err);
            alert(t('global.addPinFailed'));
        } finally {
            setAdding(false);
        }
    };

    const handleAddPin = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert(t('global.loginRequired'));
            return;
        }
        // 관리자만 핀 추가 가능. UI 는 이미 폼을 숨겼지만, 혹시 DOM
        // 조작으로 우회하는 경우를 대비한 클라이언트 방어선.
        if (!isAdmin) {
            alert('핀 추가는 관리자만 할 수 있어요.');
            return;
        }
        if (!address.trim()) return;

        setAdding(true);
        try {
            const geo = await geocodeAddress(address.trim());
            if (!geo) {
                alert(t('global.geocodeFailed'));
                return;
            }
            await addDoc(collection(db, 'globalPins'), {
                lat: geo.lat,
                lng: geo.lng,
                address: address.trim(),
                resolvedAddress: geo.displayName || '',
                title: pinTitle.trim() || '',
                createdBy: currentUser.email,
                createdByName: currentUser.displayName || currentUser.email.split('@')[0],
                createdAt: serverTimestamp(),
            });
            setFlyToTarget({ lat: geo.lat, lng: geo.lng, key: Date.now() });
            setAddress('');
            setPinTitle('');
        } catch (err) {
            console.error('Failed to add pin:', err);
            alert(t('global.addPinFailed'));
        } finally {
            setAdding(false);
        }
    };

    // audience 는 클로저로 넘기지 않고 최신 상태를 항상 저장하도록 인자로 받는다.
    const writeMyLocation = async (pos, audienceIds) => {
        if (!currentUser?.uid) return;
        try {
            await setDoc(doc(db, 'liveLocations', currentUser.uid), {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? null,
                audienceProjectIds: Array.isArray(audienceIds) ? audienceIds : [],
                updatedAt: serverTimestamp(),
            });
        } catch (err) {
            console.error('writeMyLocation failed', err);
        }
    };

    const startSharing = async (audienceIds) => {
        if (!currentUser) {
            alert(t('global.loginRequired'));
            return;
        }
        if (!('geolocation' in navigator)) {
            alert(t('global.locationNotSupported'));
            return;
        }
        if (!Array.isArray(audienceIds) || audienceIds.length === 0) {
            alert(t('global.selectShareAudience'));
            return;
        }
        setSharingLoading(true);
        try {
            // Initial position
            const initialPos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true, timeout: 15000, maximumAge: 30000,
                });
            });
            await writeMyLocation(initialPos, audienceIds);
            setFlyToTarget({
                lat: initialPos.coords.latitude,
                lng: initialPos.coords.longitude,
                key: Date.now(),
            });

            // Continuous tracking — 최신 audience 를 계속 함께 쓴다.
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => writeMyLocation(pos, audienceIds),
                (err) => console.error('watchPosition error', err),
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
            );
            setShareAudienceIds(audienceIds);
            setIsSharing(true);
        } catch (err) {
            console.error('startSharing failed', err);
            alert(t('global.shareFailed'));
        } finally {
            setSharingLoading(false);
        }
    };

    const openSharePicker = () => {
        if (!currentUser) {
            alert(t('global.loginRequired'));
            return;
        }
        if (projects.length === 0) {
            alert(t('global.needProjectToShare'));
            return;
        }
        // 기본 선택: 현재까지 공유 중이던 대상 그대로, 없으면 전체 선택.
        const initial = shareAudienceIds.length > 0
            ? new Set(shareAudienceIds.filter(id => myProjectIds.has(id)))
            : new Set(projects.map(p => p.id));
        setPickerSelection(initial);
        setSharePickerOpen(true);
    };

    const togglePickerProject = (id) => {
        setPickerSelection(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const confirmSharePicker = async () => {
        const ids = Array.from(pickerSelection);
        if (ids.length === 0) {
            alert(t('global.selectShareAudience'));
            return;
        }
        setSharePickerOpen(false);
        await startSharing(ids);
    };

    const stopSharing = async () => {
        if (watchIdRef.current != null && 'geolocation' in navigator) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsSharing(false);
        setShareAudienceIds([]);
        if (currentUser?.uid) {
            try {
                await deleteDoc(doc(db, 'liveLocations', currentUser.uid));
            } catch (err) {
                console.error('stopSharing delete failed', err);
            }
        }
    };

    const handleLocateMe = () => {
        if (!('geolocation' in navigator)) {
            alert(t('global.locationNotSupported'));
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setMyLocation(loc);
                setFlyToTarget({ ...loc, key: Date.now() });
                setLocating(false);
            },
            (err) => {
                console.error('geolocation failed', err);
                alert(t('global.locationFailed'));
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    const handleDeletePin = async (pin) => {
        if (pin.createdBy !== currentUser?.email && !isAdmin) return;
        if (!window.confirm(t('global.confirmDeletePin'))) return;
        try {
            await deleteDoc(doc(db, 'globalPins', pin.id));
        } catch (err) {
            console.error('Failed to delete pin:', err);
        }
    };

    // 핀 검색 결과 — 검색어를 title/address/resolvedAddress/createdByName 에
    // 부분 매칭. 대소문자 무시, 앞뒤 공백 무시, 최대 20개.
    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        return pins.filter(p => {
            const hay = [p.title, p.address, p.resolvedAddress, p.createdByName, p.createdBy]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        }).slice(0, 20);
    }, [pins, searchQuery]);

    // 결과 클릭 → 지도 확대 이동 + 해당 핀 마커의 팝업 자동 오픈.
    // 팝업 오픈은 OpenPinPopup helper 가 담당 (map.eachLayer 로 좌표 매칭).
    const handlePickPin = (pin) => {
        if (!pin || typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;
        setFlyToTarget({ lat: pin.lat, lng: pin.lng, zoom: 17, key: Date.now() });
        setPinToOpen({ lat: pin.lat, lng: pin.lng, key: Date.now() });
        setSearchOpen(false);
        setSearchQuery('');
    };

    return (
        <div className="max-w-5xl mx-auto space-y-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Globe className="text-blue-600" size={26} />
                    {t('global.title')}
                </h1>
                <p className="text-slate-500 text-sm mt-1">{t('global.subtitle')}</p>
            </div>

            {/* Address input form — 핀 추가는 관리자 전용. 일반 사용자에겐 폼을
                노출하지 않고, 대신 지도 위 기존 핀을 조회만 가능하다는 안내를 표시. */}
            {isAdmin ? (
                <form
                    onSubmit={handleAddPin}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row gap-2"
                >
                    <div className="flex-1 flex items-center gap-2 border border-slate-200 rounded-lg px-3 focus-within:ring-2 focus-within:ring-blue-500">
                        <MapPin size={16} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder={t('global.addressPlaceholder')}
                            className="flex-1 py-2 text-sm bg-transparent focus:outline-none"
                        />
                    </div>
                    <input
                        type="text"
                        value={pinTitle}
                        onChange={(e) => setPinTitle(e.target.value)}
                        placeholder={t('global.pinTitlePlaceholder')}
                        className="md:w-56 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        type="submit"
                        disabled={adding || !address.trim() || !currentUser}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition disabled:bg-slate-300"
                    >
                        {adding ? (
                            <>
                                <Loader size={16} className="animate-spin" />
                                {t('global.adding')}
                            </>
                        ) : (
                            <>
                                <Plus size={16} />
                                {t('global.addPinBtn')}
                            </>
                        )}
                    </button>
                </form>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 text-xs text-slate-500 flex items-center gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0" />
                    핀 추가는 관리자만 할 수 있어요. 지도에서 기존 핀은 자유롭게 조회할 수 있습니다.
                </div>
            )}

            {/* 핀 검색 도구 — 외부 지도 API 가 아니라 이미 등록된 핀만 필터.
                검색어 입력 즉시 title/address 부분매칭 결과가 뜨고, 클릭하면
                지도가 그 위치로 확대 이동 + 해당 핀의 팝업이 자동으로 열린다. */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setSearchOpen(v => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${searchOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                        <Search size={14} />
                        핀 검색
                    </button>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                        등록된 핀 중 이름·주소로 찾기
                    </span>
                </div>

                {searchOpen && (
                    <div className="mt-3">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="핀 이름이나 주소로 검색 (예: 충장)"
                            autoFocus
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        {searchQuery.trim() && searchResults.length === 0 && (
                            <div className="mt-2 text-xs text-slate-400 text-center py-3">
                                검색어와 일치하는 등록 핀이 없어요.
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <ul className="mt-2 max-h-56 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                                {searchResults.map((pin) => (
                                    <li key={pin.id}>
                                        <button
                                            type="button"
                                            onClick={() => handlePickPin(pin)}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-start gap-2"
                                        >
                                            <MapPin size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                            <span className="flex-1 min-w-0">
                                                {pin.title && (
                                                    <div className="font-semibold text-slate-800 truncate" title={pin.title}>
                                                        {pin.title}
                                                    </div>
                                                )}
                                                <div className={`truncate ${pin.title ? 'text-[11px] text-slate-500' : 'text-slate-700'}`} title={pin.address}>
                                                    {pin.address}
                                                </div>
                                                <div className="text-[10px] text-slate-400 truncate">
                                                    등록자: {pin.createdByName || pin.createdBy}
                                                </div>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* Pending pin confirmation card */}
            {pendingPin && (
                <div ref={pendingCardRef} className="bg-orange-50 border border-orange-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 text-orange-700 font-medium">
                            <MapPin size={16} />
                            <span>{t('global.pendingTitle')}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setPendingPin(null); setPendingTitle(''); }}
                            className="p-1 text-orange-400 hover:text-orange-700"
                            title={t('common.cancel')}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="text-xs text-slate-600 bg-white border border-orange-100 rounded-lg p-2">
                        {pendingPin.resolving ? (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                                <Loader size={12} className="animate-spin" />
                                {t('global.resolvingAddress')}
                            </span>
                        ) : (
                            pendingPin.address || `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`
                        )}
                    </div>
                    <div className="flex flex-col md:flex-row gap-2">
                        <input
                            type="text"
                            value={pendingTitle}
                            onChange={(e) => setPendingTitle(e.target.value)}
                            placeholder={t('global.pinTitlePlaceholder')}
                            className="flex-1 px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                        />
                        <button
                            type="button"
                            onClick={handleConfirmPendingPin}
                            disabled={adding || pendingPin.resolving}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg shadow-sm hover:bg-orange-600 disabled:bg-slate-300"
                        >
                            {adding ? (
                                <><Loader size={14} className="animate-spin" />{t('global.adding')}</>
                            ) : (
                                <><Plus size={14} />{t('global.confirmAdd')}</>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setPendingPin(null); setPendingTitle(''); }}
                            className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

            {/* Map toggle header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setShowMap(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Map size={16} className="text-blue-600" />
                        {t('global.mapToggle', '지도')}
                    </span>
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors ${showMap ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                        {showMap ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                </button>

                {/* Map content */}
                {showMap && (
                    <div className="relative w-full h-[60vh] md:h-[70vh] min-h-[400px] border-t border-slate-200">
                        {loading && (
                            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/70 pointer-events-none">
                                <Loader className="animate-spin text-blue-600" size={32} />
                            </div>
                        )}
                        <MapContainer
                            center={[37.5665, 126.9780]}
                            zoom={6}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <MapResizeFix />
                            <ClickToPin onPick={handleMapClick} />
                            {flyToTarget && <MapFlyTo target={flyToTarget} />}
                            {pinToOpen && <OpenPinPopup target={pinToOpen} />}
                            <ZoomWatcher onZoom={setMapZoom} />

                            {/* Pending (unsaved) pin */}
                            {pendingPin && (
                                <Marker
                                    position={[pendingPin.lat, pendingPin.lng]}
                                    icon={pendingIcon}
                                    eventHandlers={{ add: (e) => e.target.openPopup() }}
                                >
                                    <Popup>
                                        <div className="min-w-[180px]">
                                            <div className="font-bold text-orange-600 mb-1 text-sm">
                                                {t('global.pendingTitle')}
                                            </div>
                                            <div className="text-xs text-slate-600">
                                                {pendingPin.resolving
                                                    ? t('global.resolvingAddress')
                                                    : (pendingPin.address || `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`)}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            )}

                            <MarkerClusterGroup
                                chunkedLoading
                                showCoverageOnHover={false}
                                spiderfyOnMaxZoom
                                maxClusterRadius={60}
                                disableClusteringAtZoom={17}
                                iconCreateFunction={createClusterIcon}
                            >
                                {pins.map((pin) => {
                                    // 라벨: 제목 우선, 없으면 주소. 앞 2글자만.
                                    const label = ((pin.title || pin.address || '').trim()).slice(0, 4);
                                    return (
                                    <Marker
                                        key={pin.id}
                                        position={[pin.lat, pin.lng]}
                                        icon={savedPinIcon}
                                    >
                                        {/* zoom 이 임계값 이상일 때만 핀 아래 라벨 표시.
                                            direction=bottom, offset 으로 핀 아래로 살짝 내린다. */}
                                        {label && mapZoom >= LABEL_MIN_ZOOM && (
                                            <Tooltip
                                                permanent
                                                direction="bottom"
                                                offset={[0, 10]}
                                                className="pin-label-tooltip"
                                            >
                                                {label}
                                            </Tooltip>
                                        )}
                                        <Popup>
                                            <div className="p-1 min-w-[180px]">
                                                {pin.title && <h3 className="font-bold text-slate-800 mb-1">{pin.title}</h3>}
                                                <div className="text-sm text-slate-700 mb-1">{pin.address}</div>
                                                {pin.resolvedAddress && pin.resolvedAddress !== pin.address && (
                                                    <div className="text-[11px] text-slate-400 mb-1.5 truncate" title={pin.resolvedAddress}>
                                                        {pin.resolvedAddress}
                                                    </div>
                                                )}
                                                <div className="text-[11px] text-slate-500">
                                                    {t('global.byLabel')}: {pin.createdByName || pin.createdBy}
                                                </div>
                                                {(pin.createdBy === currentUser?.email || isAdmin) && (
                                                    <button
                                                        onClick={() => handleDeletePin(pin)}
                                                        className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                                                    >
                                                        <Trash2 size={12} />
                                                        {t('global.deletePin')}
                                                    </button>
                                                )}
                                            </div>
                                        </Popup>
                                    </Marker>
                                    );
                                })}
                            </MarkerClusterGroup>

                            {/* My (one-time) current location dot */}
                            {myLocation && !isSharing && (
                                <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon}>
                                    <Popup>{t('global.myLocation')}</Popup>
                                </Marker>
                            )}

                            {/* Live shared locations (other users + self when sharing) */}
                            {freshSharedUsers.map((u) => (
                                <Marker
                                    key={u.id}
                                    position={[u.lat, u.lng]}
                                    icon={sharedLocationIcon(u.displayName, u.uid === currentUser?.uid)}
                                >
                                    <Popup>
                                        <div className="text-sm">
                                            <div className="font-bold text-slate-800">
                                                {u.displayName}
                                                {u.uid === currentUser?.uid && (
                                                    <span className="text-[10px] text-slate-400 ml-1">{t('global.youLabel')}</span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {u.lat.toFixed(5)}, {u.lng.toFixed(5)}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>

                        {/* Top-right control stack: legend + share button + locate button */}
                        <div className="absolute top-3 right-3 z-[700] flex flex-col items-end gap-2 max-w-[260px]">
                            {/* Legend (collapsible) */}
                            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden w-full">
                                <button
                                    type="button"
                                    onClick={() => setShowSharedList(v => !v)}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Users size={13} className="text-emerald-600" />
                                        {t('global.sharedUsersTitle')}
                                        <span className="text-slate-400 font-normal">({freshSharedUsers.length})</span>
                                    </span>
                                    {showSharedList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showSharedList && (
                                    <div className="border-t border-slate-100 max-h-44 overflow-y-auto">
                                        {freshSharedUsers.length === 0 ? (
                                            <div className="text-[11px] text-slate-400 text-center py-3 px-3">
                                                {t('global.noSharedUsers')}
                                            </div>
                                        ) : (
                                            <ul className="divide-y divide-slate-50">
                                                {freshSharedUsers.map(u => {
                                                    const isMe = u.uid === currentUser?.uid;
                                                    return (
                                                        <li key={u.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setFlyToTarget({ lat: u.lat, lng: u.lng, key: Date.now() })}
                                                                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-xs"
                                                            >
                                                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isMe ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                                                                <span className="text-slate-700 truncate flex-1">
                                                                    {u.displayName}
                                                                    {isMe && <span className="text-slate-400 ml-1">{t('global.youLabel')}</span>}
                                                                </span>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Share / Stop sharing button */}
                            <button
                                type="button"
                                onClick={isSharing ? stopSharing : openSharePicker}
                                disabled={sharingLoading || !currentUser}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-md border text-xs font-medium transition-colors disabled:opacity-60 ${isSharing
                                    ? 'bg-red-500 text-white border-red-600 hover:bg-red-600'
                                    : 'bg-white text-blue-700 border-slate-200 hover:bg-blue-50'
                                    }`}
                                title={isSharing ? t('global.stopSharing') : t('global.shareLocation')}
                            >
                                {sharingLoading ? (
                                    <Loader size={14} className="animate-spin" />
                                ) : isSharing ? (
                                    <Radio size={14} className="animate-pulse" />
                                ) : (
                                    <Share2 size={14} />
                                )}
                                <span>{isSharing ? t('global.stopSharing') : t('global.shareLocation')}</span>
                            </button>

                            {/* My-location (one-shot) */}
                            <button
                                type="button"
                                onClick={handleLocateMe}
                                disabled={locating}
                                className="bg-white hover:bg-blue-50 border border-slate-200 shadow-md rounded-full p-2.5 text-blue-600 disabled:opacity-60 transition-colors"
                                title={t('global.myLocation')}
                                aria-label={t('global.myLocation')}
                            >
                                {locating ? <Loader size={18} className="animate-spin" /> : <Crosshair size={18} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Info bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-600">
                <button
                    type="button"
                    onClick={() => pins.length > 0 && setShowPinsList(true)}
                    disabled={pins.length === 0}
                    className="inline-flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-md hover:bg-blue-50 disabled:hover:bg-transparent transition-colors"
                >
                    <MapPin size={14} className="text-blue-600" />
                    <span className={pins.length > 0 ? 'text-blue-600 underline-offset-2 hover:underline' : ''}>
                        {t('global.pinsCount', { count: pins.length })}
                    </span>
                </button>
                {!currentUser && (
                    <span className="text-amber-600">{t('global.loginRequired')}</span>
                )}
                {pins.length === 0 && !loading && (
                    <span className="text-slate-400">{t('global.noPins')}</span>
                )}
            </div>

            {/* Pins list modal */}
            {showPinsList && (
                <div
                    className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setShowPinsList(false)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 inline-flex items-center gap-2">
                                <MapPin size={16} className="text-blue-600" />
                                {t('global.pinsListTitle')}
                                <span className="text-xs text-slate-400 font-normal">({pins.length})</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowPinsList(false)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
                            {pins.map((pin) => (
                                <li key={pin.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFlyToTarget({ lat: pin.lat, lng: pin.lng, key: Date.now() });
                                            setShowPinsList(false);
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-2"
                                    >
                                        <MapPin size={14} className="text-red-500 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            {pin.title && (
                                                <div className="font-medium text-slate-800 text-sm truncate">
                                                    {pin.title}
                                                </div>
                                            )}
                                            <div className={`text-xs ${pin.title ? 'text-slate-500' : 'text-slate-700 font-medium'} truncate`}>
                                                {pin.address}
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                                {t('global.byLabel')}: {pin.createdByName || pin.createdBy}
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* 위치 공유 대상 프로젝트 선택 모달 */}
            {sharePickerOpen && (
                <div
                    className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4"
                    onClick={() => setSharePickerOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <Share2 size={16} className="text-blue-600" />
                                {t('global.pickAudienceTitle')}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setSharePickerOpen(false)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <p className="px-5 pt-3 text-xs text-slate-500 leading-relaxed">
                            {t('global.pickAudienceHint')}
                        </p>
                        <ul className="p-3 space-y-1 max-h-[50vh] overflow-y-auto">
                            {projects.map(p => {
                                const checked = pickerSelection.has(p.id);
                                const memberCount = (p.memberEmails || []).length;
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            onClick={() => togglePickerProject(p.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${checked
                                                ? 'bg-blue-50 border-blue-300'
                                                : 'bg-white border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${checked
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'bg-white border-slate-300'
                                            }`}>
                                                {checked && <Check size={13} strokeWidth={3} />}
                                            </span>
                                            <span className="text-lg shrink-0">{p.icon || '📁'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div>
                                                <div className="text-[11px] text-slate-500">
                                                    {t('projects.membersCount', { count: memberCount })}
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">
                                {t('global.selectedCount', { count: pickerSelection.size })}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSharePickerOpen(false)}
                                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmSharePicker}
                                    disabled={pickerSelection.size === 0}
                                    className="px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                    <Radio size={14} /> {t('global.startSharingBtn')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default GlobalMeetingMap;
