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

    // 6) BUG (BUG+1)
    const bug = this.bug(b);
    if (bug) return bug;

    // 7) Swordfish (rows, then cols)  ← added here
    const sfRow = this.swordfish(b, 'row');
    if (sfRow) return sfRow;
    const sfCol = this.swordfish(b, 'col');
    if (sfCol) return sfCol;

    // 8) Jellyfish (rows, then cols)
    const jfRow = this.swordfish(b, 'row');
    if (jfRow) return jfRow;
    const jfCol = this.swordfish(b, 'col');
    if (jfCol) return jfCol;

    // 9) Skyscraper (rows, then cols)
    const skyRow = this.skyscraper(b, 'row');
    if (skyRow) return skyRow;
    const skyCol = this.skyscraper(b, 'col');
    if (skyCol) return skyCol;

    // 10) XY-Wing
    const xy = this.xyWing(b);
    if (xy) return xy;

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
              title: `Scan ${unitName(kind, idx)}`, message: `Within ${unitName(kind, idx)}, number ${d}.`,
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

  /**
   * BUG (BUG+1):
   * All unsolved cells are bi-value except ONE cell S with exactly 3 candidates.
   * When counting candidate digits globally, exactly one digit has an odd total.
   * That digit must be the value at S.
   */
  private bug(board: Board): HintResult | null {
    // Collect unsolved cells and detect the single tri-value exception
    const unsolved: Array<{ r: number; c: number; cand: number[] }> = [];
    let tri: { r: number; c: number; cand: number[] } | null = null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = board[r][c];
        if (cell.value) continue;
        const cand = Array.from(cell.candidates);
        if (cand.length === 0) return null;                 // not a valid BUG state
        if (cand.length === 2) {
          unsolved.push({ r, c, cand });
        } else if (cand.length === 3) {
          if (tri) return null;                              // more than one exception
          tri = { r, c, cand };
        } else {
          return null;                                       // has >3 candidates → not BUG+1
        }
      }
    }
    if (!tri) return null;                                   // need exactly one tri-value cell

    // Global parity count per digit
    const count = new Map<number, number>();
    for (let d = 1; d <= 9; d++) count.set(d, 0);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value) continue;
      for (const d of cell.candidates) count.set(d, (count.get(d) || 0) + 1);
    }

    const oddDigits = [...count.entries()].filter(([_, n]) => n % 2 === 1).map(([d]) => d);
    if (oddDigits.length !== 1) return null;

    const dMust = oddDigits[0];
    if (!tri.cand.includes(dMust)) return null;              // parity digit must be in tri cell

    // Optional: highlight all occurrences of dMust to visualize odd parity
    const allDCells: Array<{ r: number; c: number; d: number }> = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (!cell.value && cell.candidates.has(dMust)) allDCells.push({ r, c, d: dMust });
    }

    const steps: HintStep[] = [
      {
        title: `BUG+1 state`,
        message: `Every empty cell is bi-value except ${coord(tri.r, tri.c)} with 3 candidates {${tri.cand.join(', ')}}.`,
        highlight: { cells: [{ r: tri.r, c: tri.c }] }
      },
      {
        title: `Parity check`,
        message: `Across the board, candidate counts must be even. Only ${dMust} appears an odd number of times.`,
        highlight: { candTargets: allDCells }
      },
      {
        title: `Conclusion`,
        message: `${dMust} must be placed at ${coord(tri.r, tri.c)} to fix parity.`,
        highlight: { cells: [{ r: tri.r, c: tri.c }], candTargets: [{ r: tri.r, c: tri.c, d: dMust }] }
      }
    ];

    return {
      kind: 'BUG',
      digit: dMust,
      target: { r: tri.r, c: tri.c },
      steps,
      apply: (b) => setValueKeepCands(b, tri!.r, tri!.c, dMust)
    };
  }

  // ---------- Swordfish (size 3 fish) ----------
  private swordfish(board: Board, orientation: 'row' | 'col'): HintResult | null {
    // orientation 'row': choose 3 rows; candidate columns union size == 3; eliminate in those columns from other rows
    // orientation 'col': symmetric
    for (let d = 1; d <= 9; d++) {
      const unitIndices = [...Array(9).keys()];
      const combos = chooseCombos(unitIndices, 3);
      for (const trio of combos) {
        if (orientation === 'row') {
          // map each row -> set of columns where d is a candidate (limit 2..3)
          const rowCols: Array<{ r: number; cols: number[] }> = trio.map(r => ({
            r,
            cols: colsWithDigit(board, r, d)
          }));
          if (rowCols.some(x => x.cols.length === 0 || x.cols.length > 3)) continue;
          const unionCols = uniq(rowCols.flatMap(x => x.cols)).sort((a, b) => a - b);
          if (unionCols.length !== 3) continue;
          // ensure each row's cols ⊆ union
          if (!rowCols.every(x => x.cols.every(c => unionCols.includes(c)))) continue;

          // eliminations: in unionCols, for all rows NOT in trio, remove d
          const elim: Array<{ r: number; c: number; d: number }> = [];
          for (let r = 0; r < 9; r++) {
            if (trio.includes(r)) continue;
            for (const c of unionCols) {
              const cell = board[r][c];
              if (!cell.value && cell.candidates.has(d)) elim.push({ r, c, d });
            }
          }
          if (!elim.length) continue;

          const fishCells = rowCols.flatMap(x => x.cols.map(c => ({ r: x.r, c })));
          const steps: HintStep[] = [
            {
              title: `Swordfish on ${d} (rows ${ROW_LETTERS[trio[0]]}, ${ROW_LETTERS[trio[1]]}, ${ROW_LETTERS[trio[2]]})`,
              message: `In rows ${ROW_LETTERS[trio[0]]}, ${ROW_LETTERS[trio[1]]}, ${ROW_LETTERS[trio[2]]}, digit ${d} appears only in columns ${unionCols.map(c => c + 1).join(', ')}.`,
              highlight: { rows: trio, cols: unionCols, cells: fishCells, candTargets: fishCells.map(s => ({ r: s.r, c: s.c, d })) }
            },
            {
              title: `Eliminate ${d} from other rows`,
              message: `Remove ${d} from columns ${unionCols.map(c => c + 1).join(', ')} in all other rows: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
              highlight: { cols: unionCols, candTargets: elim }
            }
          ];
          return { kind: 'Swordfish', digit: d, target: { r: rowCols[0].r, c: rowCols[0].cols[0] }, steps, apply: (b) => removeCandidates(b, elim) };
        } else {
          // orientation === 'col'
          const colRows: Array<{ c: number; rows: number[] }> = trio.map(c => ({
            c,
            rows: rowsWithDigit(board, c, d)
          }));
          if (colRows.some(x => x.rows.length === 0 || x.rows.length > 3)) continue;
          const unionRows = uniq(colRows.flatMap(x => x.rows)).sort((a, b) => a - b);
          if (unionRows.length !== 3) continue;
          if (!colRows.every(x => x.rows.every(r => unionRows.includes(r)))) continue;

          const elim: Array<{ r: number; c: number; d: number }> = [];
          for (let c = 0; c < 9; c++) {
            if (trio.includes(c)) continue;
            for (const r of unionRows) {
              const cell = board[r][c];
              if (!cell.value && cell.candidates.has(d)) elim.push({ r, c, d });
            }
          }
          if (!elim.length) continue;

          const fishCells = colRows.flatMap(x => x.rows.map(r => ({ r, c: x.c })));
          const steps: HintStep[] = [
            {
              title: `Swordfish on ${d} (columns ${trio.map(c => c + 1).join(', ')})`,
              message: `In columns ${trio.map(c => c + 1).join(', ')}, digit ${d} appears only in rows ${unionRows.map(r => ROW_LETTERS[r]).join(', ')}.`,
              highlight: { cols: trio, rows: unionRows, cells: fishCells, candTargets: fishCells.map(s => ({ r: s.r, c: s.c, d })) }
            },
            {
              title: `Eliminate ${d} from other columns`,
              message: `Remove ${d} from rows ${unionRows.map(r => ROW_LETTERS[r]).join(', ')} in all other columns: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
              highlight: { rows: unionRows, candTargets: elim }
            }
          ];
          return { kind: 'Swordfish', digit: d, target: { r: colRows[0].rows[0], c: colRows[0].c }, steps, apply: (b) => removeCandidates(b, elim) };
        }
      }
    }
    return null;
  }

  /** Jellyfish (size 4): like Swordfish but with 4 rows/cols and union of 4 counterpart cols/rows */
  private jellyfish(board: Board, orientation: 'row' | 'col'): HintResult | null {
    for (let d = 1; d <= 9; d++) {
      const unitIdx = [...Array(9).keys()];
      for (const quad of chooseCombos(unitIdx, 4)) {
        if (orientation === 'row') {
          // rows → collect candidate columns per row (2..4)
          const rowCols: Array<{ r: number; cols: number[] }> = quad.map(r => ({
            r, cols: colsWithDigit(board, r, d)
          }));
          if (rowCols.some(x => x.cols.length === 0 || x.cols.length > 4)) continue;
          const unionCols = uniq(rowCols.flatMap(x => x.cols)).sort((a, b) => a - b);
          if (unionCols.length !== 4) continue;
          if (!rowCols.every(x => x.cols.every(c => unionCols.includes(c)))) continue;

          // eliminate d from unionCols in rows not in the quad
          const elim: Array<{ r: number; c: number; d: number }> = [];
          for (let r = 0; r < 9; r++) {
            if (quad.includes(r)) continue;
            for (const c of unionCols) {
              const cell = board[r][c];
              if (!cell.value && cell.candidates.has(d)) elim.push({ r, c, d });
            }
          }
          if (!elim.length) continue;

          const fishCells = rowCols.flatMap(x => x.cols.map(c => ({ r: x.r, c })));
          const steps: HintStep[] = [
            {
              title: `Jellyfish on ${d} (rows ${quad.map(r => ROW_LETTERS[r]).join(', ')})`,
              message: `In rows ${quad.map(r => ROW_LETTERS[r]).join(', ')}, ${d} appears only in columns ${unionCols.map(c => c + 1).join(', ')}.`,
              highlight: { rows: quad, cols: unionCols, cells: fishCells, candTargets: fishCells.map(s => ({ r: s.r, c: s.c, d })) }
            },
            {
              title: `Eliminate ${d} from other rows`,
              message: `Remove ${d} from columns ${unionCols.map(c => c + 1).join(', ')} in all other rows: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
              highlight: { cols: unionCols, candTargets: elim }
            }
          ];
          return { kind: 'Jellyfish', digit: d, target: fishCells[0], steps, apply: (b) => removeCandidates(b, elim) };
        } else {
          // columns → collect candidate rows per column (2..4)
          const colRows: Array<{ c: number; rows: number[] }> = quad.map(c => ({
            c, rows: rowsWithDigit(board, c, d)
          }));
          if (colRows.some(x => x.rows.length === 0 || x.rows.length > 4)) continue;
          const unionRows = uniq(colRows.flatMap(x => x.rows)).sort((a, b) => a - b);
          if (unionRows.length !== 4) continue;
          if (!colRows.every(x => x.rows.every(r => unionRows.includes(r)))) continue;

          const elim: Array<{ r: number; c: number; d: number }> = [];
          for (let c = 0; c < 9; c++) {
            if (quad.includes(c)) continue;
            for (const r of unionRows) {
              const cell = board[r][c];
              if (!cell.value && cell.candidates.has(d)) elim.push({ r, c, d });
            }
          }
          if (!elim.length) continue;

          const fishCells = colRows.flatMap(x => x.rows.map(r => ({ r, c: x.c })));
          const steps: HintStep[] = [
            {
              title: `Jellyfish on ${d} (columns ${quad.map(c => c + 1).join(', ')})`,
              message: `In columns ${quad.map(c => c + 1).join(', ')}, ${d} appears only in rows ${unionRows.map(r => ROW_LETTERS[r]).join(', ')}.`,
              highlight: { cols: quad, rows: unionRows, cells: fishCells, candTargets: fishCells.map(s => ({ r: s.r, c: s.c, d })) }
            },
            {
              title: `Eliminate ${d} from other columns`,
              message: `Remove ${d} from rows ${unionRows.map(r => ROW_LETTERS[r]).join(', ')} in all other columns: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
              highlight: { rows: unionRows, candTargets: elim }
            }
          ];
          return { kind: 'Jellyfish', digit: d, target: fishCells[0], steps, apply: (b) => removeCandidates(b, elim) };
        }
      }
    }
    return null;
  }

  /**
   * Skyscraper on digit d:
   * orientation 'row': pick two rows r1,r2 that each form a strong link (exactly two cols),
   * sharing one column cS; the other columns cA (in r1) and cB (in r2) are the "towers".
   * Any cell that sees BOTH (r1,cA) and (r2,cB) cannot be d.
   */
  private skyscraper(board: Board, orientation: 'row' | 'col'): HintResult | null {
    // peers helper (local, cached)
    const peersCache = new Map<string, Set<string>>();
    const peersOf = (r: number, c: number): Set<string> => {
      const k = `${r},${c}`;
      if (peersCache.has(k)) return peersCache.get(k)!;
      const s = new Set<string>();
      for (let i = 0; i < 9; i++) {
        if (i !== c) s.add(`${r},${i}`); // row
        if (i !== r) s.add(`${i},${c}`); // col
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) {
        if (rr === r && cc === c) continue;
        s.add(`${rr},${cc}`);
      }
      peersCache.set(k, s);
      return s;
    };

    // For each digit, gather strong links per unit (two spots exactly)
    for (let d = 1; d <= 9; d++) {
      if (orientation === 'row') {
        // row strong links: map row -> [c1,c2] where only these two have candidate d
        const rowLinks: Array<{ r: number; cols: number[] }> = [];
        for (let r = 0; r < 9; r++) {
          const cols: number[] = [];
          for (let c = 0; c < 9; c++) if (!board[r][c].value && board[r][c].candidates.has(d)) cols.push(c);
          if (cols.length === 2) rowLinks.push({ r, cols });
        }
        // pick two rows whose sets share exactly one column
        for (const [i, j] of choosePairs(rowLinks.length)) {
          const A = rowLinks[i], B = rowLinks[j];
          const shared = A.cols.filter(c => B.cols.includes(c));
          if (shared.length !== 1) continue;
          const cS = shared[0];                            // shared column
          const cA = A.cols.find(c => c !== cS)!;          // tower 1
          const cB = B.cols.find(c => c !== cS)!;          // tower 2
          const t1 = { r: A.r, c: cA }, t2 = { r: B.r, c: cB };
          // cells that see both towers
          const meet = intersectKeys(peersOf(t1.r, t1.c), peersOf(t2.r, t2.c));
          meet.delete(`${t1.r},${t1.c}`); meet.delete(`${t2.r},${t2.c}`);
          const elim: Array<{ r: number; c: number; d: number }> = [];
          for (const k of meet) {
            const [er, ec] = k.split(',').map(Number);
            const cell = board[er][ec];
            if (!cell.value && cell.candidates.has(d)) elim.push({ r: er, c: ec, d });
          }
          if (!elim.length) continue;

          const steps: HintStep[] = [
            {
              title: `Skyscraper on ${d} (rows ${ROW_LETTERS[A.r]} & ${ROW_LETTERS[B.r]})`,
              message: `Rows ${ROW_LETTERS[A.r]} and ${ROW_LETTERS[B.r]} each have a strong link on ${d} (two spots only). They share column ${cS + 1}.`,
              highlight: { rows: [A.r, B.r], cols: [cS], cells: [{ r: A.r, c: cS }, { r: B.r, c: cS }], candTargets: [{ r: A.r, c: cS, d }, { r: B.r, c: cS, d }] }
            },
            {
              title: `The towers`,
              message: `The other endpoints are ${coord(t1.r, t1.c)} and ${coord(t2.r, t2.c)}.`,
              highlight: {
                rows: [A.r, B.r],
                cols: [cA, cB],
                cells: [t1, t2],
                candTargets: [{ r: t1.r, c: t1.c, d }, { r: t2.r, c: t2.c, d }]
              }
            },
            {
              title: `Why it works`,
              message: `If ${coord(t1.r, t1.c)} is not ${d}, ${coord(A.r, cS)} must be ${d}, forcing ${coord(B.r, cS)} not ${d}, so ${coord(t2.r, t2.c)} must be ${d}. Or vice-versa. Therefore any cell that sees both towers cannot be ${d}.`
            },
            {
              title: `Eliminate ${d}`,
              message: `Remove ${d} from: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
              highlight: { candTargets: elim }
            }
          ];
          return { kind: 'Skyscraper', digit: d, target: t1, steps, apply: (b) => removeCandidates(b, elim) };
        }
      } else {
        // orientation === 'col': symmetric (swap r/c)
        const colLinks: Array<{ c: number; rows: number[] }> = [];
        for (let c = 0; c < 9; c++) {
          const rows: number[] = [];
          for (let r = 0; r < 9; r++) if (!board[r][c].value && board[r][c].candidates.has(d)) rows.push(r);
          if (rows.length === 2) colLinks.push({ c, rows });
        }
        for (const [i, j] of choosePairs(colLinks.length)) {
          const A = colLinks[i], B = colLinks[j];
          const shared = A.rows.filter(r => B.rows.includes(r));
          if (shared.length !== 1) continue;
          const rS = shared[0];
          const rA = A.rows.find(r => r !== rS)!;
          const rB = B.rows.find(r => r !== rS)!;
          const t1 = { r: rA, c: A.c }, t2 = { r: rB, c: B.c };
          const meet = intersectKeys(peersOf(t1.r, t1.c), peersOf(t2.r, t2.c));
          meet.delete(`${t1.r},${t1.c}`); meet.delete(`${t2.r},${t2.c}`);
          const elim: Array<{ r: number; c: number; d: number }> = [];
          for (const k of meet) {
            const [er, ec] = k.split(',').map(Number);
            const cell = board[er][ec];
            if (!cell.value && cell.candidates.has(d)) elim.push({ r: er, c: ec, d });
          }
          if (!elim.length) continue;

          const steps: HintStep[] = [
            {
              title: `Skyscraper on ${d} (columns ${A.c + 1} & ${B.c + 1})`,
              message: `Columns ${A.c + 1} and ${B.c + 1} each have a strong link on ${d}. They share row ${ROW_LETTERS[rS]}.`,
              highlight: { cols: [A.c, B.c], rows: [rS], cells: [{ r: rS, c: A.c }, { r: rS, c: B.c }], candTargets: [{ r: rS, c: A.c, d }, { r: rS, c: B.c, d }] }
            },
            {
              title: `The towers`,
              message: `The other endpoints are ${coord(t1.r, t1.c)} and ${coord(t2.r, t2.c)}.`,
              highlight: {
                cols: [A.c, B.c],
                rows: [rA, rB],
                cells: [t1, t2],
                candTargets: [{ r: t1.r, c: t1.c, d }, { r: t2.r, c: t2.c, d }]
              }
            },
            {
              title: `Why it works`,
              message: `Either ${coord(t1.r, t1.c)} or ${coord(t2.r, t2.c)} must be ${d}, so any cell that sees both cannot be ${d}.`
            },
            {
              title: `Eliminate ${d}`,
              message: `Remove ${d} from: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
              highlight: { candTargets: elim }
            }
          ];
          return { kind: 'Skyscraper', digit: d, target: t1, steps, apply: (b) => removeCandidates(b, elim) };
        }
      }
    }
    return null;
  }

  // ---------- XY-Wing ----------
  /**
   * Pattern: Pivot P with candidates {X,Y}, Pincer A with {X,Z} sharing a unit with P,
   *          Pincer B with {Y,Z} sharing a different unit with P. Any cell that sees A and B
   *          cannot be Z → eliminate Z there.
   */
  private xyWing(board: Board): HintResult | null {
    // Precompute peers for quick intersection
    const peersCache = new Map<string, Set<string>>();

    const peersOf = (r: number, c: number): Set<string> => {
      const k = `${r},${c}`;
      if (peersCache.has(k)) return peersCache.get(k)!;
      const set = new Set<string>();
      for (let i = 0; i < 9; i++) {
        if (i !== c) set.add(`${r},${i}`); // row
        if (i !== r) set.add(`${i},${c}`); // col
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) {
        if (rr === r && cc === c) continue;
        set.add(`${rr},${cc}`);
      }
      peersCache.set(k, set);
      return set;
    };

    // list all bi-value cells
    const bivals: Array<{ r: number; c: number; cand: number[] }> = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value) continue;
      const cand = Array.from(cell.candidates);
      if (cand.length === 2) bivals.push({ r, c, cand: cand.sort((a, b) => a - b) });
    }

    for (const pivot of bivals) {
      const [X, Y] = pivot.cand;
      // find pincers that see pivot: one with {X,Z}, one with {Y,Z}
      const pivotPeers = peersOf(pivot.r, pivot.c);

      const pinX: Array<{ r: number; c: number; Z: number }> = [];
      const pinY: Array<{ r: number; c: number; Z: number }> = [];

      for (const peerKey of pivotPeers) {
        const [pr, pc] = peerKey.split(',').map(Number);
        const cell = board[pr][pc];
        if (cell.value) continue;
        const cand = Array.from(cell.candidates);
        if (cand.length !== 2) continue;
        const s = new Set(cand);
        if (s.has(X) && !s.has(Y)) {
          const Z = cand.find(d => d !== X)!;
          pinX.push({ r: pr, c: pc, Z });
        } else if (s.has(Y) && !s.has(X)) {
          const Z = cand.find(d => d !== Y)!;
          pinY.push({ r: pr, c: pc, Z });
        }
      }

      for (const a of pinX) {
        for (const b of pinY) {
          if (a.Z !== b.Z) continue; // need shared Z
          const Z = a.Z;

          // eliminations: cells that see both a and b, with candidate Z
          const meet = intersectKeys(peersOf(a.r, a.c), peersOf(b.r, b.c));
          // exclude pivot and the pincers themselves
          meet.delete(`${pivot.r},${pivot.c}`);
          meet.delete(`${a.r},${a.c}`);
          meet.delete(`${b.r},${b.c}`);

          const eliminations: Array<{ r: number; c: number; d: number }> = [];
          for (const key of meet) {
            const [er, ec] = key.split(',').map(Number);
            const cell = board[er][ec];
            if (!cell.value && cell.candidates.has(Z)) eliminations.push({ r: er, c: ec, d: Z });
          }
          if (!eliminations.length) continue;

          // Build hint
          const steps: HintStep[] = [
            {
              title: `XY-Wing pivot at ${coord(pivot.r, pivot.c)}`,
              message: `Pivot ${coord(pivot.r, pivot.c)} has candidates {${X}, ${Y}}.`,
              highlight: { cells: [{ r: pivot.r, c: pivot.c }], candTargets: [{ r: pivot.r, c: pivot.c, d: X }, { r: pivot.r, c: pivot.c, d: Y }] }
            },
            {
              title: `Pincers ${coord(a.r, a.c)} and ${coord(b.r, b.c)}`,
              message: `${coord(a.r, a.c)} has {${X}, ${Z}} and ${coord(b.r, b.c)} has {${Y}, ${Z}}. Both see the pivot.`,
              highlight: {
                cells: [{ r: a.r, c: a.c }, { r: b.r, c: b.c }],
                candTargets: [
                  { r: a.r, c: a.c, d: X }, { r: a.r, c: a.c, d: Z },
                  { r: b.r, c: b.c, d: Y }, { r: b.r, c: b.c, d: Z }
                ]
              }
            },
            {
              title: `Why XY-Wing works`,
              message: `If ${coord(pivot.r, pivot.c)} is ${X}, then ${coord(b.r, b.c)} must be ${Z}. If ${coord(pivot.r, pivot.c)} is ${Y}, then ${coord(a.r, a.c)} must be ${Z}. Either way, any cell that sees both pincers cannot be ${Z}.`,
              highlight: { cells: [{ r: a.r, c: a.c }, { r: b.r, c: b.c }] }
            },
            {
              title: `Eliminate ${Z}`,
              message: `Remove ${Z} from ${eliminations.map(e => coord(e.r, e.c)).join(', ')}.`,
              highlight: { candTargets: eliminations }
            }
          ];

          // pick a stable target (pivot) for post-apply selection
          return {
            kind: 'XY-Wing',
            digit: Z,
            target: { r: pivot.r, c: pivot.c },
            steps,
            apply: (b) => removeCandidates(b, eliminations)
          };
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

function intersectKeys(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const k of a) if (b.has(k)) out.add(k);
  return out;
}

function chooseCombos(items: number[], k: number): number[][] {
  const res: number[][] = [];
  const n = items.length;
  const dfs = (start: number, path: number[]) => {
    if (path.length === k) { res.push([...path]); return; }
    for (let i = start; i < n; i++) {
      path.push(items[i]);
      dfs(i + 1, path);
      path.pop();
    }
  };
  dfs(0, []);
  return res;
}

function colsWithDigit(board: Board, r: number, d: number): number[] {
  const cols: number[] = [];
  for (let c = 0; c < 9; c++) if (!board[r][c].value && board[r][c].candidates.has(d)) cols.push(c);
  return cols;
}

function rowsWithDigit(board: Board, c: number, d: number): number[] {
  const rows: number[] = [];
  for (let r = 0; r < 9; r++) if (!board[r][c].value && board[r][c].candidates.has(d)) rows.push(r);
  return rows;
}

function choosePairs(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}
