// MyMemory Translation API (free, no API key required)
// Docs: https://mymemory.translated.net/doc/spec.php
// Quota: 5000 words/day anonymous, 10000 with email parameter

const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || 'meet4u-app@example.com';

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

        const langpair = `${sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}&de=${encodeURIComponent(MYMEMORY_EMAIL)}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`MyMemory API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.responseStatus && data.responseStatus !== 200) {
            throw new Error(`MyMemory response error: ${data.responseDetails || 'unknown'}`);
        }

        const translatedText = data?.responseData?.translatedText || '';
        if (!translatedText) {
            throw new Error('Empty translation result');
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                translatedText,
                match: data?.responseData?.match || 0
            })
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
