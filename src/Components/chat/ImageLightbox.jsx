import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ImageLightbox = ({ src, onClose, filename = 'image.webp' }) => {
    const { t } = useTranslation();

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleDownload = async (e) => {
        e.stopPropagation();
        try {
            const res = await fetch(src, { mode: 'cors' });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            // Fallback: open in new tab
            window.open(src, '_blank');
        }
    };

    if (!src) return null;

    return (
        <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/85 p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div className="absolute top-4 right-4 flex gap-2">
                <button
                    type="button"
                    onClick={handleDownload}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur"
                    title={t('common.download', '다운로드')}
                >
                    <Download size={20} />
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur"
                    title={t('common.close')}
                >
                    <X size={20} />
                </button>
            </div>
            <img
                src={src}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className="max-w-[95vw] max-h-[90vh] object-contain rounded shadow-2xl"
            />
        </div>
    );
};

export default ImageLightbox;
