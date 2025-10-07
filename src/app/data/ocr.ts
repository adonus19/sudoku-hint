import { Injectable } from '@angular/core';
import Tesseract from 'tesseract.js';
import { createWorker, PSM } from 'tesseract.js';

export interface OcrResult {
  matrix: number[][];
  warped?: any; // cv.Mat for preview
  preview?: any;
}

@Injectable({
  providedIn: 'root'
})
export class Ocr {
  #cvReadyPromise: Promise<void> | null = null;
  #minDigitAreaRatio = 0.01; // relative to cell area

  /** Main entry: returns 9x9 matrix; empty cells as 0 */
  async process(file: File): Promise<OcrResult> {
    await this.#cvReady();
    const cv = (window as any).cv;

    const img = await this.#fileToImage(file);
    const src = cv.imread(await this.#imageToCanvas(img));
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);


    // Detect & warp to a square (fallback to original gray if not found)
    const { warped } = this.#detectAndWarp(gray);
    const mat = warped ?? gray;

    // Keep preview (do NOT delete this mat)
    const preview = new cv.Mat();
    mat.copyTo(preview);

    // Cut 9x9 cells and preprocess each into a Tesseract-friendly tile
    const cells = this.#splitAndPreprocess(mat);

    // Tesseract worker
    const worker = await Tesseract.createWorker('eng', 1);
    await worker.setParameters({
      // why: sudoku cells contain a single glyph
      tessedit_pageseg_mode: PSM.SINGLE_CHAR, // PSM_SINGLE_CHAR = 10
      tessedit_char_whitelist: '123456789',
      classify_bln_numeric_mode: '1',
      user_defined_dpi: '300'
    });

    const matrix: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const tile = cells[r * 9 + c];
        let digit = 0;

        if (tile) {
          const canvas = document.createElement('canvas');
          canvas.width = tile.cols;
          canvas.height = tile.rows;
          cv.imshow(canvas, tile);

          const { data } = await worker.recognize(canvas);
          const text = (data?.text ?? '').replace(/\s+/g, '').trim();

          // prefer text; fallback to best symbol by confidence
          if (/^[1-9]$/.test(text)) {
            digit = Number(text);
          } else if ((data as any)?.symbols?.length) {
            const best = (data as any).symbols
              .filter((s: any) => /^[1-9]$/.test(s.text?.trim?.() ?? ''))
              .sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
            if (best) digit = Number(best.text.trim());
          }
          tile.delete();
        }
        matrix[r][c] = digit;
      }
    }

    await worker.terminate();

    // cleanup
    src.delete();
    if (warped) warped.delete();
    gray.delete();
    return { matrix, warped, preview };
  }

  // ---- helpers ----

  async #fileToImage(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = (e) => rej(e); });
      return img;
    } finally { URL.revokeObjectURL(url); }
  }

  async #imageToCanvas(img: HTMLImageElement): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  #detectAndWarp(gray: any): { warped: any | null } {
    const cv = (window as any).cv;
    const blur = new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const edges = new cv.Mat(); cv.Canny(blur, edges, 50, 200);
    const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = 0, bestPoly: any = null;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat(); cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = cv.contourArea(approx);
        if (area > bestArea) { if (bestPoly) bestPoly.delete(); bestPoly = approx; bestArea = area; }
        else approx.delete();
      } else approx.delete();
    }

    if (!bestPoly) {
      blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
      return { warped: null };
    }

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = bestPoly.data32S.slice(i * 2, i * 2 + 2); pts.push({ x, y });
    }
    const tl = pts.reduce((p, q) => (q.x + q.y < p.x + p.y ? q : p));
    const br = pts.reduce((p, q) => (q.x + q.y > p.x + p.y ? q : p));
    const tr = pts.reduce((p, q) => (q.x - q.y > p.x - p.y ? q : p));
    const bl = pts.reduce((p, q) => (q.x - q.y < p.x - p.y ? q : p));

    const dstSize = 900;
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstSize, 0, dstSize, dstSize, 0, dstSize]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const warped = new cv.Mat();
    cv.warpPerspective(gray, warped, M, new cv.Size(dstSize, dstSize), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
    bestPoly.delete(); srcTri.delete(); dstTri.delete(); M.delete();
    return { warped };
  }

  async #cvReady(): Promise<void> {
    if ((window as any).cv?.Mat) return;
    if (!this.#cvReadyPromise) {
      this.#cvReadyPromise = new Promise<void>((resolve) => {
        const w = window as any;
        const tryResolve = () => {
          if (w.cv?.Mat) return resolve();
          if (w.cv?.onRuntimeInitialized) {
            w.cv.onRuntimeInitialized = () => resolve();
          } else setTimeout(tryResolve, 20);
        };
        tryResolve();
      });
    }
    return this.#cvReadyPromise;
  }

  #splitAndPreprocess(mat: any): any[] {
    const cv = (window as any).cv as any;
    const size = mat.rows;
    const cell = Math.floor(size / 9);
    const tiles: Array<any | null> = [];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const y = r * cell, x = c * cell;
        const roi = mat.roi(new cv.Rect(x + 6, y + 6, cell - 12, cell - 12));

        const den = new cv.Mat(); cv.medianBlur(roi, den, 3);
        cv.equalizeHist(den, den);

        // Pass A: Otsu (black digits on white)
        const binA = new cv.Mat(); cv.threshold(den, binA, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
        const { crop: cropA, areaRatio: arA } = this.#largestComponent(binA);

        // Pass B: Adaptive inverse (handles glare/soft digits)
        const binB = new cv.Mat(); cv.adaptiveThreshold(den, binB, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 2);
        const invB = new cv.Mat(); cv.bitwise_not(binB, invB); // to keep black digit on white
        const { crop: cropB, areaRatio: arB } = this.#largestComponent(invB);

        const chosen = arA >= arB ? cropA : cropB;
        const chosenAR = Math.max(arA, arB);

        let tile: any | null = null;
        if (chosen && chosenAR >= this.#minDigitAreaRatio) {
          tile = this.#toSquareWhite(chosen, 30);
        }

        tiles.push(tile);

        roi.delete(); den.delete();
        binA.delete(); binB.delete(); invB.delete();
        if (cropA && cropA !== binA) cropA.delete();
        if (cropB && cropB !== invB) cropB.delete();
      }
    }
    return tiles;
  }

  #largestComponent(binWhiteBg: any): { crop: any | null; areaRatio: number } {
    // expects white background, black glyph
    const cv = (window as any).cv as any;
    const inv = new cv.Mat(); cv.bitwise_not(binWhiteBg, inv); // glyph white
    const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
    cv.findContours(inv, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let crop: any | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const a = cv.contourArea(contours.get(i));
      if (a > bestArea) bestArea = a;
    }
    if (bestArea > 0) {
      let bestIdx = 0;
      for (let i = 0; i < contours.size(); i++) {
        if (cv.contourArea(contours.get(i)) === bestArea) { bestIdx = i; break; }
      }
      const rect = cv.boundingRect(contours.get(bestIdx));
      rect.x = Math.max(0, rect.x - 2);
      rect.y = Math.max(0, rect.y - 2);
      rect.width = Math.min(binWhiteBg.cols - rect.x, rect.width + 4);
      rect.height = Math.min(binWhiteBg.rows - rect.y, rect.height + 4);
      crop = binWhiteBg.roi(rect);
    }

    const ar = bestArea / (binWhiteBg.cols * binWhiteBg.rows);
    inv.delete(); contours.delete(); hierarchy.delete();
    return { crop, areaRatio: ar };
  }

  #toSquareWhite(src: any, target = 128): any {
    const cv = (window as any).cv as any;
    const s = Math.max(src.cols, src.rows);
    const white = new cv.Mat(s, s, cv.CV_8UC1, new cv.Scalar(255));
    const roi = white.roi(new cv.Rect(Math.floor((s - src.cols) / 2), Math.floor((s - src.rows) / 2), src.cols, src.rows));
    src.copyTo(roi); roi.delete();
    const dst = new cv.Mat(); cv.resize(white, dst, new cv.Size(target, target), 0, 0, cv.INTER_LINEAR);
    white.delete();
    return dst;
  }

}
