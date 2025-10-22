import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SudokuStore } from '../../data/sudoku.store'

@Component({
  selector: 'app-solved',
  imports: [CommonModule],
  templateUrl: './solved.html',
  styleUrl: './solved.scss'
})
export class Solved {
  private store = inject(SudokuStore);
  private router = inject(Router);

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

  newPuzzle() {
    this.router.navigate(['/play']); /* open your new-puzzle flow if you like */
  }

  importBoard() {
    this.router.navigate(['/dashboard']); /* or a dedicated import route */
  }
}
