// GET /.netlify/functions/weather?lat=37.61&lon=126.83
// → OpenWeather 5일/3시간 예보(무료 2.5 forecast)를 모임 화면용으로 줄여서 돌려준다.
//
// 키(OPENWEATHER_API_KEY, 없으면 OWM_API_KEY)는 서버에만 둔다. 좌표를 소수 둘째 자리(≈1km)로
// 반올림하고 CDN 에 30분 캐시 — 같은 코트 모임이 여럿이어도 OpenWeather 호출은 30분에 한 번.
// 한반도 밖 좌표는 받지 않는다(키를 남이 마음대로 쓰지 못하게).

const apiKey = () => process.env.OPENWEATHER_API_KEY || process.env.OWM_API_KEY || '';
const memo = new Map();   // 함수 인스턴스가 살아 있는 동안의 캐시
const TTL_MS = 30 * 60 * 1000;

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': statusCode === 200 ? 'public, max-age=600' : 'no-store',
        ...(statusCode === 200 ? { 'Netlify-CDN-Cache-Control': 'public, max-age=1800' } : {}),
    },
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    const q = event.queryStringParameters || {};
    const lat = Math.round(Number(q.lat) * 100) / 100;
    const lon = Math.round(Number(q.lon) * 100) / 100;
    if (!(lat >= 33 && lat <= 39.5 && lon >= 124 && lon <= 132)) return json(400, { ok: false, error: 'bad-coords' });
    if (!apiKey()) return json(503, { ok: false, error: 'no-key' });

    const k = `${lat},${lon}`;
    const hit = memo.get(k);
    if (hit && Date.now() - hit.at < TTL_MS) return json(200, hit.body);

    try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${apiKey()}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return json(502, { ok: false, error: `owm-${r.status}` });
        const j = await r.json();
        const body = {
            ok: true,
            list: (j.list || []).map((x) => ({
                t: x.dt * 1000,
                temp: Math.round(x.main?.temp ?? NaN),
                id: x.weather?.[0]?.id ?? 0,
                desc: x.weather?.[0]?.description || '',
                night: String(x.weather?.[0]?.icon || '').endsWith('n'),
                pop: Math.round((x.pop || 0) * 100),
                rain: Math.round(((x.rain?.['3h'] || 0) + (x.snow?.['3h'] || 0)) * 10) / 10,
            })),
        };
        memo.set(k, { at: Date.now(), body });
        return json(200, body);
    } catch (e) {
        console.error('weather fetch failed:', e?.message || e);
        return json(502, { ok: false, error: 'fetch-failed' });
    }
};
