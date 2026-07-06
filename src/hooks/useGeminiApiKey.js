import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasAdminGeminiKey } from '../lib/grammar';

// Gemini API 키를 통합 관리하는 훅.
//
// 우선순위:
//   1) userProfile.geminiApiKey (Firestore 저장 — 어느 기기든 로그인만 하면 자동 로드)
//   2) localStorage (마이그레이션 전 기존 사용자 호환)
//   3) VITE_GEMINI_ADMIN_API_KEY (관리자 공유 키, fallback)
//
// saveKey(newKey):
//   • Firestore 의 users/{uid}.geminiApiKey 에 저장 (updateUserProfile 사용)
//   • localStorage 에도 mirror (오프라인 캐시 + fallback 유지)
//
// 자동 마이그레이션: userProfile.geminiApiKey 는 없는데 localStorage 에
// 유효한 키가 있으면 로그인 즉시 Firestore 로 옮기고 localStorage 값 유지.

const LS_KEY = 'meet4u_gemini_api_key';

const looksLikeKey = (k) => {
    if (!k) return false;
    const v = String(k).trim();
    return v.length >= 20 && (v.startsWith('AIza') || v.startsWith('AQ.'));
};

export const useGeminiApiKey = () => {
    const { userProfile, updateUserProfile, currentUser, isAdmin } = useAuth();
    const [saving, setSaving] = useState(false);

    const cloudKey = (userProfile?.geminiApiKey || '').trim();
    const lsKey = useMemo(() => {
        try { return (localStorage.getItem(LS_KEY) || '').trim(); }
        catch { return ''; }
    }, [userProfile?.geminiApiKey]);
    const adminKey = (import.meta?.env?.VITE_GEMINI_ADMIN_API_KEY || '').trim();

    // 최종 활성 키 결정
    const key = useMemo(() => {
        if (cloudKey) return cloudKey;
        if (lsKey)    return lsKey;
        if (isAdmin && adminKey) return adminKey;
        return '';
    }, [cloudKey, lsKey, isAdmin, adminKey]);

    // 어디서 왔는지 표시용
    const source = cloudKey
        ? 'cloud'
        : lsKey
            ? 'local'
            : (isAdmin && adminKey ? 'admin' : 'none');

    // 자동 마이그레이션: localStorage → Firestore (한 번만)
    useEffect(() => {
        if (!currentUser || !updateUserProfile) return;
        if (!lsKey || cloudKey) return;
        if (!looksLikeKey(lsKey)) return;
        (async () => {
            try {
                await updateUserProfile({ geminiApiKey: lsKey });
                console.log('[useGeminiApiKey] localStorage → cloud migration OK');
            } catch (e) {
                console.warn('[useGeminiApiKey] auto-migration failed:', e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, lsKey, cloudKey]);

    const saveKey = async (newKey) => {
        const v = String(newKey || '').trim();
        setSaving(true);
        try {
            // 1) Firestore
            if (currentUser && updateUserProfile) {
                await updateUserProfile({ geminiApiKey: v });
            }
            // 2) localStorage mirror
            try {
                if (v) localStorage.setItem(LS_KEY, v);
                else localStorage.removeItem(LS_KEY);
            } catch { /* ignore */ }
        } finally {
            setSaving(false);
        }
    };

    const clearKey = async () => saveKey('');

    return {
        key,
        source,
        hasKey: Boolean(key),
        hasCloudKey: Boolean(cloudKey),
        hasLocalKey: Boolean(lsKey),
        hasAdminKey: hasAdminGeminiKey(),
        saveKey,
        clearKey,
        saving,
    };
};
