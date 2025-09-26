import { Injectable } from '@angular/core';
import { Board } from '../data/sudoku.types';
import { HintResult, HintStep, UnitKind } from './hint.types';
import { computeCandidates } from '../data/sudoku.utils';

const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

@Injectable({
  providedIn: 'root'
})
export class HintService {

  findNextHint(board: Board): HintResult | null {
    const withCands = computeCandidates(board);

    // Naked Single
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cell = withCands[r][c];
      if (cell.value) continue;
      const cands = Array.from(cell.candidates);
      if (cands.length === 1) {
        const d = cands[0];
        return this.buildNakedSingle(withCands, r, c, d);
      }
    }

    // Hidden Single (row, col, box)
    const order: UnitKind[] = ['row', 'col', 'box'];
    for (const kind of order) {
      const res = this.findHiddenSingle(withCands, kind);
      if (res) return res;
    }
    return null;
  }

  coordLabel(r: number, c: number) {
    return `${ROW_LETTERS[r]}${c + 1}`;
  }

  unitName(kind: UnitKind, idx: number) {
    if (kind === 'row') return `row ${ROW_LETTERS[idx]} (${ROW_LETTERS[idx]}1–${ROW_LETTERS[idx]}9)`;
    if (kind === 'col') return `column ${idx + 1} (A${idx + 1}–I${idx + 1})`;
    return `box ${idx + 1}`;
  }

  private buildNakedSingle(board: Board, r: number, c: number, d: number): HintResult {
    const label = this.coordLabel(r, c);
    const steps: HintStep[] = [
      {
        title: `Only one candidate at ${label}`,
        message: `${label} has a single pencil mark: ${d}.`,
        highlight: { cells: [{ r, c }], candTargets: [{ r, c, d }], rows: [r], cols: [c], boxes: [board[r][c].box] }
      },
      {
        title: 'Why only one?',
        message: `Other digits are blocked by its row ${ROW_LETTERS[r]}, column ${c + 1}, and box ${board[r][c].box + 1}.`,
        highlight: { rows: [r], cols: [c], boxes: [board[r][c].box], cells: [{ r, c }], candTargets: [{ r, c, d }] }
      }
    ];
    return {
      kind: 'Naked Single',
      digit: d,
      target: { r, c },
      steps,
      apply: (b) => {
        const next = b.map(row => row.map(cell => ({ ...cell, candidates: new Set(cell.candidates) })));
        next[r][c] = { ...next[r][c], value: d as any };
        return next;
      }
    };
  }

  private findHiddenSingle(board: Board, kind: UnitKind): HintResult | null {
    for (let idx = 0; idx < 9; idx++) {
      for (let d = 1; d <= 9; d++) {
        const spots: Array<{ r: number; c: number }> = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
          if (!this.inUnit(kind, idx, r, c)) continue;
          const cell = board[r][c];
          if (cell.value) continue;
          if (cell.candidates.has(d)) spots.push({ r, c });
        }
        if (spots.length === 1) {
          const { r, c } = spots[0];
          return this.buildHiddenSingle(board, kind, idx, r, c, d);
        }
      }
    }
    return null;
  }

  private inUnit(kind: UnitKind, idx: number, r: number, c: number): boolean {
    if (kind === 'row') return r === idx;
    if (kind === 'col') return c === idx;
    const br = Math.floor(r / 3), bc = Math.floor(c / 3);
    return (br * 3 + bc) === idx;
  }

  private buildHiddenSingle(board: Board, kind: UnitKind, idx: number, r: number, c: number, d: number): HintResult {
    const label = this.coordLabel(r, c);
    const uName = this.unitName(kind, idx);
    const steps: HintStep[] = [
      { title: `Scan ${uName}`, message: `Find where ${d} can go within ${uName}.`, highlight: this.unitHighlight(kind, idx) },
      {
        title: `Only ${label} works`,
        message: `${d} can only go at ${label} in this ${uName}.`,
        highlight: { ...this.unitHighlight(kind, idx), cells: [{ r, c }], candTargets: [{ r, c, d }] }
      }
    ];
    return {
      kind: 'Hidden Single',
      digit: d,
      target: { r, c },
      unit: { kind, index: idx },
      steps,
      apply: (b) => {
        const next = b.map(row => row.map(cell => ({ ...cell, candidates: new Set(cell.candidates) })));
        next[r][c] = { ...next[r][c], value: d as any };
        return next;
      }
    };
  }

  private unitHighlight(kind: UnitKind, idx: number) {
    if (kind === 'row') return { rows: [idx] };
    if (kind === 'col') return { cols: [idx] };
    return { boxes: [idx] };
  }
}
