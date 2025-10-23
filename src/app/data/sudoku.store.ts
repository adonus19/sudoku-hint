import { Injectable, computed, signal, effect } from '@angular/core';
import { Board, Digit, Coord, Cell } from './sudoku.types';
import { createEmptyBoard, setValue, clearValue, detectConflicts, parseBoardString, computeCandidates } from './sudoku.utils';
import { HintHighlight, HintResult } from '../hint/hint.types';
import { solveSudoku } from './sudoku.solver';
import type { Bucket } from './sudoku.rater';
import type { Difficulty } from '../components/new-puzzle-dialog/new-puzzle-dialog';
import { DifficultyRating, ratePuzzle } from './sudoku.rater';

type UndoEntry = {
  r: number; c: number;
  before: { value: Digit; given: boolean; suppressed: Set<number>; manualCands: Set<number> };
  after: { value: Digit; given: boolean; suppressed: Set<number>; manualCands: Set<number> };
  scoreDelta: number; // what we applied when doing the action (e.g. -50 for a wrong entry)
};

function emptyStats(): Record<Bucket, DiffStats> {
  return {
    easy: { solved: 0, bestTimeMs: null, bestScore: null, totalScore: 0, totalHints: 0, totalMistakes: 0, totalMistakePoints: 0, techniques: new Set() },
    medium: { solved: 0, bestTimeMs: null, bestScore: null, totalScore: 0, totalHints: 0, totalMistakes: 0, totalMistakePoints: 0, techniques: new Set() },
    hard: { solved: 0, bestTimeMs: null, bestScore: null, totalScore: 0, totalHints: 0, totalMistakes: 0, totalMistakePoints: 0, techniques: new Set() },
    expert: { solved: 0, bestTimeMs: null, bestScore: null, totalScore: 0, totalHints: 0, totalMistakes: 0, totalMistakePoints: 0, techniques: new Set() },
  };
}

type DiffStats = {
  solved: number;
  bestTimeMs: number | null;
  bestScore: number | null;
  totalScore: number;
  totalHints: number;
  totalMistakes: number;
  totalMistakePoints: number;
  techniques: Set<string>;
};

export type ActiveKey =
  | { kind: 'generated'; difficulty: Bucket }
  | { kind: 'custom'; origin?: 'manual' | 'csv' | 'photo' };

type GameSnapshot = {
  key: ActiveKey;
  board: any;                      // serialized board (sets -> arrays)
  selected: Coord | null;
  editingGiven: boolean;
  pencilMode: boolean;
  timerSec: number;
  score: number;
  difficulty: Bucket;
  solution: number[][] | null;
  rating: DifficultyRating | null;
  savedAt: number;
};

type ActiveStore = {
  active: ActiveKey | null;
  generated: Partial<Record<Bucket, GameSnapshot | null>>;
  custom: (GameSnapshot & { key: { kind: 'custom'; origin?: 'manual' | 'csv' | 'photo' } }) | null;
};

export interface ResumableItem {
  key: ActiveKey;
  label: string;
  progress: number;
  savedAt: number;
  rating?: DifficultyRating | null;
}

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
  private _history: Board[] = [];
  private _worker: Worker | null = null;
  private _hintsUsed = signal<number>(0);
  private _hintTechniques = signal<Set<string>>(new Set<string>());
  private _mistakes = signal<number>(0);
  private _mistakePoints = signal<number>(0);
  private _stats = signal<Record<Bucket, DiffStats>>(emptyStats());

  // difficulty context (for multiplier)
  private _currentDifficulty = signal<Difficulty>('easy');

  // ----- timer & score -----
  private _timerSec = signal<number>(0);
  private _timerId: any = null;

  // ---- score (raw vs shown for animation) ----
  private _scoreRaw = signal<number>(0);
  private _scoreShown = signal<number>(0);
  private _scoreBumping = signal<boolean>(false);
  private _scored = new Set<string>(); // cells already rewarded "r,c"

  // little “+95 / -50” floaters
  private _floaters = signal<Array<{ id: number; r: number; c: number; text: string }>>([]);
  private _floaterId = 0;

  private _undo: UndoEntry[] = [];
  private readonly _undoLimit = 3;

  private _pool = new Map<Difficulty, Array<{ board: Board; rating: DifficultyRating }>>(); // small pregen cache
  private _recentHashes = signal<Record<Difficulty, string[]>>(
    (() => {
      try { return JSON.parse(localStorage.getItem('sdk_recent_hashes') || '{}'); }
      catch { return {}; }
    })() as any
  );

  private _lastSolved = signal<{
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    timeMs: number;
    score: number;
    mistakes: number;
    mistakePoints: number;
    hintsUsed: number;
    hintTechniques: string[];
    newBest: boolean;
  } | null>(null);

  private readonly ACTIVE_KEY = 'sdk_active_games_v1';
  private _activeKey = signal<ActiveKey | null>(null);
  private _saveDebounce: any = null;
  private _activeStore: ActiveStore = { active: null, generated: {}, custom: null };

  private readonly STATS_KEY = 'sdk_stats_v1';



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

  // HUD
  score = computed(() => this._scoreShown());
  timerLabel = computed(() => {
    const s = this._timerSec();
    const m = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  });

  scoreBump = computed(() => this._scoreBumping());
  floaters = this._floaters.asReadonly();
  lastSolved = this._lastSolved.asReadonly();

  statsByDifficulty = computed(() => {
    const s = this._stats();
    const toPlain = (d: DiffStats) => ({
      ...d,
      techniques: Array.from(d.techniques).sort()
    });
    return {
      easy: toPlain(s.easy),
      medium: toPlain(s.medium),
      hard: toPlain(s.hard),
      expert: toPlain(s.expert),
    };
  });

  lifetimeStats = computed(() => {
    const s = this._stats();
    const sum = <K extends keyof DiffStats>(k: K) =>
      (s.easy[k] as any ?? 0) + (s.medium[k] as any ?? 0) + (s.hard[k] as any ?? 0) + (s.expert[k] as any ?? 0);

    return {
      solved: sum('solved'),
      totalScore: sum('totalScore'),
      totalHints: sum('totalHints'),
      totalMistakes: sum('totalMistakes'),
      totalMistakePoints: sum('totalMistakePoints'),
    };
  });

  constructor() {
    // hydrate from localStorage (if present)
    this._activeStore = this.loadActiveStore();

    effect(() => {
      const key = this._activeKey();
      // track dependencies
      const _b = this._board();
      const _sel = this._selected();
      const _eg = this._editingGivenMode();
      const _pm = this._pencilMode();
      const _t = this._timerSec();
      const _sc = this._scoreRaw();
      const _sol = this._solution();
      const _rate = this._rating();
      const _diff = this._currentDifficulty();

      if (!key) return;
      // debounce writes so we don’t hammer localStorage every second
      clearTimeout(this._saveDebounce);
      this._saveDebounce = setTimeout(() => this.persistActive(key), 250);
    });

    try {
      const raw = localStorage.getItem(this.STATS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const s = this.deserializeStats(parsed);
        if (s) this._stats.set(s);
      }
    } catch { /* ignore */ }

    // autosave whenever stats change
    effect(() => {
      const snapshot = this._stats(); // track signal
      try {
        localStorage.setItem(this.STATS_KEY, JSON.stringify(this.serializeStats(snapshot)));
      } catch { /* ignore quota/private mode */ }
    });
  }

  clearAllStats() {
    this._stats.set(emptyStats());
    try { localStorage.removeItem(this.STATS_KEY); } catch { }
  }

  mmss = (ms: number | null) => {
    if (ms == null) return '—';
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  resetBoard() {
    this._board.set(createEmptyBoard());
    this._selected.set(null);
    this._editingGivenMode.set(true);
    this._pencilMode.set(false);
    this._hl.set(null);
    this._solution.set(null);
    this.resetTimer();
    this._scoreRaw.set(0);
    this._scoreShown.set(0);
    this._scored.clear();
    this._undo = [];
    this._win.set(null);
    this._flashes.set([]);
    this._mistakes.set(0);
    this._mistakePoints.set(0);
    this._stats.set(this._stats());
  }

  toggleFullScreenBoard() {
    this._fullScreenBoard.update(v => !v);
  }

  toggleEditingGivenMode() {
    this._editingGivenMode.update(v => !v);
    if (!this._editingGivenMode()) {
      this.computeSolutionFromGivens?.();
      this._rating.set(null);
      this.rateCurrentBoard();
      this.startTimer(5000); // start when user leaves given mode (imports)
    } else {
      this._solution?.set(null);
      this._rating.set(null);
      this.resetTimer();
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
    const wasEmpty = current.value === 0;
    if (current.given && !asGiven) return;

    // snapshot BEFORE for undo (only if it's an action we might undo)
    const before = (!asGiven) ? this.snapshotCell(r, c) : null;

    this._board.update(b => setValue(b, r, c, value, asGiven));
    this.recomputeCandidates();

    if (asGiven) return; // givens: no scoring/undo/animation

    const sol = this._solution();
    const key = `${r},${c}`;

    if (wasEmpty) {
      if (sol && value === sol[r][c]) {
        // CORRECT: score (once), show floater, clear undo history
        if (!this._scored.has(key)) {
          const pts = Math.round(this.basePointsNow() * this.multiplier(this._currentDifficulty()));
          this._scored.add(key);
          this.showFloater(r, c, `+${pts}`);
          setTimeout(() => this.applyScoreDelta(pts), 600);
        }
        this._undo = []; // clear history on correct entry

        // animations
        if (this.isSolvedBoard()) {
          this._flashes.set([]);
          this.stopTimer();
          this.captureSolvedStats();
          this.triggerWinRipple(r, c);
        } else {
          this.triggerUnitFlash(r, c);
        }
      } else {
        // WRONG: penalty, floater, and push undo of the wrong placement
        const pen = Math.round((this.basePointsNow() * this.multiplier(this._currentDifficulty())) / 2);
        const delta = -pen;
        this._mistakes.update(n => n + 1);
        this._mistakePoints.update(p => p + pen);
        this.showFloater(r, c, `${delta}`);
        setTimeout(() => this.applyScoreDelta(delta), 600);

        const after = this.snapshotCell(r, c);
        if (before) this.pushUndo({ r, c, before, after, scoreDelta: delta });
      }
    } else {
      // Changing a non-empty cell (still not a correct placement): treat as an undoable edit without score delta
      const after = this.snapshotCell(r, c);
      if (before) this.pushUndo({ r, c, before, after, scoreDelta: 0 });
    }
  }

  clearCell(r: number, c: number) {
    const cur = this._board()[r][c];
    if (cur.given && !this._editingGivenMode()) return;
    this.pushHistory();
    this._board.update(b => clearValue(b, r, c));
    this.recomputeCandidates();
  }

  loadFromString(s: string) {
    const next = parseBoardString(s);
    this._board.set(next);
    this._selected.set({ r: 0, c: 0 });
    this._editingGivenMode.set(false);
    this._currentDifficulty.set('easy');   // default for custom imports
    this._scoreRaw.set(0);
    this._scoreShown.set(0);
    this._scored.clear();
    this._undo = [];
    this._mistakes.set(0);
    this._mistakePoints.set(0);
    this.recomputeCandidates();
    this.computeSolutionFromGivens();
    this._rating.set(null);
    this.rateCurrentBoard();
    this.startTimer(5000);
  }

  recomputeCandidates() {
    this._board.update(b => computeCandidates(b));
  }

  /** Clear all suppressed (and keep manual on? No: reset to pure calc) */
  resetPencils() {
    this.pushHistory();
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
    const before = this.snapshotCell(r, c);
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    })));
    const cell = next[r][c];
    if (cell.value) { this._board.set(next); return; }

    const isVisible = cell.candidates.has(d);
    const isManual = cell.manualCands.has(d);

    if (isVisible) {
      if (isManual) { cell.manualCands.delete(d); cell.suppressed.add(d); }
      else { cell.suppressed.add(d); }
    } else {
      cell.suppressed.delete(d);
      cell.manualCands.add(d);
    }

    this._board.set(computeCandidates(next));
    const after = this.snapshotCell(r, c);
    this.pushUndo({ r, c, before, after, scoreDelta: 0 });
  }

  togglePencilDigitIfEnabled(r: number, c: number, d: number, enabled: boolean) {
    if (!enabled) return;
    this.togglePencilDigit(r, c, d);
  }

  /** Clear all pencils for a cell (why: quick cleanup) */
  clearPencils(r: number, c: number) {
    const before = this.snapshotCell(r, c);
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    })));
    next[r][c].suppressed.clear();
    next[r][c].manualCands.clear();
    this._board.set(computeCandidates(next));
    const after = this.snapshotCell(r, c);
    this.pushUndo({ r, c, before, after, scoreDelta: 0 });
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
    this._board.update(b => h.apply(b));
    this.recomputeCandidates();
    this._hl.set(null);
    this._selected.set({ r: h.target.r, c: h.target.c });

    this._hintsUsed.update(n => n + 1);
    this._hintTechniques.update(s => new Set([...s, h.kind]));
  }

  loadFromMatrix(matrix: number[][]) {
    this._activeKey.set({ kind: 'custom', origin: 'csv' });
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
    this._currentDifficulty.set('easy');
    this._scoreRaw.set(0);
    this._scoreShown.set(0);
    this._scored.clear();
    this._undo = [];
    this._mistakes.set(0);
    this._mistakePoints.set(0);
    this.recomputeCandidates();
    this.computeSolutionFromGivens();
    this.startTimer(5000);
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
      this._currentDifficulty.set(difficulty);
      this._activeKey.set({ kind: 'generated', difficulty });
      this._scoreRaw.set(0);
      this._scoreShown.set(0);
      this._scored.clear();
      this._undo = [];
      this._hl.set(null);
      this._solution.set(null);
      this._hintsUsed.set(0);
      this._hintTechniques.set(new Set());
      this._lastSolved.set(null);
      this._mistakes.set(0);
      this._mistakePoints.set(0);
      this.recomputeCandidates();
      this.computeSolutionFromGivens?.();

      // set rating from worker
      this._rating.set(rating);

      setTimeout(() => this.prewarmCache?.(difficulty, symmetry), 0);
    } finally {
      this._busy.set(false);
    }
    this.triggerReveal();
    this.resetTimer(); // ensure clean
    this.startTimer(5000);
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
        // NEW: accept only matching bucket
        if (rating?.bucket !== difficulty) {
          setTimeout(step, 0);
          return;
        }
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

  undo() {
    const last = this._undo.pop();
    if (!last) return;
    this.restoreCell(last.before, last.r, last.c);
    if (last.scoreDelta) this.applyScoreDelta(-last.scoreDelta); // reverse score effect
  }

  eraseAt(r: number, c: number) {
    const before = this.snapshotCell(r, c); // why: capture for undo

    const cell = this._board()[r][c];
    if (cell.value && (!cell.given || this._editingGivenMode())) {
      // clear the value
      this._board.update(b => clearValue(b, r, c));
      this.recomputeCandidates();
    } else {
      // clear pencils only (need a mutable copy of Sets)
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

    const after = this.snapshotCell(r, c);

    // avoid pushing no-op undos
    const sameSet = (a: Set<number>, b: Set<number>) =>
      a.size === b.size && [...a].every(x => b.has(x));
    const changed =
      before.value !== after.value ||
      before.given !== after.given ||
      !sameSet(before.suppressed, after.suppressed) ||
      !sameSet(before.manualCands, after.manualCands);

    if (changed) this.pushUndo({ r, c, before, after, scoreDelta: 0 });
  }

  /** Enter given mode explicitly (used by manual / CSV / photo flows). */
  enterGivenMode() {
    this._editingGivenMode.set(true);
    this._solution.set(null);
    this._rating.set(null);
  }

  hasAnyValues(): boolean {
    const b = this._board();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (b[r][c].value) return true;
    }
    return false;
  }

  /**
   * Validate current givens: must have at least one value, no conflicts,
   * and the puzzle must be solvable. If valid, switch to play mode,
   * seed solution & start timer after 5s; otherwise stay in given mode.
   */
  tryStartSolving(): boolean {
    if (!this._editingGivenMode()) return true;

    if (!this.hasAnyValues()) {
      alert('Please enter at least one number before starting.');
      return false;
    }

    const conflicts = this.conflicts().cells.size;
    if (conflicts > 0) {
      alert('Your givens have conflicts. Please fix them before starting.');
      return false;
    }

    // Build a board with only givens and solve it
    const givensOnly = this._board().map(row => row.map(cell => ({
      ...cell,
      value: cell.given ? cell.value : 0 as Digit,
      candidates: new Set<number>(),
      suppressed: new Set<number>(),
      manualCands: new Set<number>()
    }))) as Board;

    const solved = solveSudoku(givensOnly);   // returns number[][] | null
    if (!solved) {
      alert('This setup is not solvable. Please double-check your entries.');
      return false;
    }

    // Success: enter play mode without re-solving
    this._solution.set(solved);
    this._editingGivenMode.set(false);
    this._rating.set(null);
    this.rateCurrentBoard();              // rate the user puzzle
    this.startTimer(5000);   // 5s grace (if you added timer helpers)

    if (!this._activeKey()) {
      this._activeKey.set({ kind: 'custom', origin: 'manual' });
    }
    return true;
  }

  beginCustomEntry(origin: 'manual' | 'csv' | 'photo' = 'manual') {
    this._activeKey.set({ kind: 'custom', origin });
    // ensure we’re in given mode for build-up flows
    this.enterGivenMode();
  }

  hasActiveGenerated(d: Bucket): boolean {
    return !!this._activeStore.generated?.[d];
  }

  hasActiveCustom(): boolean {
    return !!this._activeStore.custom;
  }

  clearActiveGenerated(d: Bucket) {
    if (this._activeStore.generated) this._activeStore.generated[d] = null as any;
    this.saveActiveStore();
  }

  clearActiveCustom() {
    this._activeStore.custom = null;
    this.saveActiveStore();
  }

  clearCurrentActive() {
    const key = this._activeKey();
    if (!key) return;
    if (key.kind === 'generated') this.clearActiveGenerated(key.difficulty);
    else this.clearActiveCustom();
    this._activeKey.set(null);
  }

  getResumables(): ResumableItem[] {
    const list: ResumableItem[] = [];

    // generated slots
    for (const d of ['easy', 'medium', 'hard', 'expert'] as Bucket[]) {
      const s = this._activeStore.generated?.[d];
      if (s) {
        list.push({
          key: { kind: 'generated', difficulty: d },
          label: `Generated • ${d}`,
          progress: this.progressOf(s.board),
          savedAt: s.savedAt,
          rating: s.rating
        });
      }
    }

    // custom slot (narrowed by ActiveStore type)
    const cs = this._activeStore.custom;
    if (cs) {
      const origin = cs.key.origin ?? 'manual';
      list.push({
        key: { kind: 'custom', origin },
        label: `Custom • ${origin}`,
        progress: this.progressOf(cs.board),
        savedAt: cs.savedAt,
        rating: cs.rating
      });
    }

    return list.sort((a, b) => b.savedAt - a.savedAt);
  }

  // — resume —
  async resumeGenerated(d: Bucket) {
    const snap = this._activeStore.generated?.[d];
    if (!snap) return false;
    await this.loadSnapshot(snap);
    this._activeKey.set({ kind: 'generated', difficulty: d });
    return true;
  }

  async resumeCustom() {
    const snap = this._activeStore.custom;
    if (!snap) return false;
    await this.loadSnapshot(snap);
    this._activeKey.set({ kind: 'custom', origin: snap.key.origin });
    return true;
  }

  private progressOf(serialized: any): number {
    let filled = 0;
    for (const row of serialized) for (const c of row) if (c.value) filled++;
    return filled / 81;
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

  private async getFromPoolOrGenerateAsync(
    d: Difficulty,
    sym: 'central' | 'diagonal' | 'none'
  ): Promise<{ board: Board; rating: DifficultyRating }> {

    const list = this._pool.get(d) ?? [];
    while (list.length) {
      const item = list.shift()!;
      const h = this.puzzleHash(item.board);
      // NEW: skip if bucket mismatch
      if (item.rating?.bucket !== d) {
        continue; // keep discarding until we find a matching bucket
      }
      if (!this.isRecent(d, h)) {
        this._pool.set(d, list);
        this.pushRecent(d, h);
        return item; // correct bucket
      }
    }

    // NEW: try more times but *require* correct bucket
    for (let tries = 0; tries < 12; tries++) {
      const { board, rating } = await this.genInWorker(d, sym);
      if (rating?.bucket !== d) {
        await this.nextFrame();
        continue; // reject and regenerate
      }
      const h = this.puzzleHash(board);
      if (!this.isRecent(d, h)) {
        this.pushRecent(d, h);
        return { board, rating };
      }
      await this.nextFrame();
    }

    // Fallback: keep trying until bucket matches; last resort after cap
    // (prevents returning a wrong-bucket board)
    // You can keep a hard cap if desired.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { board, rating } = await this.genInWorker(d, sym);
      if (rating?.bucket === d) {
        this.pushRecent(d, this.puzzleHash(board));
        return { board, rating };
      }
      await this.nextFrame();
    }
  }

  // helper: is board fully filled (after a move)
  private isSolvedBoard(): boolean {
    const b = this._board();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!b[r][c].value) return false;
    return true;
  }

  // NEW: full puzzle ripple
  private triggerWinRipple(r: number, c: number) {
    this._flashes.set([]); // ensure no competing overlays
    // Defer one frame so Angular paints flash-clear before win starts
    requestAnimationFrame(() => {
      this._win.set({ r, c });
      setTimeout(() => this._win.set(null), 1200);
    });
  }

  private cloneBoard(b: Board): Cell[][] {
    return b.map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    })));
  }

  private pushHistory() {
    const snap = this.cloneBoard(this._board());
    this._history.push(snap);
    if (this._history.length > 100) this._history.shift();
  }

  // ----- timer & scoring helpers -----
  private startTimer(delayMs = 0) {
    this.stopTimer();
    if (delayMs > 0) {
      const t = setTimeout(() => { this._timerId = this.setIntervalTick(); clearTimeout(t); }, delayMs);
    } else {
      this._timerId = this.setIntervalTick();
    }
  }

  private setIntervalTick() {
    return setInterval(() => this._timerSec.update(s => s + 1), 1000);
  }

  private stopTimer() {
    if (this._timerId != null) { clearInterval(this._timerId); this._timerId = null; }
  }

  private resetTimer() {
    this.stopTimer(); this._timerSec.set(0);
  }

  private multiplier(d: Difficulty): number {
    if (d === 'medium') return 1.5;
    if (d === 'hard') return 2.0;
    if (d === 'expert') return 3.0;
    return 1.0; // easy
  }

  private basePointsNow(): number {
    // 100 - 1pt per 2s, floored at 25
    return Math.max(25, 100 - Math.floor(this._timerSec() / 2));
  }

  private animateScoreTo(target: number) {
    const start = this._scoreShown();
    const diff = target - start;
    if (!diff) return;

    this._scoreBumping.set(true);
    const dur = 500;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);      // ease-out-cubic
      this._scoreShown.set(Math.round(start + diff * eased));
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(() => this._scoreBumping.set(false), 120);
    };
    requestAnimationFrame(tick);
  }

  private applyScoreDelta(delta: number) {
    const next = Math.max(0, this._scoreRaw() + delta);
    this._scoreRaw.set(next);
    this.animateScoreTo(next);
  }

  // ---- floaters (+95 / -50) ----
  private showFloater(r: number, c: number, text: string, ms = 650) {
    const id = ++this._floaterId;
    this._floaters.update(a => [...a, { id, r, c, text }]);
    setTimeout(() => this._floaters.update(a => a.filter(f => f.id !== id)), ms);
  }

  // ---- timer helpers ----
  pauseTimer() {
    this.stopTimer();
  }

  resumeTimer() {
    if (this._timerId == null && !this.isSolvedBoard() && !this._editingGivenMode()) this.startTimer();
  }

  // ---- tiny undo ----
  private snapshotCell(r: number, c: number) {
    const cell = this._board()[r][c];
    return {
      value: cell.value as Digit,
      given: cell.given,
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    };
  }

  private restoreCell(s: UndoEntry['before'], r: number, c: number) {
    const next = this._board().map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set(cell.manualCands)
    })));
    next[r][c].value = s.value;
    next[r][c].given = s.given;
    next[r][c].suppressed = new Set(s.suppressed);
    next[r][c].manualCands = new Set(s.manualCands);
    this._board.set(computeCandidates(next));
  }

  private pushUndo(u: UndoEntry) {
    // keep only after last correct entry (we clear history on correct), and cap to 3
    this._undo.push(u);
    while (this._undo.length > this._undoLimit) this._undo.shift();
  }

  private captureSolvedStats() {
    const bucket: Bucket = this._rating()?.bucket ?? 'easy';
    const timeMs = this._timerSec() * 1000;
    const score = this._scoreRaw();
    const mistakes = this._mistakes();
    const mistakePts = this._mistakePoints();
    const hints = this._hintsUsed();
    const techs = Array.from(this._hintTechniques());
    const prev = this._stats()[bucket];
    const newBest =
      (prev.bestTimeMs == null || timeMs < prev.bestTimeMs) ||
      (prev.bestScore == null || score > prev.bestScore);

    // per-puzzle record for the Solved screen
    this._lastSolved.set({
      difficulty: bucket,
      timeMs,
      score,
      mistakes,
      mistakePoints: mistakePts,
      hintsUsed: hints,
      hintTechniques: techs,
      newBest
    });

    // session-aggregate stats (by difficulty)
    this._stats.update(all => {
      const cur = all[bucket];
      const next: DiffStats = {
        solved: cur.solved + 1,
        bestTimeMs: cur.bestTimeMs == null ? timeMs : Math.min(cur.bestTimeMs, timeMs),
        bestScore: cur.bestScore == null ? score : Math.max(cur.bestScore, score),
        totalScore: cur.totalScore + score,
        totalHints: cur.totalHints + hints,
        totalMistakes: cur.totalMistakes + mistakes,
        totalMistakePoints: cur.totalMistakePoints + mistakePts,
        techniques: new Set(cur.techniques),
      };
      for (const t of techs) next.techniques.add(t);
      return { ...all, [bucket]: next };
    });
    this.clearCurrentActive(); // clear active on solve
  }

  private serializeStats(s: Record<Bucket, DiffStats>) {
    // Convert Sets → arrays for storage
    return {
      easy: { ...s.easy, techniques: Array.from(s.easy.techniques) },
      medium: { ...s.medium, techniques: Array.from(s.medium.techniques) },
      hard: { ...s.hard, techniques: Array.from(s.hard.techniques) },
      expert: { ...s.expert, techniques: Array.from(s.expert.techniques) },
    };
  }

  private deserializeStats(raw: any): Record<Bucket, DiffStats> | null {
    try {
      const r = raw as Record<Bucket, any>;
      const mk = (x: any): DiffStats => ({
        solved: Number(x?.solved ?? 0),
        bestTimeMs: x?.bestTimeMs == null ? null : Number(x.bestTimeMs),
        bestScore: x?.bestScore == null ? null : Number(x.bestScore),
        totalScore: Number(x?.totalScore ?? 0),
        totalHints: Number(x?.totalHints ?? 0),
        totalMistakes: Number(x?.totalMistakes ?? 0),
        totalMistakePoints: Number(x?.totalMistakePoints ?? 0),
        techniques: new Set<string>(Array.isArray(x?.techniques) ? x.techniques : []),
      });
      return {
        easy: mk(r.easy), medium: mk(r.medium), hard: mk(r.hard), expert: mk(r.expert)
      };
    } catch {
      return null;
    }
  }

  private serializeBoard(b: Board) {
    return b.map(row => row.map(cell => ({
      value: cell.value,
      given: cell.given,
      box: cell.box,
      // we REcompute candidates on load; just persist manual/suppressed
      suppressed: Array.from(cell.suppressed ?? []),
      manualCands: Array.from(cell.manualCands ?? [])
    })));
  }

  private deserializeBoard(raw: any): Board {
    // reconstruct a minimal Board, then recomputeCandidates() later
    return raw.map((row: any[], r: number) => row.map((c: any, i: number) => ({
      value: Number(c.value || 0) as Digit,
      given: !!c.given,
      box: c.box ?? (Math.floor(r / 3) * 3 + Math.floor(i / 3)),
      candidates: new Set<number>(),
      suppressed: new Set<number>(c.suppressed ?? []),
      manualCands: new Set<number>(c.manualCands ?? [])
    })));
  }

  private loadActiveStore(): ActiveStore {
    try {
      const raw = localStorage.getItem(this.ACTIVE_KEY);
      if (!raw) return { active: null, generated: {}, custom: null };
      const obj = JSON.parse(raw);
      // naive validate
      return {
        active: obj?.active ?? null,
        generated: obj?.generated ?? {},
        custom: obj?.custom ?? null
      };
    } catch {
      return { active: null, generated: {}, custom: null };
    }
  }

  private saveActiveStore() {
    try {
      localStorage.setItem(this.ACTIVE_KEY, JSON.stringify(this._activeStore));
    } catch { /* ignore quota/private */ }
  }

  private persistActive(key: ActiveKey) {
    const snap: GameSnapshot = {
      key,
      board: this.serializeBoard(this._board()),
      selected: this._selected(),
      editingGiven: this._editingGivenMode(),
      pencilMode: this._pencilMode(),
      timerSec: this._timerSec(),
      score: this._scoreRaw(),
      difficulty: this._currentDifficulty(),
      solution: this._solution(),
      rating: this._rating(),
      savedAt: Date.now()
    };

    // write into in-memory store slots
    if (key.kind === 'generated') {
      this._activeStore.generated[key.difficulty] = snap;
    } else {
      const customSnap: GameSnapshot & { key: { kind: 'custom'; origin?: 'manual' | 'csv' | 'photo' } } = {
        ...snap,
        key: { kind: 'custom', origin: key.origin },
      };
      this._activeStore.custom = customSnap;
    }
    this._activeStore.active = key;
    this.saveActiveStore();
  }

  private async loadSnapshot(s: GameSnapshot) {
    // board
    const b = this.deserializeBoard(s.board);
    this._board.set(b);
    this.recomputeCandidates();       // rebuild candidates
    this._selected.set(s.selected);
    this._editingGivenMode.set(s.editingGiven);
    this._pencilMode.set(s.pencilMode);
    this._currentDifficulty.set(s.difficulty);
    this._rating.set(s.rating ?? null);
    this._solution.set(s.solution ?? null);

    // reset reveal/animations
    this._reveal.set(false);
    this._flashes.set([]);
    this._win.set(null);

    // score/timer
    this._scoreRaw.set(s.score);
    this._scoreShown.set(s.score);
    this._scored.clear();           // avoid re-rewarding old cells
    this.resetTimer();
    this._timerSec.set(s.timerSec);
    if (!this.isSolvedBoard() && !this._editingGivenMode()) {
      this.startTimer();             // resume immediately
    }
  }
}
