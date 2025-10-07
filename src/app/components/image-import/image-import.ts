import { Component, effect, inject, signal } from '@angular/core';
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
    const f = (ev.target as HTMLInputElement).files?.[0];
    this.fileName = f ? f.name : '';
    console.log('Selected file:', this.fileName);

    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.busy.set(true);
    this.result.set(null);
    this.#ocr.process(file).then(res => {
      this.result.set(res);
      this.busy.set(false);

      const canvas = document.getElementById('ocr-out') as HTMLCanvasElement;
      if (res?.preview) {
        const cv = (window as any).cv as any;
        cv.imshow(canvas, res.preview); // why: quick preview for user validation
      } else {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '20px Arial';
        ctx.fillText('No preview available', 10, 50);
      }

      // paint warped preview
      // if (res?.warped) {
      //   const cv = (window as any).cv as any;
      //   const mat = res.warped as any;
      //   const canvas = document.getElementById('ocr-out') as HTMLCanvasElement;
      //   cv.imshow(canvas, mat); // why: quick preview for user validation
      // }
    }).catch(() => this.busy.set(false));
  }

  retry() { this.result.set(null); }

  import() {
    const m = this.result()?.matrix;
    if (!m) return;
    this.#store.loadFromMatrix(m);
    this.#ref.close(true);
  }
}
