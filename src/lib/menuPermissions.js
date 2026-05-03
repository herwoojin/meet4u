import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

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

export const useMenuPermissions = () => {
    const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
        const unsub = onSnapshot(ref, (snap) => {
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
        }, () => setLoaded(true));
        return unsub;
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
