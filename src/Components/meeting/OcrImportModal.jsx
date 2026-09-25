// OcrImportModal — 예약 완료 문자 캡처 → 미팅 일괄 자동 등록
//
// 흐름:
//   1) 사진 선택(모바일은 카메라 촬영도 가능)
//   2) OCR (Gemini Vision 우선, 없으면 Tesseract.js)
//   3) 추출된 예약 건들을 표로 보여주고 편집 가능
//   4) [N건 모두 등록] → Firestore 에 writeBatch 로 한 번에 생성

import React, { useState, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { DEFAULT_PROJECT_ID } from '../../lib/projects';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';
import {
    ocrWithTesseract, ocrWithGemini, parseReservations,
    DEFAULT_RENTAL_COST, AUTO_DESCRIPTION,
} from '../../lib/ocrReservation';
import {
    X, Camera, Image as ImageIcon, Loader, Sparkles, Trash2, Check, AlertCircle,
} from 'lucide-react';

const OcrImportModal = ({ open, onClose, onDone }) => {
    const { currentUser } = useAuth();
    const { currentProjectId, currentProject } = useProjects();
    const gemini = useGeminiApiKey();

    const [step, setStep] = useState('pick');   // pick | running | review
    const [preview, setPreview] = useState('');
    const [engine, setEngine] = useState('');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [items, setItems] = useState([]);
    const [saving, setSaving] = useState(false);

    const cameraRef = useRef(null);
    const galleryRef = useRef(null);

    const myName = currentUser?.displayName
        || currentUser?.email?.split('@')[0]
        || '나';

    const reset = () => {
        setStep('pick'); setPreview(''); setEngine('');
        setProgress(0); setError(''); setItems([]); setSaving(false);
    };

    const handleClose = () => { reset(); onClose?.(); };

    // ---- OCR 실행 -------------------------------------------------------
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';                 // 같은 파일 재선택 허용
        if (!file) return;

        setError('');
        setPreview(URL.createObjectURL(file));
        setStep('running');
        setProgress(0);

        try {
            let parsed = [];

            if (gemini.hasKey) {
                // Gemini Vision — 구조화 추출까지 한 번에. 정확도가 훨씬 높다.
                setEngine('Gemini Vision');
                parsed = await ocrWithGemini(file, gemini.key);
            } else {
                // Tesseract.js — 완전 무료. 첫 실행 시 언어팩 다운로드로 시간이 걸린다.
                setEngine('Tesseract (무료)');
                const text = await ocrWithTesseract(file, setProgress);
                parsed = parseReservations(text);
            }

            if (parsed.length === 0) {
                setError(
                    gemini.hasKey
                        ? '예약 정보를 찾지 못했어요. 문자 내용이 잘 보이도록 다시 캡처해 주세요.'
                        : '예약 정보를 찾지 못했어요. 설정에서 Gemini API 키를 등록하면 인식률이 크게 올라갑니다.'
                );
                setStep('pick');
                return;
            }

            setItems(parsed.map((p) => ({ ...p, cost: DEFAULT_RENTAL_COST })));
            setStep('review');
        } catch (err) {
            console.error('[OCR] failed', err);
            setError(err.message || 'OCR 처리 중 오류가 발생했습니다.');
            setStep('pick');
        }
    };

    // ---- 항목 편집 ------------------------------------------------------
    const updateItem = (idx, field, value) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

    const removeItem = (idx) =>
        setItems((prev) => prev.filter((_, i) => i !== idx));

    // ---- 일괄 등록 ------------------------------------------------------
    const handleCreateAll = async () => {
        if (!currentUser?.uid) { alert('로그인이 필요합니다.'); return; }
        if (items.length === 0) return;

        setSaving(true);
        try {
            const batch = writeBatch(db);
            items.forEach((it) => {
                const cost = Math.max(0, Number(it.cost) || 0);
                const costEntries = cost > 0 ? [{ cost, bookedBy: myName }] : [];
                const ref = doc(collection(db, 'meetings'));
                batch.set(ref, {
                    title: it.title,
                    date: it.date,
                    startTime: it.startTime,
                    endTime: it.endTime,
                    location: '',
                    description: AUTO_DESCRIPTION,
                    attendees: '',
                    costEntries,
                    rentalCost: cost,
                    bookedBy: costEntries.length === 1 ? myName : '',
                    createdBy: currentUser.uid,
                    status: 'upcoming',
                    attendeesList: [],
                    projectId: currentProjectId || DEFAULT_PROJECT_ID,
                    createdAt: serverTimestamp(),
                    // OCR 로 자동 생성된 문서라는 표식
                    source: 'ocr-import',
                });
            });
            await batch.commit();
            alert(`${items.length}건의 미팅이 등록되었습니다.`);
            onDone?.(items.length);
            handleClose();
        } catch (err) {
            console.error('[OCR] batch create failed', err);
            alert('등록 실패: ' + (err.message || ''));
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[1200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
            onClick={handleClose}
        >
            <div
                className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles size={18} className="text-indigo-600" />
                        캡처로 미팅 등록
                    </h3>
                    <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* 프로젝트 안내 */}
                    {currentProject && (
                        <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
                            <span>{currentProject.icon || '📁'}</span>
                            <span>
                                <b className="text-blue-800">{currentProject.name}</b> 프로젝트에 등록됩니다.
                            </span>
                        </div>
                    )}

                    {/* 에러 */}
                    {error && (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* STEP 1 — 사진 선택 */}
                    {step === 'pick' && (
                        <>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                예약 완료 문자 화면을 캡처해서 올리면 날짜·시간·코트명을 자동으로 읽어
                                미팅을 한 번에 만들어 드려요. 여러 건이 한 화면에 있으면 모두 등록됩니다.
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => cameraRef.current?.click()}
                                    className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                >
                                    <Camera size={28} />
                                    <span className="text-sm font-bold">촬영하기</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => galleryRef.current?.click()}
                                    className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                    <ImageIcon size={28} />
                                    <span className="text-sm font-bold">앨범에서 선택</span>
                                </button>
                            </div>

                            {/* 모바일에서 카메라 직접 실행 */}
                            <input
                                ref={cameraRef} type="file" accept="image/*" capture="environment"
                                className="hidden" onChange={handleFile}
                            />
                            <input
                                ref={galleryRef} type="file" accept="image/*"
                                className="hidden" onChange={handleFile}
                            />

                            {/* 엔진 안내 */}
                            <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
                                {gemini.hasKey ? (
                                    <>🤖 <b>Gemini Vision</b> 으로 인식합니다. (내 API 키 · 무료 티어)</>
                                ) : (
                                    <>
                                        🆓 <b>Tesseract</b> 무료 엔진으로 인식합니다. 첫 실행 시 언어팩을
                                        내려받느라 20~30초 걸릴 수 있어요.<br />
                                        설정에서 Gemini API 키를 등록하면 훨씬 빠르고 정확해집니다.
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* STEP 2 — 처리 중 */}
                    {step === 'running' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            {preview && (
                                <img src={preview} alt="" className="max-h-40 rounded-lg border border-gray-200" />
                            )}
                            <Loader size={28} className="animate-spin text-indigo-600" />
                            <p className="text-sm font-medium text-gray-700">{engine} 로 읽는 중…</p>
                            {progress > 0 && (
                                <div className="w-full max-w-xs">
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 transition-all"
                                            style={{ width: `${Math.round(progress * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-gray-400 text-center mt-1">
                                        {Math.round(progress * 100)}%
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3 — 결과 확인/편집 */}
                    {step === 'review' && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-gray-800">
                                    {items.length}건을 찾았어요
                                </p>
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="text-xs text-gray-500 underline underline-offset-2"
                                >
                                    다시 캡처
                                </button>
                            </div>

                            <div className="space-y-3">
                                {items.map((it, idx) => (
                                    <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={it.title}
                                                onChange={(e) => updateItem(idx, 'title', e.target.value)}
                                                placeholder="코트명"
                                                className="flex-1 px-2.5 py-1.5 text-sm font-bold bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeItem(idx)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 shrink-0"
                                                title="이 건 제외"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <input
                                                type="date"
                                                value={it.date}
                                                onChange={(e) => updateItem(idx, 'date', e.target.value)}
                                                className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                                            />
                                            <input
                                                type="time"
                                                value={it.startTime}
                                                onChange={(e) => updateItem(idx, 'startTime', e.target.value)}
                                                className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                                            />
                                            <input
                                                type="time"
                                                value={it.endTime}
                                                onChange={(e) => updateItem(idx, 'endTime', e.target.value)}
                                                className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <label className="text-[11px] text-gray-500 font-semibold shrink-0">대여비</label>
                                            <input
                                                type="number" min="0" step="1000"
                                                value={it.cost}
                                                onChange={(e) => updateItem(idx, 'cost', e.target.value)}
                                                className="w-28 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                                            />
                                            <span className="text-[11px] text-gray-500">원 · 예약자</span>
                                            <span className="text-[11px] font-bold text-gray-800 truncate">{myName}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                설명란에 <b>“{AUTO_DESCRIPTION}”</b> 이 자동으로 들어갑니다.
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === 'review' && (
                    <div className="p-4 border-t border-gray-100 shrink-0">
                        <button
                            type="button"
                            onClick={handleCreateAll}
                            disabled={saving || items.length === 0}
                            className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 disabled:bg-gray-300 flex items-center justify-center gap-2"
                        >
                            {saving
                                ? <><Loader size={16} className="animate-spin" /> 등록 중…</>
                                : <><Check size={16} /> {items.length}건 모두 등록하기</>}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OcrImportModal;
