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

@Injectable({ providedIn: 'root' })
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

    // 4) Naked Pair
    for (const kind of ['row', 'col', 'box'] as UnitKind[]) {
      const np = this.nakedPair(b, kind);
      if (np) return np;
    }

    // 5) Hidden Pair
    for (const kind of ['row', 'col', 'box'] as UnitKind[]) {
      const hp = this.hiddenPair(b, kind);
      if (hp) return hp;
    }

    // 6) BUG
    const bug = this.bug(b);
    if (bug) return bug;

    // 7) Swordfish (rows, then cols)
    const sfRow = this.swordfish(b, 'row');
    if (sfRow) return sfRow;
    const sfCol = this.swordfish(b, 'col');
    if (sfCol) return sfCol;

    // 8) Jellyfish (rows, then cols)
    const jfRow = this.jellyfish(b, 'row');
    if (jfRow) return jfRow;
    const jfCol = this.jellyfish(b, 'col');
    if (jfCol) return jfCol;

    // 9) Skyscraper
    const skyRow = this.skyscraper(b, 'row');
    if (skyRow) return skyRow;
    const skyCol = this.skyscraper(b, 'col');
    if (skyCol) return skyCol;

    // 10) XY-Wing
    const xy = this.xyWing(b);
    if (xy) return xy;

    // 11) W-Wing
    const ww = this.wWing(b);
    if (ww) return ww;

    // 12) XYZ-Wing
    const xyz = this.xyzWing(b);
    if (xyz) return xyz;

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
    return { kind: 'Naked Single', digit: d, target: { r, c }, steps, apply: (b) => setValueKeepCands(b, r, c, d) };
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
  private lockedCandidatesPointing(board: Board): HintResult | null {
    for (let box = 0; box < 9; box++) {
      const cells = boxCells(box);
      for (let d = 1; d <= 9; d++) {
        const spots = cells.filter(({ r, c }) => !board[r][c].value && board[r][c].candidates.has(d));
        if (spots.length < 2) continue;
        const rows = uniq(spots.map(s => s.r));
        const cols = uniq(spots.map(s => s.c));
        if (rows.length === 1) {
          const r = rows[0];
          const eliminations: Array<{ r: number; c: number; d: number }> = [];
          for (let c = 0; c < 9; c++) {
            if (inBox(r, c) === box) continue;
            if (!board[r][c].value && board[r][c].candidates.has(d)) eliminations.push({ r, c, d });
          }
          if (eliminations.length) return this.buildLockedPointing(board, 'row', box, r, d, spots, eliminations);
        }
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
      kind: 'Locked Candidates',
      digit: d,
      target: boxSpots[0],
      steps,
      apply: (b) => removeCandidates(b, eliminations)
    };
  }

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
              if ((kind === 'row' && bc.r === idx) || (kind === 'col' && bc.c === idx)) continue;
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

  private hiddenPair(board: Board, kind: UnitKind): HintResult | null {
    for (let idx = 0; idx < 9; idx++) {
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
            const spots = cells1;
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

  // ---------- BUG ----------
  private bug(board: Board): HintResult | null {
    const unsolved: Array<{ r: number; c: number; cand: number[] }> = [];
    let tri: { r: number; c: number; cand: number[] } | null = null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = board[r][c];
        if (cell.value) continue;
        const cand = Array.from(cell.candidates);
        if (cand.length === 0) return null;
        if (cand.length === 2) {
          unsolved.push({ r, c, cand });
        } else if (cand.length === 3) {
          if (tri) return null;
          tri = { r, c, cand };
        } else {
          return null;
        }
      }
    }
    if (!tri) return null;

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
    if (!tri.cand.includes(dMust)) return null;

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

  // ---------- Fish ----------
  private swordfish(board: Board, orientation: 'row' | 'col'): HintResult | null {
    for (let d = 1; d <= 9; d++) {
      const unitIndices = [...Array(9).keys()];
      const combos = chooseCombos(unitIndices, 3);
      for (const trio of combos) {
        if (orientation === 'row') {
          const rowCols: Array<{ r: number; cols: number[] }> = trio.map(r => ({
            r, cols: colsWithDigit(board, r, d)
          }));
          if (rowCols.some(x => x.cols.length === 0 || x.cols.length > 3)) continue;
          const unionCols = uniq(rowCols.flatMap(x => x.cols)).sort((a, b) => a - b);
          if (unionCols.length !== 3) continue;
          if (!rowCols.every(x => x.cols.every(c => unionCols.includes(c)))) continue;

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
          const colRows: Array<{ c: number; rows: number[] }> = trio.map(c => ({
            c, rows: rowsWithDigit(board, c, d)
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

  private jellyfish(board: Board, orientation: 'row' | 'col'): HintResult | null {
    for (let d = 1; d <= 9; d++) {
      const unitIdx = [...Array(9).keys()];
      for (const quad of chooseCombos(unitIdx, 4)) {
        if (orientation === 'row') {
          const rowCols: Array<{ r: number; cols: number[] }> = quad.map(r => ({ r, cols: colsWithDigit(board, r, d) }));
          if (rowCols.some(x => x.cols.length === 0 || x.cols.length > 4)) continue;
          const unionCols = uniq(rowCols.flatMap(x => x.cols)).sort((a, b) => a - b);
          if (unionCols.length !== 4) continue;
          if (!rowCols.every(x => x.cols.every(c => unionCols.includes(c)))) continue;

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
          const colRows: Array<{ c: number; rows: number[] }> = quad.map(c => ({ c, rows: rowsWithDigit(board, c, d) }));
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

  // ---------- Skyscraper ----------
  private skyscraper(board: Board, orientation: 'row' | 'col'): HintResult | null {
    const peersCache = new Map<string, Set<string>>();
    const peersOf = (r: number, c: number): Set<string> => {
      const k = `${r},${c}`;
      if (peersCache.has(k)) return peersCache.get(k)!;
      const s = new Set<string>();
      for (let i = 0; i < 9; i++) {
        if (i !== c) s.add(`${r},${i}`);
        if (i !== r) s.add(`${i},${c}`);
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) {
        if (rr === r && cc === c) continue;
        s.add(`${rr},${cc}`);
      }
      peersCache.set(k, s);
      return s;
    };

    for (let d = 1; d <= 9; d++) {
      if (orientation === 'row') {
        const rowLinks: Array<{ r: number; cols: number[] }> = [];
        for (let r = 0; r < 9; r++) {
          const cols: number[] = [];
          for (let c = 0; c < 9; c++) if (!board[r][c].value && board[r][c].candidates.has(d)) cols.push(c);
          if (cols.length === 2) rowLinks.push({ r, cols });
        }
        for (const [i, j] of choosePairs(rowLinks.length)) {
          const A = rowLinks[i], B = rowLinks[j];
          const shared = A.cols.filter(c => B.cols.includes(c));
          if (shared.length !== 1) continue;
          const cS = shared[0], cA = A.cols.find(c => c !== cS)!, cB = B.cols.find(c => c !== cS)!;
          const t1 = { r: A.r, c: cA }, t2 = { r: B.r, c: cB };
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
              message: `Rows ${ROW_LETTERS[A.r]} and ${ROW_LETTERS[B.r]} each have a strong link on ${d} and share column ${cS + 1}.`,
              highlight: { rows: [A.r, B.r], cols: [cS], cells: [{ r: A.r, c: cS }, { r: B.r, c: cS }], candTargets: [{ r: A.r, c: cS, d }, { r: B.r, c: cS, d }] }
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
          const rS = shared[0], rA = A.rows.find(r => r !== rS)!, rB = B.rows.find(r => r !== rS)!;
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
              message: `Columns ${A.c + 1} and ${B.c + 1} each have a strong link on ${d} and share row ${ROW_LETTERS[rS]}.`,
              highlight: { cols: [A.c, B.c], rows: [rS], cells: [{ r: rS, c: A.c }, { r: rS, c: B.c }], candTargets: [{ r: rS, c: A.c, d }, { r: rS, c: B.c, d }] }
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
  private xyWing(board: Board): HintResult | null {
    const peersCache = new Map<string, Set<string>>();
    const peersOf = (r: number, c: number): Set<string> => {
      const k = `${r},${c}`;
      if (peersCache.has(k)) return peersCache.get(k)!;
      const set = new Set<string>();
      for (let i = 0; i < 9; i++) { if (i !== c) set.add(`${r},${i}`); if (i !== r) set.add(`${i},${c}`); }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) { if (rr === r && cc === c) continue; set.add(`${rr},${cc}`); }
      peersCache.set(k, set);
      return set;
    };

    const bivals: Array<{ r: number; c: number; cand: number[] }> = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value) continue;
      const cand = Array.from(cell.candidates);
      if (cand.length === 2) bivals.push({ r, c, cand: cand.sort((a, b) => a - b) });
    }

    for (const pivot of bivals) {
      const [X, Y] = pivot.cand;
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
        if (s.has(X) && !s.has(Y)) { const Z = cand.find(d => d !== X)!; pinX.push({ r: pr, c: pc, Z }); }
        else if (s.has(Y) && !s.has(X)) { const Z = cand.find(d => d !== Y)!; pinY.push({ r: pr, c: pc, Z }); }
      }

      for (const a of pinX) for (const b of pinY) {
        if (a.Z !== b.Z) continue;
        const Z = a.Z;
        const meet = intersectKeys(peersOf(a.r, a.c), peersOf(b.r, b.c));
        meet.delete(`${pivot.r},${pivot.c}`); meet.delete(`${a.r},${a.c}`); meet.delete(`${b.r},${b.c}`);
        const eliminations: Array<{ r: number; c: number; d: number }> = [];
        for (const key of meet) {
          const [er, ec] = key.split(',').map(Number);
          const cell = board[er][ec];
          if (!cell.value && cell.candidates.has(Z)) eliminations.push({ r: er, c: ec, d: Z });
        }
        if (!eliminations.length) continue;

        const steps: HintStep[] = [
          { title: `XY-Wing pivot at ${coord(pivot.r, pivot.c)}`, message: `Pivot has {${X}, ${Y}}.`, highlight: { cells: [{ r: pivot.r, c: pivot.c }], candTargets: [{ r: pivot.r, c: pivot.c, d: X }, { r: pivot.r, c: pivot.c, d: Y }] } },
          { title: `Pincers`, message: `${coord(a.r, a.c)} has {${X}, ${Z}}, ${coord(b.r, b.c)} has {${Y}, ${Z}}.`, highlight: { cells: [{ r: a.r, c: a.c }, { r: b.r, c: b.c }], candTargets: [{ r: a.r, c: a.c, d: X }, { r: a.r, c: a.c, d: Z }, { r: b.r, c: b.c, d: Y }, { r: b.r, c: b.c, d: Z }] } },
          { title: `Eliminate ${Z}`, message: `Remove ${Z} from ${eliminations.map(e => coord(e.r, e.c)).join(', ')}.`, highlight: { candTargets: eliminations } }
        ];
        return { kind: 'XY-Wing', digit: Z, target: { r: pivot.r, c: pivot.c }, steps, apply: (b) => removeCandidates(b, eliminations) };
      }
    }
    return null;
  }

  // ---------- NEW: W-Wing ----------
  /**
   * Two bi-value cells A and B share the same pair {X,Y} (not peers).
   * If there exists a *conjugate pair* (strong link) on X either:
   *   - in some ROW r: X occurs only in columns {A.c, B.c}, or
   *   - in some COL c: X occurs only in rows    {A.r, B.r},
   * then Y can be eliminated from cells that see BOTH A and B.
   */
  private wWing(board: Board): HintResult | null {
    // peers helper
    const peersCache = new Map<string, Set<string>>();
    const peersOf = (r: number, c: number): Set<string> => {
      const k = `${r},${c}`; if (peersCache.has(k)) return peersCache.get(k)!;
      const s = new Set<string>();
      for (let i = 0; i < 9; i++) { if (i !== c) s.add(`${r},${i}`); if (i !== r) s.add(`${i},${c}`); }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) { if (rr === r && cc === c) continue; s.add(`${rr},${cc}`); }
      peersCache.set(k, s); return s;
    };

    // collect bi-values
    const bivals: Array<{ r: number; c: number; pair: [number, number] }> = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value) continue;
      const cand = Array.from(cell.candidates);
      if (cand.length === 2) bivals.push({ r, c, pair: cand.sort((a, b) => a - b) as [number, number] });
    }

    // try all pairs of wings
    for (const [i, j] of choosePairs(bivals.length)) {
      const A = bivals[i], B = bivals[j];
      if (A.pair[0] !== B.pair[0] || A.pair[1] !== B.pair[1]) continue; // same pair
      // not peers (classical W-Wing)
      if (A.r === B.r || A.c === B.c || inBox(A.r, A.c) === inBox(B.r, B.c)) continue;

      const [X, Y] = A.pair;

      // check a row strong link on X spanning columns of A and B
      let linkRow: number | null = null;
      for (let r = 0; r < 9 && linkRow === null; r++) {
        const cols = colsWithDigit(board, r, X);
        if (cols.length === 2 && cols.includes(A.c) && cols.includes(B.c)) linkRow = r;
      }

      // check a column strong link on X spanning rows of A and B
      let linkCol: number | null = null;
      for (let c = 0; c < 9 && linkCol === null; c++) {
        const rows = rowsWithDigit(board, c, X);
        if (rows.length === 2 && rows.includes(A.r) && rows.includes(B.r)) linkCol = c;
      }

      if (linkRow === null && linkCol === null) continue; // no conjugate link found

      // eliminations = Y in intersection of peers of A and B
      const meet = intersectKeys(peersOf(A.r, A.c), peersOf(B.r, B.c));
      meet.delete(`${A.r},${A.c}`); meet.delete(`${B.r},${B.c}`);
      const eliminations: Array<{ r: number; c: number; d: number }> = [];
      for (const key of meet) {
        const [er, ec] = key.split(',').map(Number);
        const cell = board[er][ec];
        if (!cell.value && cell.candidates.has(Y)) eliminations.push({ r: er, c: ec, d: Y });
      }
      if (!eliminations.length) continue;

      // explain the link succinctly
      const linkText = linkRow !== null
        ? `row ${ROW_LETTERS[linkRow]} (only in columns ${A.c + 1} & ${B.c + 1})`
        : `column ${(linkCol! + 1)} (only in rows ${ROW_LETTERS[A.r]} & ${ROW_LETTERS[B.r]})`;

      const steps: HintStep[] = [
        {
          title: `W-Wing on {${X}, ${Y}}`,
          message: `Wings at ${coord(A.r, A.c)} and ${coord(B.r, B.c)} share the pair {${X}, ${Y}}.`,
          highlight: { cells: [{ r: A.r, c: A.c }, { r: B.r, c: B.c }], candTargets: [{ r: A.r, c: A.c, d: X }, { r: A.r, c: A.c, d: Y }, { r: B.r, c: B.c, d: X }, { r: B.r, c: B.c, d: Y }] }
        },
        {
          title: `Strong link on ${X}`,
          message: `${X} forms a conjugate pair in ${linkText}.`,
          highlight: {
            rows: linkRow !== null ? [linkRow] : [],
            cols: linkCol !== null ? [linkCol!] : [],
            candTargets: linkRow !== null
              ? [{ r: linkRow, c: A.c, d: X }, { r: linkRow, c: B.c, d: X }]
              : [{ r: A.r, c: linkCol!, d: X }, { r: B.r, c: linkCol!, d: X }]
          }
        },
        {
          title: `Eliminate ${Y}`,
          message: `Any cell that sees both wings cannot be ${Y}. Remove from: ${uniq(eliminations.map(e => coord(e.r, e.c))).join(', ')}.`,
          highlight: { candTargets: eliminations }
        }
      ];

      return { kind: 'W-Wing', digit: Y, target: { r: A.r, c: A.c }, steps, apply: (b) => removeCandidates(b, eliminations) };
    }

    return null;
  }

  // ---------- NEW: XYZ-Wing ----------
  /**
   * Pivot P with {X,Y,Z}; pincers A with {X,Z} and B with {Y,Z}, both see P.
   * Then any cell that sees P, A, and B cannot be Z.
   */
  private xyzWing(board: Board): HintResult | null {
    // peers helper
    const peersCache = new Map<string, Set<string>>();
    const peersOf = (r: number, c: number): Set<string> => {
      const k = `${r},${c}`; if (peersCache.has(k)) return peersCache.get(k)!;
      const s = new Set<string>();
      for (let i = 0; i < 9; i++) { if (i !== c) s.add(`${r},${i}`); if (i !== r) s.add(`${i},${c}`); }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) { if (rr === r && cc === c) continue; s.add(`${rr},${cc}`); }
      peersCache.set(k, s); return s;
    };

    // tri-value pivots
    const pivots: Array<{ r: number; c: number; tri: number[] }> = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value) continue;
      const cand = Array.from(cell.candidates);
      if (cand.length === 3) pivots.push({ r, c, tri: cand.sort((a, b) => a - b) });
    }

    for (const P of pivots) {
      const [X, Y, Z] = P.tri;
      const pPeers = peersOf(P.r, P.c);

      const axz: Array<{ r: number; c: number }> = [];
      const byz: Array<{ r: number; c: number }> = [];

      for (const key of pPeers) {
        const [pr, pc] = key.split(',').map(Number);
        const cell = board[pr][pc];
        if (cell.value) continue;
        const cand = Array.from(cell.candidates);
        if (cand.length !== 2) continue;
        const s = new Set(cand);
        if (s.has(X) && s.has(Z) && !s.has(Y)) axz.push({ r: pr, c: pc });
        if (s.has(Y) && s.has(Z) && !s.has(X)) byz.push({ r: pr, c: pc });
      }

      for (const A of axz) for (const B of byz) {
        const common = intersectKeys(intersectKeys(peersOf(P.r, P.c), peersOf(A.r, A.c)), peersOf(B.r, B.c));
        common.delete(`${P.r},${P.c}`); common.delete(`${A.r},${A.c}`); common.delete(`${B.r},${B.c}`);

        const elim: Array<{ r: number; c: number; d: number }> = [];
        for (const key of common) {
          const [er, ec] = key.split(',').map(Number);
          const cell = board[er][ec];
          if (!cell.value && cell.candidates.has(Z)) elim.push({ r: er, c: ec, d: Z });
        }
        if (!elim.length) continue;

        const steps: HintStep[] = [
          {
            title: `XYZ-Wing pivot at ${coord(P.r, P.c)}`,
            message: `Pivot has {${X}, ${Y}, ${Z}}.`,
            highlight: { cells: [{ r: P.r, c: P.c }], candTargets: [{ r: P.r, c: P.c, d: X }, { r: P.r, c: P.c, d: Y }, { r: P.r, c: P.c, d: Z }] }
          },
          {
            title: `Pincers`,
            message: `${coord(A.r, A.c)} has {${X}, ${Z}}; ${coord(B.r, B.c)} has {${Y}, ${Z}}. Both see the pivot.`,
            highlight: { cells: [A, B], candTargets: [{ r: A.r, c: A.c, d: X }, { r: A.r, c: A.c, d: Z }, { r: B.r, c: B.c, d: Y }, { r: B.r, c: B.c, d: Z }] }
          },
          {
            title: `Eliminate ${Z}`,
            message: `Any cell that sees all three cannot be ${Z}: ${uniq(elim.map(e => coord(e.r, e.c))).join(', ')}.`,
            highlight: { candTargets: elim }
          }
        ];

        return { kind: 'XYZ-Wing', digit: Z, target: { r: P.r, c: P.c }, steps, apply: (b) => removeCandidates(b, elim) };
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

function uniq<T>(arr: T[]) { return Array.from(new Set(arr)); }

function inBox(r: number, c: number) { return Math.floor(r / 3) * 3 + Math.floor(c / 3); }

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
    for (let i = start; i < n; i++) { path.push(items[i]); dfs(i + 1, path); path.pop(); }
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
