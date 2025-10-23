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
import type { Bucket } from '../../data/sudoku.rater';

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
  resumables = computed(() => this.#store.getResumables());

  mmss(ms: number | null) { return this.#store.mmss(ms); }

  // ---- Actions ----
  async manualEntry() {
    if (this.#store.hasActiveCustom()) {
      const ok = window.confirm('Starting a new custom puzzle will erase your current custom game. Continue?');
      if (!ok) return;
      this.#store.clearActiveCustom();
    }
    this.#store.resetBoard();                 // blank board
    this.#store.beginCustomEntry('manual');   // set active custom & enter given mode
    this.#router.navigate(['/play']);
  }

  importCsv() {
    // You can also confirm overwrite here if desired
    this.#dialog.open(ImportDialog, { width: '520px', autoFocus: true });
  }

  importPhoto() {
    this.#dialog.open(ImageImport, {
      width: '960px', maxWidth: '96vw',
      height: 'min(92vh, 1100px)', maxHeight: '92vh',
      autoFocus: false, panelClass: ['photo-dialog']
    });
  }

  async generatePuzzle() {
    const ref = this.#dialog.open(NewPuzzleDialog, { width: '420px', autoFocus: true });
    const result = await ref.afterClosed().toPromise();
    if (!result) return;
    const { difficulty, symmetry } = result as { difficulty: Bucket; symmetry: 'central' | 'diagonal' | 'none' };

    // Overwrite protection (one slot per difficulty)
    if (this.#store.hasActiveGenerated(difficulty)) {
      const ok = window.confirm(`Starting a new ${difficulty} game will erase your current ${difficulty} game. Continue?`);
      if (!ok) return;
      this.#store.clearActiveGenerated(difficulty);
    }

    await this.#store.newPuzzle(difficulty, symmetry);
    this.#router.navigate(['/play']);
  }

  async resume(item: { key: any }) {
    if (item.key.kind === 'generated') {
      const ok = await this.#store.resumeGenerated(item.key.difficulty);
      if (ok) this.#router.navigate(['/play']);
    } else {
      const ok = await this.#store.resumeCustom();
      if (ok) this.#router.navigate(['/play']);
    }
  }
}
