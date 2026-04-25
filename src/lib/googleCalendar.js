// Google Identity Services + Calendar API helpers (browser-only).
// Uses the OAuth 2.0 implicit flow via Google Identity Services token client.

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let scriptPromise = null;
let tokenClient = null;
let tokenClientForId = null;
let pendingResolve = null;

const loadGisScript = () => {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('GIS script failed')));
            if (window.google?.accounts?.oauth2) resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = GIS_SCRIPT_URL;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('GIS script failed'));
        document.head.appendChild(s);
    });
    return scriptPromise;
};

const ensureTokenClient = async (clientId) => {
    if (!clientId) throw new Error('Missing Google OAuth Client ID');
    await loadGisScript();
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services not available');

    if (tokenClient && tokenClientForId === clientId) return tokenClient;

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CALENDAR_SCOPE,
        callback: (response) => {
            const fn = pendingResolve;
            pendingResolve = null;
            if (!fn) return;
            if (response?.error) fn({ error: response.error });
            else fn({ access_token: response.access_token, expires_in: Number(response.expires_in) || 3600 });
        },
    });
    tokenClientForId = clientId;
    return tokenClient;
};

// Request an OAuth access token. `prompt: 'consent'` forces the chooser; `prompt: ''` tries silent.
export const requestAccessToken = async (clientId, { prompt = 'consent' } = {}) => {
    const client = await ensureTokenClient(clientId);
    return new Promise((resolve) => {
        pendingResolve = resolve;
        try {
            client.requestAccessToken({ prompt });
        } catch (e) {
            pendingResolve = null;
            resolve({ error: String(e?.message || e) });
        }
    });
};

export const revokeToken = (accessToken) => new Promise((resolve) => {
    if (!accessToken || !window.google?.accounts?.oauth2?.revoke) return resolve();
    try {
        window.google.accounts.oauth2.revoke(accessToken, () => resolve());
    } catch (_) {
        resolve();
    }
});

// Build a Calendar event payload from MeetingForm-style fields.
export const buildEventFromMeeting = (meeting, { timeZone } = {}) => {
    const { title, description, location, date, startTime, endTime } = meeting;
    if (!date) throw new Error('Meeting requires a date');
    const tz = timeZone
        || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Seoul');

    const startDateTime = startTime ? `${date}T${startTime}:00` : null;
    const endDateTime = endTime ? `${date}T${endTime}:00` : null;

    if (startDateTime && endDateTime) {
        return {
            summary: title || '(제목 없음)',
            description: description || '',
            location: location || '',
            start: { dateTime: startDateTime, timeZone: tz },
            end: { dateTime: endDateTime, timeZone: tz },
        };
    }
    // All-day fallback
    return {
        summary: title || '(제목 없음)',
        description: description || '',
        location: location || '',
        start: { date },
        end: { date },
    };
};

export const createCalendarEvent = async (accessToken, eventBody) => {
    const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
        }
    );
    if (!res.ok) {
        let detail = '';
        try {
            const err = await res.json();
            detail = err?.error?.message || JSON.stringify(err);
        } catch (_) { /* ignore */ }
        throw new Error(`Google Calendar API ${res.status}: ${detail}`);
    }
    return res.json();
};
