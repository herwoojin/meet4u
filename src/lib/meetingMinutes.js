import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// 회의록 생성 라이브러리.
//  • Firestore 의 globalChatRooms/{roomId}/messages 에서 기간을 필터하여 수집
//  • 사용자가 설정한 프롬프트 + 언어로 Gemini API 호출
//  • 결과는 마크다운 문자열

const PROMPT_STORAGE = 'meet4u_minutes_prompt';

// ---------------------------------------------------------------------------
// Localized default prompts
// ---------------------------------------------------------------------------

const DEFAULT_PROMPTS = {
    ko: `아래 대화 내용을 바탕으로 회의록을 마크다운(Markdown) 형식으로 작성해 주세요.

포함할 항목:
- **회의 개요**: 일시, 참석자, 주제
- **주요 논의사항**: 대화에서 다룬 핵심 주제와 흐름
- **결정된 사항**: 합의되거나 결정된 내용
- **액션 아이템**: 누가 무엇을 언제까지 할지 (있을 경우)
- **참고 사항**: 기타 중요한 언급

원본 대화의 흐름과 뉘앙스를 잃지 않으면서 간결하고 읽기 쉽게 정리하세요.
결정과 액션 아이템은 명확히 눈에 띄게 표기하고, 상충되는 의견이 있었다면 그 사실도 반영하세요.`,

    en: `Please create meeting minutes in Markdown format based on the conversation below.

Include the following sections:
- **Meeting Overview**: date, participants, topic
- **Key Discussion Points**: main topics and how the conversation flowed
- **Decisions Made**: agreements or decisions reached
- **Action Items**: who does what by when (if applicable)
- **Additional Notes**: other important mentions

Keep it concise and easy to read while preserving the flow and nuance of the original conversation.
Clearly highlight decisions and action items, and reflect any conflicting opinions if they were raised.`,

    ja: `以下の会話内容を基に、議事録をマークダウン(Markdown)形式で作成してください。

含める項目:
- **会議概要**: 日時、参加者、テーマ
- **主要な議論内容**: 会話で扱われた核心テーマと流れ
- **決定事項**: 合意または決定された内容
- **アクションアイテム**: 誰が何をいつまでにやるか(該当時)
- **補足事項**: その他の重要な言及

原文の流れとニュアンスを損なわず、簡潔で読みやすくまとめてください。
決定とアクションアイテムは明確に目立たせ、対立意見があった場合はその事実も反映してください。`,

    zh: `请根据以下对话内容,以Markdown格式撰写会议记录。

包含以下部分:
- **会议概述**: 时间、参与者、主题
- **主要讨论内容**: 会话中涉及的核心主题及流程
- **决定事项**: 达成的一致或决定
- **行动项目**: 谁在何时之前做什么(如适用)
- **补充说明**: 其他重要提及

在保留原对话流程和细微差别的前提下,简洁易读地整理。
明确标注决定和行动项目,如有对立意见也请予以反映。`,

    fr: `Veuillez créer un compte-rendu de réunion au format Markdown à partir de la conversation ci-dessous.

Incluez les sections suivantes:
- **Aperçu de la réunion**: date, participants, sujet
- **Points de discussion clés**: sujets principaux et flux
- **Décisions prises**: accords ou décisions atteints
- **Actions à mener**: qui fait quoi et pour quand (le cas échéant)
- **Notes supplémentaires**: autres mentions importantes`,

    es: `Cree un acta de reunión en formato Markdown basado en la conversación a continuación.

Incluya las siguientes secciones:
- **Resumen de la reunión**: fecha, participantes, tema
- **Puntos de discusión clave**
- **Decisiones tomadas**
- **Elementos de acción**
- **Notas adicionales**`,

    vi: `Vui lòng tạo biên bản cuộc họp ở định dạng Markdown dựa trên cuộc trò chuyện dưới đây.

Bao gồm các phần sau:
- **Tổng quan cuộc họp**: ngày, người tham gia, chủ đề
- **Điểm thảo luận chính**
- **Quyết định**
- **Hành động cần làm**
- **Ghi chú bổ sung**`,

    ru: `Пожалуйста, создайте протокол встречи в формате Markdown на основе разговора ниже.

Включите следующие разделы:
- **Обзор встречи**: дата, участники, тема
- **Ключевые обсуждения**
- **Принятые решения**
- **Пункты действий**
- **Дополнительные заметки**`,

    ar: `يرجى إنشاء محضر اجتماع بتنسيق Markdown بناءً على المحادثة أدناه.

قم بتضمين الأقسام التالية:
- **نظرة عامة على الاجتماع**: التاريخ، المشاركون، الموضوع
- **نقاط النقاش الرئيسية**
- **القرارات المتخذة**
- **بنود العمل**
- **ملاحظات إضافية**`,

    th: `กรุณาสร้างบันทึกการประชุมในรูปแบบ Markdown จากการสนทนาด้านล่าง

รวมส่วนต่อไปนี้:
- **ภาพรวมการประชุม**: วันที่ ผู้เข้าร่วม หัวข้อ
- **ประเด็นสำคัญ**
- **การตัดสินใจ**
- **รายการดำเนินการ**
- **หมายเหตุเพิ่มเติม**`,

    id: `Silakan buat notulen rapat dalam format Markdown berdasarkan percakapan di bawah ini.

Sertakan bagian berikut:
- **Ringkasan Rapat**: tanggal, peserta, topik
- **Poin Diskusi Utama**
- **Keputusan**
- **Tindak Lanjut**
- **Catatan Tambahan**`,
};

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

export const getDefaultPrompt = (lang) => {
    const base = String(lang || 'ko').split('-')[0].toLowerCase();
    return DEFAULT_PROMPTS[base] || DEFAULT_PROMPTS.en;
};

export const getSavedPrompt = () => {
    try { return localStorage.getItem(PROMPT_STORAGE) || ''; } catch { return ''; }
};

export const savePrompt = (prompt) => {
    try {
        if (prompt && prompt.trim()) localStorage.setItem(PROMPT_STORAGE, prompt);
        else localStorage.removeItem(PROMPT_STORAGE);
    } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Firestore query
// ---------------------------------------------------------------------------

export const fetchMessagesInRange = async (roomId, startDate, endDate) => {
    if (!roomId) return [];
    const messagesRef = collection(db, 'globalChatRooms', roomId, 'messages');
    const start = Timestamp.fromDate(startDate);
    const end = Timestamp.fromDate(endDate);
    const q = query(
        messagesRef,
        where('timestamp', '>=', start),
        where('timestamp', '<=', end),
        orderBy('timestamp', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

const formatMessagesForPrompt = (messages) => {
    return messages.map(m => {
        let time = '(시간 미상)';
        try {
            if (m.timestamp?.toDate) {
                time = m.timestamp.toDate().toLocaleString('ko-KR');
            } else if (m.timestamp instanceof Date) {
                time = m.timestamp.toLocaleString('ko-KR');
            }
        } catch { /* ignore */ }
        const name = m.senderName || m.senderEmail?.split('@')?.[0] || '알 수 없음';
        const text = (m.text || '').trim() || '(이미지 또는 첨부)';
        return `[${time}] ${name}: ${text}`;
    }).join('\n');
};

// 모델 fallback 리스트. 앞에서부터 시도, 404(NOT_FOUND) 뜨면 다음 모델로.
// gemini-1.5-flash 는 v1beta 에서 deprecated 되어 제외.
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-1.5-flash-latest',
];
const endpointFor = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const generateMinutes = async ({ messages, prompt, targetLanguageName, apiKey }) => {
    if (!apiKey) throw new Error('Gemini API 키가 필요합니다. 우측 상단 "내 키 등록" 으로 등록해 주세요.');
    if (!messages || messages.length === 0) {
        throw new Error('선택한 기간에 대화가 없습니다. 기간을 확장하거나 다른 방을 선택해 주세요.');
    }

    const conversation = formatMessagesForPrompt(messages);
    const fullPrompt =
        `${prompt.trim()}\n\n` +
        `**출력 언어**: 반드시 "${targetLanguageName}" 로 작성해 주세요.\n\n` +
        `--- 대화 내용 (총 ${messages.length}개 메시지) ---\n` +
        `${conversation}\n` +
        `--- 대화 끝 ---`;

    const body = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    };

    let lastErrText = '';
    let lastStatus = 0;
    for (const model of GEMINI_MODELS) {
        const url = `${endpointFor(model)}?key=${encodeURIComponent(apiKey.trim())}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!text) throw new Error('Gemini 응답이 비어 있습니다.');
            return text;
        }

        lastStatus = res.status;
        lastErrText = await res.text().catch(() => '');
        // 404(모델 없음) 이면 다음 모델로 계속. 그 외 에러는 즉시 중단.
        const isModelMissing =
            res.status === 404 || /not found|NOT_FOUND/i.test(lastErrText);
        if (!isModelMissing) break;
    }

    let hint = '';
    try {
        const j = JSON.parse(lastErrText);
        const msg = j?.error?.message || '';
        if (msg.toLowerCase().includes('api key')) {
            hint = '\n👉 키가 잘못됐거나 만료됐을 수 있습니다. Google AI Studio 에서 재발급해 주세요.';
        }
    } catch { /* ignore */ }
    throw new Error(`Gemini ${lastStatus}: ${lastErrText.slice(0, 300)}${hint}`);
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export const dateToInput = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

export const inputToStartOfDay = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
};

export const inputToEndOfDay = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
};
