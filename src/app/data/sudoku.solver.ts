import { Board } from './sudoku.types';
import { computeCandidates } from './sudoku.utils';

/**
 * Returns a 9x9 solved grid (numbers 1..9) or null if unsatisfiable.
 * Uses MRV (fewest candidates first) guided backtracking on your Board shape.
 */
export function solveSudoku(from: Board): number[][] | null {
  // Build a working copy we can mutate safely.
  let work: Board = from.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed)
  })));

  // Lock: take only givens as fixed; clear user entries before solving
  work = work.map((row, r) => row.map((cell, c) => ({
    ...cell,
    value: cell.given ? cell.value : 0 as any,
    candidates: new Set<number>(), // will be recomputed
    suppressed: new Set<number>()
  })));

  const solved = backtrack(work);
  return solved;

  function backtrack(b: Board): number[][] | null {
    const withCands = computeCandidates(b);
    // Find the next empty with minimum candidates (MRV)
    let target: { r: number; c: number; cands: number[] } | null = null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (withCands[r][c].value) continue;
        const cands = Array.from(withCands[r][c].candidates);
        if (cands.length === 0) return null; // dead end
        if (!target || cands.length < target.cands.length) target = { r, c, cands };
      }
    }

    // No empty cells ⇒ solved
    if (!target) {
      return withCands.map(row => row.map(cell => (cell.value as number)));
    }

    const { r, c, cands } = target;
    // Try candidates in ascending order
    for (const d of cands.sort((a, b) => a - b)) {
      const next = cloneBoard(withCands);
      next[r][c].value = d as any;
      const res = backtrack(next);
      if (res) return res;
    }
    return null;
  }

  function cloneBoard(b: Board): Board {
    return b.map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed)
    })));
  }
}
