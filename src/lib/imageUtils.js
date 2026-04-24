// Client-side image resize + WebP conversion helper.
// Takes a File (png/jpeg/gif/bmp/webp/...) and returns a Blob encoded as
// image/webp, shrunk so the longest side <= maxDim.

export async function compressImageToWebp(file, { maxDim = 1280, quality = 0.82 } = {}) {
    if (!file || !file.type?.startsWith('image/')) {
        throw new Error('Not an image file');
    }

    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);

    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDim);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!blob) throw new Error('Failed to encode image');

    return { blob, width, height };
}

function fitWithin(w, h, maxDim) {
    if (w <= maxDim && h <= maxDim) return { width: w, height: h };
    const ratio = w >= h ? maxDim / w : maxDim / h;
    return {
        width: Math.round(w * ratio),
        height: Math.round(h * ratio),
    };
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
