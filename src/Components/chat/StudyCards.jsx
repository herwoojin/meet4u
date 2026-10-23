// 언어 공부 카드 — studyPipeline.buildStudy() 결과를 그린다 (+ A4 학습지 인쇄).
//
// 한 카드 = 원문의 한 문장. 원문(그대로) · 번역 · 발음 · 단어(뜻·품사·다른 뜻·조사 설명) · 숙어.
// 단어를 누르면 소리로 들려준다(브라우저 음성). 영어는 한글 발음 대신 🔊 로 듣는다.

import React from 'react';
import { Loader, Volume2 } from 'lucide-react';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
const num = (i) => CIRCLED[i] || `(${i + 1})`;
const SPEECH = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', es: 'es-ES', fr: 'fr-FR', vi: 'vi-VN', ru: 'ru-RU',
    th: 'th-TH', id: 'id-ID', mn: 'mn-MN', ar: 'ar-SA', km: 'km-KH', bn: 'bn-BD', uz: 'uz-UZ', si: 'si-LK', my: 'my-MM', tl: 'fil-PH', ne: 'ne-NP' };

export const speak = (text, lang) => {
    try {
        const s = window.speechSynthesis;
        if (!s || !text) return;
        s.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = SPEECH[String(lang).split('-')[0]] || lang;
        u.rate = 0.9;
        s.speak(u);
    } catch (_) { /* 음성 미지원 */ }
};

const ReadingLine = ({ reading, lang, text, loading }) => {
    if (!reading) return loading ? <span className="text-gray-400 italic text-xs">발음 불러오는 중…</span> : <span className="text-gray-400 text-xs">(없음)</span>;
    if (reading.audioOnly) {
        return (
            <button type="button" onClick={() => speak(text, lang)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                <Volume2 size={13} /> 눌러서 듣기
                <span className="font-normal text-gray-400">(영어는 철자와 발음이 달라 한글로 적지 않아요)</span>
            </button>
        );
    }
    return (
        <span>
            {reading.roman && <span className="font-mono text-indigo-700">{reading.roman}</span>}
            {reading.hangul && <span className={reading.roman ? 'ml-2 text-gray-700' : 'text-indigo-700'}>{reading.roman ? `[${reading.hangul}]` : reading.hangul}</span>}
        </span>
    );
};

const WordChip = ({ w, lang }) => {
    const i = w.info;
    return (
        <button
            type="button"
            onClick={() => speak(w.text, lang)}
            title="눌러서 듣기"
            className="text-left rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
        >
            <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-gray-900 break-words">{w.text}</span>
                {i?.reading?.roman && (
                    <span className="text-[11px] font-mono text-indigo-600">
                        {i.reading.roman}{i.reading.hangul && i.reading.hangul !== i.reading.roman ? ` · ${i.reading.hangul}` : ''}
                    </span>
                )}
                {i?.meaning && <span className="text-xs font-semibold text-rose-600">{i.meaning}</span>}
                {(i?.pos || []).map((p) => (
                    <span key={p} className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-600">{p}</span>
                ))}
                {!i && <Loader size={10} className="animate-spin text-gray-300" />}
            </div>
            {i?.note && <div className="text-[10.5px] text-emerald-700 mt-0.5 leading-snug">💡 {i.note}</div>}
            {w.phraseNote && <div className="text-[10.5px] text-amber-700 mt-0.5 leading-snug">📌 {w.phraseNote}</div>}
            {i?.alts?.length > 0 && <div className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">다른 뜻: {i.alts.join(', ')}</div>}
        </button>
    );
};

const SentenceCard = ({ c, study, languageLabel }) => {
    const { paired, lang } = study;
    const loading = !study.done;
    const first = paired
        ? { label: '1. 원문 (🇰🇷 한국어)', text: c.source }
        : { label: `1. 원문 (${languageLabel})`, text: c.target };
    const second = paired
        ? { label: `2. 번역 (${languageLabel})`, text: c.target, big: true }
        : { label: '2. 뜻 (🇰🇷 한국어)', text: c.meaningKo };
    return (
        <div className="rounded-xl border-2 border-indigo-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-indigo-50 border-b border-indigo-100">
                <span className="text-base font-bold text-indigo-700">{num(c.idx)}</span>
                <button type="button" onClick={() => speak(c.target, lang)} disabled={!c.target}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                    <Volume2 size={13} /> 문장 듣기
                </button>
            </div>
            {[first, second].map((row) => (
                <div key={row.label} className="px-3 py-2 border-b border-gray-100">
                    <div className="text-[9px] uppercase tracking-wide text-rose-500 font-bold mb-0.5">{row.label}</div>
                    <div className={`${row.big ? 'text-base text-gray-900' : 'text-sm text-gray-800'} break-words leading-relaxed`}>
                        {row.text || (loading ? <span className="text-gray-400 italic text-xs">번역 중…</span> : <span className="text-gray-400 text-xs">(번역을 가져오지 못했어요)</span>)}
                    </div>
                </div>
            ))}
            <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-[9px] uppercase tracking-wide text-purple-500 font-bold mb-0.5">3. 발음</div>
                <div className="text-sm leading-relaxed break-words">
                    <ReadingLine reading={c.reading} lang={lang} text={c.target} loading={loading} />
                </div>
            </div>
            {c.phrases?.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/50">
                    <div className="text-[9px] uppercase tracking-wide text-amber-600 font-bold mb-0.5">📌 숙어</div>
                    {c.phrases.map((p) => (
                        <div key={p.phrase} className="text-sm"><b className="text-gray-900">{p.phrase}</b> <span className="text-gray-700">— {p.meaning}</span></div>
                    ))}
                </div>
            )}
            <div className="px-3 py-2">
                <div className="text-[9px] uppercase tracking-wide text-emerald-600 font-bold mb-1.5">4. 단어 (누르면 들려줘요)</div>
                {c.words.length === 0
                    ? <div className="text-xs text-gray-400">{loading ? '단어 나누는 중…' : '(없음)'}</div>
                    : <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">{c.words.map((w, k) => <WordChip key={k} w={w} lang={lang} />)}</div>}
            </div>
        </div>
    );
};

export const StudyCards = ({ study, languageLabel }) => {
    if (!study) return <div className="flex items-center gap-2 text-xs text-gray-400"><Loader size={12} className="animate-spin" /> 문장을 나누는 중…</div>;
    const multi = study.paragraphs.length > 1;
    const cards = study.paragraphs.flat();
    const join = (pick) => study.paragraphs.map((p) => p.map(pick).filter(Boolean).join(' ')).filter(Boolean).join('\n\n');
    const allReading = cards.every((c) => c.reading && !c.reading.audioOnly)
        ? join((c) => (c.reading.roman ? `${c.reading.roman}${c.reading.hangul ? ` [${c.reading.hangul}]` : ''}` : c.reading.hangul))
        : '';
    return (
        <div className="space-y-4">
            {/* 한눈에 보기 */}
            <div className="bg-gradient-to-r from-rose-50 to-indigo-50 rounded-lg p-3 border border-rose-200 space-y-2">
                {study.paired && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-rose-500 font-bold mb-1">전체 원문 (🇰🇷 한국어)</div>
                        <div className="text-sm text-gray-800 leading-relaxed break-words whitespace-pre-line">{join((c) => c.source)}</div>
                    </div>
                )}
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-bold mb-1">{study.paired ? `전체 번역 (${languageLabel})` : `전체 원문 (${languageLabel})`}</div>
                    <div className="text-base text-gray-900 leading-relaxed break-words whitespace-pre-line">{join((c) => c.target) || '…'}</div>
                </div>
                {!study.paired && join((c) => c.meaningKo) && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-rose-500 font-bold mb-1">전체 뜻 (🇰🇷 한국어)</div>
                        <div className="text-sm text-gray-800 leading-relaxed break-words whitespace-pre-line">{join((c) => c.meaningKo)}</div>
                    </div>
                )}
                {allReading && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-purple-500 font-bold mb-1">전체 발음</div>
                        <div className="text-sm text-indigo-700 leading-relaxed break-words whitespace-pre-line">{allReading}</div>
                    </div>
                )}
                <div className="text-[10.5px] text-gray-500 leading-snug">
                    ⓘ 번역은 구글 번역 기준이라 직함·이름 같은 고유한 말은 틀릴 수 있어요. 더 정확한 해석은 아래 <b>Gemini 정밀 분석</b>을 써 보세요.
                </div>
            </div>

            <div className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                문장별 학습 (원문 → 번역 → 발음 → 단어)
                {!study.done && <Loader size={9} className="animate-spin text-indigo-400" />}
            </div>
            {study.paragraphs.map((p, pi) => (
                <section key={pi} className="space-y-3">
                    {multi && <div className="text-[11px] font-bold text-gray-500 border-l-4 border-indigo-300 pl-2">단락 {pi + 1}</div>}
                    {p.map((c) => <SentenceCard key={c.idx} c={c} study={study} languageLabel={languageLabel} />)}
                </section>
            ))}
        </div>
    );
};

// ---------------------------------------------------------------------------
// A4 학습지 (같은 데이터로 인쇄)
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const buildStudyPrintHtml = (study, languageLabel) => {
    const now = new Date();
    const dateLabel = `${String(now.getMonth() + 1).padStart(2, '0')}월${String(now.getDate()).padStart(2, '0')}일`;
    const readingHtml = (r) => (!r ? '' : r.audioOnly ? '<span class="muted">(영어 — 소리로 들어 보세요)</span>'
        : `${r.roman ? `<span class="mono">${esc(r.roman)}</span>` : ''}${r.hangul ? ` <span>${r.roman ? `[${esc(r.hangul)}]` : esc(r.hangul)}</span>` : ''}`);
    const card = (c) => `
<div class="card">
  <div class="num">${num(c.idx)}</div>
  <div class="row"><span class="lab">원문</span>${esc(study.paired ? c.source : c.target)}</div>
  <div class="row big"><span class="lab">${study.paired ? '번역' : '뜻'}</span>${esc(study.paired ? c.target : c.meaningKo)}</div>
  <div class="row"><span class="lab">발음</span>${readingHtml(c.reading)}</div>
  ${(c.phrases || []).length ? `<div class="row"><span class="lab">숙어</span>${c.phrases.map((p) => `<b>${esc(p.phrase)}</b> — ${esc(p.meaning)}`).join(' · ')}</div>` : ''}
  <table class="words">${c.words.map((w) => `<tr>
    <td class="w">${esc(w.text)}</td>
    <td class="mono">${esc(w.info?.reading?.roman || '')}${w.info?.reading?.hangul && w.info.reading.hangul !== w.info.reading.roman ? ` · ${esc(w.info.reading.hangul)}` : ''}</td>
    <td>${esc(w.info?.meaning || '')}${(w.info?.pos || []).length ? ` <span class="pos">${esc(w.info.pos.join('/'))}</span>` : ''}
      ${w.info?.note ? `<div class="note">💡 ${esc(w.info.note)}</div>` : ''}${w.phraseNote ? `<div class="note">📌 ${esc(w.phraseNote)}</div>` : ''}
      ${w.info?.alts?.length ? `<div class="alt">다른 뜻: ${esc(w.info.alts.join(', '))}</div>` : ''}</td></tr>`).join('')}</table>
</div>`;
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${dateLabel} ${esc(languageLabel)} 공부</title>
<style>
@page { size: A4; margin: 14mm; } * { box-sizing: border-box; }
body { font-family: -apple-system, 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.55; margin: 0; padding: 16px; }
h1 { font-size: 15pt; margin: 0 0 4px; } .sub { color: #666; font-size: 9pt; margin-bottom: 12px; }
.para { margin: 14px 0 6px; font-weight: 700; color: #4f46e5; border-left: 4px solid #a5b4fc; padding-left: 6px; }
.card { border: 1.5px solid #e0e7ff; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; page-break-inside: avoid; }
.num { font-weight: 800; color: #4338ca; } .row { margin: 3px 0; } .row.big { font-size: 12pt; }
.lab { display: inline-block; min-width: 34px; font-size: 8pt; font-weight: 700; color: #e11d48; margin-right: 6px; }
.mono { font-family: Menlo, monospace; color: #4f46e5; } .muted { color: #999; }
table.words { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 6px; font-size: 9.5pt; }
table.words td:nth-child(1) { width: 22%; } table.words td:nth-child(2) { width: 30%; }
table.words td { border-top: 1px dashed #e5e7eb; padding: 3px 4px; vertical-align: top; } td.w { font-weight: 700; word-break: break-word; }
.pos { font-size: 7.5pt; background: #f1f5f9; color: #475569; border-radius: 3px; padding: 0 3px; }
.note { color: #047857; font-size: 8.5pt; } .alt { color: #6b7280; font-size: 8.5pt; }
.toolbar { margin-bottom: 10px; } @media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">📄 PDF로 저장 / 인쇄</button></div>
<h1>${dateLabel}의 공부 · ${esc(languageLabel)}</h1>
<div class="sub">문장마다 원문 → ${study.paired ? '번역' : '뜻'} → 발음 → 단어</div>
${study.paragraphs.map((p, i) => `${study.paragraphs.length > 1 ? `<div class="para">단락 ${i + 1}</div>` : ''}${p.map(card).join('')}`).join('')}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body></html>`;
};

export const openStudyPrint = (study, languageLabel) => {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.'); return; }
    w.document.open();
    w.document.write(buildStudyPrintHtml(study, languageLabel));
    w.document.close();
};
