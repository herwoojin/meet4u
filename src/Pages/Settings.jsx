import React, { useState, useEffect } from 'react';
import { Bell, BellRing, BellOff, Settings as SettingsIcon } from 'lucide-react';
import { requestNotificationPermission } from '../hooks/useCommentNotifications';

const Settings = () => {
    const [notifPermission, setNotifPermission] = useState('unsupported');

    useEffect(() => {
        if ('Notification' in window) {
            setNotifPermission(Notification.permission);
        }
    }, []);

    const handleRequestPermission = async () => {
        const result = await requestNotificationPermission();
        setNotifPermission(result);
        if (result === 'granted') {
            alert('알림이 활성화되었습니다! 🔔\n참석 및 댓글 알림을 받을 수 있습니다.');
        } else if (result === 'denied') {
            alert('알림이 차단되어 있습니다.\n브라우저 설정(또는 기기 설정)에서 알림을 허용해 주세요.');
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <SettingsIcon className="text-blue-600" size={28} />
                    설정
                </h1>
                <p className="text-gray-500 mt-2">앱 환경 및 알림 설정을 관리하세요.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell className="text-gray-600" size={20} />
                        푸시 알림 설정
                    </h2>
                    
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-800">모바일 알림 (브라우저 푸시 알림)</p>
                            <p className="text-xs text-gray-500 mt-1">
                                새로운 댓글이나 내 모임에 새로운 참석자가 있을 때 알림을 받습니다.
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <span className={`text-xs px-3 py-1 rounded-full font-bold border ${notifPermission === 'granted' ? 'bg-green-100 text-green-700 border-green-200' :
                                    notifPermission === 'denied' ? 'bg-red-100 text-red-700 border-red-200' :
                                    'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>
                                {notifPermission === 'granted' ? '사용 중' : 
                                 notifPermission === 'denied' ? '차단됨' : 
                                 '미설정'}
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        {notifPermission === 'granted' ? (
                            <div className="flex items-center gap-3 text-green-700">
                                <div className="p-2 bg-green-100 rounded-full">
                                    <BellRing size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">푸시 알림이 활성화되어 있습니다.</p>
                                    <p className="text-xs mt-1 text-green-600">이제 브라우저 및 모바일 알림창에서 메시지를 받을 수 있습니다.</p>
                                </div>
                            </div>
                        ) : notifPermission === 'denied' ? (
                            <div className="flex items-center gap-3 text-red-700">
                                <div className="p-2 bg-red-100 rounded-full">
                                    <BellOff size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">알림 권한이 차단되었습니다.</p>
                                    <p className="text-xs mt-1 text-red-600">주소창의 자물쇠 아이콘(또는 기기 앱 설정)을 눌러 알림 권한을 '허용'으로 변경해주세요.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-start gap-3">
                                <p className="text-sm text-gray-600">아직 푸시 알림 권한이 없습니다. 알림을 받으시려면 아래 버튼을 눌러주세요.</p>
                                <button
                                    onClick={handleRequestPermission}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition"
                                >
                                    알림 접근 권한 허용하기
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-blue-50/50">
                    <h3 className="text-sm font-bold text-gray-800 mb-2">💡 아이폰(iOS) 사용자 참고사항</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                        아이폰의 경우 브라우저 정책상 <strong>'홈 화면에 추가'</strong>를 통해 앱을 설치하셔야 알림 기능을 온전히 사용할 수 있습니다. (iOS 16.4 이상 지원) <br className="hidden md:block" />
                        Safari 브라우저 하단의 [공유] 버튼을 누른 후, [홈 화면에 추가]를 선택하여 바탕화면에 앱을 설치해 주세요.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
