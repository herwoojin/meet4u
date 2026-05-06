// Google Translate API (free, no API key required)
// Uses the same endpoint as Google Translate web interface
// Supports all language pairs with high quality

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { text, sourceLang = 'ko', targetLang } = JSON.parse(event.body);

        if (!text || !targetLang) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing text or targetLang parameters' })
            };
        }

        // Skip API call if source == target
        if (sourceLang === targetLang) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ translatedText: text, skipped: true })
            };
        }

        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Translate API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Google Translate returns nested arrays: data[0] contains translation segments
        // Each segment is [translatedText, originalText, ...]
        let translatedText = '';
        if (data && data[0]) {
            translatedText = data[0]
                .filter(segment => segment && segment[0])
                .map(segment => segment[0])
                .join('');
        }

        if (!translatedText) {
            throw new Error('Empty translation result');
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ translatedText })
        };
    } catch (error) {
        console.error('Translation error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message || 'Translation failed' })
        };
    }
};
