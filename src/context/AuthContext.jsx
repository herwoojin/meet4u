import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(() => {
        // Check sessionStorage for admin session on init
        return sessionStorage.getItem('meet4u_admin') === 'true';
    });
    const [activeChatUser, setActiveChatUser] = useState(null); // { email, name }

    const openChat = (user) => {
        setActiveChatUser(user);
    };

    const closeChat = () => {
        setActiveChatUser(null);
    };

    const login = () => {
        return signInWithPopup(auth, googleProvider);
    };

    const logout = () => {
        sessionStorage.removeItem('meet4u_admin');
        setIsAdmin(false);
        return signOut(auth);
    };

    // Admin login: ID match + SHA-256 hash compare (credentials in .env)
    const adminLogin = async (id, password) => {
        const expectedId = import.meta.env.VITE_ADMIN_ID;
        const expectedHash = import.meta.env.VITE_ADMIN_PASSWORD_HASH;
        if (!expectedId || !expectedHash) {
            console.error('Admin credentials not configured: set VITE_ADMIN_ID and VITE_ADMIN_PASSWORD_HASH in .env');
            return false;
        }
        if (id !== expectedId) return false;
        try {
            const buf = new TextEncoder().encode(password);
            const hashBuf = await crypto.subtle.digest('SHA-256', buf);
            const inputHash = Array.from(new Uint8Array(hashBuf))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            if (inputHash === expectedHash.toLowerCase()) {
                sessionStorage.setItem('meet4u_admin', 'true');
                setIsAdmin(true);
                return true;
            }
        } catch (e) {
            console.error('Admin login hash failed:', e);
        }
        return false;
    };

    const adminLogout = () => {
        sessionStorage.removeItem('meet4u_admin');
        setIsAdmin(false);
    };

    const updateUserProfile = async (patch) => {
        if (!currentUser?.uid) return;
        await setDoc(doc(db, 'users', currentUser.uid), patch, { merge: true });
        setUserProfile(prev => ({ ...(prev || {}), ...patch }));
    };

    // profile subscription 해제 함수를 ref 로 보관해 auth 상태 변경마다 정리.
    const profileUnsubRef = useRef(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            // 이전 profile subscription 정리 (로그아웃 · 계정 전환 대비)
            if (profileUnsubRef.current) {
                profileUnsubRef.current();
                profileUnsubRef.current = null;
            }

            setCurrentUser(user);
            if (!user) {
                setUserProfile(null);
                setLoading(false);
                return;
            }

            const userDocRef = doc(db, "users", user.uid);
            // 카카오 로그인 사용자는 user.email 이 null 일 수 있어
            // 안전한 fallback 으로 sanitize 한다.
            const safeEmail = user.email || `${user.uid}@kakao.local`;
            const safeEmailSanitized = safeEmail.replace(/\./g, '_');

            // 1) 문서 존재 확인 · 없으면 생성, 있으면 lastSeen 만 갱신. 이 단계가
            //    permission-denied 로 실패해도 아래 onSnapshot 이 자동으로 재시도.
            try {
                const snap = await getDoc(userDocRef);
                if (!snap.exists()) {
                    await setDoc(userDocRef, {
                        email: safeEmail,
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        role: 'user',
                        preferredLanguage: 'ko',
                        createdAt: new Date().toISOString(),
                        lastSeen: new Date().toISOString(),
                        emailSanitized: safeEmailSanitized,
                    });
                } else {
                    setDoc(userDocRef, {
                        lastSeen: new Date().toISOString(),
                        emailSanitized: safeEmailSanitized,
                        photoURL: user.photoURL,
                    }, { merge: true }).catch(() => { /* 무시 */ });
                }
            } catch (e) {
                // 로그인 직후 auth 토큰이 Firestore 로 완전히 전파되기 전
                // 짧은 순간 permission-denied 가 날 수 있다. 이 경우에도 아래
                // onSnapshot 이 재시도되어 정상 프로필을 받아온다.
                console.warn('[Auth] initial profile check failed (will retry via snapshot):', e?.code || e);
            }

            // 2) 실시간 구독 — 프로필/role 변경이 즉시 반영되고, 초기 fetch 가
            //    permission-denied 로 실패한 경우에도 재시도되어 안정적으로 로드된다.
            //    "관리자로 지정한 사용자가 첫 로그인 시 메뉴가 회색으로 보이는" 이슈
            //    의 근본 원인이 여기 있었음.
            profileUnsubRef.current = onSnapshot(userDocRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setUserProfile(data);
                    if (data.role === 'admin') {
                        setIsAdmin(true);
                    }
                    // sessionStorage 로 얻은 isAdmin=true 는 유지, false 로 덮지 않음.
                }
                setLoading(false);
            }, (err) => {
                console.warn('[Auth] profile snapshot error:', err?.code || err);
                setLoading(false);
            });
        });

        return () => {
            unsubscribe();
            if (profileUnsubRef.current) {
                profileUnsubRef.current();
                profileUnsubRef.current = null;
            }
        };
    }, []);

    const value = {
        currentUser,
        userProfile,
        login,
        logout,
        loading,
        isAdmin,
        adminLogin,
        adminLogout,
        activeChatUser,
        openChat,
        closeChat,
        updateUserProfile,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
