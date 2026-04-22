import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { collection, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
// Setup default Leaflet marker icons fixing the broken icon issue in react-leaflet
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

const GlobalMeetingMap = () => {
    const { t } = useTranslation();
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        const q = collection(db, 'shops');
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = [];
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            setShops(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const generateMockData = async () => {
        setGenerating(true);
        try {
            // Firestore allow maximum 500 writes per batch. 
            // So we do 500 points to keep it simple and fit within 1 batch, or do 2 batches for 1000.
            // Let's do 2 batches for 1000 points.
            
            const createShops = (count, startNum) => {
                const batchShops = [];
                for (let i = 0; i < count; i++) {
                    const lat = 37.5 + Math.random() * 0.2; // Seoul/Gyeonggi latitude
                    const lng = 126.9 + Math.random() * 0.3; // Seoul/Gyeonggi longitude
                    const types = ['Active', 'Pending', 'Closed'];
                    const status = types[Math.floor(Math.random() * types.length)];
                    batchShops.push({
                        lat,
                        lng,
                        name: `CCTV / Shop #${startNum + i}`,
                        address: `경기/서울 임의 주소 ${startNum + i}`,
                        status
                    });
                }
                return batchShops;
            };

            const batch1 = writeBatch(db);
            const shops1 = createShops(500, 1);
            shops1.forEach((shop) => {
                const shopRef = doc(collection(db, 'shops'));
                batch1.set(shopRef, shop);
            });
            await batch1.commit();

            const batch2 = writeBatch(db);
            const shops2 = createShops(500, 501);
            shops2.forEach((shop) => {
                const shopRef = doc(collection(db, 'shops'));
                batch2.set(shopRef, shop);
            });
            await batch2.commit();

            alert('1,000 Mock Data generated successfully!');
        } catch (error) {
            console.error("Error generating mock data:", error);
            alert('Error generating mock data.');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative p-4">
            <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">{t('nav.globalMeeting', '글로벌 미팅')}</h1>
                    <p className="text-slate-500 text-sm mt-1">대규모 CCTV/점포 위치를 지도에서 한눈에 확인하세요.</p>
                </div>
                <div className="mt-4 md:mt-0">
                    {shops.length === 0 && !loading && (
                        <button 
                            onClick={generateMockData} 
                            disabled={generating}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition disabled:bg-blue-300"
                        >
                            {generating ? '생성 중...' : '1,000개 임의 데이터 생성 (테스트용)'}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
                {loading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70">
                        <div className="text-blue-600 font-medium">지도 데이터를 불러오는 중...</div>
                    </div>
                )}
                <MapContainer 
                    center={[37.5665, 126.9780]} // Seoul Center
                    zoom={10} 
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    <MarkerClusterGroup
                        chunkedLoading
                        // Disable default icon creation and inject custom style classes if needed
                    >
                        {shops.map((shop) => (
                            <Marker 
                                key={shop.id} 
                                position={[shop.lat, shop.lng]}
                            >
                                <Popup>
                                    <div className="p-1 min-w-[150px]">
                                        <h3 className="font-bold text-slate-800 mb-1">{shop.name}</h3>
                                        <div className="text-sm text-slate-600 mb-2">{shop.address}</div>
                                        <div className="text-xs font-semibold">
                                            Status: 
                                            <span className={`ml-1 px-2 py-0.5 rounded-full text-white ${shop.status === 'Active' ? 'bg-green-500' : shop.status === 'Pending' ? 'bg-yellow-500' : 'bg-red-500'}`}>
                                                {shop.status}
                                            </span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>
            
            {/* Legend / Info block */}
            <div className="mt-4 flex gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm text-sm">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span className="text-slate-600">Active (운영중)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                    <span className="text-slate-600">Pending (대기/수리중)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="text-slate-600">Closed (종료/장애)</span>
                </div>
                <div className="flex-1 text-right text-slate-500">
                    지도상 노드를 클릭하면 해당 지역으로 확대됩니다.
                </div>
            </div>
        </div>
    );
};

export default GlobalMeetingMap;
