import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-number-pad',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './number-pad.html',
  styleUrl: './number-pad.scss'
})
export class NumberPad {
  store = inject(SudokuStore);
  digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  pressDigit(d: number) {
    const sel = this.store.selected();
    if (!sel) return;
    if (this.store.pencilMode()) {
      this.store.togglePencilDigit(sel.r, sel.c, d);
    } else {
      if (this.store.editingGivenMode()) {
        this.store.setCellValue(sel.r, sel.c, d as any, { asGiven: true });
      } else {
        this.store.setCellValue(sel.r, sel.c, d as any);
      }
    }
  }

  clear() {
    const sel = this.store.selected();
    if (!sel) return;
    this.store.clearCell(sel.r, sel.c);
  }

  togglePencil() {
    this.store.togglePencilMode();
  }
}
