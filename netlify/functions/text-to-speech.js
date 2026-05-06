// Google Translate TTS Proxy
// Proxies Google Translate's text-to-speech to avoid CORS restrictions
// Supports all languages, works on all browsers (Edge, Chrome, Safari, old Android)
// Max text length: ~200 chars per request

export const handler = async (event) => {
    // Support both GET (for <audio> src) and POST
    let text, lang;
    if (event.httpMethod === 'GET') {
        text = event.queryStringParameters?.text;
        lang = event.queryStringParameters?.lang;
    } else if (event.httpMethod === 'POST') {
        const body = JSON.parse(event.body || '{}');
        text = body.text;
        lang = body.lang;
    } else {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!text || !lang) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing text or lang parameters' })
        };
    }

    // Google TTS has a ~200 char limit; truncate if needed
    const trimmed = text.length > 200 ? text.slice(0, 200) : text;

    try {
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmed)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

        const response = await fetch(ttsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://translate.google.com/',
            }
        });

        if (!response.ok) {
            throw new Error(`Google TTS error: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400',
            },
            body: Buffer.from(buffer).toString('base64'),
            isBase64Encoded: true,
        };
    } catch (error) {
        console.error('TTS proxy error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message || 'TTS failed' })
        };
    }
};
