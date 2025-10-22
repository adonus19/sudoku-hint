import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { SudokuStore } from '../../data/sudoku.store';
import { ImportDialog } from '../import-dialog/import-dialog';
import { ImageImport } from '../image-import/image-import';
import { NewPuzzleDialog } from '../new-puzzle-dialog/new-puzzle-dialog';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatDialogModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  #router = inject(Router);
  #dialog = inject(MatDialog);
  #store = inject(SudokuStore);

  byDiff = this.#store.statsByDifficulty;
  total = this.#store.lifetimeStats;

  mmss(ms: number | null) {
    return this.#store.mmss(ms);
  }

  manualEntry() {
    // clear board and enter Given mode for user input
    this.#store.resetBoard();
    // ensure we remain in given mode to set givens
    // (resetBoard() already sets editingGivenMode=true in your store)
    this.#router.navigate(['/play']);
  }

  importCsv() {
    this.#dialog.open(ImportDialog, { width: '520px', autoFocus: true });
  }

  importPhoto() {
    this.#dialog.open(ImageImport, { width: '960px', maxWidth: '96vw', height: 'min(92vh, 1100px)', maxHeight: '92vh', autoFocus: false, panelClass: ['photo-dialog'] });
  }

  async generatePuzzle() {
    // let user pick difficulty in your existing dialog, then start the game
    const ref = this.#dialog.open(NewPuzzleDialog, { width: '420px', autoFocus: true });
    const result = await ref.afterClosed().toPromise();
    if (!result) return; // user cancelled
    const { difficulty, symmetry } = result; // depends on your dialog's return shape
    await this.#store.newPuzzle(difficulty, symmetry);
    this.#router.navigate(['/play']);
  }
}
