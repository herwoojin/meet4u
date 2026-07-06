import React, { useEffect, useMemo, useState } from 'react';
import { X, BookOpen, Sparkles, Loader, KeyRound, Save, Eye, EyeOff, Trash2, Printer } from 'lucide-react';
import {
    analyzeSentence,
    analyzeWithGemini,
    getPhrasePronunciations,
    getPhraseTranslations,
    pairKoreanChunks,
    fetchFullPronunciation,
    splitPronunciationByChunks,
} from '../../lib/grammar';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';

const COLOR_CLASSES = {
    blue:    { bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-300',     pill: 'bg-blue-100 text-blue-700' },
    green:   { bg: 'bg-green-50',    text: 'text-green-700',    border: 'border-green-300',    pill: 'bg-green-100 text-green-700' },
    red:     { bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-300',      pill: 'bg-red-100 text-red-700' },
    purple:  { bg: 'bg-purple-50',   text: 'text-purple-700',   border: 'border-purple-300',   pill: 'bg-purple-100 text-purple-700' },
    orange:  { bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-300',   pill: 'bg-orange-100 text-orange-700' },
    indigo:  { bg: 'bg-indigo-50',   text: 'text-indigo-700',   border: 'border-indigo-300',   pill: 'bg-indigo-100 text-indigo-700' },
    pink:    { bg: 'bg-pink-50',     text: 'text-pink-700',     border: 'border-pink-300',     pill: 'bg-pink-100 text-pink-700' },
    teal:    { bg: 'bg-teal-50',     text: 'text-teal-700',     border: 'border-teal-300',     pill: 'bg-teal-100 text-teal-700' },
    slate:   { bg: 'bg-slate-50',    text: 'text-slate-700',    border: 'border-slate-300',    pill: 'bg-slate-100 text-slate-700' },
    rose:    { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-300',     pill: 'bg-rose-100 text-rose-700' },
    fuchsia: { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  border: 'border-fuchsia-300',  pill: 'bg-fuchsia-100 text-fuchsia-700' },
    amber:   { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-300',    pill: 'bg-amber-100 text-amber-700' },
    cyan:    { bg: 'bg-cyan-50',     text: 'text-cyan-700',     border: 'border-cyan-300',     pill: 'bg-cyan-100 text-cyan-700' },
    lime:    { bg: 'bg-lime-50',     text: 'text-lime-700',     border: 'border-lime-300',     pill: 'bg-lime-100 text-lime-700' },
    emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-400',  pill: 'bg-emerald-100 text-emerald-700' },
    gray:    { bg: 'bg-gray-50',     text: 'text-gray-700',     border: 'border-gray-300',     pill: 'bg-gray-100 text-gray-700' },
};
const cls = (color) => COLOR_CLASSES[color] || COLOR_CLASSES.gray;

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// JSX: render a chunk by inserting "/" between consecutive phrases so that
// subject / object / predicate / complement boundaries are visible at a
// glance. Works for every supported language because each analyzer returns
// the same phrase shape.
const renderChunkPhrasesJSX = (chunk) => {
    if (!chunk?.phrases?.length) {
        return <span>{chunk?.originalChunk?.trim() || ''}</span>;
    }
    return chunk.phrases.map((p, i) => (
        <React.Fragment key={i}>
            <span>{p.text}{p.particle || ''}{p.punct || ''}</span>
            {i < chunk.phrases.length - 1 && (
                <span className="text-indigo-400 mx-1.5 font-bold select-none">/</span>
            )}
        </React.Fragment>
    ));
};

const renderAllPhrasesJSX = (analysis) => {
    const allPhrases = (analysis?.chunks || []).flatMap(c => c.phrases);
    if (!allPhrases.length) return <span>{analysis?.original || ''}</span>;
    return allPhrases.map((p, i) => (
        <React.Fragment key={i}>
            <span>{p.text}{p.particle || ''}{p.punct || ''}</span>
            {i < allPhrases.length - 1 && (
                <span className="text-indigo-400 mx-1.5 font-bold select-none">/</span>
            )}
        </React.Fragment>
    ));
};

// HTML string variants for the printable PDF.
const renderChunkPhrasesHtml = (chunk) => {
    if (!chunk?.phrases?.length) return escapeHtml(chunk?.originalChunk?.trim() || '');
    return chunk.phrases.map((p, i) => {
        const piece = escapeHtml(p.text) + escapeHtml(p.particle || '') + escapeHtml(p.punct || '');
        const sep = i < chunk.phrases.length - 1 ? '<span class="phrase-slash">/</span>' : '';
        return piece + sep;
    }).join('');
};

const renderAllPhrasesHtml = (analysis) => {
    const allPhrases = (analysis?.chunks || []).flatMap(c => c.phrases);
    if (!allPhrases.length) return escapeHtml(analysis?.original || '');
    return allPhrases.map((p, i) => {
        const piece = escapeHtml(p.text) + escapeHtml(p.particle || '') + escapeHtml(p.punct || '');
        const sep = i < allPhrases.length - 1 ? '<span class="phrase-slash">/</span>' : '';
        return piece + sep;
    }).join('');
};

// Map our Tailwind color tokens to print-friendly hex pairs so the PDF
// keeps role-coloring even when Tailwind is unavailable in the print
// window.
const PRINT_COLORS = {
    blue: '#1d4ed8', green: '#16a34a', red: '#dc2626', purple: '#7c3aed',
    orange: '#ea580c', indigo: '#4338ca', pink: '#db2777', teal: '#0d9488',
    slate: '#475569', rose: '#e11d48', fuchsia: '#c026d3', amber: '#d97706',
    cyan: '#0891b2', lime: '#65a30d', emerald: '#059669', gray: '#374151',
};

const renderPrintSection = (analysis, fullPron, phrasePron) => {
    const ciNums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    const phraseKey = (p) => (p.text || '') + (p.particle || '');

    const chunksHtml = analysis.chunks.map((c, i) => `
        <div class="chunk">
            <span class="num">${ciNums[i] || `(${i + 1})`}</span>
            <span class="chunk-text">${renderChunkPhrasesHtml(c)}</span>
            <div class="struct">${escapeHtml(c.structure || '구조 불명')}</div>
        </div>
    `).join('');

    const originalHtml = renderAllPhrasesHtml(analysis);

    const phrasesHtml = analysis.phrases.map(p => {
        const pron = phrasePron[phraseKey(p)] || '';
        const color = PRINT_COLORS[p.label?.color] || '#374151';
        return `
            <div class="phrase" style="border-left-color: ${color}">
                <div class="phrase-head">
                    <span class="surface">${escapeHtml(p.text)}</span>
                    ${p.particle ? `<span class="particle" style="color:${color};border-color:${color}">+${escapeHtml(p.particle)}</span>` : ''}
                    ${p.punct ? `<span class="punct">${escapeHtml(p.punct)}</span>` : ''}
                    ${pron ? `<span class="pron-mini">[${escapeHtml(pron)}]</span>` : ''}
                </div>
                ${p.label ? `
                    <div class="role-row">
                        <span class="role" style="background:${color}1a;color:${color}">${escapeHtml(p.label.role)}</span>
                        <span class="role-desc">${escapeHtml(p.label.detail)}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    return { chunksHtml, originalHtml, phrasesHtml };
};

const renderUnifiedPrintSection = (local, fullPron, phrasePron, phraseMeanings, chunkKoreans, koreanOriginal, languageLabel) => {
    const ciNums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    const phraseKey = (p) => (p.text || '') + (p.particle || '');
    const pronSlices = splitPronunciationByChunks(fullPron, local.chunks);

    const cardsHtml = local.chunks.map((chunk, idx) => {
        const ko = chunkKoreans[idx] || '';
        const pron = pronSlices[idx] || '';
        const phrasesHtml = chunk.phrases.map(p => {
            const color = PRINT_COLORS[p.label?.color] || '#374151';
            const pronP = phrasePron[phraseKey(p)] || '';
            const meaning = phraseMeanings[phraseKey(p)] || '';
            return `
                <div class="u-phrase" style="border-left-color:${color}">
                    <div class="u-phrase-head">
                        <span class="u-surface">${escapeHtml(p.text)}</span>
                        ${p.particle ? `<span class="u-particle" style="color:${color};border-color:${color}">+${escapeHtml(p.particle)}</span>` : ''}
                        ${p.punct ? `<span class="u-punct">${escapeHtml(p.punct)}</span>` : ''}
                        ${pronP ? `<span class="u-pron">[${escapeHtml(pronP)}]</span>` : ''}
                        ${meaning ? `<span class="u-meaning">— <b>${escapeHtml(meaning)}</b></span>` : ''}
                    </div>
                    ${p.label ? `
                        <div class="u-role-row">
                            <span class="u-role" style="background:${color}1a;color:${color}">${escapeHtml(p.label.role)}</span>
                            <span class="u-role-desc">${escapeHtml(p.label.detail)}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="u-card">
                <div class="u-card-head">
                    <span class="u-num">${ciNums[idx] || `(${idx + 1})`}</span>
                    <span class="u-struct">${escapeHtml(chunk.structure || '(구조 불명)')}</span>
                </div>
                <div class="u-row"><span class="u-label u-label-ko">1. 원문 (한국어)</span><div class="u-content">${escapeHtml(ko) || '<span class="u-empty">(매칭 없음)</span>'}</div></div>
                <div class="u-row"><span class="u-label u-label-tr">2. 번역 (${escapeHtml(languageLabel || '')})</span><div class="u-content u-content-translated">${renderChunkPhrasesHtml(chunk)}</div></div>
                <div class="u-row"><span class="u-label u-label-pr">3. 발음</span><div class="u-content u-content-pron">${escapeHtml(pron) || '<span class="u-empty">(없음)</span>'}</div></div>
                <div class="u-row"><span class="u-label u-label-bd">4. 어절 분해 (단어 + 뜻)</span><div class="u-phrases">${phrasesHtml}</div></div>
            </div>
        `;
    }).join('');

    return { cardsHtml, fullPron };
};

const buildPrintHtml = ({ local, fullPron, phrasePron, koreanLocal, koreanFullPron, koreanPhrasePron, koreanOriginal, chunkKoreans, phraseMeanings }) => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dateLabel = `${mm}월${dd}일`;

    const unified = koreanLocal
        ? renderUnifiedPrintSection(local, fullPron, phrasePron, phraseMeanings || {}, chunkKoreans || [], koreanOriginal || '', local.languageLabel)
        : null;
    const main = unified ? null : renderPrintSection(local, fullPron, phrasePron);
    const korean = null; // legacy separate korean section retired in unified mode

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${dateLabel} ${escapeHtml(local.languageLabel || '')} 문법 공부</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a; line-height: 1.55; font-size: 10.5pt;
    padding: 16px;
}
.toolbar {
    position: fixed; top: 12px; right: 12px; z-index: 999;
    background: white; border: 1px solid #ddd; border-radius: 8px;
    padding: 8px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    display: flex; gap: 8px;
}
.toolbar button {
    background: #4338ca; color: white; border: none;
    padding: 8px 14px; border-radius: 6px; font-size: 10pt;
    cursor: pointer; font-weight: bold;
}
.toolbar button:hover { background: #312e81; }
.toolbar .secondary { background: #6b7280; }
.toolbar .secondary:hover { background: #4b5563; }
.header {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 2.5px solid #4338ca; padding-bottom: 8px; margin-bottom: 14px;
}
.header h1 { font-size: 15pt; margin: 0; color: #4338ca; font-weight: 800; }
.header .date { color: #666; font-size: 9.5pt; }
.section { margin-bottom: 12px; page-break-inside: avoid; }
.section h2 {
    font-size: 10.5pt; margin: 0 0 6px 0; color: #4338ca;
    border-left: 3px solid #4338ca; padding-left: 6px;
}
.original {
    font-size: 12pt; line-height: 1.7; padding: 10px;
    background: #f7f7fb; border-radius: 6px; border: 1px solid #eef;
}
.divider { color: #4338ca; font-weight: bold; padding: 0 5px; }
.phrase-slash { color: #6366f1; font-weight: bold; padding: 0 5px; }
.pron {
    font-family: 'Menlo', 'Courier New', monospace;
    font-size: 9.5pt; color: #4338ca;
    padding: 8px 10px; background: #fafafe;
    border-radius: 6px; border: 1px dashed #d6d8f5;
    word-break: break-word;
}
.chunk {
    padding: 6px 10px; border: 1px solid #eee;
    border-radius: 4px; margin-bottom: 4px;
}
.chunk .num { font-weight: bold; color: #4338ca; margin-right: 6px; }
.chunk .struct { color: #555; font-size: 9pt; margin-top: 2px; padding-left: 18px; }
.phrases {
    display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
}
.phrase {
    padding: 6px 8px; border: 1px solid #ddd; border-left: 3px solid #888;
    border-radius: 3px; page-break-inside: avoid; background: white;
}
.phrase-head {
    display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px;
}
.surface { font-size: 11pt; font-weight: 700; }
.particle {
    display: inline-block; padding: 1px 4px;
    border: 1px solid; border-radius: 3px;
    font-size: 8.5pt; background: white;
}
.punct { color: #999; }
.pron-mini {
    color: #4338ca; font-family: 'Menlo', monospace;
    font-size: 8.5pt;
}
.role-row { display: flex; align-items: baseline; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
.role {
    display: inline-block; padding: 1px 5px; border-radius: 3px;
    font-size: 8pt; font-weight: 700;
}
.role-desc { color: #555; font-size: 9pt; }
.note {
    font-size: 9pt; color: #4338ca; background: #eef2ff;
    border: 1px solid #c7d2fe; border-radius: 4px; padding: 6px 10px;
}
.footer {
    margin-top: 16px; text-align: center; color: #888;
    font-size: 8pt; border-top: 1px solid #eee; padding-top: 6px;
}
.ko-divider {
    margin: 18px 0 10px 0; padding: 6px 10px;
    background: #fff1f2; color: #be123c;
    border: 1px dashed #fda4af; border-radius: 6px;
    font-size: 10pt; font-weight: 700;
    page-break-before: auto; page-break-after: avoid;
}
/* Unified per-clause study cards */
.u-overview {
    background: linear-gradient(90deg, #fff1f2 0%, #eef2ff 100%);
    border: 1px solid #fecdd3; border-radius: 8px;
    padding: 10px; margin-bottom: 14px;
}
.u-overview .u-ov-row { margin-bottom: 4px; }
.u-overview .u-ov-label {
    display: inline-block; font-size: 8.5pt; font-weight: 700;
    margin-right: 4px;
}
.u-overview .u-ov-label.ko { color: #be123c; }
.u-overview .u-ov-label.tr { color: #4338ca; }
.u-overview .u-ov-label.pr { color: #9333ea; }
.u-card {
    border: 1.5px solid #c7d2fe; border-radius: 8px;
    margin-bottom: 8px; overflow: hidden;
    page-break-inside: avoid; background: white;
}
.u-card-head {
    display: flex; align-items: center; gap: 8px;
    background: #eef2ff; padding: 4px 10px;
    border-bottom: 1px solid #c7d2fe;
}
.u-num { font-size: 11pt; font-weight: 800; color: #4338ca; }
.u-struct { font-size: 8.5pt; color: #4338ca; font-weight: 600; }
.u-row {
    display: flex; gap: 8px; padding: 5px 10px;
    border-bottom: 1px solid #f3f4f6;
}
.u-row:last-child { border-bottom: none; }
.u-label {
    display: inline-block; flex: 0 0 90px;
    font-size: 7.5pt; font-weight: 700; padding-top: 2px;
}
.u-label-ko { color: #be123c; }
.u-label-tr { color: #4338ca; }
.u-label-pr { color: #9333ea; }
.u-label-bd { color: #047857; }
.u-content { flex: 1; font-size: 10pt; line-height: 1.45; }
.u-content-translated { font-size: 11pt; font-weight: 600; }
.u-content-pron { color: #4338ca; font-family: 'Menlo', monospace; font-size: 9pt; }
.u-empty { color: #999; font-style: italic; font-size: 9pt; }
.u-phrases { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.u-phrase {
    border: 1px solid #ddd; border-left-width: 3px; border-radius: 3px;
    padding: 4px 6px; background: white; page-break-inside: avoid;
}
.u-phrase-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 3px; }
.u-surface { font-size: 10pt; font-weight: 700; }
.u-particle {
    display: inline-block; padding: 0 3px; border: 1px solid;
    border-radius: 3px; font-size: 7.5pt; background: white;
}
.u-punct { color: #999; }
.u-pron {
    color: #4338ca; font-family: 'Menlo', monospace;
    font-size: 8pt;
}
.u-meaning { font-size: 9pt; color: #555; }
.u-meaning b { color: #be123c; }
.u-role-row { display: flex; align-items: baseline; gap: 4px; margin-top: 2px; flex-wrap: wrap; }
.u-role {
    display: inline-block; padding: 1px 4px; border-radius: 3px;
    font-size: 7.5pt; font-weight: 700;
}
.u-role-desc { color: #555; font-size: 8pt; }
@media print {
    body { padding: 0; }
    .no-print { display: none !important; }
    .toolbar { display: none !important; }
}
</style>
</head>
<body>
<div class="toolbar no-print">
    <button onclick="window.print()">📄 PDF로 저장 / 인쇄</button>
    <button class="secondary" onclick="window.close()">닫기</button>
</div>

<div class="header">
    <h1>📚 오늘(${dateLabel})의 공부 · ${escapeHtml(local.languageLabel || '')}</h1>
    <div class="date">${yyyy}-${mm}-${dd}</div>
</div>

${unified ? `
<div class="u-overview">
    <div class="u-ov-row"><span class="u-ov-label ko">🇰🇷 전체 원문 (한국어):</span> ${escapeHtml(koreanOriginal || '')}</div>
    <div class="u-ov-row"><span class="u-ov-label tr">전체 번역 (${escapeHtml(local.languageLabel || '')}):</span> ${renderAllPhrasesHtml(local)}</div>
    ${fullPron ? `<div class="u-ov-row"><span class="u-ov-label pr">전체 발음:</span> ${escapeHtml(fullPron)}</div>` : ''}
</div>

<div class="section">
    <h2>문장별 학습 (원문 → 번역 → 발음 → 어절+뜻)</h2>
    ${unified.cardsHtml}
</div>
` : `
<div class="section">
    <h2>원문</h2>
    <div class="original">${main.originalHtml}</div>
</div>

${fullPron ? `
<div class="section">
    <h2>발음</h2>
    <div class="pron">${escapeHtml(fullPron)}</div>
</div>` : ''}

${local.note ? `<div class="section"><div class="note">${escapeHtml(local.note)}</div></div>` : ''}

<div class="section">
    <h2>구조 (문장별)</h2>
    ${main.chunksHtml}
</div>

<div class="section">
    <h2>어절 분해</h2>
    <div class="phrases">${main.phrasesHtml}</div>
</div>
`}

<div class="footer">Meet4U · PromiseU — 다국어 문법 공부 학습지 (${yyyy}-${mm}-${dd} 생성)</div>
<script>
    // Auto-open print dialog after the page is ready so users can save as PDF.
    window.addEventListener('load', () => { setTimeout(() => { window.print(); }, 350); });
</script>
</body>
</html>`;
};

const openPrintWindow = (args) => {
    const html = buildPrintHtml(args);
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) {
        alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
};

// Unified per-clause study layout used when the source message was Korean
// and the viewer reads a different language. Each clause card shows:
//   ① 원문 (한국어) → 번역 → 발음 → 어절(단어+뜻).
const UnifiedClauseLayout = ({
    analysis, fullPron, phrasePron, phraseMeanings,
    chunkKoreans, languageLabel, pronLoading,
}) => {
    const pronChunks = useMemo(
        () => splitPronunciationByChunks(fullPron, analysis.chunks),
        [fullPron, analysis.chunks]
    );
    const ciNums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    const phraseKey = (p) => (p.text || '') + (p.particle || '');

    return (
        <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
                문장별 학습 (원문 → 번역 → 발음 → 어절)
                {pronLoading && <Loader size={9} className="animate-spin text-indigo-400" />}
            </div>
            <div className="space-y-3">
                {analysis.chunks.map((chunk, idx) => {
                    const ko = chunkKoreans[idx] || '';
                    const pron = pronChunks[idx] || '';
                    return (
                        <div
                            key={idx}
                            className="rounded-xl border-2 border-indigo-100 bg-white shadow-sm overflow-hidden"
                        >
                            {/* Header: number + structure */}
                            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-indigo-50 border-b border-indigo-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-indigo-700">{ciNums[idx] || `(${idx + 1})`}</span>
                                    <span className="text-[10px] text-indigo-600 font-semibold">{chunk.structure || '(구조 불명)'}</span>
                                </div>
                            </div>

                            {/* 1. Korean original */}
                            <div className="px-3 py-2 border-b border-gray-100">
                                <div className="text-[9px] uppercase tracking-wide text-rose-500 font-bold mb-0.5">1. 원문 (한국어)</div>
                                <div className="text-sm text-gray-800 break-words leading-relaxed">
                                    {ko || (pronLoading ? <span className="text-gray-400 italic text-xs">한국어 매칭 로딩…</span> : <span className="text-gray-400 italic text-xs">(없음)</span>)}
                                </div>
                            </div>

                            {/* 2. Translated text — phrase-by-phrase with "/" for role boundaries */}
                            <div className="px-3 py-2 border-b border-gray-100">
                                <div className="text-[9px] uppercase tracking-wide text-indigo-500 font-bold mb-0.5">2. 번역 ({languageLabel})</div>
                                <div className="text-base text-gray-900 break-words leading-relaxed">
                                    {renderChunkPhrasesJSX(chunk)}
                                </div>
                            </div>

                            {/* 3. Pronunciation */}
                            <div className="px-3 py-2 border-b border-gray-100">
                                <div className="text-[9px] uppercase tracking-wide text-purple-500 font-bold mb-0.5">3. 발음</div>
                                <div className="text-sm text-indigo-700 font-mono leading-relaxed break-words">
                                    {pron || (pronLoading ? <span className="text-gray-400 italic text-xs not-italic">발음 로딩…</span> : <span className="text-gray-400 italic text-xs">(없음)</span>)}
                                </div>
                            </div>

                            {/* 4. Phrase breakdown with meanings */}
                            <div className="px-3 py-2">
                                <div className="text-[9px] uppercase tracking-wide text-emerald-600 font-bold mb-1.5">4. 어절 분해 (단어 + 뜻)</div>
                                <div className="space-y-1.5">
                                    {chunk.phrases.map((p, pIdx) => {
                                        const c = cls(p.label?.color || 'gray');
                                        const key = phraseKey(p);
                                        const wordPron = phrasePron[key];
                                        const meaning = phraseMeanings[key];
                                        return (
                                            <div
                                                key={pIdx}
                                                className={`rounded border ${c.border} ${c.bg} p-2`}
                                            >
                                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                                    <span className={`text-sm font-bold ${c.text} break-words`}>
                                                        {p.text}
                                                        {p.particle && (
                                                            <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-white/70 border border-current">
                                                                +{p.particle}
                                                            </span>
                                                        )}
                                                        {p.punct && <span className="text-gray-400 ml-0.5">{p.punct}</span>}
                                                    </span>
                                                    {wordPron && (
                                                        <span className="text-[11px] font-mono text-indigo-600">[{wordPron}]</span>
                                                    )}
                                                    {meaning && (
                                                        <span className="text-xs text-gray-700">— <span className="font-semibold text-rose-600">{meaning}</span></span>
                                                    )}
                                                    {!wordPron && !meaning && pronLoading && (
                                                        <span className="text-[10px] text-gray-400 italic">로딩…</span>
                                                    )}
                                                </div>
                                                {p.label && (
                                                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                                                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${c.pill}`}>
                                                            {p.label.role}
                                                        </span>
                                                        <span className="text-[10.5px] text-gray-600 leading-snug">{p.label.detail}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Reusable in-popup analysis block: original text + pronunciation + structure
// + phrase decomposition. Used when only one language is being analyzed.
const AnalysisBlock = ({ analysis, fullPron, phrasePron, pronLoading }) => {
    const pronChunks = useMemo(
        () => splitPronunciationByChunks(fullPron, analysis.chunks),
        [fullPron, analysis.chunks]
    );
    const phraseKey = (p) => (p.text || '') + (p.particle || '');
    const ciNums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

    return (
        <div className="space-y-4">
            {/* Original + pronunciation */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-3">
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">원문 (어절은 "/" 로 끊어 표시)</div>
                    <div className="text-base text-gray-900 leading-relaxed break-words">
                        {analysis.chunks.length === 0 ? (
                            <span className="italic text-gray-400">(빈 문장)</span>
                        ) : renderAllPhrasesJSX(analysis)}
                    </div>
                </div>

                {(fullPron || pronLoading) && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1">
                            발음
                            {pronLoading && <Loader size={9} className="animate-spin text-indigo-400" />}
                        </div>
                        {fullPron ? (
                            <div className="text-sm text-indigo-700 font-mono leading-relaxed break-words">
                                {pronChunks.map((c, i) => (
                                    <React.Fragment key={i}>
                                        <span>{c}</span>
                                        {i < pronChunks.length - 1 && (
                                            <span className="text-indigo-300 mx-1.5 font-bold select-none">/</span>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-400 italic">발음 로딩 중…</div>
                        )}
                    </div>
                )}
            </div>

            {/* Note */}
            {analysis.note && (
                <div className="text-xs leading-relaxed bg-indigo-50 text-indigo-900 rounded-lg px-3 py-2 border border-indigo-100">
                    {analysis.note}
                </div>
            )}

            {/* Structure per chunk */}
            {analysis.chunks.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">구조 (문장별)</div>
                    <ol className="space-y-1.5 text-xs">
                        {analysis.chunks.map((c, i) => (
                            <li key={i} className="flex items-start gap-2 rounded border border-gray-100 bg-white px-2.5 py-1.5">
                                <span className="font-bold text-indigo-600 shrink-0 mt-0.5">{ciNums[i] || `(${i + 1})`}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-gray-500 break-words">{renderChunkPhrasesJSX(c)}</div>
                                    <div className="font-semibold text-gray-800 mt-0.5">{c.structure || '(구조 불명)'}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Phrase breakdown */}
            <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
                    어절 분해
                    {pronLoading && <Loader size={9} className="animate-spin text-indigo-400" />}
                </div>
                <div className="space-y-2">
                    {analysis.phrases.length === 0 ? (
                        <div className="text-sm text-gray-400 italic">분석할 어절이 없습니다.</div>
                    ) : analysis.phrases.map((p, idx) => {
                        const c = cls(p.label?.color || 'gray');
                        const key = phraseKey(p);
                        const pron = phrasePron[key];
                        return (
                            <div
                                key={idx}
                                className={`flex items-start gap-2 p-2.5 rounded-lg border ${c.border} ${c.bg}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className={`text-base font-semibold ${c.text} break-words`}>
                                            {p.text}
                                            {p.particle && (
                                                <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-white/60 border border-current">
                                                    +{p.particle}
                                                </span>
                                            )}
                                            {p.punct && <span className="text-gray-400 ml-0.5">{p.punct}</span>}
                                        </span>
                                        {pron ? (
                                            <span className="text-xs font-mono text-indigo-600">[{pron}]</span>
                                        ) : pronLoading ? (
                                            <span className="text-[10px] text-gray-400 italic">발음…</span>
                                        ) : null}
                                    </div>
                                    {p.label && (
                                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.pill}`}>
                                                {p.label.role}
                                            </span>
                                            <span className="text-xs text-gray-600 leading-snug">{p.label.detail}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const GrammarPopup = ({ open, onClose, text, lang, fullPronunciation = '', koreanOriginal = '', isAdmin = false }) => {
    const [geminiResult, setGeminiResult] = useState(null);
    const [geminiLoading, setGeminiLoading] = useState(false);
    const [geminiError, setGeminiError] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [keyVisible, setKeyVisible] = useState(false);

    const [fullPron, setFullPron] = useState(fullPronunciation || '');
    const [phrasePron, setPhrasePron] = useState({});
    const [pronLoading, setPronLoading] = useState(false);

    // 한국어 원문 분석용 상태 (sourceLang === 'ko' && myLang !== 'ko' 일 때만 채워짐)
    const [koreanFullPron, setKoreanFullPron] = useState('');
    const [koreanPhrasePron, setKoreanPhrasePron] = useState({});
    // 통합 학습 레이아웃용: 청크별 한국어 원문 + 어절별 한국어 뜻
    const [chunkKoreans, setChunkKoreans] = useState([]);
    const [phraseMeanings, setPhraseMeanings] = useState({});

    const local = useMemo(() => analyzeSentence(text || '', lang), [text, lang]);
    const koreanLocal = useMemo(
        () => koreanOriginal ? analyzeSentence(koreanOriginal, 'ko') : null,
        [koreanOriginal]
    );

    const gemini = useGeminiApiKey();
    const adminAvailable = gemini.hasAdminKey && isAdmin;
    const resolvedKey = gemini.key;
    const canUseGemini = Boolean(resolvedKey);

    useEffect(() => {
        if (!open) return;
        setGeminiResult(null);
        setGeminiError('');
        setShowSettings(false);
        setKeyInput(gemini.key || '');
    }, [open, text, lang, isAdmin, gemini.key]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // Resolve full + per-phrase pronunciation for both the translated text
    // and (when present) the original Korean sentence. Also pre-fetch the
    // Korean meaning of each translated phrase + the Korean equivalent of
    // each clause so the unified study layout can render immediately.
    useEffect(() => {
        if (!open || !text) {
            setFullPron('');
            setPhrasePron({});
            setKoreanFullPron('');
            setKoreanPhrasePron({});
            setChunkKoreans([]);
            setPhraseMeanings({});
            return;
        }
        let cancelled = false;
        (async () => {
            setPronLoading(true);
            try {
                // Translated-text pronunciation
                let full = fullPronunciation;
                if (!full) full = await fetchFullPronunciation(text, lang);
                if (cancelled) return;
                setFullPron(full || '');

                // Korean original pronunciation (parallel-safe via the cache)
                if (koreanOriginal && koreanLocal) {
                    fetchFullPronunciation(koreanOriginal, 'ko').then(krFull => {
                        if (!cancelled) setKoreanFullPron(krFull || '');
                    });
                    getPhrasePronunciations(
                        koreanLocal.phrases,
                        'ko',
                        (partial) => { if (!cancelled) setKoreanPhrasePron({ ...partial }); }
                    ).then(krMap => {
                        if (!cancelled) setKoreanPhrasePron(krMap);
                    });

                    // Unified-study extras: per-chunk Korean + per-phrase Korean meaning.
                    pairKoreanChunks(local.chunks, koreanLocal, lang).then(arr => {
                        if (!cancelled) setChunkKoreans(arr);
                    });
                    getPhraseTranslations(
                        local.phrases,
                        lang,
                        'ko',
                        (partial) => { if (!cancelled) setPhraseMeanings({ ...partial }); }
                    ).then(meanMap => {
                        if (!cancelled) setPhraseMeanings(meanMap);
                    });
                }

                const map = await getPhrasePronunciations(
                    local.phrases,
                    lang,
                    (partial) => { if (!cancelled) setPhrasePron({ ...partial }); }
                );
                if (cancelled) return;
                setPhrasePron(map);
            } finally {
                if (!cancelled) setPronLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, text, lang, fullPronunciation, koreanOriginal, local.phrases, local.chunks, koreanLocal]);

    const runGemini = async () => {
        if (!text || !lang) return;
        if (!resolvedKey) { setShowSettings(true); return; }
        setGeminiLoading(true);
        setGeminiError('');
        setGeminiResult(null);
        try {
            const out = await analyzeWithGemini(text, lang, resolvedKey);
            setGeminiResult(out);
        } catch (err) {
            console.error('Gemini analysis failed:', err);
            setGeminiError(err?.message || 'Gemini 분석에 실패했습니다.');
        } finally {
            setGeminiLoading(false);
        }
    };

    const saveKey = async () => {
        const trimmed = keyInput.trim();
        await gemini.saveKey(trimmed);
        setShowSettings(false);
    };

    const clearKey = async () => {
        await gemini.clearKey();
        setKeyInput('');
    };

    if (!open) return null;

    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}월${String(now.getDate()).padStart(2, '0')}일`;
    const handlePrintPdf = () => openPrintWindow({
        local,
        fullPron,
        phrasePron,
        koreanLocal,
        koreanFullPron,
        koreanPhrasePron,
        koreanOriginal,
        chunkKoreans,
        phraseMeanings,
    });

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2000] flex items-end sm:items-center justify-center p-2 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-teal-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <BookOpen size={18} className="text-indigo-600 shrink-0" />
                        <h2 className="text-sm font-bold text-gray-800 truncate">
                            문법 분석 · {local.languageLabel}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="닫기"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* Quick action: Today's study PDF */}
                <div className="px-4 pt-3">
                    <button
                        type="button"
                        onClick={handlePrintPdf}
                        disabled={!local.original}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-40 shadow"
                        title="A4 인쇄용 학습지로 변환 후 PDF로 저장"
                    >
                        <Printer size={14} />
                        오늘({mmdd})의 공부 — A4 PDF로 저장
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {koreanLocal ? (
                        <>
                            {/* Top reference: full Korean + full translated for at-a-glance compare */}
                            <div className="bg-gradient-to-r from-rose-50 to-indigo-50 rounded-lg p-3 border border-rose-200 space-y-2">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wide text-rose-500 font-bold mb-1">전체 원문 (🇰🇷 한국어)</div>
                                    <div className="text-sm text-gray-800 leading-relaxed break-words">{koreanOriginal}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-bold mb-1">전체 번역 ({local.languageLabel})</div>
                                    <div className="text-base text-gray-900 leading-relaxed break-words">{renderAllPhrasesJSX(local)}</div>
                                </div>
                                {fullPron && (
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wide text-purple-500 font-bold mb-1">전체 발음</div>
                                        <div className="text-sm text-indigo-700 font-mono leading-relaxed break-words">{fullPron}</div>
                                    </div>
                                )}
                            </div>

                            {/* Per-clause unified study cards */}
                            <UnifiedClauseLayout
                                analysis={local}
                                fullPron={fullPron}
                                phrasePron={phrasePron}
                                phraseMeanings={phraseMeanings}
                                chunkKoreans={chunkKoreans}
                                languageLabel={local.languageLabel}
                                pronLoading={pronLoading}
                            />
                        </>
                    ) : (
                        /* Single-language analysis (no Korean source pairing) */
                        <AnalysisBlock
                            analysis={local}
                            fullPron={fullPron}
                            phrasePron={phrasePron}
                            pronLoading={pronLoading}
                        />
                    )}

                    {/* Gemini section */}
                    <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                                <Sparkles size={14} className="text-amber-500" />
                                <span className="text-xs font-bold text-gray-800">Gemini 정밀 분석</span>
                                {adminAvailable && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">관리자 공유키</span>
                                )}
                                {!adminAvailable && canUseGemini && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-semibold">내 키</span>
                                )}
                            </div>
                            <button
                                onClick={() => setShowSettings(s => !s)}
                                className="text-[10px] text-gray-500 hover:text-indigo-600 flex items-center gap-1"
                            >
                                <KeyRound size={11} />
                                {canUseGemini ? '키 변경' : '내 키 등록'}
                            </button>
                        </div>

                        {showSettings && (
                            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                <div className="text-[11px] text-amber-900 leading-snug">
                                    Google AI Studio (aistudio.google.com) 에서 무료 Gemini API 키를 발급받아 붙여넣으세요.
                                    이 키는 본인의 브라우저(localStorage)에만 저장되며 서버에 전송되지 않습니다.
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type={keyVisible ? 'text' : 'password'}
                                        value={keyInput}
                                        onChange={e => setKeyInput(e.target.value)}
                                        placeholder="AIza... 또는 발급받은 키"
                                        className="flex-1 px-2 py-1.5 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setKeyVisible(v => !v)}
                                        className="p-1.5 rounded text-amber-700 hover:bg-amber-100"
                                        title={keyVisible ? '숨기기' : '보기'}
                                    >
                                        {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={saveKey}
                                        disabled={!keyInput.trim()}
                                        className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold bg-amber-600 text-white rounded px-2 py-1.5 hover:bg-amber-700 disabled:opacity-40"
                                    >
                                        <Save size={12} /> 저장
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearKey}
                                        className="flex items-center justify-center gap-1 text-xs font-semibold text-amber-700 border border-amber-300 rounded px-2 py-1.5 hover:bg-amber-100"
                                    >
                                        <Trash2 size={12} /> 삭제
                                    </button>
                                </div>
                            </div>
                        )}

                        {!canUseGemini && !showSettings && (
                            <div className="text-[11px] text-gray-500 leading-snug">
                                Gemini 정밀 분석은 무료 API 키가 필요합니다.
                                {isAdmin
                                    ? ' 관리자 공유 키가 설정되어 있지 않습니다. 본인 키를 등록하거나 .env 의 VITE_GEMINI_ADMIN_API_KEY 를 확인하세요.'
                                    : ' 위 “내 키 등록” 으로 본인 키를 추가하면 더 정밀한 분석을 받을 수 있습니다.'}
                            </div>
                        )}

                        {canUseGemini && (
                            <button
                                type="button"
                                onClick={runGemini}
                                disabled={geminiLoading}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded px-3 py-2 hover:opacity-90 disabled:opacity-50"
                            >
                                {geminiLoading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {geminiLoading ? '분석 중…' : (geminiResult ? '다시 분석' : '정밀 분석 실행')}
                            </button>
                        )}

                        {geminiError && (
                            <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 leading-snug">
                                {geminiError}
                            </div>
                        )}

                        {geminiResult && (
                            <div className="mt-3 space-y-2">
                                {geminiResult.structure && (
                                    <div className="text-xs text-gray-700">
                                        <span className="font-bold">구조:</span> {geminiResult.structure}
                                    </div>
                                )}
                                {Array.isArray(geminiResult.tokens) && geminiResult.tokens.length > 0 && (
                                    <div className="space-y-1.5">
                                        {geminiResult.tokens.map((t, i) => (
                                            <div key={i} className="rounded border border-gray-200 p-2 bg-white">
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-gray-900">{t.surface}</span>
                                                    {t.reading && t.reading !== t.surface && (
                                                        <span className="text-[11px] text-indigo-600 font-mono">[{t.reading}]</span>
                                                    )}
                                                    {t.pos && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">{t.pos}</span>
                                                    )}
                                                    {t.role && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">{t.role}</span>
                                                    )}
                                                </div>
                                                {t.meaning && <div className="text-xs text-gray-700 mt-1">{t.meaning}</div>}
                                                {t.note && <div className="text-[11px] text-gray-500 italic mt-0.5">💡 {t.note}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {geminiResult.overall && (
                                    <div className="text-xs text-gray-800 bg-emerald-50 border border-emerald-200 rounded p-2.5 leading-relaxed">
                                        <span className="font-bold">요약:</span> {geminiResult.overall}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GrammarPopup;
