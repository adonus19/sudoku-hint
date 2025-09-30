export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 0 means empty
export type Candidates = ReadonlySet<number>; // 1..9 when used

export interface Cell {
  r: number; // 0..8
  c: number; // 0..8
  box: number; // 0..8
  value: Digit;
  given: boolean; // true if part of initial puzzle
  candidates: Candidates;           // visible (allowed − suppressed)
  suppressed: ReadonlySet<number>;  // digits intentionally removed by hints/user
  manualCands: ReadonlySet<number>;  // ON by user (persist even if disallowed)
}

export type Row = ReadonlyArray<Cell>;
export type Board = ReadonlyArray<ReadonlyArray<Cell>>;

export interface Coord { r: number; c: number; }

export interface ConflictMap {
  rows: Set<number>;
  cols: Set<number>;
  boxes: Set<number>;
  cells: Set<string>; // "r,c"
}
