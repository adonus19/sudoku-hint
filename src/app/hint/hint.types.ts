import { Board } from '../data/sudoku.types';

export type UnitKind = 'row' | 'col' | 'box';

export interface HintHighlight {
  rows?: number[];     // 0..8
  cols?: number[];
  boxes?: number[];
  cells?: Array<{ r: number; c: number }>;
  candTargets?: Array<{ r: number; c: number; d: number }>; // highlight specific candidate digits
}

export interface HintStep {
  title: string;
  message: string;
  highlight?: HintHighlight;
}

export type HintKind = 'Naked Single' | 'Hidden Single';

export interface HintResult {
  kind: HintKind;
  digit: number;
  target: { r: number; c: number };
  unit?: { kind: UnitKind; index: number }; // for Hidden Single
  steps: HintStep[];
  apply: (board: Board) => Board; // pure
}
