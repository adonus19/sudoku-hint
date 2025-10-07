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
  private _pencilMode = signal<boolean>(false);
  private _hl = signal<HintHighlight | null>(null);
  private _fullScreenBoard = signal<boolean>(false);

  board = this._board.asReadonly();
  selected = this._selected.asReadonly();
  editingGivenMode = this._editingGivenMode.asReadonly();
  pencilMode = this._pencilMode.asReadonly();
  highlight = this._hl.asReadonly();
  fullScreenBoard = this._fullScreenBoard.asReadonly();

  conflicts = computed(() => detectConflicts(this._board()));

  resetBoard() {
    this._board.set(createEmptyBoard());
    this._selected.set(null);
    this._editingGivenMode.set(true);
    this._pencilMode.set(false);
    this._hl.set(null);
  }

  toggleFullScreenBoard() {
    this._fullScreenBoard.update(v => !v);
  }

  toggleEditingGivenMode() {
    this._editingGivenMode.update(v => !v);
  }
  togglePencilMode() {
    this._pencilMode.update(v => !v);
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
    const cur = this._board()[r][c];
    if (cur.given && !this._editingGivenMode()) return;
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

  /** Clear all suppressed (and keep manual on? No: reset to pure calc) */
  resetPencils() {
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      suppressed: new Set<number>(),
      manualCands: new Set<number>()
    })));

    this._board.set(next);
    this.recomputeCandidates();
  }

  /** Toggle a pencil digit in selected cell */
  togglePencilDigit(r: number, c: number, d: number) {
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    })));
    const cell = next[r][c];
    if (cell.value) { this._board.set(next); return; }

    const isVisible = cell.candidates.has(d); // current visible state
    const isManual = cell.manualCands.has(d);

    if (isVisible) {
      if (isManual) {
        // visible via manual -> turn OFF
        cell.manualCands.delete(d);
        cell.suppressed.add(d);
      } else {
        // visible via auto -> first tap removes (suppress)
        cell.suppressed.add(d);
      }
    } else {
      // not visible -> turn ON manually
      cell.suppressed.delete(d);
      cell.manualCands.add(d);
    }

    this._board.set(computeCandidates(next));
  }

  togglePencilDigitIfEnabled(r: number, c: number, d: number, enabled: boolean) {
    if (!enabled) return;
    this.togglePencilDigit(r, c, d);
  }

  /** Clear all pencils for a cell (why: quick cleanup) */
  clearPencils(r: number, c: number) {
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    })));
    next[r][c].suppressed.clear();
    next[r][c].manualCands.clear();
    this._board.set(computeCandidates(next));
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

  loadFromMatrix(matrix: number[][]) {
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      value: 0 as Digit,
      given: false,
      candidates: new Set<number>(),
      suppressed: new Set<number>(),
      manualCands: new Set<number>()
    })));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = Number(matrix[r]?.[c] ?? 0);
      if (v >= 1 && v <= 9) {
        next[r][c].value = v as any;
        next[r][c].given = true;
      }
    }
    this._board.set(next);
    this._editingGivenMode.set(false);
    this.recomputeCandidates();
  }
}
