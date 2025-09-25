import { Injectable, computed, signal } from '@angular/core';
import { Board, Digit, Coord } from './sudoku.types';
import { createEmptyBoard, setValue, clearValue, detectConflicts } from './sudoku.utils';
import { parseBoardString } from './sudoku.utils';

@Injectable()
export class SudokuStore {
  // Signals
  private _board = signal<Board>(createEmptyBoard());
  private _selected = signal<Coord | null>(null);
  private _editingGivenMode = signal<boolean>(true); // why: distinguish initial givens vs user entries

  board = this._board.asReadonly();
  selected = this._selected.asReadonly();
  editingGivenMode = this._editingGivenMode.asReadonly();

  conflicts = computed(() => detectConflicts(this._board()));

  resetBoard() {
    this._board.set(createEmptyBoard());
    this._selected.set(null);
    this._editingGivenMode.set(true);
  }

  toggleEditingGivenMode() {
    this._editingGivenMode.update(v => !v);
  }

  select(r: number, c: number) {
    this._selected.set({ r, c });
  }

  setCellValue(r: number, c: number, value: Digit, opts?: { asGiven?: boolean }) {
    const asGiven = opts?.asGiven ?? this._editingGivenMode();
    // why: protect givens when not in initial-entry mode
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
    this._editingGivenMode.set(false); // switch to user mode after import
  }

  // Placeholder: will implement pencil marks in Step 4
  recomputeCandidates() {
    // no-op for Step 1
  }
}
