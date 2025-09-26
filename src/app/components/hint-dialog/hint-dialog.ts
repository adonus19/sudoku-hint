import { Component, Inject, OnDestroy, inject, signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { HintResult } from '../../hint/hint.types';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-hint-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './hint-dialog.html',
  styleUrl: './hint-dialog.scss'
})
export class HintDialog {
  store = inject(SudokuStore);
  #ref = inject(MatDialogRef<HintDialog>);
  idx = signal(0);

  constructor(@Inject(MAT_DIALOG_DATA) public data: HintResult) {
    this.pushHighlight();
  }

  currentStep = computed(() => this.data.steps[this.idx()]);
  isLast = () => this.idx() >= this.data.steps.length - 1;

  next() {
    if (!this.isLast()) {
      this.idx.update(v => v + 1);
      this.pushHighlight();
    }
  }

  apply() {
    this.store.applyHint(this.data);
    this.#ref.close();
  }

  close() {
    this.store.clearHighlights();
    this.#ref.close();
  }

  private pushHighlight() {
    this.store.setHighlights(this.currentStep().highlight || null);
  }
}
