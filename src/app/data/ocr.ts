import { Injectable } from '@angular/core';
import Tesseract from 'tesseract.js';

export interface OcrResult {
  matrix: number[][];
  warped?: any; // cv.Mat for preview
  preview?: any;
}

@Injectable({
  providedIn: 'root'
})
export class Ocr {
  /** Main entry: returns 9x9 matrix; empty cells as 0 */
  async process(file: File): Promise<OcrResult> {
    console.groupCollapsed('[OCR] process start');
    console.time('[OCR] total');
    console.debug('[OCR] file:', file?.name, file?.type, file?.size, 'bytes');

    const img = await this.#fileToImage(file);
    const cv = (window as any).cv;

    const src = cv.imread(await this.#imageToCanvas(img));
    console.debug('[OCR] src size:', src.cols, 'x', src.rows);

    const gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    console.time('[OCR] detect+warp');
    const { quad, warped } = this.#detectAndWarp(gray);
    console.timeEnd('[OCR] detect+warp');
    if (quad) console.debug('[OCR] grid quad:', quad);
    else console.warn('[OCR] no grid quad found, falling back to naive split');

    const mat = warped ?? gray;

    const preview = new cv.Mat();
    mat.copyTo(preview);

    console.time('[OCR] split81');
    const cells = this.#split81(mat);
    console.timeEnd('[OCR] split81');

    // Tesseract init
    console.time('[OCR] tesseract init');
    const worker = await Tesseract.createWorker('eng', 1, { logger: (m) => console.debug('[OCR][tess]', m) });
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      classify_bln_numeric_mode: '1'
    });
    console.timeEnd('[OCR] tesseract init');

    const matrix: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    let nonZero = 0;
    console.time('[OCR] per-cell');
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c;
        const { digit, conf } = await this.#ocrDigit(worker, cells[idx]);
        matrix[r][c] = digit;
        if (digit) nonZero++;
        if (digit) console.debug(`[OCR] cell ${r},${c} = ${digit} (conf ${conf.toFixed(1)})`);
      }
    }
    console.timeEnd('[OCR] per-cell');

    await worker.terminate();
    src.delete(); gray.delete(); cells.forEach(m => m.delete());

    console.info('[OCR] digits detected:', nonZero, '/ 81');
    if (nonZero === 0) console.warn('[OCR] 0 digits detected. Check thresholding / font weight.');

    console.timeEnd('[OCR] total');
    console.groupEnd();

    return { matrix, warped, preview };
  }

  // ---- helpers ----

  async #fileToImage(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise(res => { img.onload = () => res(null); });
      return img;
    } finally { URL.revokeObjectURL(url); }
  }

  async #imageToCanvas(img: HTMLImageElement): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const maxSide = 1800; // why: keep OCR sharp but bounded
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  #detectAndWarp(gray: any): { quad: any | null, warped: any | null } {
    const cv = (window as any).cv;
    const blur = new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const edges = new cv.Mat(); cv.Canny(blur, edges, 50, 150);
    const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = 0, bestPoly: any = null;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = cv.contourArea(approx);
        if (area > bestArea) { bestArea = area; bestPoly = approx; } else { approx.delete(); }
      } else { approx.delete(); }
    }

    if (!bestPoly) {
      console.warn('[OCR] no 4-point contour found (Canny thresholds may be too strict)');
      blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
      return { quad: null, warped: null };
    }

    // order corners (top-left, top-right, bottom-right, bottom-left)
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push(bestPoly.intPtr(i, 0));
    const arr = [];
    for (let i = 0; i < 4; i++) {
      const p = bestPoly.data32S.slice(i * 2, i * 2 + 2); arr.push({ x: p[0], y: p[1] });
    }
    const tl = arr.reduce((p, q) => (q.x + q.y < p.x + p.y ? q : p));
    const br = arr.reduce((p, q) => (q.x + q.y > p.x + p.y ? q : p));
    const tr = arr.reduce((p, q) => (q.x - q.y > p.x - p.y ? q : p));
    const bl = arr.reduce((p, q) => (q.x - q.y < p.x - p.y ? q : p));

    const dstSize = 900;
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstSize, 0, dstSize, dstSize, 0, dstSize]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const warped = new cv.Mat();
    cv.warpPerspective(gray, warped, M, new cv.Size(dstSize, dstSize), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    blur.delete(); edges.delete(); contours.delete(); hierarchy.delete(); bestPoly.delete(); srcTri.delete(); dstTri.delete(); M.delete();
    return { quad: arr, warped };
  }

  #split81(mat: any): any[] {
    const cv = (window as any).cv as any;
    const size = mat.rows;
    const cell = Math.floor(size / 9);
    const cells: any[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const y = r * cell, x = c * cell;
        const roi = mat.roi(new cv.Rect(x + 6, y + 6, cell - 12, cell - 12)); // why: avoid grid lines (margin)
        console.log(roi.cols, roi.rows);
        cells.push(roi);
        // binarize
        // const th = new cv.Mat();
        // cv.adaptiveThreshold(roi, th, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
        // // clean small noise
        // const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
        // cv.morphologyEx(th, th, cv.MORPH_OPEN, kernel);
        // cells.push(th);
        // roi.delete(); kernel.delete();
      }
    }
    return cells;
  }

  async #ocrDigit(worker: any, cellMat: any): Promise<{ digit: number; conf: number }> {
    const cv = (window as any).cv;
    const contours = new cv.MatVector(), hierarchy = new cv.Mat();
    cv.findContours(cellMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best: any = null, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > bestArea) { bestArea = area; best = cnt; }
    }
    let crop = cellMat; // default
    if (best && bestArea > 30) {
      const rect = cv.boundingRect(best);
      crop = cellMat.roi(rect);
    }
    const resized = new cv.Mat();
    const up = 4;
    cv.resize(crop, resized, new cv.Size(crop.cols * up, crop.rows * up), 0, 0, cv.INTER_LINEAR);

    const canvas = document.createElement('canvas');
    canvas.width = resized.cols; canvas.height = resized.rows;
    cv.imshow(canvas, resized);

    const { data } = await worker.recognize(canvas);
    let digit = 0, conf = 0;
    for (const s of data.symbols || []) {
      const ch = s.text?.trim();
      if (/^[0-9]$/.test(ch) && s.confidence > conf) { conf = s.confidence; digit = Number(ch); }
    }

    if (crop !== cellMat) crop.delete();
    contours.delete(); hierarchy.delete(); resized.delete();

    // Lower the threshold a bit for screenshots (clean glyphs)
    const ok = conf >= 45;
    if (!ok && conf > 0) console.debug('[OCR] low conf symbol ignored:', { digit, conf });
    return { digit: ok ? digit : 0, conf };
  }

}
