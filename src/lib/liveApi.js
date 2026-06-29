// Gemini Live API client — verbose-logging 버전.
// 핵심 개선:
//  • onLog 콜백으로 모든 단계를 UI 로그 패널에 표시.
//  • setupComplete 메시지를 받기 전엔 절대 오디오를 보내지 않음
//    (이전엔 WS open 직후 무차별로 보내서 무시되거나 끊김 유발).
//  • WebSocket onclose 의 code/reason 을 사용자가 볼 수 있게 노출.
//  • AudioContext.resume() 명시 호출 (iOS Safari 대응).
//  • API 키 형식 검증 — Live API 는 AIza... 형식의 Gemini 키 필요.

const LIVE_MODEL = 'gemini-2.0-flash-exp';
const ENDPOINT_BASE =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Generative Language API 의 인증 컨벤션:
//   • API Key (AIza...)  → ?key=<KEY>          ← 브라우저 WebSocket OK
//   • OAuth Token (AQ.)  → Authorization 헤더  ← 브라우저 WebSocket 에서 불가
//
// 따라서 모든 형식을 일단 ?key= 로 전달한다. 잘못된 형식이면 서버가
// 1008 unregistered caller 로 닫는다(아래 onclose 에서 친절히 안내).
const buildEndpoint = (rawKey) => {
    const k = String(rawKey || '').trim();
    return `${ENDPOINT_BASE}?key=${encodeURIComponent(k)}`;
};

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const FRAME_SIZE = 2048;

// ---------------------------------------------------------------------------
// Helpers
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

// AI Studio 의 키 형식은 다음 두 가지 모두 허용한다.
//   • 'AIza' prefix — 전통적인 Gemini API 키. URL ?key= 로 전달.
//   • 'AQ.' prefix — AI Studio 의 새 OAuth/IAM 바인딩 토큰.
//                    URL ?access_token= 로 전달.
// 둘 다 아닌 형식이라도 길이만 충분하면 일단 통과시켜 서버 응답으로
// 판단한다(클라이언트 사이드 하드코딩 거부 방지).
export const validateGeminiKey = (k) => {
    if (!k || !k.trim()) return { ok: false, reason: '키가 비어 있습니다.' };
    const key = k.trim();
    if (key.length < 20) {
        return { ok: false, reason: `키 길이가 너무 짧습니다. (${key.length}자)` };
    }
    if (key.startsWith('AIza')) return { ok: true, type: 'apiKey' };
    if (key.startsWith('AQ.'))  return { ok: true, type: 'oauthToken' };
    // 알 수 없는 prefix — 일단 통과시키되 어떤 형식으로 보내는지 표시.
    return { ok: true, type: 'unknown' };
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export class LiveTranslatorSession {
    constructor({
        apiKey, sourceLang, targetLang, audioOut = true,
        onState, onText, onError, onTurnComplete, onLog,
    }) {
        this.apiKey = apiKey;
        this.sourceLang = sourceLang;
        this.targetLang = targetLang;
        this.audioOut = audioOut;
        this.onState = onState || (() => { });
        this.onText = onText || (() => { });
        this.onError = onError || (() => { });
        this.onTurnComplete = onTurnComplete || (() => { });
        this.onLog = onLog || (() => { });

        this.ws = null;
        this.micCtx = null;
        this.outCtx = null;
        this.stream = null;
        this.source = null;
        this.processor = null;
        this.playheadTime = 0;
        this.state = 'idle';
        this.setupAck = false;
        this.sentChunks = 0;
        this.recvAudioChunks = 0;
    }

    log(msg, level = 'info') {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        // eslint-disable-next-line no-console
        console.log('[Live]', line);
        this.onLog({ msg: line, level });
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

        const v = validateGeminiKey(this.apiKey);
        if (!v.ok) {
            this.log(`키 형식 오류: ${v.reason}`, 'error');
            throw new Error(v.reason);
        }

        this.setState('connecting');
        const isAQ = this.apiKey.trim().startsWith('AQ.');
        this.log(`모델=${LIVE_MODEL} / source=${this.sourceLang} → target=${this.targetLang}`);
        this.log(`키 prefix=${this.apiKey.slice(0, 6)}…(len ${this.apiKey.length}) — URL param: ?key=`);
        if (isAQ) {
            this.log(
                "⚠ 'AQ.' 형식은 OAuth 액세스 토큰입니다. 브라우저 WebSocket 은 헤더를 보낼 수 없어 보통 1008 로 거절됩니다. " +
                'AI Studio (aistudio.google.com/app/apikey) 의 \"Create API key\" 로 발급되는 AIza... 형식 키를 사용하세요.',
                'error'
            );
        }
        this.log(`엔드포인트: wss://…v1beta.GenerativeService.BidiGenerateContent`);

        // ── 1) WebSocket open ─────────────────────────────────────────────
        try {
            this.ws = new WebSocket(buildEndpoint(this.apiKey));
        } catch (e) {
            this.log(`WebSocket 생성 실패: ${e.message}`, 'error');
            throw e;
        }
        this.ws.binaryType = 'arraybuffer';

        const openPromise = new Promise((resolve, reject) => {
            const onOpen = () => { this.log('WebSocket OPEN'); resolve(); };
            const onErr = (e) => {
                this.log(`WebSocket onerror — 보통 API 키 권한 / 네트워크 문제`, 'error');
                reject(new Error('WebSocket 연결 실패. 키가 Gemini Live API 권한을 가지고 있는지 확인하세요.'));
            };
            this.ws.addEventListener('open', onOpen, { once: true });
            this.ws.addEventListener('error', onErr, { once: true });
        });

        this.ws.onmessage = (ev) => this.handleServerMessage(ev);
        this.ws.onclose = (e) => {
            const reason = e.reason || '(no reason)';
            this.log(`WebSocket CLOSED code=${e.code} reason=${reason}`, e.code === 1000 ? 'info' : 'error');

            let userMsg = `연결이 종료되었습니다. code=${e.code} ${reason}`;
            const reasonLow = reason.toLowerCase();

            if (e.code === 1008 && (reasonLow.includes('unregistered') || reasonLow.includes('api key'))) {
                userMsg =
                    'Google Live API 가 키 인증을 거절했습니다.\n\n' +
                    '👉 해결: AI Studio (https://aistudio.google.com/app/apikey) 에 접속해\n' +
                    '   "Create API key" 버튼으로 발급받은 \"AIza...\" 형식의 키를 사용하세요.\n\n' +
                    '현재 키 형식: ' + this.apiKey.slice(0, 5) + '…\n' +
                    '주의: \"AQ.\" 형식은 OAuth 액세스 토큰이라 브라우저 WebSocket 에서는 사용할 수 없습니다.';
            } else if (e.code === 1011) {
                userMsg = '서버 내부 오류. 잠시 후 다시 시도해 주세요. (code 1011)';
            } else if (e.code === 1007) {
                userMsg = '잘못된 페이로드. 모델 호환성 문제일 수 있습니다.\n원본: ' + reason;
            }

            if (this.state !== 'idle' && e.code !== 1000) {
                this.onError(new Error(userMsg));
            }
            if (this.state !== 'idle') this.setState('closed');
        };

        await openPromise;

        // ── 2) Send setup ─────────────────────────────────────────────────
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
        this.log(`setup 전송 — responseModalities=${this.audioOut ? 'AUDIO' : 'TEXT'}`);
        this.setState('starting');

        // ── 3) Output AudioContext (iOS Safari 는 resume 필요) ────────────
        if (typeof window !== 'undefined') {
            this.outCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_RATE });
            try { await this.outCtx.resume(); } catch { /* ignore */ }
            this.playheadTime = this.outCtx.currentTime;
            this.log(`출력 AudioContext 준비 (rate=${this.outCtx.sampleRate}, state=${this.outCtx.state})`);
        }

        // ── 4) Mic capture ────────────────────────────────────────────────
        try {
            await this.startMic();
        } catch (e) {
            this.log(`마이크 시작 실패: ${e.message}`, 'error');
            throw e;
        }

        this.setState('listening');
        this.log(`청취 시작 — setupComplete 수신 전엔 청크가 누적만 됩니다.`);
    }

    async startMic() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('이 브라우저는 마이크 권한을 지원하지 않습니다.');
        }
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        this.log('마이크 권한 OK');

        let ctxRate;
        try {
            this.micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: INPUT_RATE });
        } catch {
            this.micCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        try { await this.micCtx.resume(); } catch { /* ignore */ }
        ctxRate = this.micCtx.sampleRate;
        this.log(`입력 AudioContext rate=${ctxRate} (목표 ${INPUT_RATE})`);

        this.source = this.micCtx.createMediaStreamSource(this.stream);
        // eslint-disable-next-line no-undef
        this.processor = this.micCtx.createScriptProcessor(FRAME_SIZE, 1, 1);

        this.processor.onaudioprocess = (e) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            if (!this.setupAck) return; // setup 완료 전엔 보내지 않음

            const f32 = e.inputBuffer.getChannelData(0);
            const resampled = ctxRate === INPUT_RATE ? f32 : resampleFloat32(f32, ctxRate, INPUT_RATE);
            const int16 = floatToInt16(resampled);
            const b64 = int16ToBase64(int16);
            try {
                this.ws.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{ mimeType: `audio/pcm;rate=${INPUT_RATE}`, data: b64 }],
                    },
                }));
                this.sentChunks++;
                if (this.sentChunks === 1 || this.sentChunks % 25 === 0) {
                    this.log(`송신 청크 누적 ${this.sentChunks}`);
                }
            } catch (err) {
                this.log(`청크 송신 실패: ${err.message}`, 'error');
            }
        };

        this.source.connect(this.processor);
        this.processor.connect(this.micCtx.destination);
    }

    handleServerMessage(ev) {
        let msg;
        try {
            msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
        } catch (err) {
            this.log(`서버 응답 파싱 실패: ${err.message}`, 'error');
            return;
        }

        if (msg.setupComplete) {
            this.setupAck = true;
            this.log('서버: setupComplete — 이제 청크 송신 시작');
            return;
        }

        if (msg.serverContent) {
            const sc = msg.serverContent;
            const parts = sc.modelTurn?.parts || [];
            for (const p of parts) {
                if (p.text) {
                    this.onText({ text: p.text, partial: !sc.turnComplete });
                    this.log(`텍스트 수신 (${p.text.length}자)`);
                }
                if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/')) {
                    this.recvAudioChunks++;
                    if (this.recvAudioChunks === 1 || this.recvAudioChunks % 10 === 0) {
                        this.log(`수신 오디오 청크 ${this.recvAudioChunks}`);
                    }
                    this.queueAudio(p.inlineData.data);
                }
            }
            if (sc.turnComplete) {
                this.log('서버: turnComplete');
                this.onTurnComplete();
            }
        }

        if (msg.error) {
            const m = msg.error.message || JSON.stringify(msg.error);
            this.log(`서버 에러: ${m}`, 'error');
            this.onError(new Error(m));
        }
    }

    queueAudio(base64) {
        if (!this.outCtx) return;
        try {
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
        } catch (e) {
            this.log(`오디오 재생 큐 실패: ${e.message}`, 'error');
        }
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
        if (this.state === 'idle') return;
        this.log('세션 종료');
        this.setState('idle');
        try { this.processor?.disconnect(); } catch { /* ignore */ }
        try { this.source?.disconnect(); } catch { /* ignore */ }
        try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
        try { await this.micCtx?.close(); } catch { /* ignore */ }
        try { await this.outCtx?.close(); } catch { /* ignore */ }
        try { this.ws?.close(1000, 'client stop'); } catch { /* ignore */ }
        this.processor = this.source = this.stream = this.micCtx = this.outCtx = this.ws = null;
        this.setupAck = false;
        this.sentChunks = 0;
        this.recvAudioChunks = 0;
    }
}
