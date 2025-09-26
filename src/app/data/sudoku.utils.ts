import { Board, Cell, Digit } from './sudoku.types';
import { SIZE, BOX, DIGITS, toBoxIndex } from './sudoku.constants';

export function createEmptyBoard(): Board {
  const rows: Cell[][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < SIZE; c++) {
      row.push({
        r, c,
        box: toBoxIndex(r, c),
        value: 0,
        given: false,
        candidates: new Set<number>()
      });
    }
    rows.push(row);
  }
  return rows;
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set<number>(cell.candidates)
  })));
}

// Injectable-level, used by store only (kept pure)
export function setValue(board: Board, r: number, c: number, value: Digit, asGiven: boolean): Board {
  const next = cloneBoard(board) as Cell[][];
  const cell = next[r][c];
  next[r][c] = {
    ...cell,
    value,
    given: asGiven ? true : cell.given, // don't unset once given
    // candidates cleared on value set
    candidates: value === 0 ? cell.candidates : new Set<number>()
  };
  return next;
}

export function clearValue(board: Board, r: number, c: number): Board {
  const next = cloneBoard(board) as Cell[][];
  const cell = next[r][c];
  next[r][c] = { ...cell, value: 0, candidates: new Set<number>() };
  return next;
}

export function detectConflicts(board: Board) {
  // Basic duplicate detection (value > 0). Used for highlight/validation later.
  const rows = new Set<number>(), cols = new Set<number>(), boxes = new Set<number>(), cells = new Set<string>();
  // why: fast feedback on invalid entries early
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board[r][c].value;
      if (!v) continue;
      // row
      for (let cc = 0; cc < 9; cc++) {
        if (cc !== c && board[r][cc].value === v) { rows.add(r); cells.add(`${r},${c}`); cells.add(`${r},${cc}`); }
      }
      // col
      for (let rr = 0; rr < 9; rr++) {
        if (rr !== r && board[rr][c].value === v) { cols.add(c); cells.add(`${r},${c}`); cells.add(`${rr},${c}`); }
      }
      // box
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
          if ((rr !== r || cc !== c) && board[rr][cc].value === v) {
            boxes.add(board[r][c].box); cells.add(`${r},${c}`); cells.add(`${rr},${cc}`);
          }
        }
      }
    }
  }
  return { rows, cols, boxes, cells };
}

// Parse 81-char string into Board (digits 1-9 = givens, 0/. = empty)
export function parseBoardString(str: string): Board {
  const s = str.replace(/\s+/g, '');
  if (s.length !== 81) throw new Error('Board string must be 81 characters.');
  const board = createEmptyBoard() as Cell[][];
  for (let i = 0; i < 81; i++) {
    const ch = s[i];
    const r = Math.floor(i / 9), c = i % 9;
    if (ch === '0' || ch === '.') continue;
    const v = Number(ch);
    if (!Number.isInteger(v) || v < 1 || v > 9) throw new Error('Invalid digit in board string.');
    board[r][c] = {
      ...board[r][c],
      value: v as Digit,
      given: true
    };
  }
  return board;
}

// --- Candidates ---
export function computeCandidates(board: Board): Board {
  const next = cloneBoard(board);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = next[r][c];
      if (cell.value) { cell.candidates = new Set(); continue; }
      const used = usedDigits(board, r, c);
      const cand = new Set<number>();
      for (const d of DIGITS) if (!used.has(d)) cand.add(d);
      cell.candidates = cand;
    }
  }
  return next;
}

function usedDigits(board: Board, r: number, c: number): Set<number> {
  const out = new Set<number>();
  for (let cc = 0; cc < 9; cc++) { const v = board[r][cc].value; if (v) out.add(v); }
  for (let rr = 0; rr < 9; rr++) { const v = board[rr][c].value; if (v) out.add(v); }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      const v = board[rr][cc].value; if (v) out.add(v);
    }
  }
  return out;
}
