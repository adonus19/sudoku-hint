import { Injectable } from '@angular/core';
import { Board } from '../data/sudoku.types';
import { HintResult, HintStep, UnitKind } from './hint.types';
import { computeCandidates } from '../data/sudoku.utils';

const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const coord = (r: number, c: number) => `${ROW_LETTERS[r]}${c + 1}`;
const unitName = (kind: UnitKind, idx: number) =>
  kind === 'row' ? `row ${ROW_LETTERS[idx]}`
    : kind === 'col' ? `column ${idx + 1}`
      : `box ${idx + 1}`;

@Injectable({
  providedIn: 'root'
})
export class HintService {

  findNextHint(board: Board): HintResult | null {
    const b = computeCandidates(board);

    // 1) Naked Single
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = b[r][c]; if (cell.value) continue;
      const cands = Array.from(cell.candidates);
      if (cands.length === 1) return this.nakedSingle(b, r, c, cands[0]);
    }

    // 2) Hidden Single (row, col, box)
    for (const kind of ['row', 'col', 'box'] as UnitKind[]) {
      const hs = this.hiddenSingle(b, kind);
      if (hs) return hs;
    }

    // 3) Locked Candidates (pointing then claiming)
    const lcPoint = this.lockedCandidatesPointing(b);
    if (lcPoint) return lcPoint;
    const lcClaim = this.lockedCandidatesClaiming(b);
    if (lcClaim) return lcClaim;

    // 4) Naked Pair (row, col, box)
    for (const kind of ['row', 'col', 'box'] as UnitKind[]) {
      const np = this.nakedPair(b, kind);
      if (np) return np;
    }

    // 5) Hidden Pair (row, col, box)
    for (const kind of ['row', 'col', 'box'] as UnitKind[]) {
      const hp = this.hiddenPair(b, kind);
      if (hp) return hp;
    }

    return null;
  }

  // ---------- Singles ----------
  private nakedSingle(board: Board, r: number, c: number, d: number): HintResult {
    const steps: HintStep[] = [
      {
        title: `Only one candidate at ${coord(r, c)}`, message: `${coord(r, c)} has a single pencil mark: ${d}.`,
        highlight: { cells: [{ r, c }], candTargets: [{ r, c, d }], rows: [r], cols: [c], boxes: [board[r][c].box] }
      },
      {
        title: 'Reason', message: `Other candidates are blocked by its row ${ROW_LETTERS[r]}, column ${c + 1}, and box ${board[r][c].box + 1}.`,
        highlight: { rows: [r], cols: [c], boxes: [board[r][c].box], cells: [{ r, c }], candTargets: [{ r, c, d }] }
      }
    ];
    return {
      kind: 'Naked Single', digit: d, target: { r, c }, steps,
      apply: (b) => setValueKeepCands(b, r, c, d)
    };
  }

  private hiddenSingle(board: Board, kind: UnitKind): HintResult | null {
    for (let idx = 0; idx < 9; idx++) {
      for (let d = 1; d <= 9; d++) {
        const spots: Array<{ r: number; c: number }> = [];
        forEachUnitCell(kind, idx, (r, c) => {
          const cell = board[r][c];
          if (!cell.value && cell.candidates.has(d)) spots.push({ r, c });
        });
        if (spots.length === 1) {
          const { r, c } = spots[0];
          const steps: HintStep[] = [
            {
              title: `Scan ${unitName(kind, idx)}`, message: `Within ${unitName(kind, idx)}, place ${d}.`,
              highlight: unitHighlight(kind, idx)
            },
            {
              title: `Only ${coord(r, c)}`, message: `${d} fits only at ${coord(r, c)} in this ${unitName(kind, idx)}.`,
              highlight: { ...unitHighlight(kind, idx), cells: [{ r, c }], candTargets: [{ r, c, d }] }
            }
          ];
          return {
            kind: 'Hidden Single', digit: d, target: { r, c }, unit: { kind, index: idx }, steps,
            apply: (b) => setValueKeepCands(b, r, c, d)
          };
        }
      }
    }
    return null;
  }

  // ---------- Locked Candidates ----------
  // Pointing: in a BOX, if digit d candidates sit only in one ROW or COL of that box,
  // eliminate d from that entire ROW/COL outside the box.
  private lockedCandidatesPointing(board: Board): HintResult | null {
    for (let box = 0; box < 9; box++) {
      const cells = boxCells(box);
      for (let d = 1; d <= 9; d++) {
        const spots = cells.filter(({ r, c }) => !board[r][c].value && board[r][c].candidates.has(d));
        if (spots.length < 2) continue; // need at least 2 to be interesting
        const rows = uniq(spots.map(s => s.r));
        const cols = uniq(spots.map(s => s.c));
        // confined to one row?
        if (rows.length === 1) {
          const r = rows[0];
          const eliminations: Array<{ r: number; c: number; d: number }> = [];
          for (let c = 0; c < 9; c++) {
            if (inBox(r, c) === box) continue;
            if (!board[r][c].value && board[r][c].candidates.has(d)) eliminations.push({ r, c, d });
          }
          if (eliminations.length) return this.buildLockedPointing(board, 'row', box, r, d, spots, eliminations);
        }
        // confined to one col?
        if (cols.length === 1) {
          const c = cols[0];
          const eliminations: Array<{ r: number; c: number; d: number }> = [];
          for (let r = 0; r < 9; r++) {
            if (inBox(r, c) === box) continue;
            if (!board[r][c].value && board[r][c].candidates.has(d)) eliminations.push({ r, c, d });
          }
          if (eliminations.length) return this.buildLockedPointing(board, 'col', box, c, d, spots, eliminations);
        }
      }
    }
    return null;
  }

  private buildLockedPointing(
    board: Board,
    axis: 'row' | 'col',
    box: number,
    idx: number,
    d: number,
    boxSpots: Array<{ r: number; c: number }>,
    eliminations: Array<{ r: number; c: number; d: number }>
  ): HintResult {
    const unitStr = axis === 'row' ? `row ${ROW_LETTERS[idx]}` : `column ${idx + 1}`;
    const steps: HintStep[] = [
      {
        title: `Locked Candidates (pointing)`, message: `In box ${box + 1}, digit ${d} appears only in ${unitStr}.`,
        highlight: { boxes: [box], [axis === 'row' ? 'rows' : 'cols']: [idx] as any, cells: boxSpots }
      },
      {
        title: `Eliminate ${d} in ${unitStr}`, message: `Remove ${d} from ${unitStr} outside box ${box + 1}: ${eliminations.map(e => coord(e.r, e.c)).join(', ')}.`,
        highlight: { [axis === 'row' ? 'rows' : 'cols']: [idx] as any, boxes: [box], candTargets: eliminations }
      }
    ];
    return {
      kind: 'Locked Candidates', // label not used here; we’ll just return a generic kind string
      // To keep existing structure, we still fill fields; target is arbitrary (first spot)
      digit: d,
      target: boxSpots[0],
      steps,
      apply: (b) => removeCandidates(b, eliminations)
    };
  }

  // Claiming: in a ROW/COL, if digit d candidates sit only within one BOX,
  // eliminate d from that BOX outside the ROW/COL.
  private lockedCandidatesClaiming(board: Board): HintResult | null {
    for (const kind of ['row', 'col'] as UnitKind[]) {
      for (let idx = 0; idx < 9; idx++) {
        for (let d = 1; d <= 9; d++) {
          const spots: Array<{ r: number; c: number }> = [];
          forEachUnitCell(kind, idx, (r, c) => {
            if (!board[r][c].value && board[r][c].candidates.has(d)) spots.push({ r, c });
          });
          if (spots.length < 2) continue;
          const boxes = uniq(spots.map(s => inBox(s.r, s.c)));
          if (boxes.length === 1) {
            const box = boxes[0];
            const eliminations: Array<{ r: number; c: number; d: number }> = [];
            for (const bc of boxCells(box)) {
              if ((kind === 'row' && bc.r === idx) || (kind === 'col' && bc.c === idx)) continue; // skip inside the line
              if (!board[bc.r][bc.c].value && board[bc.r][bc.c].candidates.has(d)) eliminations.push({ r: bc.r, c: bc.c, d });
            }
            if (eliminations.length) {
              const steps: HintStep[] = [
                {
                  title: `Locked Candidates (claiming)`, message: `In ${unitName(kind, idx)}, ${d} lies only in box ${box + 1}.`,
                  highlight: { ...unitHighlight(kind, idx), boxes: [box], cells: spots }
                },
                {
                  title: `Eliminate in box ${box + 1}`, message: `Remove ${d} from cells in box ${box + 1} outside ${unitName(kind, idx)}: ${eliminations.map(e => coord(e.r, e.c)).join(', ')}.`,
                  highlight: { boxes: [box], ...unitHighlight(kind, idx), candTargets: eliminations }
                }
              ];
              return {
                kind: 'Locked Candidates', digit: d, target: spots[0], steps,
                apply: (b) => removeCandidates(b, eliminations)
              };
            }
          }
        }
      }
    }
    return null;
  }

  // ---------- Pairs ----------
  // Naked Pair: two cells in a unit share the same two candidates -> remove those from other cells in unit.
  private nakedPair(board: Board, kind: UnitKind): HintResult | null {
    for (let idx = 0; idx < 9; idx++) {
      const cells: Array<{ r: number; c: number; set: string; cand: number[] }> = [];
      forEachUnitCell(kind, idx, (r, c) => {
        const cell = board[r][c];
        if (cell.value) return;
        const cands = Array.from(cell.candidates);
        if (cands.length === 2) cells.push({ r, c, set: cands.slice().sort().join(','), cand: cands });
      });
      const pairs = groupBy(cells, x => x.set);
      for (const key of Object.keys(pairs)) {
        if (pairs[key].length === 2) {
          const digits = pairs[key][0].cand;
          const others: Array<{ r: number; c: number; d: number }> = [];
          forEachUnitCell(kind, idx, (r, c) => {
            if (pairs[key].some(p => p.r === r && p.c === c)) return;
            const cell = board[r][c];
            if (cell.value) return;
            for (const d of digits) if (cell.candidates.has(d)) others.push({ r, c, d });
          });
          if (others.length) {
            const spots = pairs[key].map(p => ({ r: p.r, c: p.c }));
            const steps: HintStep[] = [
              {
                title: `Naked Pair in ${unitName(kind, idx)}`, message: `${digits.join(' & ')} only at ${spots.map(s => coord(s.r, s.c)).join(' & ')}.`,
                highlight: { ...unitHighlight(kind, idx), cells: spots, candTargets: spots.flatMap(s => digits.map(d => ({ r: s.r, c: s.c, d }))) }
              },
              {
                title: `Eliminate ${digits.join(' & ')} elsewhere`, message: `Remove from ${unitName(kind, idx)} other cells: ${uniq(others.map(o => coord(o.r, o.c))).join(', ')}`,
                highlight: { ...unitHighlight(kind, idx), candTargets: others }
              }
            ];
            return { kind: 'Naked Pair', digit: digits[0], target: spots[0], steps, apply: (b) => removeCandidates(b, others) };
          }
        }
      }
    }
    return null;
  }

  // Hidden Pair: two digits appear exactly twice in a unit -> in those cells, keep only those two.
  private hiddenPair(board: Board, kind: UnitKind): HintResult | null {
    for (let idx = 0; idx < 9; idx++) {
      // map digit -> cells
      const occ: Map<number, Array<{ r: number; c: number }>> = new Map();
      for (let d = 1; d <= 9; d++) occ.set(d, []);
      forEachUnitCell(kind, idx, (r, c) => {
        const cell = board[r][c];
        if (cell.value) return;
        for (const d of cell.candidates) occ.get(d)!.push({ r, c });
      });
      const digits = [...occ.entries()].filter(([_, arr]) => arr.length === 2);
      for (let i = 0; i < digits.length; i++) {
        for (let j = i + 1; j < digits.length; j++) {
          const [d1, cells1] = digits[i];
          const [d2, cells2] = digits[j];
          if (sameCellList(cells1, cells2)) {
            const spots = cells1; // same as cells2
            const keeps = [d1, d2];
            const trims: Array<{ r: number; c: number; d: number }> = [];
            for (const s of spots) {
              for (const d of board[s.r][s.c].candidates) {
                if (!keeps.includes(d)) trims.push({ r: s.r, c: s.c, d });
              }
            }
            if (trims.length) {
              const steps: HintStep[] = [
                {
                  title: `Hidden Pair in ${unitName(kind, idx)}`, message: `${d1} & ${d2} appear only at ${spots.map(s => coord(s.r, s.c)).join(' & ')}.`,
                  highlight: { ...unitHighlight(kind, idx), cells: spots, candTargets: spots.flatMap(s => keeps.map(d => ({ r: s.r, c: s.c, d }))) }
                },
                {
                  title: `Keep ${d1} & ${d2}`, message: `Remove all other candidates in those cells.`,
                  highlight: { ...unitHighlight(kind, idx), candTargets: trims }
                }
              ];
              return { kind: 'Hidden Pair', digit: d1, target: spots[0], steps, apply: (b) => removeCandidates(b, trims) };
            }
          }
        }
      }
    }
    return null;
  }
}

// ---------- helpers ----------
function forEachUnitCell(kind: UnitKind, idx: number, fn: (r: number, c: number) => void) {
  if (kind === 'row') for (let c = 0; c < 9; c++) fn(idx, c);
  else if (kind === 'col') for (let r = 0; r < 9; r++) fn(r, idx);
  else {
    const br = Math.floor(idx / 3) * 3, bc = (idx % 3) * 3;
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) fn(r, c);
  }
}

function unitHighlight(kind: UnitKind, idx: number) {
  return kind === 'row' ? { rows: [idx] } : kind === 'col' ? { cols: [idx] } : { boxes: [idx] };
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function inBox(r: number, c: number) {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

function boxCells(box: number) {
  const br = Math.floor(box / 3) * 3, bc = (box % 3) * 3;
  const out: Array<{ r: number; c: number }> = [];
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) out.push({ r, c });
  return out;
}

function sameCellList(a: Array<{ r: number; c: number }>, b: Array<{ r: number; c: number }>) {
  return a.length === b.length && a.every(s => b.some(t => t.r === s.r && t.c === s.c));
}

function removeCandidates(board: Board, removals: Array<{ r: number; c: number; d: number }>): Board {
  const next = board.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed)
  })));
  for (const { r, c, d } of removals) next[r][c].suppressed.add(d);
  return computeCandidates(next);
}

function setValueKeepCands(board: Board, r: number, c: number, d: number): Board {
  const next = board.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
    suppressed: new Set(cell.suppressed)
  })));
  // place value and clear suppressed for that cell
  next[r][c].value = d as any;
  next[r][c].suppressed.clear();
  return computeCandidates(next);
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

