/**
 * Local OCR for chord charts: Tesseract (runs in the browser; the ~15 MB model is fetched once and cached)
 * and pdf.js for PDF pages. Nothing leaves the device.
 */
import type { OcrWord } from '@shed/theory';

export interface Page { canvas: HTMLCanvasElement; width: number; height: number }

/**
 * A PDF opened but not yet rendered.
 *
 * A fake book is four hundred pages and fifty megabytes; rendering it up front is not an option,
 * and rendering only the first few makes it useless. Pages come out one at a time, on demand.
 */
export interface PageSource {
  numPages: number;
  /** 1-based */
  render(index: number): Promise<Page>;
  destroy(): void;
}

export async function openPages(file: File): Promise<PageSource> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;
    return {
      numPages: doc.numPages,
      async render(index: number): Promise<Page> {
        const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, index)));
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
        return { canvas, width: canvas.width, height: canvas.height };
      },
      destroy() { void task.destroy(); },
    };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const page: Page = { canvas, width: canvas.width, height: canvas.height };
  return { numPages: 1, render: async () => page, destroy() { /* nothing to free */ } };
}

/** Light pre-processing helps Tesseract on phone photos: grayscale + contrast stretch. */
export function preprocess(page: Page): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = page.width; c.height = page.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(page.canvas, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) { const g = (d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11); d[i] = d[i + 1] = d[i + 2] = g; if (g < min) min = g; if (g > max) max = g; }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) { const v = ((d[i]! - min) / range) * 255; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function ocrPage(page: Page, onProgress?: (p: number) => void): Promise<OcrWord[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); } });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const res = await worker.recognize(preprocess(page), {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const b of res.data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
      words.push({ text: w.text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, confidence: w.confidence });
    }
    return words;
  } finally {
    await worker.terminate();
  }
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85));
}
