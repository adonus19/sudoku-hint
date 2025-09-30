import { Board, Cell, Digit } from './sudoku.types';
import { SIZE, DIGITS, toBoxIndex } from './sudoku.constants';

export function createEmptyBoard(): Board {
  const rows: Cell[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < 9; c++) {
      row.push({
        r, c, box: Math.floor(r / 3) * 3 + Math.floor(c / 3),
        value: 0,
        given: false,
        candidates: new Set<number>(),
        suppressed: new Set<number>(),
        manualCands: new Set<number>()
      });
    }
    rows.push(row);
  }
  return rows;
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed),
    manualCands: new Set(cell.manualCands)
  })));
}

// Injectable-level, used by store only (kept pure)
export function setValue(board: Board, r: number, c: number, value: Digit, asGiven: boolean): Board {
  const next = cloneBoard(board) as Cell[][];
  const cell = next[r][c];
  next[r][c] = {
    ...cell,
    value,
    given: asGiven ? true : cell.given,
    candidates: value === 0 ? cell.candidates : new Set<number>(),
    suppressed: value === 0 ? cell.suppressed : new Set<number>(),   // clear when placed
    manualCands: value === 0 ? cell.manualCands : new Set<number>()  // clear when placed
  };
  return next;
}

export function clearValue(board: Board, r: number, c: number): Board {
  const next = cloneBoard(board) as Cell[][];
  const cell = next[r][c];
  next[r][c] = { ...cell, value: 0, candidates: new Set<number>(cell.candidates) };
  return next;
}

export function detectConflicts(board: Board) {
  const rows = new Set<number>(),
    cols = new Set<number>(),
    boxes = new Set<number>(),
    cells = new Set<string>();
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const v = board[r][c].value;
    if (!v) continue;
    for (let cc = 0; cc < 9; cc++) if (cc !== c && board[r][cc].value === v) { rows.add(r); cells.add(`${r},${c}`); cells.add(`${r},${cc}`); }
    for (let rr = 0; rr < 9; rr++) if (rr !== r && board[rr][c].value === v) { cols.add(c); cells.add(`${r},${c}`); cells.add(`${rr},${c}`); }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) if ((rr !== r || cc !== c) && board[rr][cc].value === v) {
      boxes.add(board[r][c].box);
      cells.add(`${r},${c}`);
      cells.add(`${rr},${cc}`);
    }
  }
  return { rows, cols, boxes, cells };
}

// Parse 81-char string into Board (digits 1-9 = givens, 0/. = empty)
export function parseBoardString(str: string): Board {
  const s = str.replace(/\s+/g, '');
  if (s.length !== 81) throw new Error('Board string must be 81 characters.');
  const b = createEmptyBoard() as Cell[][];
  for (let i = 0; i < 81; i++) {
    const ch = s[i];
    const r = Math.floor(i / 9),
      c = i % 9;
    if (ch === '0' || ch === '.') continue;
    const v = Number(ch);
    if (!Number.isInteger(v) || v < 1 || v > 9) throw new Error('Invalid digit.');
    b[r][c] = {
      ...b[r][c],
      value: v as Digit,
      given: true,
      candidates: new Set(),
      suppressed: new Set(),
      manualCands: new Set()
    };
  }
  return b;
}

// --- Candidates ---
// Visible candidates = (allowed − suppressed) ∪ manualCands
export function computeCandidates(board: Board): Board {
  const next = cloneBoard(board);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const cell = next[r][c];
    if (cell.value) {
      cell.candidates = new Set();
      continue;
    }

    const allowed = allowedDigits(board, r, c);
    const vis = new Set<number>();
    for (const d of allowed) if (!cell.suppressed.has(d)) vis.add(d);
    for (const d of cell.manualCands) vis.add(d); // why: user wants it visible
    cell.candidates = vis;
  }
  return next;
}

// Allowed by pure constraints (ignores user overrides)
function allowedDigits(board: Board, r: number, c: number): Set<number> {
  const used = new Set<number>();
  for (let cc = 0; cc < 9; cc++) {
    const v = board[r][cc].value;
    if (v) used.add(v);
  }
  for (let rr = 0; rr < 9; rr++) {
    const v = board[rr][c].value;
    if (v) used.add(v);
  }

  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) { const v = board[rr][cc].value; if (v) used.add(v); }
  const out = new Set<number>();
  for (let d = 1; d <= 9; d++) if (!used.has(d)) out.add(d);
  return out;
}
