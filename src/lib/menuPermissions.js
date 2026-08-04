import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

export const GROUPS = ['general', 'full', 'special', 'admin'];

export const GROUP_LABEL_KEY = {
    general: 'admin.groupGeneral',
    full: 'admin.groupFull',
    special: 'admin.groupSpecial',
    admin: 'admin.groupAdmin',
};

export const MENU_KEYS = [
    'weeklyCalendar',
    'monthlyCalendar',
    'createMeeting',
    'globalMeeting',
    'chatCheck',
    'guestMeetups',
    'myDashboard',
    'settings',
    'admin',
];

export const DEFAULT_PERMISSIONS = MENU_KEYS.reduce((acc, key) => {
    acc[key] = {
        general: key !== 'admin',
        full: key !== 'admin',
        special: key !== 'admin',
        admin: true,
    };
    return acc;
}, {});

const CONFIG_COLLECTION = 'config';
const CONFIG_DOC = 'menuPermissions';

// menuPermissions 문서는 firestore.rules 상 로그인된 사용자만 읽을 수 있다.
// 따라서 컴포넌트 mount 시점에 곧바로 onSnapshot 을 걸면, 아직 auth 토큰이
// Firestore SDK 로 전달되기 전이라 permission-denied 로 실패하고 그대로
// DEFAULT_PERMISSIONS 에 굳어버려 "같은 계정인데 브라우저마다 좌측 메뉴가
// 다르게 보이는" 버그가 발생한다.
//
// 해결: onAuthStateChanged 로 auth 상태를 구독해서
//   - 로그인 상태가 확실해진 뒤에만 config 구독을 시작하고,
//   - 로그아웃 → 로그인으로 바뀌면 자동으로 재구독하며,
//   - 에러가 나도 재시도 여지를 남겨 두도록 loaded 플래그를 초기화한다.
export const useMenuPermissions = () => {
    const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let configUnsub = null;

        const authUnsub = onAuthStateChanged(auth, (user) => {
            // 이전 구독 정리
            if (configUnsub) { configUnsub(); configUnsub = null; }

            if (!user) {
                setPermissions(DEFAULT_PERMISSIONS);
                setLoaded(true);
                return;
            }

            setLoaded(false); // 재구독 중임을 표시
            const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
            configUnsub = onSnapshot(ref, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const merged = { ...DEFAULT_PERMISSIONS };
                    MENU_KEYS.forEach(key => {
                        if (data[key]) {
                            merged[key] = { ...DEFAULT_PERMISSIONS[key], ...data[key] };
                        }
                    });
                    setPermissions(merged);
                } else {
                    setPermissions(DEFAULT_PERMISSIONS);
                }
                setLoaded(true);
            }, (err) => {
                console.warn('[useMenuPermissions] snapshot error:', err?.code || err);
                setLoaded(true);
            });
        });

        return () => {
            authUnsub && authUnsub();
            if (configUnsub) configUnsub();
        };
    }, []);

    return { permissions, loaded };
};

export const saveMenuPermissions = async (permissions) => {
    const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
    await setDoc(ref, permissions, { merge: true });
};

export const getUserGroup = (userProfile) => {
    if (!userProfile) return 'general';
    if (userProfile.group && GROUPS.includes(userProfile.group)) return userProfile.group;
    if (userProfile.role === 'admin') return 'admin';
    return 'general';
};

export const canAccessMenu = (menuKey, userProfile, permissions, isAdminMode = false) => {
    if (isAdminMode) return true;
    const group = getUserGroup(userProfile);
    if (group === 'admin') return true;
    const config = permissions?.[menuKey];
    if (!config) return true;
    return config[group] !== false;
};
