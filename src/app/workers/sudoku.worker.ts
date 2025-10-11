/// <reference lib="webworker" />
import { generatePuzzle } from '../data/sudoku.generator';
import type { Difficulty } from '../components/new-puzzle-dialog/new-puzzle-dialog';
import { ratePuzzle } from '../data/sudoku.rater';

export interface GenMsg {
  type: 'generate';
  difficulty: Difficulty;
  symmetry: 'central' | 'diagonal' | 'none';
}

addEventListener('message', (e: MessageEvent<GenMsg>) => {
  const msg = e.data;
  if (msg?.type !== 'generate') return;

  // Heavy sync work, but off the UI thread
  const { board } = generatePuzzle({
    difficulty: msg.difficulty,
    symmetry: msg.symmetry
  });
  const rating = ratePuzzle(board); // compute off main thread
  postMessage({ board, rating });
});
