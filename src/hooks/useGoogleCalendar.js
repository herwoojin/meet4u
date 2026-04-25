import { useCallback, useEffect, useState } from 'react';
import {
    requestAccessToken,
    createCalendarEvent,
    buildEventFromMeeting,
    revokeToken,
} from '../lib/googleCalendar';

const LS_CLIENT_ID = 'meet4u_googleClientId';
const LS_SYNC_ENABLED = 'meet4u_googleSyncEnabled';
const SS_TOKEN = 'meet4u_googleAccessToken';
const SS_TOKEN_EXP = 'meet4u_googleAccessTokenExp';

const readLS = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const writeLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
const readSS = (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } };
const writeSS = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) { /* ignore */ } };

export const useGoogleCalendar = () => {
    const [clientId, setClientIdState] = useState(() => readLS(LS_CLIENT_ID) || '');
    const [syncEnabled, setSyncEnabledState] = useState(() => readLS(LS_SYNC_ENABLED) === 'true');
    const [accessToken, setAccessToken] = useState(() => readSS(SS_TOKEN) || '');
    const [tokenExpiresAt, setTokenExpiresAt] = useState(() => Number(readSS(SS_TOKEN_EXP) || 0));
    const [busy, setBusy] = useState(false);
    const [lastError, setLastError] = useState(null);

    // Cross-tab sync (rare but cheap)
    useEffect(() => {
        const handler = (e) => {
            if (e.key === LS_CLIENT_ID) setClientIdState(e.newValue || '');
            if (e.key === LS_SYNC_ENABLED) setSyncEnabledState(e.newValue === 'true');
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const isTokenValid = !!accessToken && Date.now() < tokenExpiresAt - 60_000;

    const saveClientId = useCallback((id) => {
        const trimmed = (id || '').trim();
        setClientIdState(trimmed);
        writeLS(LS_CLIENT_ID, trimmed || null);
    }, []);

    const setSyncEnabled = useCallback((value) => {
        setSyncEnabledState(value);
        writeLS(LS_SYNC_ENABLED, value ? 'true' : 'false');
    }, []);

    const saveToken = useCallback((tok, expiresIn) => {
        const exp = Date.now() + (Number(expiresIn || 3600) * 1000);
        setAccessToken(tok);
        setTokenExpiresAt(exp);
        writeSS(SS_TOKEN, tok);
        writeSS(SS_TOKEN_EXP, String(exp));
    }, []);

    const clearToken = useCallback(() => {
        setAccessToken('');
        setTokenExpiresAt(0);
        writeSS(SS_TOKEN, null);
        writeSS(SS_TOKEN_EXP, null);
    }, []);

    const connect = useCallback(async () => {
        if (!clientId) throw new Error('clientId-required');
        setBusy(true);
        setLastError(null);
        try {
            const result = await requestAccessToken(clientId, { prompt: 'consent' });
            if (result?.error || !result?.access_token) {
                throw new Error(result?.error || 'no-access-token');
            }
            saveToken(result.access_token, result.expires_in);
            return true;
        } catch (err) {
            setLastError(err.message);
            throw err;
        } finally {
            setBusy(false);
        }
    }, [clientId, saveToken]);

    const disconnect = useCallback(async () => {
        if (accessToken) await revokeToken(accessToken).catch(() => { });
        clearToken();
    }, [accessToken, clearToken]);

    // Get a valid token, requesting silently if expired/missing.
    const ensureToken = useCallback(async () => {
        if (isTokenValid) return accessToken;
        if (!clientId) throw new Error('clientId-required');
        const result = await requestAccessToken(clientId, { prompt: '' });
        if (!result?.access_token) throw new Error(result?.error || 'token-failed');
        saveToken(result.access_token, result.expires_in);
        return result.access_token;
    }, [accessToken, clientId, isTokenValid, saveToken]);

    // Best-effort: create a Google Calendar event from a meeting object.
    const syncMeeting = useCallback(async (meeting) => {
        if (!syncEnabled) return { skipped: true };
        if (!clientId) return { skipped: true, reason: 'clientId-required' };
        try {
            const tok = await ensureToken();
            const body = buildEventFromMeeting(meeting);
            const event = await createCalendarEvent(tok, body);
            return { ok: true, event };
        } catch (err) {
            console.error('Google Calendar sync failed:', err);
            return { ok: false, error: err.message };
        }
    }, [clientId, syncEnabled, ensureToken]);

    return {
        clientId, saveClientId,
        syncEnabled, setSyncEnabled,
        accessToken, isTokenValid,
        connect, disconnect,
        ensureToken, syncMeeting,
        busy, lastError,
    };
};

export default useGoogleCalendar;
