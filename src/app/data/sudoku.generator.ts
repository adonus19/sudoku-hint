import { Board, Digit } from './sudoku.types';
import { createEmptyBoard, computeCandidates, setValue, clearValue } from './sudoku.utils';
import { solveSudoku } from './sudoku.solver';
import { ratePuzzle, DifficultyRating } from './sudoku.rater';

type Symmetry = 'none' | 'central' | 'diagonal';

export interface GenerateOptions {
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  symmetry?: Symmetry;
  maxRemoveFailures?: number; // how long to keep trying removals after repeated failures
  rng?: () => number;
}

export interface GeneratedPuzzle {
  board: Board;               // with givens marked and candidates computed
  rating: DifficultyRating;   // detail on techniques, steps, bucket
}

// Public API
export function generatePuzzle(opts: GenerateOptions = {}): GeneratedPuzzle {
  const rng = opts.rng ?? Math.random;

  // 1) Make a random solved grid (matrix)
  const solved = randomSolvedMatrix(rng);

  // 2) Start from the solution as full givens; then dig with uniqueness checks
  let puzzle = boardFromMatrixAsGivens(solved);

  // we will try to remove as many as possible while keeping uniqueness
  const symmetry = opts.symmetry ?? 'central';
  const maxRemoveFailures = opts.maxRemoveFailures ?? 80;

  let failures = 0;
  const positions = shuffledIndices(rng); // 0..80 shuffled
  let removalCursor = 0;
  const targetClueFloor = opts.difficulty === 'easy' ? 40 : 0; // keep ≥ 40 givens for easy

  while (failures < maxRemoveFailures && removalCursor < positions.length) {
    const idx = positions[removalCursor++];
    const r = Math.floor(idx / 9), c = idx % 9;

    if (puzzle[r][c].value === 0) continue; // already empty
    const mates = symmetricMates(r, c, symmetry);
    const toRemove: Array<{ r: number; c: number; prev: number }> = [];

    // collect unique set of positions to clear (avoid duplicates in mates)
    const seen = new Set<string>();
    for (const { r: rr, c: cc } of [{ r, c }, ...mates]) {
      const k = `${rr},${cc}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (puzzle[rr][cc].given && puzzle[rr][cc].value) {
        toRemove.push({ r: rr, c: cc, prev: puzzle[rr][cc].value as number });
      }
    }
    if (!toRemove.length) continue;

    // try remove
    const backup = cloneBoard(puzzle);
    for (const { r: rr, c: cc } of toRemove) puzzle = clearGiven(puzzle, rr, cc);

    // uniqueness check
    if (!hasUniqueSolution(puzzle)) {
      // revert
      puzzle = backup;
      failures++;
      continue;
    }

    if (failures === 0) {
      // ...you just kept 'puzzle' with removed givens...
      if (opts.difficulty === 'easy' && countClues(puzzle) <= targetClueFloor) {
        break; // stop digging early to keep the grid easy
      }
    }

    // successful removal
    failures = 0;
  }

  // recompute candidates after carving
  puzzle = computeCandidates(puzzle);

  // 3) Rate difficulty (simulate human steps)
  const rating = ratePuzzle(puzzle);

  // Optionally, if asked difficulty not matched closely, re-generate (simple loop).
  if (opts.difficulty === 'easy') {
    const by = rating.byTechnique || {};
    const hardish = (by['Swordfish'] || 0) + (by['Jellyfish'] || 0) + (by['Skyscraper'] || 0) + (by['XY-Wing'] || 0) + (by['W-Wing'] || 0) + (by['XYZ-Wing'] || 0) + (by['BUG'] || 0);
    const mediumish = (by['Locked Candidates'] || 0) + (by['Hidden Pair'] || 0) + (by['Naked Pair'] || 0);
    const singles = (by['Naked Single'] || 0) + (by['Hidden Single'] || 0);

    const looksEasy =
      rating.bucket === 'easy' &&                // solver’s own bucket
      hardish === 0 &&                           // forbid hard techniques
      mediumish <= 2 &&                          // very few medium steps
      rating.steps <= 50 &&                      // short solve path
      singles >= 10;                             // plenty of singles

    if (!looksEasy) {
      // regenerate until we hit criteria (you already re-call generatePuzzle when bucket mismatches)
      return generatePuzzle(opts);
    }
  }

  return { board: puzzle, rating };
}

// ---------------- internals ----------------

function randomSolvedMatrix(rng: () => number): number[][] {
  // Start with empty board (as givens), fill by backtracking with shuffles
  let b = createEmptyBoard();
  // mark all as non-given initially
  b = b.map(row => row.map(cell => ({ ...cell, value: 0 as Digit, given: false })));
  const digits = () => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);

  function backtrack(board: Board): Board | null {
    const withCands = computeCandidates(board);
    // find first empty with fewest candidates
    let target: { r: number; c: number; cands: number[] } | null = null;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (withCands[r][c].value) continue;
      const cs = Array.from(withCands[r][c].candidates);
      if (cs.length === 0) return null;
      if (!target || cs.length < target.cands.length) target = { r, c, cands: cs };
    }
    if (!target) return withCands; // solved

    const order = shuffle(target.cands.slice(), rng);
    for (const d of order) {
      const next = cloneBoard(withCands);
      next[target.r][target.c].value = d as Digit;
      const res = backtrack(next);
      if (res) return res;
    }
    return null;
  }

  const solvedBoard = backtrack(b);
  if (!solvedBoard) throw new Error('Failed to create solved grid');

  // Return as matrix
  return solvedBoard.map(row => row.map(cell => cell.value as number));
}

function boardFromMatrixAsGivens(matrix: number[][]): Board {
  let b = createEmptyBoard();
  b = b.map(row => row.map(cell => ({
    ...cell,
    value: 0 as Digit,
    given: false,
    candidates: new Set<number>(),
    suppressed: new Set<number>(),
    manualCands: new Set<number>()
  })));
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const v = Number(matrix[r]?.[c] ?? 0);
    if (v >= 1 && v <= 9) b = setValue(b, r, c, v as Digit, true);
  }
  return computeCandidates(b);
}

function clearGiven(board: Board, r: number, c: number): Board {
  // mark as empty non-given
  const next = board.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed),
    manualCands: new Set(cell.manualCands)
  })));
  next[r][c].value = 0 as Digit;
  next[r][c].given = false;
  return computeCandidates(next);
}

function cloneBoard(b: Board): Board {
  return b.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed),
    manualCands: new Set(cell.manualCands)
  })));
}

function hasUniqueSolution(puzzle: Board): boolean {
  // Count up to 2 solutions; if >1 → not unique
  let count = 0;

  function backtrack(b: Board): boolean {
    if (count > 1) return true; // early stop
    const withCands = computeCandidates(b);

    // find MRV empty
    let target: { r: number; c: number; cands: number[] } | null = null;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (withCands[r][c].value) continue;
      const cands = Array.from(withCands[r][c].candidates);
      if (cands.length === 0) return false;
      if (!target || cands.length < target.cands.length) target = { r, c, cands };
    }

    if (!target) { count++; return count > 1; } // found a solution

    for (const d of target.cands) {
      const next = cloneBoard(withCands);
      next[target.r][target.c].value = d as Digit;
      if (backtrack(next)) return true; // early stop on >1
    }
    return false;
  }

  backtrack(puzzle);
  return count === 1;
}

function shuffledIndices(rng: () => number): number[] {
  return shuffle(Array.from({ length: 81 }, (_, i) => i), rng);
}

function symmetricMates(r: number, c: number, sym: Symmetry): Array<{ r: number; c: number }> {
  if (sym === 'none') return [];
  if (sym === 'central') return [{ r: 8 - r, c: 8 - c }];
  // diagonal symmetry (main diagonal)
  return [{ r: c, c: r }];
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function countClues(b: Board): number {
  let n = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (b[r][c].given && b[r][c].value) n++;
  return n;
}
