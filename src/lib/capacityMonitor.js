// Lightweight capacity monitor that tracks backend usage from the client side.
// Counters are stored in localStorage and rolled over per UTC day/month so that
// the ServerCapacityIndicator can show a battery-style "remaining quota" view
// for Firestore (read/write/delete), Firebase Storage uploads, and Netlify
// Functions invocations. The values are best-effort estimates — real quota
// comes from the Firebase/Netlify dashboards, but these counters give a live
// early-warning that is good enough to act on.
//
// Free-tier limits encoded here mirror techstack.json. If you upgrade plans,
// update LIMITS and the inventory file in the same commit.

const STORAGE_KEY = 'meet4u_capacity_v1';

export const LIMITS = {
    firestoreReadsPerDay: 50000,
    firestoreWritesPerDay: 20000,
    firestoreDeletesPerDay: 20000,
    storageBytesTotal: 5 * 1024 * 1024 * 1024,
    storageDownloadBytesPerDay: 1024 * 1024 * 1024,
    netlifyFunctionsPerMonth: 125000,
    netlifyBandwidthBytesPerMonth: 100 * 1024 * 1024 * 1024,
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthKey = () => new Date().toISOString().slice(0, 7);

const emptyState = () => ({
    day: todayKey(),
    month: monthKey(),
    counters: {
        firestoreReads: 0,
        firestoreWrites: 0,
        firestoreDeletes: 0,
        storageDownloadBytes: 0,
        netlifyFunctions: 0,
        netlifyBandwidthBytes: 0,
    },
    cumulative: {
        storageBytesTotal: 0,
    },
    health: {
        lastPingMs: null,
        lastPingAt: null,
        firestoreOnline: true,
        functionOnline: null,
    },
});

function read() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        const parsed = JSON.parse(raw);
        const fresh = emptyState();
        if (parsed.day !== fresh.day) {
            parsed.day = fresh.day;
            parsed.counters.firestoreReads = 0;
            parsed.counters.firestoreWrites = 0;
            parsed.counters.firestoreDeletes = 0;
            parsed.counters.storageDownloadBytes = 0;
        }
        if (parsed.month !== fresh.month) {
            parsed.month = fresh.month;
            parsed.counters.netlifyFunctions = 0;
            parsed.counters.netlifyBandwidthBytes = 0;
        }
        return { ...fresh, ...parsed, counters: { ...fresh.counters, ...parsed.counters }, cumulative: { ...fresh.cumulative, ...parsed.cumulative }, health: { ...fresh.health, ...parsed.health } };
    } catch {
        return emptyState();
    }
}

function write(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage might be full or disabled; ignore
    }
    notify(state);
}

const subscribers = new Set();
function notify(state) {
    for (const fn of subscribers) {
        try { fn(state); } catch { /* ignore subscriber errors */ }
    }
}

export function subscribeCapacity(fn) {
    subscribers.add(fn);
    fn(read());
    return () => subscribers.delete(fn);
}

export function getCapacityState() {
    return read();
}

function bump(field, by = 1) {
    const state = read();
    state.counters[field] = (state.counters[field] || 0) + by;
    write(state);
}

export const recordFirestoreRead = (n = 1) => bump('firestoreReads', n);
export const recordFirestoreWrite = (n = 1) => bump('firestoreWrites', n);
export const recordFirestoreDelete = (n = 1) => bump('firestoreDeletes', n);
export const recordStorageDownload = (bytes) => bump('storageDownloadBytes', bytes);
export const recordNetlifyFunction = (bytes = 0) => {
    const state = read();
    state.counters.netlifyFunctions = (state.counters.netlifyFunctions || 0) + 1;
    state.counters.netlifyBandwidthBytes = (state.counters.netlifyBandwidthBytes || 0) + bytes;
    write(state);
};
export const recordStorageUpload = (bytes) => {
    const state = read();
    state.cumulative.storageBytesTotal = (state.cumulative.storageBytesTotal || 0) + bytes;
    write(state);
};

export function recordHealth({ pingMs, firestoreOnline, functionOnline }) {
    const state = read();
    if (pingMs !== undefined) {
        state.health.lastPingMs = pingMs;
        state.health.lastPingAt = Date.now();
    }
    if (firestoreOnline !== undefined) state.health.firestoreOnline = firestoreOnline;
    if (functionOnline !== undefined) state.health.functionOnline = functionOnline;
    write(state);
}

export function computeUsage(state = read()) {
    const ratios = {
        firestoreReads: state.counters.firestoreReads / LIMITS.firestoreReadsPerDay,
        firestoreWrites: state.counters.firestoreWrites / LIMITS.firestoreWritesPerDay,
        firestoreDeletes: state.counters.firestoreDeletes / LIMITS.firestoreDeletesPerDay,
        storageBytesTotal: state.cumulative.storageBytesTotal / LIMITS.storageBytesTotal,
        storageDownloadBytes: state.counters.storageDownloadBytes / LIMITS.storageDownloadBytesPerDay,
        netlifyFunctions: state.counters.netlifyFunctions / LIMITS.netlifyFunctionsPerMonth,
        netlifyBandwidthBytes: state.counters.netlifyBandwidthBytes / LIMITS.netlifyBandwidthBytesPerMonth,
    };
    const worstKey = Object.keys(ratios).reduce((a, b) => (ratios[a] >= ratios[b] ? a : b));
    const worstRatio = Math.min(1, Math.max(0, ratios[worstKey]));
    const offline = state.health.firestoreOnline === false || state.health.functionOnline === false;
    let level;
    if (offline) level = 'offline';
    else if (worstRatio >= 0.9) level = 'critical';
    else if (worstRatio >= 0.7) level = 'warning';
    else if (worstRatio >= 0.4) level = 'caution';
    else level = 'ok';
    return { ratios, worstKey, worstRatio, level, state };
}

// ---------------------------------------------------------------------------
// Fetch interceptor: auto-count Netlify Functions calls + measure latency.
// Install once at module load — guarded so HMR/repeated imports don't stack.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && !window.__meet4uCapacityFetchPatched) {
    window.__meet4uCapacityFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        const isNetlifyFn = url.includes('/.netlify/functions/');
        const start = performance.now();
        try {
            const res = await originalFetch(input, init);
            if (isNetlifyFn) {
                const lat = performance.now() - start;
                let size = 0;
                const len = res.headers?.get?.('content-length');
                if (len) size = Number(len) || 0;
                recordNetlifyFunction(size);
                recordHealth({ functionOnline: res.ok, pingMs: lat });
            }
            return res;
        } catch (err) {
            if (isNetlifyFn) recordHealth({ functionOnline: false });
            throw err;
        }
    };
}

// Listen for online/offline events as a coarse signal.
if (typeof window !== 'undefined' && !window.__meet4uCapacityOnlinePatched) {
    window.__meet4uCapacityOnlinePatched = true;
    window.addEventListener('online', () => recordHealth({ firestoreOnline: true }));
    window.addEventListener('offline', () => recordHealth({ firestoreOnline: false, functionOnline: false }));
}
