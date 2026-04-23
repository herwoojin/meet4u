import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Globe, MapPin, Trash2, Loader, Plus } from 'lucide-react';
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

// Recenter helper — flies to target when a new pin is added
const MapFlyTo = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), { duration: 1.2 });
        }
    }, [target, map]);
    return null;
};

// Fix map sizing once mounted so Leaflet recomputes tiles correctly on mobile
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

const GlobalMeetingMap = () => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();

    const [pins, setPins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [address, setAddress] = useState('');
    const [pinTitle, setPinTitle] = useState('');
    const [adding, setAdding] = useState(false);
    const [flyToTarget, setFlyToTarget] = useState(null);

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

    const geocodeAddress = async (addr) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json', 'Accept-Language': 'ko,en;q=0.8,zh;q=0.6' }
        });
        if (!res.ok) throw new Error('geocode request failed');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const hit = data[0];
        return {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            displayName: hit.display_name,
        };
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

    const handleDeletePin = async (pin) => {
        if (pin.createdBy !== currentUser?.email) return;
        if (!window.confirm(t('global.confirmDeletePin'))) return;
        try {
            await deleteDoc(doc(db, 'globalPins', pin.id));
        } catch (err) {
            console.error('Failed to delete pin:', err);
        }
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
                    {flyToTarget && <MapFlyTo target={flyToTarget} />}

                    <MarkerClusterGroup chunkedLoading>
                        {pins.map((pin) => (
                            <Marker key={pin.id} position={[pin.lat, pin.lng]}>
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
                    </MarkerClusterGroup>
                </MapContainer>
            </div>

            {/* Info bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                    <MapPin size={14} className="text-blue-600" />
                    {t('global.pinsCount', { count: pins.length })}
                </span>
                {!currentUser && (
                    <span className="text-amber-600">{t('global.loginRequired')}</span>
                )}
                {pins.length === 0 && !loading && (
                    <span className="text-slate-400">{t('global.noPins')}</span>
                )}
            </div>

            {/* Global chat */}
            <GlobalChat />
        </div>
    );
};

export default GlobalMeetingMap;
