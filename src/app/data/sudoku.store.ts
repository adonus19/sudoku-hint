import { Injectable, computed, signal } from '@angular/core';
import { Board, Digit, Coord } from './sudoku.types';
import { createEmptyBoard, setValue, clearValue, detectConflicts, parseBoardString, computeCandidates } from './sudoku.utils';
import { HintHighlight, HintResult } from '../hint/hint.types';

@Injectable({
  providedIn: 'root'
})
export class SudokuStore {
  // Signals
  private _board = signal<Board>(createEmptyBoard());
  private _selected = signal<Coord | null>(null);
  private _editingGivenMode = signal<boolean>(true);

  // Hint highlights
  private _hl = signal<HintHighlight | null>(null);

  board = this._board.asReadonly();
  selected = this._selected.asReadonly();
  editingGivenMode = this._editingGivenMode.asReadonly();
  highlight = this._hl.asReadonly();

  conflicts = computed(() => detectConflicts(this._board()));

  resetBoard() {
    this._board.set(createEmptyBoard());
    this._selected.set(null);
    this._editingGivenMode.set(true);
    this._hl.set(null);
  }

  toggleEditingGivenMode() {
    this._editingGivenMode.update(v => !v);
  }

  select(r: number, c: number) {
    this._selected.set({ r, c });
  }

  setCellValue(r: number, c: number, value: Digit, opts?: { asGiven?: boolean }) {
    const asGiven = opts?.asGiven ?? this._editingGivenMode();
    const current = this._board()[r][c];
    if (current.given && !asGiven) return;
    this._board.update(b => setValue(b, r, c, value, asGiven));
    this.recomputeCandidates();
  }

  clearCell(r: number, c: number) {
    const current = this._board()[r][c];
    if (current.given && !this._editingGivenMode()) return;
    this._board.update(b => clearValue(b, r, c));
    this.recomputeCandidates();
  }

  loadFromString(s: string) {
    const next = parseBoardString(s);
    this._board.set(next);
    this._selected.set({ r: 0, c: 0 });
    this._editingGivenMode.set(false);
    this.recomputeCandidates();
  }

  recomputeCandidates() {
    this._board.update(b => computeCandidates(b));
  }

  /** Clear all suppressed candidates (why: rebuild pencils from pure constraints) */
  resetPencils() {
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      suppressed: new Set<number>() // clear all
    })));
    this._board.set(next);
    this.recomputeCandidates();
  }

  // --- Hint highlight control ---
  setHighlights(h: HintHighlight | null) {
    this._hl.set(h);
  }

  clearHighlights() {
    this._hl.set(null);
  }

  // Apply hint result and refresh
  applyHint(h: HintResult) {
    console.log(h);
    this._board.update(b => h.apply(b));
    this.recomputeCandidates();
    this._hl.set(null);
    // keep selection on target for continuity
    this._selected.set({ r: h.target.r, c: h.target.c });
  }
}
