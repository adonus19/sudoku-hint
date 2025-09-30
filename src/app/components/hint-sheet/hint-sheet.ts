import { Component, Inject, inject, signal, computed } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { HintResult } from '../../hint/hint.types';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-hint-sheet',
  imports: [MatBottomSheetModule, MatButtonModule],
  templateUrl: './hint-sheet.html',
  styleUrl: './hint-sheet.scss'
})
export class HintSheet {
  store = inject(SudokuStore);
  #ref = inject(MatBottomSheetRef<HintSheet>);
  idx = signal(0);

  constructor(@Inject(MAT_BOTTOM_SHEET_DATA) public data: HintResult) { this.pushHighlight(); }

  currentStep = computed(() => this.data.steps[this.idx()]);
  isLast = () => this.idx() >= this.data.steps.length - 1;

  next() { if (!this.isLast()) { this.idx.update(v => v + 1); this.pushHighlight(); } }
  apply() { this.store.applyHint(this.data); this.#ref.dismiss(); }
  close() { this.store.clearHighlights(); this.#ref.dismiss(); }

  private pushHighlight() { this.store.setHighlights(this.currentStep().highlight || null); }
}
