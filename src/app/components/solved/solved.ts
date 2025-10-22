import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SudokuStore } from '../../data/sudoku.store'
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { NewPuzzleDialog } from '../new-puzzle-dialog/new-puzzle-dialog'; // adjust path if needed

@Component({
  selector: 'app-solved',
  imports: [CommonModule],
  templateUrl: './solved.html',
  styleUrl: './solved.scss'
})
export class Solved {
  private store = inject(SudokuStore);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  stats = computed(() => this.store.lastSolved() ?? {
    difficulty: 'easy',
    timeMs: 0,
    score: 0,
    mistakes: 0,
    mistakePoints: 0,
    hintsUsed: 0,
    hintTechniques: [] as string[],
    newBest: false
  });

  mmss(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  toDashboard() {
    this.router.navigate(['/dashboard']);
  }

  async newPuzzle() {
    const ref = this.dialog.open(NewPuzzleDialog, { width: '360px', autoFocus: false });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;                           // user cancelled
    await this.store.newPuzzle(result.difficulty, result.symmetry);
    this.router.navigate(['/play']);               // go straight into play
  }

  importBoard() {
    // if you have a dedicated route, use that; otherwise open Dashboard import pane
    this.router.navigate(['/dashboard'], { queryParams: { open: 'import' } });
  }

  manualEntry() {
    this.store.resetBoard();
    this.store.enterGivenMode();          // stay in Given mode for typing
    this.router.navigate(['/play']);      // open the board in entry mode
  }
}
