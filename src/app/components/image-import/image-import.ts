import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Ocr, OcrResult } from '../../data/ocr';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-image-import',
  imports: [MatButtonModule, MatDialogModule, MatProgressBarModule, MatIconModule, MatDividerModule],
  templateUrl: './image-import.html',
  styleUrl: './image-import.scss'
})
export class ImageImport {
  #ocr = inject(Ocr);
  #store = inject(SudokuStore);
  #ref = inject(MatDialogRef<ImageImport, boolean>);

  busy = signal(false);
  result = signal<OcrResult | null>(null);

  rows = Array.from({ length: 9 }, (_, i) => i);
  cols = Array.from({ length: 9 }, (_, i) => i);

  fileName = '';

  takePhoto(input: HTMLInputElement) {
    // Some mobile browsers honor capture attribute only on programmatic click
    input.click();
  }

  onFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    this.fileName = file ? file.name : '';
    if (!file) return;

    this.busy.set(true);
    this.result.set(null);

    this.#ocr.process(file).then(res => {
      this.result.set(res);
      this.busy.set(false);

      // why: canvas is created by @if(result()); draw on next frame (no injection context needed)
      requestAnimationFrame(() => this.#drawPreviewAndOverlay());
    }).catch(err => {
      console.error('[Import] OCR failed', err);
      this.busy.set(false);
    });
  }

  #drawPreviewAndOverlay() {
    const res = this.result();
    if (!res) return;

    const cv = (window as any).cv as any;
    const canvas = document.getElementById('ocr-out') as HTMLCanvasElement | null;
    if (!canvas) return;

    const mat = res.preview ?? res.warped;
    if (mat) cv.imshow(canvas, mat);

    const ctx = canvas.getContext('2d')!;
    const cell = Math.floor(canvas.width / 9);
    ctx.save();
    ctx.font = '28px Roboto, Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const d = res.matrix[r][c];
        if (!d) continue;
        ctx.fillText(String(d), c * cell + cell / 2, r * cell + cell / 2);
      }
    }
    ctx.restore();
  }

  retry() { this.result.set(null); }

  import() {
    const m = this.result()?.matrix;
    if (!m) return;
    this.#store.loadFromMatrix(m);
    this.#ref.close(true);
  }
}
