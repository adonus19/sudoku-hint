import { Component, inject, computed } from '@angular/core';
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

  leftovers = computed(() => {
    const placed = Array(10).fill(0);
    const b = this.store.board();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = b[r][c].value as number | 0;
      if (v >= 1 && v <= 9) placed[v]++;
    }
    const rem = Array(10).fill(0);
    for (let d = 1; d <= 9; d++) rem[d] = Math.max(0, 9 - placed[d]);
    return rem as ReadonlyArray<number>;
  });

  pressDigit(d: number) {
    if (!this.store.pencilMode() && this.isDigitExhausted(d)) return;
    const sel = this.store.selected();
    if (!sel) return;

    if (this.store.pencilMode()) {
      this.store.togglePencilDigitIfEnabled(sel.r, sel.c, d, true);
    } else {
      this.store.setCellValue(sel.r, sel.c, d as any, { asGiven: this.store.editingGivenMode() });
    }
  }

  isDigitExhausted(d: number): boolean {
    // exhausted means 0 remaining
    return this.leftovers()[d] === 0;
  }
}
