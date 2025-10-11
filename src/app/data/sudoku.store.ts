import { Injectable, computed, signal } from '@angular/core';
import { Board, Digit, Coord } from './sudoku.types';
import { createEmptyBoard, setValue, clearValue, detectConflicts, parseBoardString, computeCandidates } from './sudoku.utils';
import { HintHighlight, HintResult } from '../hint/hint.types';
import { solveSudoku } from './sudoku.solver';
import { generatePuzzle } from './sudoku.generator';
import type { Difficulty } from '../components/new-puzzle-dialog/new-puzzle-dialog';
import { DifficultyRating, ratePuzzle } from './sudoku.rater';

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
  private _solution = signal<number[][] | null>(null);
  private _busy = signal<boolean>(false);
  private _rating = signal<DifficultyRating | null>(null);
  private _reveal = signal<boolean>(false);
  private _flashes = signal<Array<{ kind: 'row' | 'col' | 'box'; index: number; origin: Coord }>>([]);
  private _win = signal<Coord | null>(null);

  private _pool = new Map<Difficulty, Array<{ board: Board; rating: DifficultyRating }>>(); // small pregen cache
  private _recentHashes = signal<Record<Difficulty, string[]>>(
    (() => {
      try { return JSON.parse(localStorage.getItem('sdk_recent_hashes') || '{}'); }
      catch { return {}; }
    })() as any
  );

  private _worker: Worker | null = null;

  board = this._board.asReadonly();
  selected = this._selected.asReadonly();
  editingGivenMode = this._editingGivenMode.asReadonly();
  pencilMode = this._pencilMode.asReadonly();
  highlight = this._hl.asReadonly();
  fullScreenBoard = this._fullScreenBoard.asReadonly();

  conflicts = computed(() => detectConflicts(this._board()));
  solution = this._solution.asReadonly();
  busy = this._busy.asReadonly();
  rating = this._rating.asReadonly();
  reveal = this._reveal.asReadonly();
  flashes = this._flashes.asReadonly();
  win = this._win.asReadonly();

  resetBoard() {
    this._board.set(createEmptyBoard());
    this._selected.set(null);
    this._editingGivenMode.set(true);
    this._pencilMode.set(false);
    this._hl.set(null);
    this._solution.set(null);
  }

  toggleFullScreenBoard() {
    this._fullScreenBoard.update(v => !v);
  }

  toggleEditingGivenMode() {
    this._editingGivenMode.update(v => !v);
    if (!this._editingGivenMode()) {
      this.computeSolutionFromGivens?.();
      this._rating.set(null);
      this.rateCurrentBoard(); // stays on main thread for user boards
    } else {
      this._solution?.set(null);
      this._rating.set(null);
    }
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
    const wasEmpty = current.value === 0; // <-- add
    if (current.given && !asGiven) return;
    this._board.update(b => setValue(b, r, c, value, asGiven));
    this.recomputeCandidates();

    if (!this._editingGivenMode() && wasEmpty) {
      if (this.isSolvedBoard()) {
        // NEW: ensure win ripple takes precedence
        this._flashes?.set?.([]);          // clear any running row/col/box flashes
        this.triggerWinRipple(r, c);       // fire win ripple (no unit flash)
      } else {
        this.triggerUnitFlash(r, c);       // normal unit flash
      }
    }
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
    this.computeSolutionFromGivens();
    this._rating.set(null);
    this.rateCurrentBoard();
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
    this.computeSolutionFromGivens();
  }

  isErrorCell(r: number, c: number): boolean {
    if (this._editingGivenMode()) return false;

    const sol = this._solution();
    if (!sol) return false;

    const cell = this._board()[r][c];
    if (cell.given || !cell.value) return false;

    return cell.value !== sol[r][c];
  }

  async newPuzzle(difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium', symmetry: 'central' | 'diagonal' | 'none' = 'central') {
    if (this._busy()) return;
    this._busy.set(true);
    try {
      await this.nextFrame();

      // was: const board = await this.getFromPoolOrGenerateAsync(...)
      const { board, rating } = await this.getFromPoolOrGenerateAsync(difficulty, symmetry);

      this._board.set(board);
      this._selected.set({ r: 0, c: 0 });
      this._editingGivenMode.set(false);
      this._hl.set(null);
      this._solution.set(null);
      this.recomputeCandidates();
      this.computeSolutionFromGivens?.();

      // set rating from worker
      this._rating.set(rating);

      setTimeout(() => this.prewarmCache?.(difficulty, symmetry), 0);
    } finally {
      this._busy.set(false);
    }
    this.triggerReveal();
  }

  /** Pre-generate a few puzzles per difficulty to make "New" feel instant */
  prewarmCache(difficulty: Difficulty, symmetry: 'central' | 'diagonal' | 'none') {
    const targetSize = 3;
    const list = this._pool.get(difficulty) ?? [];
    if (list.length >= targetSize) return;

    const need = targetSize - list.length;
    let produced = 0;

    const step = async () => {
      if (produced >= need) { this._pool.set(difficulty, list); return; }
      try {
        const { board, rating } = await this.genInWorker(difficulty, symmetry);
        const h = this.puzzleHash(board);
        if (!this.isRecent(difficulty, h) && !list.some(x => this.puzzleHash(x.board) === h)) {
          list.push({ board, rating });
          produced++;
        }
      } catch { }
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  rateCurrentBoard() {
    // rating is synchronous; offload a tick to keep UI snappy
    setTimeout(() => this._rating.set(ratePuzzle(this._board())), 0);
  }

  flashActive(): boolean {
    return this._flashes().length > 0;
  }

  private puzzleHash(b: Board): string {
    let s = '';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) s += (b[r][c].value || 0);
    return s;
  }

  // keep recent hashes bounded (e.g., 50 per difficulty)
  private pushRecent(d: Difficulty, hash: string) {
    const cur = { ...(this._recentHashes() as any) } as Record<Difficulty, string[]>;
    const list = (cur[d] ?? []).filter(h => h !== hash);
    list.unshift(hash);
    while (list.length > 50) list.pop();
    cur[d] = list;
    this._recentHashes.set(cur);
    try { localStorage.setItem('sdk_recent_hashes', JSON.stringify(cur)); } catch { }
  }

  private isRecent(d: Difficulty, hash: string) {
    const cur = this._recentHashes();
    return (cur?.[d] ?? []).includes(hash);
  }

  private computeSolutionFromGivens() {
    const givensOnly = this._board().map(row => row.map(cell => ({
      ...cell,
      value: cell.given ? cell.value : 0 as Digit,
      candidates: new Set<number>(),
      suppressed: new Set<number>(),
      manualCands: new Set<number>()
    }))) as Board;

    const solved = solveSudoku(givensOnly);
    this._solution.set(solved);
  }

  private triggerReveal(ms = 900) {
    this._reveal.set(true);
    setTimeout(() => this._reveal.set(false), ms);
  }

  private isRowComplete(r: number) {
    return this._board()[r].every(c => !!c.value);
  }

  private isColComplete(c: number) {
    return this._board().every(row => !!row[c].value);
  }

  private isBoxComplete(b: number) {
    const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) if (!this._board()[r][c].value) return false;
    return true;
  }

  private boxIndex(r: number, c: number) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
  }

  private triggerUnitFlash(r: number, c: number) {
    const box = this.boxIndex(r, c);
    const fs: Array<{ kind: 'row' | 'col' | 'box'; index: number; origin: Coord }> = [];
    if (this.isRowComplete(r)) fs.push({ kind: 'row', index: r, origin: { r, c } });
    if (this.isColComplete(c)) fs.push({ kind: 'col', index: c, origin: { r, c } });
    if (this.isBoxComplete(box)) fs.push({ kind: 'box', index: box, origin: { r, c } });

    if (!fs.length) return;
    this._flashes.set(fs);              // set all at once
    setTimeout(() => this._flashes.set([]), 700);
  }

  private nextFrame(): Promise<void> {
    return new Promise(res => requestAnimationFrame(() => res()));
  }

  private getWorker(): Worker {
    if (this._worker) return this._worker;
    this._worker = new Worker(new URL('../workers/sudoku.worker.ts', import.meta.url), { type: 'module' });
    return this._worker;
  }

  private genInWorker(d: Difficulty, sym: 'central' | 'diagonal' | 'none'): Promise<{ board: Board; rating: DifficultyRating }> {
    return new Promise((resolve, reject) => {
      const w = this.getWorker();
      const onMessage = (e: MessageEvent<{ board: Board; rating: DifficultyRating }>) => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        resolve(e.data);
      };
      const onError = (err: any) => { /* ...same as before... */ };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage({ type: 'generate', difficulty: d, symmetry: sym });
    });
  }

  private async getFromPoolOrGenerateAsync(d: Difficulty, sym: 'central' | 'diagonal' | 'none'):
    Promise<{ board: Board; rating: DifficultyRating }> {

    const list = this._pool.get(d) ?? [];
    while (list.length) {
      const item = list.shift()!;
      const h = this.puzzleHash(item.board);
      if (!this.isRecent(d, h)) {
        this._pool.set(d, list);
        this.pushRecent(d, h);
        return item; // { board, rating }
      }
    }

    for (let tries = 0; tries < 6; tries++) {
      const { board, rating } = await this.genInWorker(d, sym);
      const h = this.puzzleHash(board);
      if (!this.isRecent(d, h)) {
        this.pushRecent(d, h);
        return { board, rating };
      }
      await this.nextFrame();
    }

    const { board, rating } = await this.genInWorker(d, sym);
    this.pushRecent(d, this.puzzleHash(board));
    return { board, rating };
  }

  // helper: is board fully filled (after a move)
  private isSolvedBoard(): boolean {
    const b = this._board();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!b[r][c].value) return false;
    return true;
  }

  // NEW: full puzzle ripple
  private triggerWinRipple(r: number, c: number) {
    this._flashes?.set?.([]);            // ensure no competing overlays
    this._win.set({ r, c });
    setTimeout(() => this._win.set(null), 900);
  }
}
