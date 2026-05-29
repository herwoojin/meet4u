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

        // Step 1: Translate the text
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

        // Step 2: Get romanization/pronunciation of the TRANSLATED text
        // This helps users read and pronounce the translated text
        // e.g., Korean "다시 회의를 시작하자" → "dasi hoeuileul sijakaja"
        // e.g., English "I study" → "ai stadi" (when target user reads non-Latin)
        let pronunciation = '';
        try {
            // We ask Google to romanize the translated text by requesting dt=rm
            // sl = targetLang (since the translated text IS in targetLang)
            // tl = en (just to get romanization output; the actual translation is irrelevant)
            const romanUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(targetLang)}&tl=en&dt=rm&q=${encodeURIComponent(translatedText)}`;
            const romanRes = await fetch(romanUrl);
            if (romanRes.ok) {
                const romanData = await romanRes.json();
                // romanData[0] contains segments; the romanization is typically at index [3]
                // e.g., [["I study", "나는 공부한다", null, "naneun gongbuhanda"], ...]
                if (romanData && romanData[0]) {
                    const parts = romanData[0]
                        .filter(seg => seg)
                        .map(seg => seg[3] || seg[2] || '')
                        .filter(Boolean);
                    pronunciation = parts.join(' ').trim();
                }
            }
        } catch (romanErr) {
            // Non-fatal: pronunciation is optional, translation still works
            console.warn('Romanization fetch failed (translation OK):', romanErr.message);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ translatedText, pronunciation })
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
