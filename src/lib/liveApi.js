// Gemini Live API client for real-time bidirectional voice translation.
//
// Protocol summary (BidiGenerateContent):
//   • Client → Server WebSocket on
//     wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage
//        .v1alpha.GenerativeService.BidiGenerateContent?key=API_KEY
//   • First message: { setup: { model, generationConfig, systemInstruction } }
//   • Then stream:   { realtimeInput: { mediaChunks: [{ mimeType, data }] } }
//   • Server pushes: { serverContent: { modelTurn: { parts: [...] }, turnComplete?: true } }
//     Parts may contain text or inlineData (audio/pcm;rate=24000).
//
// We capture mic at 16 kHz mono PCM via the WebAudio graph (resampling in JS
// if AudioContext can't honor the requested rate). Outgoing chunks are
// base64-encoded Int16 PCM. Incoming audio chunks (24 kHz) are queued and
// scheduled on a single output AudioContext for gap-free playback.

const LIVE_MODEL = 'gemini-2.0-flash-exp';
const ENDPOINT = (key) => `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`;

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const FRAME_SIZE = 2048; // samples per ScriptProcessor callback (~128ms at 16 kHz)

// ---------------------------------------------------------------------------
// Helpers — PCM ↔ base64
// ---------------------------------------------------------------------------

const floatToInt16 = (f32) => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
};

const int16ToBase64 = (int16) => {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
};

const base64ToInt16 = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
};

const int16ToFloat32 = (int16) => {
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768;
    return out;
};

// Down/up-sample by simple linear interpolation. Good enough for speech.
const resampleFloat32 = (input, inputRate, outputRate) => {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const length = Math.floor(input.length / ratio);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const srcIdx = i * ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, input.length - 1);
        const frac = srcIdx - lo;
        out[i] = input[lo] * (1 - frac) + input[hi] * frac;
    }
    return out;
};

// ---------------------------------------------------------------------------
// Main session class
// ---------------------------------------------------------------------------

export class LiveTranslatorSession {
    constructor({ apiKey, sourceLang, targetLang, audioOut = true, onState, onText, onError, onTurnComplete }) {
        this.apiKey = apiKey;
        this.sourceLang = sourceLang;
        this.targetLang = targetLang;
        this.audioOut = audioOut;
        this.onState = onState || (() => { });
        this.onText = onText || (() => { });
        this.onError = onError || (() => { });
        this.onTurnComplete = onTurnComplete || (() => { });

        this.ws = null;
        this.micCtx = null;
        this.outCtx = null;
        this.stream = null;
        this.source = null;
        this.processor = null;
        this.playheadTime = 0;
        this.state = 'idle';
        this.setupAck = false;
    }

    setState(s) { this.state = s; this.onState(s); }

    systemInstruction() {
        return [
            `You are a real-time simultaneous interpreter.`,
            `The user speaks in ${this.sourceLang || 'their language'}.`,
            `Translate the user's speech to ${this.targetLang}.`,
            `Output ONLY the translation, as natural spoken sentences.`,
            `Do not add greetings, preambles, explanations, or commentary.`,
            `Keep the meaning faithful and concise.`,
        ].join(' ');
    }

    async start() {
        if (this.state !== 'idle') return;
        if (!this.apiKey) throw new Error('Gemini API 키가 필요합니다.');
        this.setState('connecting');

        // 1) Open WebSocket
        this.ws = new WebSocket(ENDPOINT(this.apiKey));
        this.ws.binaryType = 'arraybuffer';

        const openPromise = new Promise((resolve, reject) => {
            this.ws.onopen = () => resolve();
            this.ws.onerror = (e) => reject(e);
        });

        this.ws.onmessage = (ev) => this.handleServerMessage(ev);
        this.ws.onclose = () => {
            if (this.state !== 'idle') this.setState('closed');
        };

        await openPromise;

        // 2) Send setup
        const setup = {
            setup: {
                model: `models/${LIVE_MODEL}`,
                generationConfig: {
                    responseModalities: this.audioOut ? ['AUDIO'] : ['TEXT'],
                    ...(this.audioOut && {
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
                        },
                    }),
                },
                systemInstruction: { parts: [{ text: this.systemInstruction() }] },
            },
        };
        this.ws.send(JSON.stringify(setup));
        this.setState('starting');

        // 3) Prepare audio output context (gap-free queue)
        if (typeof window !== 'undefined') {
            this.outCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_RATE });
            this.playheadTime = this.outCtx.currentTime;
        }

        // 4) Mic capture (deferred until setup ack)
        await this.startMic();
        this.setState('listening');
    }

    async startMic() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('이 브라우저는 마이크 권한을 지원하지 않습니다.');
        }
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });

        // Try to construct a 16 kHz AudioContext (Chrome supports). Fall back
        // to default rate + JS resample.
        let ctxRate = INPUT_RATE;
        try {
            this.micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: INPUT_RATE });
            ctxRate = this.micCtx.sampleRate;
        } catch {
            this.micCtx = new (window.AudioContext || window.webkitAudioContext)();
            ctxRate = this.micCtx.sampleRate;
        }

        this.source = this.micCtx.createMediaStreamSource(this.stream);
        // eslint-disable-next-line no-undef
        this.processor = this.micCtx.createScriptProcessor(FRAME_SIZE, 1, 1);

        this.processor.onaudioprocess = (e) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const f32 = e.inputBuffer.getChannelData(0);
            const resampled = ctxRate === INPUT_RATE ? f32 : resampleFloat32(f32, ctxRate, INPUT_RATE);
            const int16 = floatToInt16(resampled);
            const b64 = int16ToBase64(int16);
            this.ws.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{ mimeType: `audio/pcm;rate=${INPUT_RATE}`, data: b64 }],
                },
            }));
        };

        this.source.connect(this.processor);
        this.processor.connect(this.micCtx.destination);
    }

    handleServerMessage(ev) {
        let msg;
        try {
            msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
        } catch (err) {
            console.warn('Live: bad server message', err);
            return;
        }

        if (msg.setupComplete) {
            this.setupAck = true;
            return;
        }

        if (msg.serverContent) {
            const sc = msg.serverContent;
            const parts = sc.modelTurn?.parts || [];
            for (const p of parts) {
                if (p.text) this.onText({ text: p.text, partial: !sc.turnComplete });
                if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/')) {
                    this.queueAudio(p.inlineData.data);
                }
            }
            if (sc.turnComplete) this.onTurnComplete();
        }

        if (msg.error) {
            this.onError(new Error(msg.error.message || 'Live API 오류'));
        }
    }

    queueAudio(base64) {
        if (!this.outCtx) return;
        const int16 = base64ToInt16(base64);
        const f32 = int16ToFloat32(int16);
        const buf = this.outCtx.createBuffer(1, f32.length, OUTPUT_RATE);
        buf.copyToChannel(f32, 0);

        const src = this.outCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this.outCtx.destination);

        const now = this.outCtx.currentTime;
        const startAt = Math.max(this.playheadTime, now);
        src.start(startAt);
        this.playheadTime = startAt + buf.duration;
    }

    sendText(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text }] }],
                turnComplete: true,
            },
        }));
    }

    async stop() {
        this.setState('idle');
        try { this.processor?.disconnect(); } catch { /* ignore */ }
        try { this.source?.disconnect(); } catch { /* ignore */ }
        try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
        try { await this.micCtx?.close(); } catch { /* ignore */ }
        try { await this.outCtx?.close(); } catch { /* ignore */ }
        try { this.ws?.close(); } catch { /* ignore */ }
        this.processor = this.source = this.stream = this.micCtx = this.outCtx = this.ws = null;
    }
}
