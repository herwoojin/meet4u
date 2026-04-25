import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Globe, MapPin, Trash2, Loader, Plus, Search, X, Crosshair } from 'lucide-react';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import GlobalChat from '../Components/chat/GlobalChat';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

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

// Recenter helper — flies to target when it changes
const MapFlyTo = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 1.2 });
        }
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
    const { currentUser } = useAuth();

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

    // Keyword search
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const pendingCardRef = useRef(null);

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

    const searchNominatim = async (q) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json', 'Accept-Language': 'ko,en;q=0.8,zh;q=0.6' }
        });
        if (!res.ok) throw new Error('search failed');
        return await res.json();
    };

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
        startPendingPin(latlng.lat, latlng.lng);
    };

    const handleConfirmPendingPin = async () => {
        if (!pendingPin || !currentUser) return;
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
        if (pin.createdBy !== currentUser?.email) return;
        if (!window.confirm(t('global.confirmDeletePin'))) return;
        try {
            await deleteDoc(doc(db, 'globalPins', pin.id));
        } catch (err) {
            console.error('Failed to delete pin:', err);
        }
    };

    const handleSearchSubmit = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        setSearchResults([]);
        try {
            const results = await searchNominatim(searchQuery.trim());
            setSearchResults(Array.isArray(results) ? results : []);
        } catch (err) {
            console.error('search failed', err);
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handleSelectSearchResult = (r) => {
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        startPendingPin(lat, lng, r.display_name || '');
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
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

            {/* Address input form */}
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

            {/* Search toolbar */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setSearchOpen(v => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${searchOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                        <Search size={14} />
                        {t('global.searchBtn')}
                    </button>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                        {t('global.pendingHint')}
                    </span>
                </div>

                {searchOpen && (
                    <div className="mt-3">
                        <form onSubmit={handleSearchSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('global.searchPlaceholder')}
                                autoFocus
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="submit"
                                disabled={searching || !searchQuery.trim()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-slate-300"
                            >
                                {searching ? (
                                    <><Loader size={14} className="animate-spin" />{t('global.searching')}</>
                                ) : (
                                    <><Search size={14} />{t('global.searchAction')}</>
                                )}
                            </button>
                        </form>

                        {!searching && searchResults.length === 0 && searchQuery && (
                            <div className="mt-2 text-xs text-slate-400 text-center py-3">
                                {t('global.noSearchResults')}
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <ul className="mt-2 max-h-56 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                                {searchResults.map((r, idx) => (
                                    <li key={`${r.place_id || idx}`}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectSearchResult(r)}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-start gap-2"
                                        >
                                            <MapPin size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                            <span className="flex-1 text-slate-700 truncate" title={r.display_name}>
                                                {r.display_name}
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

            {/* Map */}
            <div className="relative w-full h-[60vh] md:h-[70vh] min-h-[400px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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

                    {pins.map((pin) => (
                        <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={savedPinIcon}>
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
                                    {pin.createdBy === currentUser?.email && (
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
                    ))}

                    {/* My current location */}
                    {myLocation && (
                        <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon}>
                            <Popup>{t('global.myLocation')}</Popup>
                        </Marker>
                    )}
                </MapContainer>

                {/* My-location button (overlay) */}
                <button
                    type="button"
                    onClick={handleLocateMe}
                    disabled={locating}
                    className="absolute top-3 right-3 z-[700] bg-white hover:bg-blue-50 border border-slate-200 shadow-md rounded-full p-2.5 text-blue-600 disabled:opacity-60 transition-colors"
                    title={t('global.myLocation')}
                    aria-label={t('global.myLocation')}
                >
                    {locating ? <Loader size={18} className="animate-spin" /> : <Crosshair size={18} />}
                </button>
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

            {/* Global chat */}
            <GlobalChat />
        </div>
    );
};

export default GlobalMeetingMap;
