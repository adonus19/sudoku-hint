import { Board } from './sudoku.types';
import { computeCandidates } from './sudoku.utils';
import { HintService } from '../hint/hint.service';
import type { HintResult } from '../hint/hint.types';

export type Bucket = 'easy' | 'medium' | 'hard' | 'expert';

export interface DifficultyRating {
  bucket: Bucket;
  steps: number;
  byTechnique: Record<string, number>;
}

/**
 * Rate by simulating human solving using your HintService.
 * Counts steps per technique; maps totals to a bucket.
 */
export function ratePuzzle(start: Board): DifficultyRating {
  // work on a copy; do not mutate caller’s board
  let b = start.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed),
    manualCands: new Set<number>() // ignore manual while rating
  })));
  // Ensure b is mutable and has candidates computed
  b = computeCandidates(b).map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed),
    manualCands: new Set<number>()
  })));

  const hs = new HintService();
  const by: Record<string, number> = {};
  let steps = 0;

  // hard cap to prevent infinite loops on pathological puzzles
  const MAX_STEPS = 2000;

  while (steps < MAX_STEPS) {
    const hint: HintResult | null = hs.findNextHint(b);
    if (!hint) break;

    by[hint.kind] = (by[hint.kind] ?? 0) + 1;
    steps++;

    b = hint.apply(b).map(row => row.map(cell => ({
      ...cell,
      candidates: new Set(cell.candidates),
      suppressed: new Set(cell.suppressed),
      manualCands: new Set<number>()
    }))); // ensure mutable deep copy
  }

  const bucket = mapToBucket(by, steps, isSolved(b));
  return { bucket, steps, byTechnique: by };
}

function mapToBucket(by: Record<string, number>, steps: number, solved: boolean): Bucket {
  const hardish = sum(by, ['Swordfish', 'Jellyfish', 'Skyscraper', 'XY-Wing', 'W-Wing', 'XYZ-Wing', 'BUG']);
  const mediumish = sum(by, ['Locked Candidates', 'Hidden Pair', 'Naked Pair']);
  const singles = sum(by, ['Naked Single', 'Hidden Single']);

  if (!solved) return 'expert'; // needs guessing beyond our human set

  if (hardish >= 2 || steps > 180) return 'expert';
  if (hardish >= 1 || mediumish > 8 || steps > 120) return 'hard';
  if (mediumish >= 3 || steps > 60) return 'medium';
  // else
  return 'easy';
}

function isSolved(b: Board): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!b[r][c].value) return false;
  }
  return true;
}

function sum(by: Record<string, number>, keys: string[]): number {
  return keys.reduce((acc, k) => acc + (by[k] ?? 0), 0);
}
