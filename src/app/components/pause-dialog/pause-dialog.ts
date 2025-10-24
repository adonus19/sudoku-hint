import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-pause-dialog',
  imports: [CommonModule, MatButtonModule],
  templateUrl: './pause-dialog.html',
  styleUrl: './pause-dialog.scss'
})
export class PauseDialog {
  private store = inject(SudokuStore);
  private ref = inject(MatDialogRef<PauseDialog>);
  stats = this.store.gameStats;

  resume() {
    this.store.resumeGame();
    this.ref.close('resume');
  }

  quit() {
    // leave paused; let the caller route away
    this.ref.close('quit');
  }
}
